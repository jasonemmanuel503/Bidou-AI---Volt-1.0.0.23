/**
 * server/costLedger.ts
 *
 * Plain-language summary:
 * Records every paid supplier attempt, completion, and failure into the
 * `provider_cost_ledger` table so we know our real provider cost, credits charged,
 * and profit margin per generation variant. Also provides `spendUsd()` and
 * `countUnitsToday()` so the dev/prod supplier router can enforce daily caps
 * and production spend circuit breakers.
 *
 * Safety rule: A cost ledger failure MUST NEVER fail a customer generation.
 * In demo mode (or when the DB table is unreachable), entries are kept in an
 * in-memory array so dev caps and smoke tests still work.
 */

import { getSupabaseAdmin } from './db';
import { isLiveMode } from './config/mode';
import { DEFAULT_PRICING_FACTORS } from '../src/services/pricingEngine';
import crypto from 'crypto';

export interface LedgerAttemptInput {
  jobId?: string | null;
  variantIndex?: number;
  userId?: string | null;
  modelId: string;
  supplier: string;
  upstreamModel?: string;
  env: 'dev' | 'prod';
  units?: number;
  unitLabel?: 'image' | 'second' | 'clip' | 'song' | string;
  estCostUsd: number;
  creditsCharged?: number;
}

export interface LedgerRow {
  id: string;
  job_id: string | null;
  variant_index: number;
  user_id: string | null;
  model_id: string;
  supplier: string;
  upstream_model: string | null;
  env: 'dev' | 'prod';
  units: number;
  unit_label: string;
  est_cost_usd: number;
  actual_cost_usd: number | null;
  fx_xaf_per_usd: number;
  credits_charged: number;
  revenue_floor_xaf: number;
  status: 'dispatched' | 'succeeded' | 'failed';
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

const inMemoryLedger: LedgerRow[] = [];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function asValidUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  return UUID_RE.test(val) ? val : null;
}

export function getFxXafPerUsd(): number {
  const raw = Number(process.env.FX_XAF_PER_USD);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_PRICING_FACTORS.usd_to_xaf_rate;
}

export function getInMemoryLedger(): LedgerRow[] {
  return [...inMemoryLedger];
}

export function getAttempt(
  jobId: string | null | undefined,
  variantIndex: number,
  supplier: string
): LedgerRow | undefined {
  for (let i = inMemoryLedger.length - 1; i >= 0; i--) {
    const r = inMemoryLedger[i];
    if ((jobId ? r.job_id === jobId : true) && r.variant_index === variantIndex && r.supplier === supplier) {
      return r;
    }
  }
  return undefined;
}

export function clearInMemoryLedger(): void {
  inMemoryLedger.length = 0;
}

