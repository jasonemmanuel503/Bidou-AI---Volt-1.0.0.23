/**
 * server/providers/suppliers.ts
 *
 * Plain-language summary:
 * Multi-supplier router, capability filter, dev-mode hard spending/unit caps,
 * production daily spend circuit breaker, and SSRF-safe HTTP/download helpers.
 *
 * Key business guarantees:
 * 1. Same model only: never downgrades or switches a customer to a different model.
 *    If no supplier for the chosen model is available, throws MODEL_TEMPORARILY_UNAVAILABLE.
 * 2. Environment safety: if PROVIDER_ENV=prod but NODE_ENV !== 'production',
 *    logs a loud error and forces 'dev' mode.
 * 3. Dev hard caps: checked BEFORE every paid call against the cost ledger:
 *    - Cloudflare: CF_DEV_DAILY_IMAGE_CAP (default 100 images/day)
 *    - Google images: GOOGLE_DEV_DAILY_IMAGE_CAP (default 10 images/day)
 *    - Kie.ai:     KIE_DEV_TOTAL_USD_CAP (default $0.40 total)
 *    - Sunor:      SUNOR_DEV_TOTAL_USD_CAP (default $0.50 total)
 *    - MusicAPI:   MUSICAPI_DEV_DAILY_TASK_CAP (default 3 tasks/day)
 *    - Alibaba:    ALIBABA_DEV_DAILY_USD_CAP (default $1.00/day)
 *    - Google video in dev: simulated unless DEV_ALLOW_GOOGLE_VIDEO=true
 * 4. Prod circuit breaker: compares today's UTC spend + estimate against
 *    supplier_status.daily_spend_limit_usd and trips the supplier until end of UTC day.
 */

import { getSupabaseAdmin } from '../db';
import { isLiveMode } from '../config/mode';
import { INITIAL_AI_MODELS } from '../../src/services/configData';
import { getActualCostUsd } from '../../src/services/providerCatalog';
import { spendUsd, countUnitsSince } from '../costLedger';
import type { SupplierId, SupplierRoute } from '../../src/types';

export interface CapabilityCheckParams {
  modelId: string;
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  hasReferenceImage?: boolean;
}

export interface SupplierPlan {
  modelId: string;
  supplier: SupplierId;
  upstreamModel: string;
  priority: number;
  env: 'dev' | 'prod' | 'both';
  estCostUsd: number;
  dailySpendLimitUsd: number | null;
}

export class ModelTemporarilyUnavailableError extends Error {
  code = 'MODEL_TEMPORARILY_UNAVAILABLE';
  constructor(modelId: string, detail?: string) {
    super(detail ? `MODEL_TEMPORARILY_UNAVAILABLE: ${modelId} (${detail})` : `MODEL_TEMPORARILY_UNAVAILABLE: ${modelId}`);
    this.name = 'ModelTemporarilyUnavailableError';
  }
}

export class ProviderDispatchError extends Error {
  code: string;
  httpStatus?: number;
  retryableBeforeAccept: boolean;
  adminMessage?: string;

  constructor(params: {
    message: string;
    code: string;
    httpStatus?: number;
    retryableBeforeAccept: boolean;
    adminMessage?: string;
  }) {
    super(params.message);
    this.name = 'ProviderDispatchError';
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.retryableBeforeAccept = params.retryableBeforeAccept;
    this.adminMessage = params.adminMessage;
  }
}

let loggedProdMismatch = false;

/**
 * Rule 2.1: Environment detection.
 * PROVIDER_ENV=dev|prod. If unset: 'prod' when NODE_ENV=production, else 'dev'.
 * If PROVIDER_ENV=prod but NODE_ENV !== 'production', log a loud error and behave as 'dev'.
 */
export function getProviderEnv(): 'dev' | 'prod' {
  const raw = (process.env.PROVIDER_ENV || '').trim().toLowerCase();
  const isNodeProd = process.env.NODE_ENV === 'production';

  if (raw === 'prod') {
    if (!isNodeProd) {
      if (!loggedProdMismatch) {
        loggedProdMismatch = true;
        console.error(
          '🚨 [Suppliers] LOUD ERROR: PROVIDER_ENV=prod is set while NODE_ENV !== "production". Failing safe and behaving as PROVIDER_ENV=dev.'
        );
      }
      return 'dev';
    }
    return 'prod';
  }

  if (raw === 'dev') {
    return 'dev';
  }

  return isNodeProd ? 'prod' : 'dev';
}

