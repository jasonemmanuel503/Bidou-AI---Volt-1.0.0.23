import { getAuthHeaders as getAuthHeadersFromToken } from './authToken';
import type { AiModelConfig, PlanTier, SupplierId, VideoOptions } from '../types';
import type { ModelPriceTableEntry } from './pricingEngine';

export interface WalletResponse {
  balance: number;
  paid_balance?: number;
  promo_balance?: number;
  total_balance?: number;
  updated_at: string;
  plan_tier: string;
  lifetime_spend_fcfa?: number;
  mode?: 'live' | 'demo';
}

export interface PlanLimitInfo {
  max_video_seconds: number;
  max_resolution: string;
  max_concurrent_jobs: number;
  max_variants: number;
  premium_monthly_cap: number;
}

export interface PublicModelItem {
  id: string;
  provider: string;
  model_name: string;
  display_name: string;
  generation_type: 'image' | 'video' | 'music' | 'voice';
  pricing_kind?: 'per_image' | 'per_clip' | 'per_second' | 'per_song';
  unit?: 'per_generation' | 'per_second' | 'per_song';
  credit_cost: number;
  price_table?: ModelPriceTableEntry[];
  quality_tier: 'lite' | 'fast' | 'standard' | 'pro';
  promo_eligible?: boolean;
  is_premium?: boolean;
  min_plan_tier?: PlanTier | null;
  max_concurrent_variants?: number;
  max_upscale?: '1k' | '2k' | '4k' | '1080p';
  upscale_credit_cost?: number;
  supported_aspect_ratios?: Array<'16:9' | '9:16' | '1:1'>;
  video_options?: VideoOptions;
  prompt_style_guide?: string;
}

export interface PublicModelsResponse {
  provider_env: 'dev' | 'prod';
  mode: 'live' | 'demo';
  plan_limits?: Record<PlanTier, PlanLimitInfo>;
  plan_tier?: PlanTier | null;
  allowed_max_video_seconds?: number | null;
  models: PublicModelItem[];
}

export interface AdminModelSupplierRow {
  id: string;
  supplier: SupplierId;
  upstream_model: string;
  priority: number;
  env: 'dev' | 'prod' | 'both';
  enabled: boolean;
  configured: boolean;
  note?: string | null;
}

export interface AdminModelItem extends AiModelConfig {
  computed_credit_cost?: number;
  price_table?: ModelPriceTableEntry[];
  licence_note?: string | null;
  licence_verified_at?: string | null;
  licence_verified_by?: string | null;
  model_suppliers?: AdminModelSupplierRow[];
}

export interface AdminModelsResponse {
  provider_env: 'dev' | 'prod';
  models: AdminModelItem[];
}

export interface AdminSupplierSummary {
  supplier: SupplierId;
  configured: boolean;
  enabled: boolean;
  tripped_until: string | null;
  trip_reason: string | null;
  daily_spend_limit_usd: number | null;
  spend_today_usd: number;
  dev_cap_usage: {
    units_today: number;
    spend_today_usd: number;
    total_dev_spend_usd: number;
    cap_description: string;
  };
}

export interface AdminProfitDailyRow {
  day_utc: string;
  model_id: string;
  supplier: string;
  env: string;
  succeeded_count: number;
  failed_count: number;
  total_cost_xaf: number;
  revenue_floor_xaf: number;
  margin_pct: number | null;
}

export interface AdminProfitReportResponse {
  days: number;
  provider_env: 'dev' | 'prod';
  totals: {
    succeeded_count: number;
    revenue_floor_xaf: number;
    total_cost_xaf: number;
    margin_pct: number | null;
  };
  suppliers: AdminSupplierSummary[];
  daily: AdminProfitDailyRow[];
}

export interface AdminPlanLimitRow {
  plan_tier: PlanTier;
  max_video_seconds: number;
  premium_monthly_cap: number;
}

export interface CheckoutResponse {
  referenceId: string;
  status: string;
  amount: number;
  currency: string;
  credits: number;
  checkoutUrl?: string | null;
  mode: 'live' | 'demo';
}

export interface PaymentStatusResponse {
  referenceId: string;
  status: string;
  packageId?: string;
  amount?: number;
  credits?: number;
  mode: 'live' | 'demo';
}

