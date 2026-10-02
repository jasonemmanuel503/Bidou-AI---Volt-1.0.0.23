/**
 * server/planLimits.ts
 *
 * Plain-language summary:
 * Manages per-tier video duration limits (`max_video_seconds`) and monthly premium
 * model generation caps (`premium_monthly_cap`).
 * - Caches `plan_limits` from Supabase for 60 seconds.
 * - Falls back to the locked Master Context defaults in demo mode or if the table
 *   is not yet migrated:
 *     free:    8s  / 0 premium per month
 *     starter: 8s  / 5 premium per month
 *     creator: 15s / 20 premium per month
 *     pro:     30s / 60 premium per month
 *     studio:  30s / 200 premium per month
 * - Provides helpers to check what minimum plan tier is required for a requested
 *   video duration and how many premium model jobs a user has run in the current UTC month.
 */

import { PlanTier } from '../src/types';
import { TIER_RANK } from '../src/services/tiers';
import { INITIAL_AI_MODELS } from '../src/services/configData';
import { getSupabaseAdmin, getRecentJobsForUser } from './db';
import { isLiveMode } from './config/mode';

export const PLAN_TIER_ORDER: PlanTier[] = ['free', 'starter', 'creator', 'pro', 'studio'];

export interface PlanLimitRow {
  plan_tier: PlanTier;
  max_video_seconds: number;
  premium_monthly_cap: number;
  updated_at: string;
}

export const DEFAULT_PLAN_LIMITS: Record<PlanTier, { max_video_seconds: number; premium_monthly_cap: number }> = {
  free: { max_video_seconds: 8, premium_monthly_cap: 0 },
  starter: { max_video_seconds: 8, premium_monthly_cap: 5 },
  creator: { max_video_seconds: 15, premium_monthly_cap: 20 },
  pro: { max_video_seconds: 30, premium_monthly_cap: 60 },
  studio: { max_video_seconds: 30, premium_monthly_cap: 200 },
};

const inMemoryOverrides = new Map<PlanTier, PlanLimitRow>();
let cachedLimits: { fetchedAt: number; map: Map<PlanTier, PlanLimitRow> } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function invalidatePlanLimitsCache(): void {
  cachedLimits = null;
}

export async function getPlanLimitsMap(): Promise<Map<PlanTier, PlanLimitRow>> {
  const now = Date.now();
  if (cachedLimits && now - cachedLimits.fetchedAt < CACHE_TTL_MS) {
    return cachedLimits.map;
  }

  const map = new Map<PlanTier, PlanLimitRow>();
  const nowIso = new Date().toISOString();

  for (const tier of PLAN_TIER_ORDER) {
    const def = DEFAULT_PLAN_LIMITS[tier];
    const override = inMemoryOverrides.get(tier);
    map.set(
      tier,
      override || {
        plan_tier: tier,
        max_video_seconds: def.max_video_seconds,
        premium_monthly_cap: def.premium_monthly_cap,
        updated_at: nowIso,
      }
    );
  }

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const { data, error } = await admin.from('plan_limits').select('*');
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            const t = row.plan_tier as PlanTier;
            if (PLAN_TIER_ORDER.includes(t)) {
              const override = inMemoryOverrides.get(t);
              map.set(t, {
                plan_tier: t,
                max_video_seconds:
                  override?.max_video_seconds ??
                  Number(row.max_video_seconds ?? DEFAULT_PLAN_LIMITS[t].max_video_seconds),
                premium_monthly_cap:
                  override?.premium_monthly_cap ??
                  Number(row.premium_monthly_cap ?? DEFAULT_PLAN_LIMITS[t].premium_monthly_cap),
                updated_at: override?.updated_at || row.updated_at || nowIso,
              });
            }
          }
        }
      } catch (err: any) {
        console.warn('[PlanLimits] Failed to query plan_limits, using defaults:', err?.message || err);
      }
    }
  }

  cachedLimits = { fetchedAt: now, map };
  return map;
}

export async function getPlanLimitForTier(tier: PlanTier): Promise<PlanLimitRow> {
  const map = await getPlanLimitsMap();
  return (
    map.get(tier) || {
      plan_tier: tier,
      ...DEFAULT_PLAN_LIMITS[tier || 'free'],
      updated_at: new Date().toISOString(),
    }
  );
}