/**
 * Checks if the required API credentials exist in env for a given supplier.
 */
export function hasSupplierCredentials(supplier: SupplierId): boolean {
  switch (supplier) {
    case 'cloudflare':
      return Boolean(
        (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim() &&
        (process.env.CLOUDFLARE_API_TOKEN || '').trim()
      );
    case 'kie':
      return Boolean((process.env.KIE_API_KEY || '').trim());
    case 'alibaba':
      return Boolean((process.env.DASHSCOPE_API_KEY || '').trim());
    case 'google':
      return Boolean((process.env.GEMINI_API_KEY || '').trim());
    case 'musicapi':
      return Boolean((process.env.MUSICAPI_API_KEY || '').trim());
    case 'sunor':
      return Boolean((process.env.SUNOR_API_KEY || '').trim());
    default:
      return false;
  }
}

/**
 * Capability matrix per supplier.
 * Registered dynamically by each adapter or evaluated via the canonical rules below.
 */
type CapabilityChecker = (params: CapabilityCheckParams) => boolean;
const adapterCapabilityCheckers = new Map<SupplierId, CapabilityChecker>();

export function registerSupplierCapability(supplier: SupplierId, checker: CapabilityChecker): void {
  adapterCapabilityCheckers.set(supplier, checker);
}

export function supplierSupportsRequest(supplier: SupplierId, params: CapabilityCheckParams): boolean {
  const custom = adapterCapabilityCheckers.get(supplier);
  if (custom) {
    return custom(params);
  }

  const { modelId, durationSeconds = 8, resolution = '720p', aspectRatio = '16:9' } = params;

  switch (supplier) {
    case 'cloudflare':
      return modelId === 'img_cf_flux1_schnell' || modelId === 'img_cf_flux2_klein_4b';

    case 'kie': {
      // Confirmed in docs.kie.ai/veo3-api: Kie Veo 3.1 generates 8s clips in 16:9 or 9:16 (720p default + 1080p endpoint).
      // Any 4s or 6s Veo clip request is NOT supported by Kie and goes straight to Google.
      const isVeoModel =
        modelId === 'vid_veo_3_1_lite' ||
        modelId === 'vid_veo_3_1_fast' ||
        modelId === 'vid_veo_3_1_standard';
      if (!isVeoModel) return false;
      if (Number(durationSeconds) !== 8) return false;
      if (resolution !== '720p' && resolution !== '1080p') return false;
      if (aspectRatio !== '16:9' && aspectRatio !== '9:16') return false;
      return true;
    }

    case 'google': {
      if (
        modelId === 'img_nano_banana_2_lite' ||
        modelId === 'img_nano_banana_2' ||
        modelId === 'img_nano_banana_pro'
      ) {
        return true;
      }
      if (
        modelId === 'vid_veo_3_1_lite' ||
        modelId === 'vid_veo_3_1_fast' ||
        modelId === 'vid_veo_3_1_standard'
      ) {
        const dur = Number(durationSeconds);
        return (dur === 4 || dur === 6 || dur === 8) && (resolution === '720p' || resolution === '1080p');
      }
      return false;
    }

    case 'alibaba': {
      const isWan = modelId === 'vid_wan_3_0_standard' || modelId === 'vid_wan_3_0_prime';
      if (!isWan) return false;
      const dur = Number(durationSeconds);
      if (!Number.isFinite(dur) || dur < 2 || dur > 30) return false;
      if (resolution !== '480p' && resolution !== '720p' && resolution !== '1080p') return false;
      return true;
    }

    case 'musicapi':
      return modelId === 'mus_lyria_3_pro' || modelId === 'mus_suno_sonic_v5';

    case 'sunor':
      return modelId === 'mus_suno_v6';

    default:
      return false;
  }
}

interface CachedSupplierData {
  fetchedAt: number;
  routesByModel: Map<string, SupplierRoute[]>;
  statusBySupplier: Map<
    string,
    {
      enabled: boolean;
      trippedUntil: string | null;
      tripReason: string | null;
      dailySpendLimitUsd: number | null;
    }
  >;
}

let supplierCache: CachedSupplierData | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

const DEFAULT_DAILY_LIMITS: Record<string, number | null> = {
  cloudflare: 5,
  kie: 25,
  alibaba: 25,
  google: 25,
  musicapi: 25,
  sunor: 10,
};

// In-memory circuit breaker and admin status overrides (also persisted to supplier_status when in live mode)
const inMemoryTrippedUntil = new Map<string, { until: string; reason: string }>();
const inMemorySupplierOverrides = new Map<
  string,
  {
    enabled?: boolean;
    dailySpendLimitUsd?: number | null;
  }
>();

export function setSupplierStatusOverride(
  supplier: string,
  updates: {
    enabled?: boolean;
    dailySpendLimitUsd?: number | null;
    clearTrip?: boolean;
  }
): void {
  const prev = inMemorySupplierOverrides.get(supplier) || {};
  if (updates.enabled !== undefined) prev.enabled = updates.enabled;
  if (updates.dailySpendLimitUsd !== undefined) prev.dailySpendLimitUsd = updates.dailySpendLimitUsd;
  inMemorySupplierOverrides.set(supplier, prev);

  if (updates.clearTrip) {
    inMemoryTrippedUntil.delete(supplier);
  }
  supplierCache = null;
}

export function getSupplierStatusOverride(supplier: string) {
  return {
    ...(inMemorySupplierOverrides.get(supplier) || {}),
    tripped: inMemoryTrippedUntil.get(supplier) || null,
  };
}

export function clearSupplierCache(): void {
  supplierCache = null;
}

async function loadSupplierRoutingData(): Promise<CachedSupplierData> {
  const now = Date.now();
  if (supplierCache && now - supplierCache.fetchedAt < CACHE_TTL_MS) {
    return supplierCache;
  }

  const routesByModel = new Map<string, SupplierRoute[]>();
  const statusBySupplier = new Map<
    string,
    {
      enabled: boolean;
      trippedUntil: string | null;
      tripReason: string | null;
      dailySpendLimitUsd: number | null;
    }
  >();

  // Seed defaults from catalog first
  for (const m of INITIAL_AI_MODELS) {
    if (m.suppliers?.length) {
      routesByModel.set(m.id, [...m.suppliers]);
    }
  }
  for (const [sup, limit] of Object.entries(DEFAULT_DAILY_LIMITS)) {
    const memTrip = inMemoryTrippedUntil.get(sup);
    const override = inMemorySupplierOverrides.get(sup);
    statusBySupplier.set(sup, {
      enabled: override?.enabled !== undefined ? override.enabled : true,
      trippedUntil: memTrip?.until ?? null,
      tripReason: memTrip?.reason ?? null,
      dailySpendLimitUsd:
        override?.dailySpendLimitUsd !== undefined ? override.dailySpendLimitUsd : limit,
    });
  }

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const [{ data: dbRoutes, error: rErr }, { data: dbStatus, error: sErr }] = await Promise.all([
          admin.from('model_suppliers').select('*').order('priority', { ascending: true }),
          admin.from('supplier_status').select('*'),
        ]);

        if (!rErr && Array.isArray(dbRoutes) && dbRoutes.length > 0) {
          const grouped = new Map<string, SupplierRoute[]>();
          for (const row of dbRoutes) {
            const list = grouped.get(row.model_id) || [];
            list.push({
              supplier: row.supplier as SupplierId,
              upstream_model: row.upstream_model,
              priority: Number(row.priority ?? 1),
              env: (row.env as 'dev' | 'prod' | 'both') || 'both',
              enabled: Boolean(row.enabled),
            });
            grouped.set(row.model_id, list);
          }
          for (const [modelId, list] of grouped.entries()) {
            routesByModel.set(modelId, list);
          }
        }

        if (!sErr && Array.isArray(dbStatus)) {
          for (const row of dbStatus) {
            const memTrip = inMemoryTrippedUntil.get(row.supplier);
            const override = inMemorySupplierOverrides.get(row.supplier);
            statusBySupplier.set(row.supplier, {
              enabled:
                override?.enabled !== undefined
                  ? override.enabled
                  : row.enabled !== false,
              trippedUntil: row.tripped_until || memTrip?.until || null,
              tripReason: row.trip_reason || memTrip?.reason || null,
              dailySpendLimitUsd:
                override?.dailySpendLimitUsd !== undefined
                  ? override.dailySpendLimitUsd
                  : row.daily_spend_limit_usd !== null && row.daily_spend_limit_usd !== undefined
                    ? Number(row.daily_spend_limit_usd)
                    : DEFAULT_DAILY_LIMITS[row.supplier] ?? null,
            });
          }
        }
      } catch (err: any) {
        console.warn('[Suppliers] Fallback to catalog supplier routes (DB query warning):', err?.message || err);
      }
    }
  }

  supplierCache = {
    fetchedAt: now,
    routesByModel,
    statusBySupplier,
  };
  return supplierCache;
}