export async function recordAttempt(input: LedgerAttemptInput): Promise<LedgerRow | null> {
  const now = new Date().toISOString();
  const fx = getFxXafPerUsd();
  const units = Number.isFinite(input.units) && (input.units as number) > 0 ? Number(input.units) : 1;
  const creditsCharged = Math.max(0, Math.round(input.creditsCharged ?? 0));
  const estCostUsd = Math.max(0, Number(input.estCostUsd || 0));
  const variantIndex = input.variantIndex ?? 0;
  const rowEnv: 'dev' | 'prod' =
    input.env || (process.env.PROVIDER_ENV === 'prod' && process.env.NODE_ENV === 'production' ? 'prod' : 'dev');

  const memRow: LedgerRow = {
    id: crypto.randomUUID(),
    job_id: input.jobId ?? null,
    variant_index: variantIndex,
    user_id: input.userId ?? null,
    model_id: input.modelId,
    supplier: input.supplier,
    upstream_model: input.upstreamModel ?? null,
    env: rowEnv,
    units,
    unit_label: input.unitLabel || 'image',
    est_cost_usd: estCostUsd,
    actual_cost_usd: null,
    fx_xaf_per_usd: fx,
    credits_charged: creditsCharged,
    revenue_floor_xaf: Number((creditsCharged * 0.79 * 0.975).toFixed(4)),
    status: 'dispatched',
    error_code: null,
    created_at: now,
    updated_at: now,
  };

  // Upsert in-memory store by (job_id, variant_index, supplier) when job_id is present
  const existingIdx = inMemoryLedger.findIndex(
    (r) =>
      r.job_id !== null &&
      r.job_id === memRow.job_id &&
      r.variant_index === memRow.variant_index &&
      r.supplier === memRow.supplier
  );
  if (existingIdx >= 0) {
    inMemoryLedger[existingIdx] = memRow;
  } else {
    inMemoryLedger.push(memRow);
  }

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const dbJobId = asValidUuidOrNull(input.jobId);
        const dbUserId = asValidUuidOrNull(input.userId);
        const payload = {
          job_id: dbJobId,
          variant_index: variantIndex,
          user_id: dbUserId,
          model_id: input.modelId,
          supplier: input.supplier,
          upstream_model: input.upstreamModel ?? null,
          env: rowEnv,
          units,
          unit_label: input.unitLabel || 'image',
          est_cost_usd: estCostUsd,
          fx_xaf_per_usd: fx,
          credits_charged: creditsCharged,
          status: 'dispatched',
          updated_at: now,
        };

        if (dbJobId) {
          const { error } = await admin
            .from('provider_cost_ledger')
            .upsert(payload, { onConflict: 'job_id,variant_index,supplier' });
          if (error) {
            console.warn('[CostLedger] Upsert attempt warning (non-fatal):', error.message);
          }
        } else {
          const { error } = await admin.from('provider_cost_ledger').insert(payload);
          if (error) {
            console.warn('[CostLedger] Insert attempt warning (non-fatal):', error.message);
          }
        }
      } catch (err: any) {
        console.warn('[CostLedger] Exception in recordAttempt (non-fatal):', err?.message || err);
      }
    }
  }

  return memRow;
}

export async function markSucceeded(
  jobId: string | null | undefined,
  variantIndex: number,
  supplier: string,
  actualCostUsd?: number
): Promise<void> {
  const now = new Date().toISOString();

  for (let i = inMemoryLedger.length - 1; i >= 0; i--) {
    const row = inMemoryLedger[i];
    if (
      (jobId ? row.job_id === jobId : true) &&
      row.variant_index === variantIndex &&
      row.supplier === supplier
    ) {
      row.status = 'succeeded';
      if (actualCostUsd !== undefined && Number.isFinite(actualCostUsd)) {
        row.actual_cost_usd = actualCostUsd;
      }
      row.updated_at = now;
      break;
    }
  }

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    const dbJobId = asValidUuidOrNull(jobId);
    if (admin && dbJobId) {
      try {
        const updates: Record<string, any> = {
          status: 'succeeded',
          updated_at: now,
        };
        if (actualCostUsd !== undefined && Number.isFinite(actualCostUsd)) {
          updates.actual_cost_usd = actualCostUsd;
        }
        const { error } = await admin
          .from('provider_cost_ledger')
          .update(updates)
          .eq('job_id', dbJobId)
          .eq('variant_index', variantIndex)
          .eq('supplier', supplier);
        if (error) {
          console.warn('[CostLedger] markSucceeded warning (non-fatal):', error.message);
        }
      } catch (err: any) {
        console.warn('[CostLedger] Exception in markSucceeded (non-fatal):', err?.message || err);
      }
    }
  }
}

export async function markFailed(
  jobId: string | null | undefined,
  variantIndex: number,
  supplier: string,
  errorCode: string
): Promise<void> {
  const now = new Date().toISOString();

  for (let i = inMemoryLedger.length - 1; i >= 0; i--) {
    const row = inMemoryLedger[i];
    if (
      (jobId ? row.job_id === jobId : true) &&
      row.variant_index === variantIndex &&
      row.supplier === supplier
    ) {
      row.status = 'failed';
      row.error_code = errorCode;
      row.updated_at = now;
      break;
    }
  }

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    const dbJobId = asValidUuidOrNull(jobId);
    if (admin && dbJobId) {
      try {
        const { error } = await admin
          .from('provider_cost_ledger')
          .update({
            status: 'failed',
            error_code: errorCode,
            updated_at: now,
          })
          .eq('job_id', dbJobId)
          .eq('variant_index', variantIndex)
          .eq('supplier', supplier);
        if (error) {
          console.warn('[CostLedger] markFailed warning (non-fatal):', error.message);
        }
      } catch (err: any) {
        console.warn('[CostLedger] Exception in markFailed (non-fatal):', err?.message || err);
      }
    }
  }
}

