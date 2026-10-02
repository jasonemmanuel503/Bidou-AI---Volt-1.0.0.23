/**
 * server/modelsApi.ts
 *
 * Plain-language summary:
 * Public (`GET /api/models`) and Admin (`/api/admin/*`) route handlers for
 * managing AI models, multi-supplier priorities, supplier circuit breakers,
 * daily profit/margin analytics, and per-tier plan limits.
 *
 * Security & privacy guarantees:
 * 1. `GET /api/models` (public, cached 30s) returns ONLY active + licence-verified
 *    models and NEVER exposes `suppliers`, `provider_cost`, `provider`, margins,
 *    or internal licence notes.
 * 2. Every `/api/admin/*` route requires `requireAdmin` (Bearer token email in
 *    `ADMIN_EMAILS`).
 * 3. `PATCH /api/admin/models/:id` refuses to set `active = true` unless
 *    `licensing_verified` is `true` after the update, and automatically stamps
 *    `licence_verified_at` and `licence_verified_by` when `licensing_verified`
 *    is turned on.
 */

import type { Express, Request, Response } from 'express';
import { INITIAL_AI_MODELS } from '../src/services/configData';
import { quoteGenerationCost, getModelPriceTable } from '../src/services/pricingEngine';
import type { AiModelConfig, PlanTier, SupplierId } from '../src/types';
import {
  getSupabaseAdmin,
  resolveUserFromAuthHeader,
  setInMemoryModelOverride,
  getInMemoryModelOverrides,
} from './db';
import { isLiveMode } from './config/mode';
import {
  clearSupplierCache,
  getProviderEnv,
  hasSupplierCredentials,
  setSupplierStatusOverride,
  getSupplierStatusOverride,
} from './providers/suppliers';
import {
  countUnitsSince,
  getInMemoryLedger,
  spendUsd,
} from './costLedger';
import {
  PLAN_TIER_ORDER,
  getPlanLimitsMap,
  getPlanLimitForTier,
  updatePlanLimitForTier,
  invalidatePlanLimitsCache,
} from './planLimits';
import { AdminAuthenticatedRequest, requireAdmin } from './adminAuth';

interface ModelSupplierRow {
  id: string;
  model_id: string;
  supplier: SupplierId;
  upstream_model: string;
  priority: number;
  env: 'dev' | 'prod' | 'both';
  enabled: boolean;
  note?: string | null;
  updated_at: string;
}

const inMemorySupplierRows = new Map<string, ModelSupplierRow>();
const inMemorySupplierStatus = new Map<
  string,
  {
    supplier: string;
    enabled: boolean;
    tripped_until: string | null;
    trip_reason: string | null;
    daily_spend_limit_usd: number | null;
    updated_at: string;
  }
>();