/**
 * Resolves the ordered list of candidate suppliers for a given model and request parameters.
 * Never switches to a different model. Throws MODEL_TEMPORARILY_UNAVAILABLE if no candidate remains.
 */
export async function resolveSuppliers(
  modelId: string,
  params: Omit<CapabilityCheckParams, 'modelId'> & { allowUnconfiguredInDev?: boolean } = {}
): Promise<SupplierPlan[]> {
  const env = getProviderEnv();
  const data = await loadSupplierRoutingData();
  const rawRoutes = data.routesByModel.get(modelId) || [];
  const now = Date.now();
  const startOfToday = getStartOfUtcDay();

  const durationSeconds = params.durationSeconds ?? 8;
  const resolution = (params.resolution as '480p' | '720p' | '1080p') || '720p';

  const candidates: SupplierPlan[] = [];

  for (const route of rawRoutes) {
    if (!route.enabled) continue;
    if (route.env !== 'both' && route.env !== env) continue;

    const status = data.statusBySupplier.get(route.supplier);
    if (status && !status.enabled) continue;

    // Check if circuit breaker is currently tripped
    const memTrip = inMemoryTrippedUntil.get(route.supplier);
    const trippedUntilIso = status?.trippedUntil || memTrip?.until || null;
    if (trippedUntilIso) {
      const tripMs = Date.parse(trippedUntilIso);
      if (Number.isFinite(tripMs) && tripMs > now) {
        continue;
      }
    }

    // Check capability for this exact request (e.g., 4s Veo skips Kie and goes straight to Google)
    if (
      !supplierSupportsRequest(route.supplier, {
        modelId,
        durationSeconds: params.durationSeconds,
        resolution: params.resolution,
        aspectRatio: params.aspectRatio,
        hasReferenceImage: params.hasReferenceImage,
      })
    ) {
      continue;
    }

    // In live/prod mode (or unless allowUnconfiguredInDev is true), require API credentials
    const hasCreds = hasSupplierCredentials(route.supplier);
    if (!hasCreds && !params.allowUnconfiguredInDev) {
      continue;
    }

    const estCostUsd = getActualCostUsd(modelId, route.supplier, {
      resolution,
      durationSeconds,
    });

    const dailyLimit = status?.dailySpendLimitUsd ?? DEFAULT_DAILY_LIMITS[route.supplier] ?? null;
    if (dailyLimit !== null && Number.isFinite(dailyLimit) && dailyLimit >= 0) {
      const spentToday = await spendUsd({ supplier: route.supplier, since: startOfToday });
      if (spentToday + estCostUsd > dailyLimit + 1e-6) {
        const reason = `Daily spend limit exceeded ($${spentToday.toFixed(2)} + $${estCostUsd.toFixed(2)} > $${dailyLimit.toFixed(2)})`;
        await tripSupplierCircuit(route.supplier, reason);
        continue;
      }
    }

    candidates.push({
      modelId,
      supplier: route.supplier,
      upstreamModel: route.upstream_model,
      priority: route.priority,
      env: route.env,
      estCostUsd,
      dailySpendLimitUsd: dailyLimit,
    });
  }

  candidates.sort((a, b) => a.priority - b.priority);

  if (candidates.length === 0) {
    throw new ModelTemporarilyUnavailableError(modelId);
  }

  return candidates;
}

function getStartOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function getEndOfUtcDayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
}

export async function tripSupplierCircuit(supplier: SupplierId, reason: string): Promise<void> {
  const until = getEndOfUtcDayIso();
  inMemoryTrippedUntil.set(supplier, { until, reason });
  if (supplierCache) {
    const existing = supplierCache.statusBySupplier.get(supplier);
    if (existing) {
      existing.trippedUntil = until;
      existing.tripReason = reason;
    }
  }
  console.error(`🚨 [Suppliers] Circuit breaker tripped for supplier="${supplier}" until ${until}: ${reason}`);

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        await admin
          .from('supplier_status')
          .upsert(
            {
              supplier,
              enabled: true,
              tripped_until: until,
              trip_reason: reason,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'supplier' }
          );
      } catch (err: any) {
        console.warn('[Suppliers] Failed to persist circuit trip to DB (non-fatal):', err?.message || err);
      }
    }
  }
}

/**
 * Checks dev hard caps and prod daily spend circuit breakers BEFORE a paid provider call is made.
 * Returns:
 * - 'ok'          : safe to call upstream provider
 * - 'cap_reached' : dev hard cap reached (caller must return simulated placeholder / demo MP4 with simulated: true)
 * - 'tripped'     : prod daily spend limit reached (supplier tripped until end of UTC day; caller should try next supplier)
 */
