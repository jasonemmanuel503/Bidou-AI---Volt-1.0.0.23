// Bidou AI Provider Catalog
/**
 * BIDOU AI - Provider Catalog (SINGLE SOURCE OF TRUTH for what we actually call and what Google bills us)
 *
 * Shared by the browser (quote preview) and the server (real provider calls + authoritative quote).
 * Pure data + pure functions only: no `process.env`, no Node APIs, safe to bundle for the client.
 *
 * RULES
 *  1. The tier a customer pays for MUST be the tier that is actually called. Never silently swap models.
 *  2. Prices below are Google's published API prices (verify at https://ai.google.dev/gemini-api/docs/pricing
 *     before launch and whenever Google changes them). They are the basis of every credit price.
 *  3. Model IDs can be overridden on the server through env vars (see server/providers/*.ts) without a redeploy of code.
 */

import type { SupplierId, SupplierRoute } from '../types';

export type VeoResolution = '720p' | '1080p';
export type VideoResolution = '480p' | '720p' | '1080p';
export type VeoDuration = 4 | 6 | 8;

export type Rate =
  | { kind: 'per_image'; usd: number }
  | { kind: 'per_second'; usdByResolution: Record<string, number> }
  | { kind: 'per_clip_8s'; usd: number; resolution: string }   // flat price of the 8 s clip (Kie.ai Veo)
  | { kind: 'per_song'; usd: number };

export interface VeoRoute {
  /** Exact Gemini API model id for this tier. */
  googleModelId: string;
  /** Google's price per generated second (audio included) by resolution, USD. */
  ratePerSecondUsd: Record<VeoResolution, number>;
}

/** Keyed by AiModelConfig.model_name */
export const VEO_ROUTES: Record<string, VeoRoute> = {
  veo_3_1_lite: {
    googleModelId: 'veo-3.1-lite-generate-preview',
    ratePerSecondUsd: { '720p': 0.05, '1080p': 0.08 },
  },
  veo_3_1_fast: {
    googleModelId: 'veo-3.1-fast-generate-preview',
    ratePerSecondUsd: { '720p': 0.1, '1080p': 0.12 },
  },
  veo_3_1_standard: {
    googleModelId: 'veo-3.1-generate-preview',
    ratePerSecondUsd: { '720p': 0.4, '1080p': 0.4 },
  },
};

/** Multiplier applied to the 720p rate for an UNKNOWN video model at 1080p (conservative). */
export const UNKNOWN_VIDEO_1080P_MULTIPLIER = 1.6;

export interface ImageRoute {
  googleModelId: string;
  imageSize: '1K' | '2K';
  /** Google's price per generated image at that size, USD. */
  providerCostUsd: number;
}

/** Keyed by AiModelConfig.model_name */
export const IMAGE_ROUTES: Record<string, ImageRoute> = {
  nano_banana_2_lite: { googleModelId: 'gemini-3.1-flash-lite-image', imageSize: '1K', providerCostUsd: 0.0336 },
  nano_banana_2: { googleModelId: 'gemini-3.1-flash-image', imageSize: '1K', providerCostUsd: 0.067 },
  nano_banana_pro: { googleModelId: 'gemini-3-pro-image', imageSize: '2K', providerCostUsd: 0.134 },
};

/** Model used for the paid "cover art" add-on (cheapest verified image model). */
export const COVER_ART_ROUTE_KEY = 'nano_banana_2_lite';

/** Music providers bill per TASK (2 takes returned per task), never per take. USD per task. */
export const MUSIC_PROVIDER_COST_USD: Record<string, number> = {
  lyria_3_pro: 0.11,
  suno_sonic_v5: 0.12,
  suno_v6: 0.10,
};

/**
 * WAN_PROMO_NOTE:
 * Alibaba Cloud Model Studio DashScope Wan 3.0 is currently in public preview with promotional
 * launch pricing mentioned in Alibaba documentation. If Alibaba adjusts standard or Prime rates
 * post-launch, update ONLY `PRICE_BOOK.vid_wan_3_0_standard` and `PRICE_BOOK.vid_wan_3_0_prime` below.
 */
export const WAN_PROMO_NOTE =
  'Alibaba Wan 3.0 preview rates verified 2 Oct 2026; update PRICE_BOOK here if launch promo changes.';

/**
 * Single typed price book keyed by canonical model ID -> supplier -> Rate (in USD).
 */