export async function updatePlanLimitForTier(
  tier: PlanTier,
  updates: { max_video_seconds?: number; premium_monthly_cap?: number }
): Promise<PlanLimitRow> {
  const current = await getPlanLimitForTier(tier);
  const next: PlanLimitRow = {
    plan_tier: tier,
    max_video_seconds:
      updates.max_video_seconds !== undefined ? updates.max_video_seconds : current.max_video_seconds,
    premium_monthly_cap:
      updates.premium_monthly_cap !== undefined ? updates.premium_monthly_cap : current.premium_monthly_cap,
    updated_at: new Date().toISOString(),
  };

  inMemoryOverrides.set(tier, next);
  invalidatePlanLimitsCache();

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      const { error } = await admin.from('plan_limits').upsert(
        {
          plan_tier: tier,
          max_video_seconds: next.max_video_seconds,
          premium_monthly_cap: next.premium_monthly_cap,
          updated_at: next.updated_at,
        },
        { onConflict: 'plan_tier' }
      );
      if (error) {
        console.warn('[PlanLimits] Supabase upsert warning (in-memory override active):', error.message);
      }
    }
  }

  return next;
}

/**
 * Finds the cheapest plan tier whose `max_video_seconds >= durationSeconds`
 * (and is at least `minPlanTier` if specified).
 */
export async function findRequiredTierForDuration(
  durationSeconds: number,
  minPlanTier?: PlanTier
): Promise<PlanTier> {
  const map = await getPlanLimitsMap();
  const minRank = minPlanTier ? (TIER_RANK[minPlanTier] ?? 0) : 0;

  for (const tier of PLAN_TIER_ORDER) {
    if ((TIER_RANK[tier] ?? 0) < minRank) continue;
    const row = map.get(tier);
    if (row && row.max_video_seconds >= durationSeconds) {
      return tier;
    }
  }
  return 'studio';
}

export function getStartOfCurrentUtcMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

export function getStartOfNextUtcMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString();
}

export async function getPremiumModelIds(): Promise<Set<string>> {
  const premiumIds = new Set<string>();
  for (const m of INITIAL_AI_MODELS) {
    if (m.is_premium) premiumIds.add(m.id);
  }

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const { data, error } = await admin.from('ai_models').select('id, is_premium').eq('is_premium', true);
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            if (row.id) premiumIds.add(row.id);
          }
        }
      } catch {
        // ignore if column not yet migrated
      }
    }
  }

  return premiumIds;
}

/**
 * Counts how many jobs of premium models this user has run in the current UTC month
 * with status in ('queued', 'processing', 'completed') where (credits_consumed > 0 or still running).
 */
export async function countUserPremiumJobsThisMonth(userId: string): Promise<number> {
  const startOfMonthIso = getStartOfCurrentUtcMonthIso();
  const startOfMonthMs = Date.parse(startOfMonthIso);
  const premiumModelIds = await getPremiumModelIds();
  if (premiumModelIds.size === 0) return 0;

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('generation_jobs')
          .select('id, model_id, status, credits_consumed, created_at')
          .eq('user_id', userId)
          .in('model_id', Array.from(premiumModelIds))
          .in('status', ['queued', 'processing', 'completed'])
          .gte('created_at', startOfMonthIso);

        if (!error && Array.isArray(data)) {
          return data.filter(
            (row) =>
              row.status === 'queued' ||
              row.status === 'processing' ||
              Number(row.credits_consumed ?? 1) > 0
          ).length;
        }
      } catch (err: any) {
        console.warn('[PlanLimits] countUserPremiumJobsThisMonth query warning:', err?.message || err);
      }
    }
  }

  // Demo mode / fallback: inspect user's recent jobs in memory
  const recent = await getRecentJobsForUser(userId, undefined, 500);
  return recent.filter((j) => {
    if (!j.model_id || !premiumModelIds.has(j.model_id)) return false;
    const createdMs = j.created_at ? Date.parse(j.created_at) : 0;
    if (createdMs < startOfMonthMs) return false;
    if (j.status === 'queued' || j.status === 'processing') return true;
    if (j.status === 'completed') {
      const consumed = (j as any).credits_consumed;
      return consumed === undefined || Number(consumed) > 0;
    }
    return false;
  }).length;
}