export async function reserveSupplierBudget(
  supplier: SupplierId,
  estUsd: number,
  units: number = 1,
  generationType: 'image' | 'video' | 'music' = 'image'
): Promise<'ok' | 'cap_reached' | 'tripped'> {
  const env = getProviderEnv();
  const startOfToday = getStartOfUtcDay();

  if (env === 'dev') {
    if (supplier === 'cloudflare') {
      const capRaw = Number(process.env.CF_DEV_DAILY_IMAGE_CAP);
      const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 100;
      const usedToday = await countUnitsSince({ supplier: 'cloudflare', env: 'dev', since: startOfToday });
      if (usedToday + units > cap) {
        console.warn(`[Suppliers] dev cap reached for cloudflare (${usedToday} + ${units} > ${cap} images/day)`);
        return 'cap_reached';
      }
      return 'ok';
    }

    if (supplier === 'kie') {
      const capRaw = Number(process.env.KIE_DEV_TOTAL_USD_CAP);
      const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 0.40;
      // Total cumulative dev spend for Kie.ai (protects free test credits)
      const totalSpent = await spendUsd({ supplier: 'kie', env: 'dev' });
      if (totalSpent + estUsd > cap + 1e-6) {
        console.warn(`[Suppliers] dev cap reached for kie ($${totalSpent.toFixed(4)} + $${estUsd.toFixed(4)} > $${cap.toFixed(2)} total)`);
        return 'cap_reached';
      }
      return 'ok';
    }

    if (supplier === 'sunor') {
      const capRaw = Number(process.env.SUNOR_DEV_TOTAL_USD_CAP ?? process.env.SUNOR_DEV_DAILY_USD_CAP);
      const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 0.50;
      // Total cumulative dev spend for Sunor (protects free test credits)
      const totalSpent = await spendUsd({ supplier: 'sunor', env: 'dev' });
      if (totalSpent + estUsd > cap + 1e-6) {
        console.warn(`[Suppliers] dev cap reached for sunor ($${totalSpent.toFixed(4)} + $${estUsd.toFixed(4)} > $${cap.toFixed(2)} total)`);
        return 'cap_reached';
      }
      return 'ok';
    }

    if (supplier === 'musicapi') {
      const capRaw = Number(process.env.MUSICAPI_DEV_DAILY_TASK_CAP);
      const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 3;
      const tasksToday = await countUnitsSince({ supplier: 'musicapi', env: 'dev', since: startOfToday });
      if (tasksToday + 1 > cap) {
        console.warn(`[Suppliers] dev cap reached for musicapi (${tasksToday} + 1 > ${cap} tasks/day)`);
        return 'cap_reached';
      }
      return 'ok';
    }

    if (supplier === 'alibaba') {
      const capRaw = Number(process.env.ALIBABA_DEV_DAILY_USD_CAP);
      const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 1.00;
      const spentToday = await spendUsd({ supplier: 'alibaba', env: 'dev', since: startOfToday });
      if (spentToday + estUsd > cap + 1e-6) {
        console.warn(`[Suppliers] dev cap reached for alibaba ($${spentToday.toFixed(4)} + $${estUsd.toFixed(4)} > $${cap.toFixed(2)}/day)`);
        return 'cap_reached';
      }
      return 'ok';
    }

    if (supplier === 'google') {
      if (generationType === 'video') {
        if (process.env.DEV_ALLOW_GOOGLE_VIDEO !== 'true') {
          console.warn('[Suppliers] dev cap reached for google video (DEV_ALLOW_GOOGLE_VIDEO !== "true"; using simulation)');
          return 'cap_reached';
        }
        return 'ok';
      }

      if (generationType === 'image') {
        const capRaw = Number(process.env.GOOGLE_DEV_DAILY_IMAGE_CAP);
        const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 10;
        const usedToday = await countUnitsSince({ supplier: 'google', env: 'dev', since: startOfToday });
        if (usedToday + units > cap) {
          console.warn(`[Suppliers] dev cap reached for google images (${usedToday} + ${units} > ${cap} images/day)`);
          return 'cap_reached';
        }
        return 'ok';
      }

      return 'ok';
    }

    return 'ok';
  }

  // PROD mode: check daily spend circuit breaker
  const data = await loadSupplierRoutingData();
  const status = data.statusBySupplier.get(supplier);
  const dailyLimit = status?.dailySpendLimitUsd ?? DEFAULT_DAILY_LIMITS[supplier] ?? null;

  if (dailyLimit !== null && Number.isFinite(dailyLimit) && dailyLimit > 0) {
    const spentToday = await spendUsd({ supplier, env: 'prod', since: startOfToday });
    if (spentToday + estUsd > dailyLimit + 1e-6) {
      const reason = `Daily spend limit exceeded ($${spentToday.toFixed(2)} + $${estUsd.toFixed(2)} > $${dailyLimit.toFixed(2)})`;
      await tripSupplierCircuit(supplier, reason);
      return 'tripped';
    }
  }

  return 'ok';
}