export async function getAuthHeaders(): Promise<HeadersInit> {
  return getAuthHeadersFromToken();
}

export async function fetchWallet(): Promise<WalletResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/credits/wallet', { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch wallet (${res.status})`);
  }
  return res.json();
}

export async function createCheckout(params: {
  packageId: string;
  channel: string;
  phoneNumber?: string;
}): Promise<CheckoutResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/payments/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.detail || `Checkout failed (${res.status})`);
  }
  return res.json();
}

export async function checkPaymentStatus(referenceId: string): Promise<PaymentStatusResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/payments/${encodeURIComponent(referenceId)}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Payment lookup failed (${res.status})`);
  }
  return res.json();
}

export async function simulatePaymentSuccess(referenceId: string): Promise<{ success: boolean; balance: number; plan_tier: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/payments/simulate-success', {
    method: 'POST',
    headers,
    body: JSON.stringify({ referenceId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Payment simulation failed (${res.status})`);
  }
  return res.json();
}

export async function apiRewriteLyrics(currentLyrics: string, targetVibe?: string): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/rewrite-lyrics', {
    method: 'POST',
    headers,
    body: JSON.stringify({ currentLyrics, targetVibe }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 402 || data.error === 'INSUFFICIENT_CREDITS') {
      const err: any = new Error('INSUFFICIENT_CREDITS');
      err.status = 402;
      err.required = data.required;
      err.available = data.available;
      throw err;
    }
    throw new Error(data.error || 'Failed to rewrite lyrics');
  }
  const data = await res.json();
  return data.rewrittenLyrics || currentLyrics;
}

export async function apiGenerateCoverArt(params: {
  title: string;
  genre?: string;
  aspectRatio?: string;
}): Promise<{ coverUrl: string; title: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/generate-cover-art', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 402 || data.error === 'INSUFFICIENT_CREDITS') {
      const err: any = new Error('INSUFFICIENT_CREDITS');
      err.status = 402;
      err.required = data.required;
      err.available = data.available;
      throw err;
    }
    throw new Error(data.error || 'Failed to generate cover art');
  }
  return res.json();
}

export async function fetchPublicModels(fresh = false): Promise<PublicModelsResponse> {
  const res = await fetch(fresh ? '/api/models?fresh=1' : '/api/models');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch models (${res.status})`);
  }
  return res.json();
}

export async function fetchAdminModels(): Promise<AdminModelsResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/models', { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Failed to fetch admin models (${res.status})`);
  }
  return res.json();
}

export async function updateAdminModel(
  modelId: string,
  patch: {
    active?: boolean;
    licensing_verified?: boolean;
    licence_note?: string | null;
  }
): Promise<{ model: AdminModelItem }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/models/${encodeURIComponent(modelId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Failed to update model (${res.status})`);
  }
  return res.json();
}

export async function updateAdminModelSupplier(
  rowId: string,
  patch: {
    enabled?: boolean;
    priority?: number;
  }
): Promise<{ success: boolean; id: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/model-suppliers/${encodeURIComponent(rowId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Failed to update model supplier (${res.status})`);
  }
  return res.json();
}

export async function updateAdminSupplier(
  supplier: SupplierId,
  patch: {
    enabled?: boolean;
    daily_spend_limit_usd?: number | null;
    clear_trip?: boolean;
  }
): Promise<{ supplier: any }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/suppliers/${encodeURIComponent(supplier)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Failed to update supplier (${res.status})`);
  }
  return res.json();
}

export async function fetchAdminProfitReport(days = 30): Promise<AdminProfitReportResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/profit?days=${encodeURIComponent(days)}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Failed to fetch profit report (${res.status})`);
  }
  return res.json();
}

export async function fetchAdminPlanLimits(): Promise<{ plan_limits: AdminPlanLimitRow[] }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/plan-limits', { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Failed to fetch plan limits (${res.status})`);
  }
  return res.json();
}

export async function updateAdminPlanLimit(
  tier: PlanTier,
  patch: {
    max_video_seconds?: number;
    premium_monthly_cap?: number;
  }
): Promise<{ plan_limit: AdminPlanLimitRow }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/plan-limits/${encodeURIComponent(tier)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Failed to update plan limit (${res.status})`);
  }
  return res.json();
}