export const PRICE_BOOK: Record<string, Partial<Record<SupplierId, Rate>>> = {
  // Cloudflare Workers AI Image Models
  img_cf_flux1_schnell: {
    // Source: https://developers.cloudflare.com/workers-ai/platform/pricing/ (verified 2 Oct 2026) — 1024x1024, 4 steps
    cloudflare: { kind: 'per_image', usd: 0.000633 },
  },
  img_cf_flux2_klein_4b: {
    // Source: https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/ (verified 2 Oct 2026) — 1024x1024
    cloudflare: { kind: 'per_image', usd: 0.00115 },
  },

  // Google Imagen / Gemini Image Models (existing rates preserved)
  img_nano_banana_2_lite: {
    // Source: https://ai.google.dev/gemini-api/docs/pricing (verified 2 Oct 2026)
    google: { kind: 'per_image', usd: IMAGE_ROUTES.nano_banana_2_lite.providerCostUsd },
  },
  img_nano_banana_2: {
    // Source: https://ai.google.dev/gemini-api/docs/pricing (verified 2 Oct 2026)
    google: { kind: 'per_image', usd: IMAGE_ROUTES.nano_banana_2.providerCostUsd },
  },
  img_nano_banana_pro: {
    // Source: https://ai.google.dev/gemini-api/docs/pricing (verified 2 Oct 2026)
    google: { kind: 'per_image', usd: IMAGE_ROUTES.nano_banana_pro.providerCostUsd },
  },

  // Veo 3.1 Video Models (Kie.ai primary + Google direct backup; priced at most expensive enabled supplier)
  vid_veo_3_1_lite: {
    // Source: https://docs.kie.ai/veo3-api & https://kie.ai/pricing (verified 2 Oct 2026) — flat 8s 1080p clip
    kie: { kind: 'per_clip_8s', usd: 0.175, resolution: '1080p' },
    // Source: https://ai.google.dev/gemini-api/docs/pricing (verified 2 Oct 2026)
    google: { kind: 'per_second', usdByResolution: VEO_ROUTES.veo_3_1_lite.ratePerSecondUsd },
  },
  vid_veo_3_1_fast: {
    // Source: https://docs.kie.ai/veo3-api & https://kie.ai/pricing (verified 2 Oct 2026) — flat 8s 1080p clip
    kie: { kind: 'per_clip_8s', usd: 0.325, resolution: '1080p' },
    // Source: https://ai.google.dev/gemini-api/docs/pricing (verified 2 Oct 2026)
    google: { kind: 'per_second', usdByResolution: VEO_ROUTES.veo_3_1_fast.ratePerSecondUsd },
  },
  vid_veo_3_1_standard: {
    // Source: https://docs.kie.ai/veo3-api & https://kie.ai/pricing (verified 2 Oct 2026) — flat 8s 1080p clip
    kie: { kind: 'per_clip_8s', usd: 1.275, resolution: '1080p' },
    // Source: https://ai.google.dev/gemini-api/docs/pricing (verified 2 Oct 2026)
    google: { kind: 'per_second', usdByResolution: VEO_ROUTES.veo_3_1_standard.ratePerSecondUsd },
  },

  // Alibaba Cloud DashScope Wan 3.0 Video Models (2–30s, billed per second by resolution)
  vid_wan_3_0_standard: {
    // Source: https://www.alibabacloud.com/help/en/model-studio/billing-for-tongyi-wanxiang (verified 2 Oct 2026)
    alibaba: {
      kind: 'per_second',
      usdByResolution: { '480p': 0.05, '720p': 0.10, '1080p': 0.20 },
    },
  },
  vid_wan_3_0_prime: {
    // Source: https://www.alibabacloud.com/help/en/model-studio/billing-for-tongyi-wanxiang (verified 2 Oct 2026)
    alibaba: {
      kind: 'per_second',
      usdByResolution: { '480p': 0.068, '720p': 0.14, '1080p': 0.28 },
    },
  },

  // Music Models (per 2-take song task)
  mus_lyria_3_pro: {
    // Source: https://musicapi.ai/pricing (verified 2 Oct 2026)
    musicapi: { kind: 'per_song', usd: MUSIC_PROVIDER_COST_USD.lyria_3_pro },
  },
  mus_suno_sonic_v5: {
    // Source: https://musicapi.ai/pricing (verified 2 Oct 2026)
    musicapi: { kind: 'per_song', usd: MUSIC_PROVIDER_COST_USD.suno_sonic_v5 },
  },
  mus_suno_v6: {
    // Source: https://docs.sunor.cc/models/suno and https://sunor.cc/pricing, 10 credits = $0.10 per music task, verified 2 Oct 2026
    sunor: { kind: 'per_song', usd: MUSIC_PROVIDER_COST_USD.suno_v6 },
  },
};