/**
 * Rule 2.7: Determines whether an error occurred BEFORE the provider accepted the job
 * and is safe to fallback to the next supplier of the SAME model.
 * Never returns true on a 4xx caused by the prompt (safety block, 400 bad request).
 */
export function isRetryableBeforeAcceptError(err: any): boolean {
  if (!err) return false;
  if (err instanceof ProviderDispatchError) {
    return err.retryableBeforeAccept;
  }
  const status = Number(err.status || err.httpStatus || err.statusCode || 0);
  if (status === 429 || (status >= 500 && status <= 599)) {
    return true;
  }
  const msg = String(err.message || '').toLowerCase();
  if (
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('quota') ||
    msg.includes('insufficient') ||
    msg.includes('rate limit')
  ) {
    return true;
  }
  return false;
}

// ============================================================================
// Step 8: Safety helpers for HTTP calls, secret redaction, and media downloads
// ============================================================================

export const SUBMIT_TIMEOUT_MS = 30_000;         // 30 s
export const CLOUDFLARE_IMAGE_TIMEOUT_MS = 60_000; // 60 s
export const DOWNLOAD_TIMEOUT_MS = 120_000;      // 120 s
export const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

export function redactSecrets(input: string): string {
  if (!input) return '';
  let out = input;
  const secrets = [
    process.env.CLOUDFLARE_API_TOKEN,
    process.env.CLOUDFLARE_ACCOUNT_ID,
    process.env.KIE_API_KEY,
    process.env.DASHSCOPE_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.MUSICAPI_API_KEY,
    process.env.SUNOR_API_KEY,
  ].filter(Boolean) as string[];

  for (const s of secrets) {
    if (s.length >= 6) {
      out = out.split(s).join('[REDACTED]');
    }
  }
  // Also redact query-string tokens/signatures
  out = out.replace(/([?&](?:token|key|api_key|Signature|OSSAccessKeyId|X-Amz-Signature|X-Amz-Credential)=)[^&\s]+/gi, '$1[REDACTED]');
  return out;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = SUBMIT_TIMEOUT_MS,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export function assertSafeRemoteUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid download URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Refusing non-HTTPS download protocol: ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^fc00:/i.test(host) ||
    /^fd[0-9a-f]{2}:/i.test(host) ||
    /^fe80:/i.test(host)
  ) {
    throw new Error(`Refusing private or loopback download host: ${host}`);
  }

  return parsed;
}

export async function downloadMediaWithMetaSafe(
  rawUrl: string,
  headers: Record<string, string> = {},
  timeoutMs: number = DOWNLOAD_TIMEOUT_MS
): Promise<{ buffer: Buffer; contentType: string }> {
  const safeUrl = assertSafeRemoteUrl(rawUrl);
  const res = await fetchWithTimeout(safeUrl.toString(), { method: 'GET', headers }, timeoutMs);
  if (!res.ok) {
    throw new Error(`Media download failed with HTTP ${res.status}`);
  }

  const contentType = (res.headers.get('content-type') || '').trim();
  const contentLengthHeader = res.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Media download exceeds 200 MB limit (${declaredBytes} bytes)`);
    }
  }

  if (!res.body) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Media download exceeds 200 MB limit (${ab.byteLength} bytes)`);
    }
    return { buffer: Buffer.from(ab), contentType };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new Error(`Media download exceeded 200 MB limit while streaming`);
      }
      chunks.push(value);
    }
  }

  return {
    buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))),
    contentType,
  };
}

export async function downloadMediaBufferSafe(
  rawUrl: string,
  headers: Record<string, string> = {},
  timeoutMs: number = DOWNLOAD_TIMEOUT_MS
): Promise<Buffer> {
  const { buffer } = await downloadMediaWithMetaSafe(rawUrl, headers, timeoutMs);
  return buffer;
}