function ensureInMemorySuppliersSeeded(): void {
  if (inMemorySupplierRows.size === 0) {
    for (const m of INITIAL_AI_MODELS) {
      for (const s of m.suppliers || []) {
        const id = `${m.id}__${s.supplier}`;
        inMemorySupplierRows.set(id, {
          id,
          model_id: m.id,
          supplier: s.supplier,
          upstream_model: s.upstream_model,
          priority: s.priority,
          env: s.env,
          enabled: s.enabled,
          note: null,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  if (inMemorySupplierStatus.size === 0) {
    const defaults: Array<{ supplier: string; limit: number | null }> = [
      { supplier: 'cloudflare', limit: 5 },
      { supplier: 'kie', limit: 25 },
      { supplier: 'alibaba', limit: 25 },
      { supplier: 'google', limit: 25 },
      { supplier: 'musicapi', limit: null },
      { supplier: 'sunor', limit: 10 },
    ];
    for (const d of defaults) {
      inMemorySupplierStatus.set(d.supplier, {
        supplier: d.supplier,
        enabled: true,
        tripped_until: null,
        trip_reason: null,
        daily_spend_limit_usd: d.limit,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

let publicModelsCache: { fetchedAt: number; models: any[] } | null = null;
const PUBLIC_MODELS_CACHE_TTL_MS = 30 * 1000; // 30 seconds

export function invalidateModelsCache(): void {
  publicModelsCache = null;
  clearSupplierCache();
}

export function getInMemoryModelOverride(modelId: string) {
  return getInMemoryModelOverrides().get(modelId);
}

/**
 * Loads all models (merging catalog metadata with DB rows and any in-memory admin edits).
 */
export async function loadAllModelsWithMetadata(): Promise<
  Array<
    AiModelConfig & {
      licence_note?: string | null;
      licence_verified_at?: string | null;
      licence_verified_by?: string | null;
    }
  >
> {
  const catalogById = new Map<string, AiModelConfig>();
  for (const m of INITIAL_AI_MODELS) {
    catalogById.set(m.id, m);
  }

  const merged = new Map<
    string,
    AiModelConfig & {
      licence_note?: string | null;
      licence_verified_at?: string | null;
      licence_verified_by?: string | null;
    }
  >();

  for (const m of INITIAL_AI_MODELS) {
    merged.set(m.id, { ...m });
  }

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const { data, error } = await admin.from('ai_models').select('*');
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            const cat = catalogById.get(row.id);
            merged.set(row.id, {
              ...(cat || {}),
              ...row,
              pricing_kind: row.pricing_kind ?? cat?.pricing_kind,
              promo_eligible: row.promo_eligible ?? cat?.promo_eligible ?? false,
              is_premium: row.is_premium ?? cat?.is_premium ?? false,
              min_plan_tier: row.min_plan_tier ?? cat?.min_plan_tier,
              video_options: row.video_options ?? cat?.video_options,
              supported_aspect_ratios: row.supported_aspect_ratios ?? cat?.supported_aspect_ratios,
              suppliers: cat?.suppliers,
            });
          }
        }
      } catch (err: any) {
        console.warn('[ModelsAPI] Failed to load ai_models from Supabase, using catalog:', err?.message || err);
      }
    }
  }

  for (const [id, override] of getInMemoryModelOverrides().entries()) {
    const existing = merged.get(id);
    if (existing) {
      merged.set(id, { ...existing, ...override });
    }
  }

  return Array.from(merged.values());
}

/**
 * Builds the sanitized public model list (active + licensing_verified only).
 * NEVER includes suppliers, supplier costs, margins, or upstream provider names.
 */
async function getSanitizedPublicModels(): Promise<any[]> {
  const now = Date.now();
  if (publicModelsCache && now - publicModelsCache.fetchedAt < PUBLIC_MODELS_CACHE_TTL_MS) {
    return publicModelsCache.models;
  }

  const allModels = await loadAllModelsWithMetadata();
  const activeVerified = allModels.filter((m) => m.active && m.licensing_verified);

  const sanitized = activeVerified.map((m) => {
    const defaultDuration =
      m.generation_type === 'video'
        ? Array.isArray(m.video_options?.durations)
          ? m.video_options!.durations[m.video_options!.durations.length - 1] || 8
          : 5
        : undefined;
    const quote = quoteGenerationCost({
      model: m,
      durationSeconds: defaultDuration,
      resolution: '720p',
      variantCount: 1,
    });

    return {
      id: m.id,
      model_name: m.model_name,
      display_name: m.display_name,
      generation_type: m.generation_type,
      unit: m.unit,
      credit_cost: quote.unitCost,
      active: true,
      quality_tier: m.quality_tier,
      licensing_verified: true,
      max_concurrent_variants: m.max_concurrent_variants,
      max_upscale: m.max_upscale,
      upscale_credit_cost: m.upscale_credit_cost,
      supported_aspect_ratios: m.supported_aspect_ratios || ['1:1', '16:9', '9:16'],
      pricing_kind: m.pricing_kind || (m.generation_type === 'image' ? 'per_image' : m.generation_type === 'music' ? 'per_song' : 'per_clip'),
      promo_eligible: Boolean(m.promo_eligible),
      is_premium: Boolean(m.is_premium),
      min_plan_tier: m.min_plan_tier || null,
      video_options: m.video_options || null,
      price_table: getModelPriceTable(m),
    };
  });

  publicModelsCache = {
    fetchedAt: now,
    models: sanitized,
  };
  return sanitized;
}

function getStartOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

export function registerModelsAndAdminRoutes(app: Express): void {
  ensureInMemorySuppliersSeeded();

  // ==========================================================================
  // Step 5: Public GET /api/models (cached 30 s, no supplier or cost fields)
  // ==========================================================================
  app.get('/api/models', async (req: Request, res: Response) => {
    try {
      const models = await getSanitizedPublicModels();
      let allowedMaxVideoSeconds: number | null = null;
      let callerTier: PlanTier | null = null;

      if (req.headers.authorization) {
        const user = await resolveUserFromAuthHeader(req.headers.authorization);
        if (user) {
          callerTier = user.plan_tier;
          const limit = await getPlanLimitForTier(user.plan_tier);
          allowedMaxVideoSeconds = limit.max_video_seconds;
        }
      }

      res.json({
        models,
        provider_env: getProviderEnv(),
        plan_tier: callerTier,
        allowed_max_video_seconds: allowedMaxVideoSeconds,
      });
    } catch (err: any) {
      console.error('[ModelsAPI] GET /api/models error:', err?.message || err);
      res.status(500).json({
        error: 'MODELS_LOAD_FAILED',
        message: 'Failed to load public models catalog',
      });
    }
  });

  // ==========================================================================
  // Step 6: Admin API (protected by requireAdmin)
  // ==========================================================================

  /**
   * GET /api/admin/models
   * Returns every model with suppliers, licence info, and current credit price.
   */
  app.get('/api/admin/models', requireAdmin, async (_req: AdminAuthenticatedRequest, res: Response) => {
    try {
      ensureInMemorySuppliersSeeded();
      const allModels = await loadAllModelsWithMetadata();

      let supplierRows: ModelSupplierRow[] = Array.from(inMemorySupplierRows.values());
      if (isLiveMode()) {
        const admin = getSupabaseAdmin();
        if (admin) {
          const { data, error } = await admin
            .from('model_suppliers')
            .select('*')
            .order('priority', { ascending: true });
          if (!error && Array.isArray(data) && data.length > 0) {
            supplierRows = data as ModelSupplierRow[];
          }
        }
      }

      const modelsWithDetails = allModels.map((m) => {
        const quote = quoteGenerationCost({
          model: m,
          durationSeconds: m.id.startsWith('vid_wan_') ? 5 : 8,
          resolution: '720p',
          variantCount: 1,
        });
        const modelSuppliers = supplierRows
          .filter((r) => r.model_id === m.id)
          .sort((a, b) => a.priority - b.priority)
          .map((r) => ({
            id: r.id,
            supplier: r.supplier,
            upstream_model: r.upstream_model,
            priority: r.priority,
            env: r.env,
            enabled: r.enabled,
            configured: hasSupplierCredentials(r.supplier),
            note: r.note || null,
          }));

        return {
          ...m,
          computed_credit_cost: quote.unitCost,
          price_table: getModelPriceTable(m),
          model_suppliers: modelSuppliers,
        };
      });

      res.json({
        models: modelsWithDetails,
        provider_env: getProviderEnv(),
      });
    } catch (err: any) {
      res.status(500).json({
        error: 'ADMIN_MODELS_FAILED',
        message: err?.message || 'Failed to load admin models',
      });
    }
  });

  /**
   * PATCH /api/admin/models/:id
   * Body: { active?, licensing_verified?, licence_note? }
   * Rule: cannot set active=true unless licensing_verified is true (after the change).
   */
  app.patch('/api/admin/models/:id', requireAdmin, async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const modelId = String(req.params.id || '').trim();
      const { active, licensing_verified, licence_note } = req.body || {};

      if (active !== undefined && typeof active !== 'boolean') {
        return res.status(400).json({ error: 'INVALID_BODY', message: 'active must be a boolean' });
      }
      if (licensing_verified !== undefined && typeof licensing_verified !== 'boolean') {
        return res.status(400).json({ error: 'INVALID_BODY', message: 'licensing_verified must be a boolean' });
      }
      if (licence_note !== undefined && licence_note !== null && typeof licence_note !== 'string') {
        return res.status(400).json({ error: 'INVALID_BODY', message: 'licence_note must be a string or null' });
      }

      const allModels = await loadAllModelsWithMetadata();
      const current = allModels.find((m) => m.id === modelId);
      if (!current) {
        return res.status(404).json({ error: 'MODEL_NOT_FOUND', message: `Model ${modelId} not found` });
      }

      const nextVerified = licensing_verified !== undefined ? licensing_verified : Boolean(current.licensing_verified);
      const nextActive = active !== undefined ? active : Boolean(current.active);

      if (nextActive && !nextVerified) {
        return res.status(400).json({
          error: 'LICENCE_VERIFICATION_REQUIRED',
          message: 'Cannot set active=true unless licensing_verified is true.',
        });
      }

      const nowIso = new Date().toISOString();
      const adminEmail = req.adminUser?.email || 'admin';
      const updates: Record<string, any> = {
        active: nextActive,
        licensing_verified: nextVerified,
        updated_at: nowIso,
      };

      if (licence_note !== undefined) {
        updates.licence_note = licence_note;
      }
      if (licensing_verified === true) {
        updates.licence_verified_at = nowIso;
        updates.licence_verified_by = adminEmail;
      }

      setInMemoryModelOverride(modelId, updates);

      if (isLiveMode()) {
        const admin = getSupabaseAdmin();
        if (admin) {
          const { error } = await admin.from('ai_models').update(updates).eq('id', modelId);
          if (error) {
            console.warn('[AdminAPI] Supabase ai_models update warning:', error.message);
          }
        }
      }

      invalidateModelsCache();
      console.info('[Admin Audit] PATCH /api/admin/models/:id', {
        admin: adminEmail,
        modelId,
        updates,
      });

      res.json({
        model: {
          ...current,
          ...updates,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        error: 'ADMIN_MODEL_UPDATE_FAILED',
        message: err?.message || 'Failed to update model',
      });
    }
  });

  /**
   * PATCH /api/admin/model-suppliers/:id
   * Body: { enabled?, priority? }
   */
  app.patch('/api/admin/model-suppliers/:id', requireAdmin, async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      ensureInMemorySuppliersSeeded();
      const rowId = String(req.params.id || '').trim();
      const { enabled, priority } = req.body || {};

      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'INVALID_BODY', message: 'enabled must be a boolean' });
      }
      if (priority !== undefined && (!Number.isInteger(priority) || priority < 1 || priority > 100)) {
        return res.status(400).json({
          error: 'INVALID_BODY',
          message: 'priority must be an integer between 1 and 100',
        });
      }

      const nowIso = new Date().toISOString();
      const updates: Record<string, any> = { updated_at: nowIso };
      if (enabled !== undefined) updates.enabled = enabled;
      if (priority !== undefined) updates.priority = priority;

      const memRow = inMemorySupplierRows.get(rowId);
      if (memRow) {
        if (enabled !== undefined) memRow.enabled = enabled;
        if (priority !== undefined) memRow.priority = priority;
        memRow.updated_at = nowIso;
        const catModel = INITIAL_AI_MODELS.find((m) => m.id === memRow.model_id);
        const catRoute = catModel?.suppliers?.find((s) => s.supplier === memRow.supplier);
        if (catRoute) {
          if (enabled !== undefined) catRoute.enabled = enabled;
          if (priority !== undefined) catRoute.priority = priority;
        }
      } else if (rowId.includes('__')) {
        const [mId, sup] = rowId.split('__');
        const catModel = INITIAL_AI_MODELS.find((m) => m.id === mId);
        const catRoute = catModel?.suppliers?.find((s) => s.supplier === sup);
        if (catRoute) {
          if (enabled !== undefined) catRoute.enabled = enabled;
          if (priority !== undefined) catRoute.priority = priority;
        }
      }

      if (isLiveMode()) {
        const admin = getSupabaseAdmin();
        if (admin) {
          // Support either UUID primary key or composite `modelId__supplier`
          if (rowId.includes('__')) {
            const [mId, sup] = rowId.split('__');
            await admin.from('model_suppliers').update(updates).eq('model_id', mId).eq('supplier', sup);
          } else {
            await admin.from('model_suppliers').update(updates).eq('id', rowId);
          }
        }
      }

      invalidateModelsCache();
      console.info('[Admin Audit] PATCH /api/admin/model-suppliers/:id', {
        admin: req.adminUser?.email,
        id: rowId,
        updates,
      });

      res.json({
        success: true,
        id: rowId,
        updates,
      });
    } catch (err: any) {
      res.status(500).json({
        error: 'ADMIN_MODEL_SUPPLIER_UPDATE_FAILED',
        message: err?.message || 'Failed to update model supplier route',
      });
    }
  });

  /**
   * PATCH /api/admin/suppliers/:supplier
   * Body: { enabled?, daily_spend_limit_usd?, clear_trip? }
   */
  app.patch('/api/admin/suppliers/:supplier', requireAdmin, async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      ensureInMemorySuppliersSeeded();
      const supplier = String(req.params.supplier || '').trim().toLowerCase();
      if (!['cloudflare', 'kie', 'alibaba', 'google', 'musicapi', 'sunor'].includes(supplier)) {
        return res.status(400).json({ error: 'INVALID_SUPPLIER', message: `Unknown supplier: ${supplier}` });
      }

      const { enabled, daily_spend_limit_usd, clear_trip } = req.body || {};
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'INVALID_BODY', message: 'enabled must be a boolean' });
      }
      if (
        daily_spend_limit_usd !== undefined &&
        daily_spend_limit_usd !== null &&
        (typeof daily_spend_limit_usd !== 'number' || !Number.isFinite(daily_spend_limit_usd) || daily_spend_limit_usd < 0)
      ) {
        return res.status(400).json({
          error: 'INVALID_BODY',
          message: 'daily_spend_limit_usd must be a non-negative number or null',
        });
      }
      if (clear_trip !== undefined && typeof clear_trip !== 'boolean') {
        return res.status(400).json({ error: 'INVALID_BODY', message: 'clear_trip must be a boolean' });
      }

      const nowIso = new Date().toISOString();
      const current = inMemorySupplierStatus.get(supplier) || {
        supplier,
        enabled: true,
        tripped_until: null,
        trip_reason: null,
        daily_spend_limit_usd: 25,
        updated_at: nowIso,
      };

      const updates: Record<string, any> = { updated_at: nowIso };
      if (enabled !== undefined) {
        current.enabled = enabled;
        updates.enabled = enabled;
        for (const m of INITIAL_AI_MODELS) {
          for (const s of m.suppliers || []) {
            if (s.supplier === supplier) {
              s.enabled = enabled;
            }
          }
        }
        for (const r of inMemorySupplierRows.values()) {
          if (r.supplier === supplier) {
            r.enabled = enabled;
          }
        }
      }
      if (daily_spend_limit_usd !== undefined) {
        current.daily_spend_limit_usd = daily_spend_limit_usd;
        updates.daily_spend_limit_usd = daily_spend_limit_usd;
      }
      if (clear_trip === true) {
        current.tripped_until = null;
        current.trip_reason = null;
        updates.tripped_until = null;
        updates.trip_reason = null;
      }
      current.updated_at = nowIso;
      inMemorySupplierStatus.set(supplier, current);
      setSupplierStatusOverride(supplier, {
        enabled,
        dailySpendLimitUsd: daily_spend_limit_usd,
        clearTrip: clear_trip === true,
      });

      if (isLiveMode()) {
        const admin = getSupabaseAdmin();
        if (admin) {
          await admin
            .from('supplier_status')
            .upsert({ supplier, ...updates }, { onConflict: 'supplier' });
        }
      }

      invalidateModelsCache();
      console.info('[Admin Audit] PATCH /api/admin/suppliers/:supplier', {
        admin: req.adminUser?.email,
        supplier,
        updates,
      });

      res.json({
        supplier: current,
      });
    } catch (err: any) {
      res.status(500).json({
        error: 'ADMIN_SUPPLIER_UPDATE_FAILED',
        message: err?.message || 'Failed to update supplier status',
      });
    }
  });

  /**
   * GET /api/admin/profit?days=30
   * Returns rows from `v_profit_daily` plus per-supplier spend today, daily limit,
   * tripped status, dev-cap usage, and overall totals (revenue floor, cost, margin %).
   */
  app.get('/api/admin/profit', requireAdmin, async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      ensureInMemorySuppliersSeeded();
      const daysRaw = Number(req.query.days ?? 30);
      const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.round(daysRaw))) : 30;
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const sinceDayStr = sinceDate.toISOString().slice(0, 10);

      let dailyRows: any[] = [];
      if (isLiveMode()) {
        const admin = getSupabaseAdmin();
        if (admin) {
          const { data, error } = await admin
            .from('v_profit_daily')
            .select('*')
            .gte('day_utc', sinceDayStr)
            .order('day_utc', { ascending: false });
          if (!error && Array.isArray(data)) {
            dailyRows = data;
          }
        }
      }

      // If in demo mode or v_profit_daily is empty, aggregate in-memory ledger rows
      if (dailyRows.length === 0) {
        const mem = getInMemoryLedger();
        const buckets = new Map<
          string,
          {
            day_utc: string;
            model_id: string;
            supplier: string;
            env: string;
            succeeded_count: number;
            failed_count: number;
            total_cost_xaf: number;
            revenue_floor_xaf: number;
          }
        >();

        for (const r of mem) {
          const dayUtc = r.created_at.slice(0, 10);
          if (dayUtc < sinceDayStr) continue;
          const key = `${dayUtc}|${r.model_id}|${r.supplier}|${r.env}`;
          const b = buckets.get(key) || {
            day_utc: dayUtc,
            model_id: r.model_id,
            supplier: r.supplier,
            env: r.env,
            succeeded_count: 0,
            failed_count: 0,
            total_cost_xaf: 0,
            revenue_floor_xaf: 0,
          };

          if (r.status === 'succeeded') {
            b.succeeded_count += 1;
            const costUsd = r.actual_cost_usd !== null ? r.actual_cost_usd : r.est_cost_usd;
            b.total_cost_xaf += costUsd * r.fx_xaf_per_usd;
            b.revenue_floor_xaf += r.revenue_floor_xaf;
          } else if (r.status === 'failed') {
            b.failed_count += 1;
            if (r.actual_cost_usd && r.actual_cost_usd > 0) {
              b.total_cost_xaf += r.actual_cost_usd * r.fx_xaf_per_usd;
            }
          }
          buckets.set(key, b);
        }

        dailyRows = Array.from(buckets.values()).map((b) => ({
          ...b,
          total_cost_xaf: Number(b.total_cost_xaf.toFixed(2)),
          revenue_floor_xaf: Number(b.revenue_floor_xaf.toFixed(2)),
          margin_pct:
            b.revenue_floor_xaf > 0
              ? Number((((b.revenue_floor_xaf - b.total_cost_xaf) / b.revenue_floor_xaf) * 100).toFixed(2))
              : null,
        }));
      }

      // Compute overall totals
      let totalRevenueFloorXaf = 0;
      let totalCostXaf = 0;
      let totalSucceeded = 0;
      for (const r of dailyRows) {
        totalRevenueFloorXaf += Number(r.revenue_floor_xaf || 0);
        totalCostXaf += Number(r.total_cost_xaf || 0);
        totalSucceeded += Number(r.succeeded_count || 0);
      }
      const totalMarginPct =
        totalRevenueFloorXaf > 0
          ? Number((((totalRevenueFloorXaf - totalCostXaf) / totalRevenueFloorXaf) * 100).toFixed(2))
          : null;

      // Per-supplier status, spend today, and dev-cap usage
      const startOfToday = getStartOfUtcDay();
      const supplierList: SupplierId[] = ['cloudflare', 'kie', 'alibaba', 'google', 'musicapi', 'sunor'];
      const dbStatuses = new Map<string, any>();
      if (isLiveMode()) {
        const admin = getSupabaseAdmin();
        if (admin) {
          const { data } = await admin.from('supplier_status').select('*');
          if (Array.isArray(data)) {
            for (const row of data) dbStatuses.set(row.supplier, row);
          }
        }
      }

      const suppliersSummary = await Promise.all(
        supplierList.map(async (s) => {
          const memSt = inMemorySupplierStatus.get(s);
          const supOverride = getSupplierStatusOverride(s);
          const dbSt = dbStatuses.get(s);
          const spendTodayProd = await spendUsd({ supplier: s, env: 'prod', since: startOfToday });
          const spendTodayDev = await spendUsd({ supplier: s, env: 'dev', since: startOfToday });
          const totalDevSpend =
            s === 'kie' || s === 'sunor' ? await spendUsd({ supplier: s, env: 'dev' }) : spendTodayDev;
          const devUnitsToday = await countUnitsSince({ supplier: s, env: 'dev', since: startOfToday });

          return {
            supplier: s,
            configured: hasSupplierCredentials(s),
            enabled: dbSt?.enabled ?? memSt?.enabled ?? true,
            tripped_until: dbSt?.tripped_until ?? supOverride.tripped?.until ?? memSt?.tripped_until ?? null,
            trip_reason: dbSt?.trip_reason ?? supOverride.tripped?.reason ?? memSt?.trip_reason ?? null,
            daily_spend_limit_usd: dbSt?.daily_spend_limit_usd ?? memSt?.daily_spend_limit_usd ?? null,
            spend_today_usd: Number((spendTodayProd + spendTodayDev).toFixed(4)),
            dev_cap_usage: {
              units_today: devUnitsToday,
              spend_today_usd: Number(spendTodayDev.toFixed(4)),
              total_dev_spend_usd: Number(totalDevSpend.toFixed(4)),
              cap_description:
                s === 'cloudflare'
                  ? `${devUnitsToday} / ${process.env.CF_DEV_DAILY_IMAGE_CAP || 100} images today`
                  : s === 'kie'
                    ? `$${totalDevSpend.toFixed(3)} / $${process.env.KIE_DEV_TOTAL_USD_CAP || '0.40'} total`
                    : s === 'sunor'
                      ? `$${totalDevSpend.toFixed(3)} / $${process.env.SUNOR_DEV_TOTAL_USD_CAP || '0.50'} total`
                      : s === 'alibaba'
                        ? `$${spendTodayDev.toFixed(3)} / $${process.env.ALIBABA_DEV_DAILY_USD_CAP || '1.00'} today`
                        : s === 'musicapi'
                          ? `${devUnitsToday} / ${process.env.MUSICAPI_DEV_DAILY_TASK_CAP || 3} tasks today`
                          : s === 'google'
                            ? `${devUnitsToday} / ${process.env.GOOGLE_DEV_DAILY_IMAGE_CAP || 10} images today (video allowed: ${process.env.DEV_ALLOW_GOOGLE_VIDEO || 'false'})`
                            : 'N/A',
            },
          };
        })
      );

      res.json({
        days,
        provider_env: getProviderEnv(),
        totals: {
          succeeded_count: totalSucceeded,
          revenue_floor_xaf: Number(totalRevenueFloorXaf.toFixed(2)),
          total_cost_xaf: Number(totalCostXaf.toFixed(2)),
          margin_pct: totalMarginPct,
        },
        suppliers: suppliersSummary,
        daily: dailyRows,
      });
    } catch (err: any) {
      res.status(500).json({
        error: 'ADMIN_PROFIT_FAILED',
        message: err?.message || 'Failed to compute profit summary',
      });
    }
  });

  /**
   * GET /api/admin/plan-limits
   */
  app.get('/api/admin/plan-limits', requireAdmin, async (_req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const map = await getPlanLimitsMap();
      const rows = PLAN_TIER_ORDER.map((t) => map.get(t)!);
      res.json({ plan_limits: rows });
    } catch (err: any) {
      res.status(500).json({
        error: 'ADMIN_PLAN_LIMITS_FAILED',
        message: err?.message || 'Failed to load plan limits',
      });
    }
  });

  /**
   * PUT /api/admin/plan-limits/:tier
   * Body: { max_video_seconds?, premium_monthly_cap? }
   */
  app.put('/api/admin/plan-limits/:tier', requireAdmin, async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const tier = String(req.params.tier || '').trim().toLowerCase() as PlanTier;
      if (!PLAN_TIER_ORDER.includes(tier)) {
        return res.status(400).json({
          error: 'INVALID_TIER',
          message: `tier must be one of: ${PLAN_TIER_ORDER.join(', ')}`,
        });
      }

      const { max_video_seconds, premium_monthly_cap } = req.body || {};
      if (
        max_video_seconds !== undefined &&
        (!Number.isInteger(max_video_seconds) || max_video_seconds < 2 || max_video_seconds > 120)
      ) {
        return res.status(400).json({
          error: 'INVALID_BODY',
          message: 'max_video_seconds must be an integer between 2 and 120',
        });
      }
      if (
        premium_monthly_cap !== undefined &&
        (!Number.isInteger(premium_monthly_cap) || premium_monthly_cap < 0 || premium_monthly_cap > 100000)
      ) {
        return res.status(400).json({
          error: 'INVALID_BODY',
          message: 'premium_monthly_cap must be an integer between 0 and 100000',
        });
      }

      const updated = await updatePlanLimitForTier(tier, {
        max_video_seconds,
        premium_monthly_cap,
      });
      invalidatePlanLimitsCache();

      console.info('[Admin Audit] PUT /api/admin/plan-limits/:tier', {
        admin: req.adminUser?.email,
        tier,
        updated,
      });

      res.json({ plan_limit: updated });
    } catch (err: any) {
      res.status(500).json({
        error: 'ADMIN_PLAN_LIMIT_UPDATE_FAILED',
        message: err?.message || 'Failed to update plan limit',
      });
    }
  });
}