export async function updateLedgerCreditsCharged(
  jobId: string | null | undefined,
  variantIndex: number,
  supplier: string,
  creditsCharged: number
): Promise<void> {
  const now = new Date().toISOString();
  const validCredits = Math.max(0, Math.round(creditsCharged));

  for (let i = inMemoryLedger.length - 1; i >= 0; i--) {
    const row = inMemoryLedger[i];
    if (
      (jobId ? row.job_id === jobId : true) &&
      row.variant_index === variantIndex &&
      row.supplier === supplier
    ) {
      row.credits_charged = validCredits;
      row.revenue_floor_xaf = validCredits * 0.79 * 0.975;
      row.updated_at = now;
      break;
    }
  }

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    const dbJobId = asValidUuidOrNull(jobId);
    if (admin && dbJobId) {
      try {
        const { error } = await admin
          .from('provider_cost_ledger')
          .update({
            credits_charged: validCredits,
            updated_at: now,
          })
          .eq('job_id', dbJobId)
          .eq('variant_index', variantIndex)
          .eq('supplier', supplier);
        if (error) {
          console.warn('[CostLedger] updateLedgerCreditsCharged warning (non-fatal):', error.message);
        }
      } catch (err: any) {
        console.warn('[CostLedger] Exception in updateLedgerCreditsCharged (non-fatal):', err?.message || err);
      }
    }
  }
}

export async function spendUsd(params: {
  supplier: string;
  env?: 'dev' | 'prod';
  since?: Date;
}): Promise<number> {
  const { supplier, env, since } = params;
  const sinceIso = since ? since.toISOString() : undefined;

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        let query = admin
          .from('provider_cost_ledger')
          .select('est_cost_usd, actual_cost_usd, status, created_at')
          .eq('supplier', supplier)
          .in('status', ['dispatched', 'succeeded']);

        if (env) {
          query = query.eq('env', env);
        }
        if (sinceIso) {
          query = query.gte('created_at', sinceIso);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          let total = 0;
          for (const r of data) {
            const c = r.actual_cost_usd !== null && r.actual_cost_usd !== undefined
              ? Number(r.actual_cost_usd)
              : Number(r.est_cost_usd || 0);
            if (Number.isFinite(c)) total += c;
          }
          return total;
        }
      } catch (err: any) {
        console.warn('[CostLedger] spendUsd fallback to memory (non-fatal):', err?.message || err);
      }
    }
  }

  let memTotal = 0;
  const sinceMs = since ? since.getTime() : 0;
  for (const r of inMemoryLedger) {
    if (r.supplier !== supplier) continue;
    if (env && r.env !== env) continue;
    if (r.status !== 'dispatched' && r.status !== 'succeeded') continue;
    if (sinceMs > 0 && Date.parse(r.created_at) < sinceMs) continue;
    const cost = r.actual_cost_usd !== null ? r.actual_cost_usd : r.est_cost_usd;
    memTotal += cost;
  }
  return memTotal;
}

export async function countUnitsSince(params: {
  supplier: string;
  env?: 'dev' | 'prod';
  since?: Date;
}): Promise<number> {
  const { supplier, env, since } = params;
  const sinceIso = since ? since.toISOString() : undefined;

  if (isLiveMode()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        let query = admin
          .from('provider_cost_ledger')
          .select('units, status, created_at')
          .eq('supplier', supplier)
          .in('status', ['dispatched', 'succeeded']);

        if (env) {
          query = query.eq('env', env);
        }
        if (sinceIso) {
          query = query.gte('created_at', sinceIso);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data.reduce((acc, r) => acc + Number(r.units || 1), 0);
        }
      } catch (err: any) {
        console.warn('[CostLedger] countUnitsSince fallback to memory (non-fatal):', err?.message || err);
      }
    }
  }

  let memUnits = 0;
  const sinceMs = since ? since.getTime() : 0;
  for (const r of inMemoryLedger) {
    if (r.supplier !== supplier) continue;
    if (env && r.env !== env) continue;
    if (r.status !== 'dispatched' && r.status !== 'succeeded') continue;
    if (sinceMs > 0 && Date.parse(r.created_at) < sinceMs) continue;
    memUnits += r.units;
  }
  return memUnits;
}