const MODEL_KEY_ALIASES: Record<string, string> = {
  cf_flux1_schnell: 'img_cf_flux1_schnell',
  cf_flux2_klein_4b: 'img_cf_flux2_klein_4b',
  nano_banana_2_lite: 'img_nano_banana_2_lite',
  nano_banana_2: 'img_nano_banana_2',
  nano_banana_pro: 'img_nano_banana_pro',
  veo_3_1_lite: 'vid_veo_3_1_lite',
  veo_3_1_fast: 'vid_veo_3_1_fast',
  veo_3_1_standard: 'vid_veo_3_1_standard',
  wan_3_0_standard: 'vid_wan_3_0_standard',
  wan_3_0_prime: 'vid_wan_3_0_prime',
  lyria_3_pro: 'mus_lyria_3_pro',
  suno_sonic_v5: 'mus_suno_sonic_v5',
  suno_v6: 'mus_suno_v6',
};

export function resolveCatalogModelKey(modelIdOrName: string): string {
  return MODEL_KEY_ALIASES[modelIdOrName] || modelIdOrName;
}

export interface CostLookupParams {
  resolution?: string;
  durationSeconds?: number;
  suppliers?: SupplierRoute[];
}

function evaluateRateUsd(rate: Rate, params?: CostLookupParams): number {
  switch (rate.kind) {
    case 'per_image':
    case 'per_song':
    case 'per_clip_8s':
      return rate.usd;
    case 'per_second': {
      const res = params?.resolution || '720p';
      const perSec =
        rate.usdByResolution[res] ??
        rate.usdByResolution['720p'] ??
        Object.values(rate.usdByResolution)[0] ??
        0;
      const dur = Number(params?.durationSeconds);
      const seconds = Number.isFinite(dur) && dur > 0 ? dur : 8;
      return perSec * seconds;
    }
  }
}

/**
 * Returns the actual USD cost we pay when rendering `modelId` through `supplier`.
 */
export function getActualCostUsd(
  modelId: string,
  supplier: SupplierId,
  params?: CostLookupParams
): number {
  const key = resolveCatalogModelKey(modelId);
  const supplierRates = PRICE_BOOK[key];
  const rate = supplierRates?.[supplier];
  if (!rate) return 0;
  return evaluateRateUsd(rate, params);
}

/**
 * Returns the USD cost of the MOST EXPENSIVE enabled supplier for `modelId`.
 * Customers are always priced on this ceiling so fallback suppliers remain profitable.
 */
export function getPricingCostUsd(
  modelId: string,
  params?: CostLookupParams
): number {
  const key = resolveCatalogModelKey(modelId);
  const supplierRates = PRICE_BOOK[key];
  if (!supplierRates) return 0;

  const enabledSupplierIds = params?.suppliers
    ? params.suppliers.filter((s) => s.enabled !== false).map((s) => s.supplier)
    : (Object.keys(supplierRates) as SupplierId[]);

  let maxUsd = 0;
  for (const sup of enabledSupplierIds) {
    const rate = supplierRates[sup];
    if (!rate) continue;
    const cost = evaluateRateUsd(rate, params);
    if (cost > maxUsd) maxUsd = cost;
  }

  // Fallback if all passed supplier routes matched nothing in PRICE_BOOK
  if (maxUsd === 0) {
    for (const rate of Object.values(supplierRates)) {
      if (!rate) continue;
      const cost = evaluateRateUsd(rate, params);
      if (cost > maxUsd) maxUsd = cost;
    }
  }

  return maxUsd;
}

/**
 * Google Veo 3.1 only accepts 4, 6 or 8 second clips, and 1080p is 8s ONLY.
 * Anything else the client sends is snapped to the nearest valid value that is >= the request
 * (so a customer never gets more seconds than they were quoted, and never fewer than they asked for).
 * This function is the ONLY place duration/resolution are interpreted: the quote, the DB row and the
 * Google request must all use its output.
 */
export function normalizeVideoParams(
  resolution: unknown,
  durationSeconds: unknown
): { resolution: VeoResolution; durationSeconds: VeoDuration } {
  const res: VeoResolution = resolution === '1080p' ? '1080p' : '720p';
  if (res === '1080p') return { resolution: res, durationSeconds: 8 };

  const requested = Number(durationSeconds);
  if (!Number.isFinite(requested) || requested <= 0) return { resolution: res, durationSeconds: 8 };
  const allowed: VeoDuration[] = [4, 6, 8];
  const snapped = allowed.find((d) => d >= requested) ?? 8;
  return { resolution: res, durationSeconds: snapped };
}

/** Google's USD cost for one clip. Uses the tier's real per-resolution rate when known. */
export function veoProviderCostUsd(
  modelName: string | undefined,
  baseRatePerSecondUsd: number,
  durationSeconds: number,
  resolution: VideoResolution
): number {
  const veoRes: VeoResolution = resolution === '1080p' ? '1080p' : '720p';
  const route = modelName ? VEO_ROUTES[modelName] : undefined;
  const rate = route
    ? route.ratePerSecondUsd[veoRes]
    : baseRatePerSecondUsd * (veoRes === '1080p' ? UNKNOWN_VIDEO_1080P_MULTIPLIER : 1);
  return rate * durationSeconds;
}
