// Bidou AI Pricing Engine
/**
 * BIDOU AI - Central Pricing Engine
 * Implements Section 6.5: Single source of truth for price derivation.
 * Customer price is never derived from raw provider API cost alone.
 * 
 * Formula:
 *   effective_generation_cost = provider_cost * (1 + retry_allowance) + allocated_variable_expenses
 *   required_revenue = effective_generation_cost / target_COGS_ratio
 *   credit_cost = required_revenue / credit_retail_value
 */

import { GenerationType, AiModelConfig } from '../types';
import {
  IMAGE_ROUTES,
  MUSIC_PROVIDER_COST_USD,
  PRICE_BOOK,
  VEO_ROUTES,
  VideoResolution,
  getPricingCostUsd,
  normalizeVideoParams,
  resolveCatalogModelKey,
  veoProviderCostUsd,
} from './providerCatalog';

export interface PricingFactors {
  usd_to_xaf_rate: number;
  /** Safety margin on the FX rate so a weaker XAF never turns a sale into a loss (0.03 = 3%). */
  fx_buffer_pct: number;
  /** Payment processor fee as a share of revenue (FuturaPay MoMo / Orange Money estimate; confirm in contract). */
  payment_fee_pct: number;
  credit_retail_value_xaf: number;
  variable_expenses_allocation_usd: number;
}

// Configurable baseline factors
export const DEFAULT_PRICING_FACTORS: PricingFactors = {
  usd_to_xaf_rate: 571.23, // Spot rate supplied by the owner (XAF is pegged to EUR; refresh before launch, see LAUNCH_CHECKLIST.md)
  fx_buffer_pct: 0.03, // Set to 0 to price at spot with no buffer
  payment_fee_pct: 0.025, // Applied to revenue (not a flat USD amount)
  credit_retail_value_xaf: 0.79, // priced on the cheapest pack (Studio 42,000 FCFA / 53,000 credits ≈ 0.7925) so no pack can fall below target margin
  variable_expenses_allocation_usd: 0.002, // Cloudflare R2 storage + CDN bandwidth allocation per generation (payment fee is modelled separately)
};

/**
 * Per-model target COGS ratio overrides.
 * `mus_suno_v6` (Suno V6 via Sunor) is positioned as a deliberate premium flagship product
 * with a tighter 0.20 target COGS ratio (80% target gross margin) instead of the default 0.30.
 */
export const MODEL_COGS_RATIO_OVERRIDE: Record<string, number> = {
  mus_suno_v6: 0.20,
};

export function getModelCogsRatioOverride(modelIdOrName: string): number | undefined {
  if (!modelIdOrName) return undefined;
  const key = resolveCatalogModelKey(modelIdOrName);
  return MODEL_COGS_RATIO_OVERRIDE[key];
}

/**
 * Returns the target COGS ratio based on media type:
 * - Video: ~55% (45% gross margin) due to heavy compute
 * - Image & Music: ~30% (70% gross margin)
 */
export function getTargetCogsRatio(type: GenerationType): number {
  switch (type) {
    case 'video':
      return 0.55;
    case 'image':
    case 'music':
    case 'voice':
    default:
      return 0.30;
  }
}

/**
 * Returns conservative retry allowance:
 * - Video: 10% (recalculated dynamically once production failure telemetry accumulates)
 * - Image & Music: 5%
 */
export function getRetryAllowance(type: GenerationType): number {
  switch (type) {
    case 'video':
      return 0.10;
    case 'image':
    case 'music':
    case 'voice':
    default:
      return 0.05;
  }
}

/**
 * Computes exact credit cost from raw provider cost.
 * All prices across the system MUST use this central function.
 */
export function computeCreditCost(
  rawProviderCostUsd: number,
  type: GenerationType,
  factors: PricingFactors = DEFAULT_PRICING_FACTORS,
  cogsRatioOverride?: number
): {
  creditCost: number;
  effectiveCostUsd: number;
  effectiveCostXaf: number;
  requiredRevenueXaf: number;
  grossMarginPercent: number;
} {
  const retryAllowance = getRetryAllowance(type);
  const targetCogsRatio =
    typeof cogsRatioOverride === 'number' && Number.isFinite(cogsRatioOverride) && cogsRatioOverride > 0
      ? cogsRatioOverride
      : getTargetCogsRatio(type);

  const effectiveCostUsd =
    rawProviderCostUsd * (1 + retryAllowance) + factors.variable_expenses_allocation_usd;

  const effectiveCostXaf = effectiveCostUsd * factors.usd_to_xaf_rate * (1 + factors.fx_buffer_pct);

  // Target margin is measured AFTER the payment fee: revenue * (1 - fee) * targetCogsRatio = cost
  const requiredRevenueXaf = effectiveCostXaf / (targetCogsRatio * (1 - factors.payment_fee_pct));

  // 1 credit = credit_retail_value_xaf. ROUND UP to the next 10 credits (never round a price below its margin target).
  const exactCredits = requiredRevenueXaf / factors.credit_retail_value_xaf;
  const roundedCredits = Math.ceil(exactCredits / 10 - 1e-9) * 10;

  const finalCredits = Math.max(roundedCredits, 10);
  const grossMarginPercent = Math.round((1 - targetCogsRatio) * 100);

  return {
    creditCost: finalCredits,
    effectiveCostUsd,
    effectiveCostXaf,
    requiredRevenueXaf,
    grossMarginPercent,
  };
}

/**
 * Calculates Single-Shot Video Cost from Google's REAL per-second rate for the tier + resolution.
 * - Uses VEO_ROUTES (providerCatalog.ts) when `modelName` is known; otherwise falls back to
 *   `baseCostPerSecondUsd` (720p) with a conservative 1080p multiplier.
 * - `includeAudio` is accepted for backward compatibility but IGNORED: Google's per-second rate already
 *   includes audio and the Gemini API has no switch to disable it, so a client-controlled flag must
 *   never lower the price.
 * - Duration/resolution are snapped to values Google actually accepts (4/6/8s, 1080p = 8s only).
 */
export function computeVideoCreditCost(
  baseCostPerSecondUsd: number,
  durationSeconds: number,
  resolution: '480p' | '720p' | '1080p' | '4k' = '720p',
  _includeAudio: boolean = true,
  modelName?: string
): number {
  const catalogKey = modelName ? resolveCatalogModelKey(modelName) : undefined;
  const isNonVeoCatalogModel = Boolean(
    catalogKey && PRICE_BOOK[catalogKey] && (!modelName || !VEO_ROUTES[modelName])
  );

  if (isNonVeoCatalogModel && catalogKey) {
    const res: VideoResolution =
      resolution === '480p' ? '480p' : resolution === '1080p' ? '1080p' : '720p';
    const rawSec = Number(durationSeconds);
    const clampedSec = Number.isFinite(rawSec) && rawSec > 0 ? Math.min(30, Math.max(2, Math.round(rawSec))) : 5;
    const rawProviderCostUsd = getPricingCostUsd(catalogKey, {
      resolution: res,
      durationSeconds: clampedSec,
    });
    return computeCreditCost(rawProviderCostUsd, 'video').creditCost;
  }

  const norm = normalizeVideoParams(resolution, durationSeconds);
  const rawProviderCostUsd = veoProviderCostUsd(modelName, baseCostPerSecondUsd, norm.durationSeconds, norm.resolution);
  return computeCreditCost(rawProviderCostUsd, 'video').creditCost;
}

export type IllustrationFocus = 'mixed' | 'image' | 'video' | 'music';

export interface TierIllustrationItem {
  label: string;
  count: number;
}

/**
 * Returns dynamic illustrations of what credit amounts can generate.
 * All counts derived from INITIAL_AI_MODELS credit costs — no hardcoded numbers, always round down.
 * Copy uses "for example", never "included" or "limit".
 */
export function getTierIllustration(
  credits: number,
  focus: IllustrationFocus = 'mixed',
  modelsOverride?: AiModelConfig[]
): TierIllustrationItem[] {
  const models = modelsOverride;

  // Defaults are DERIVED from the same catalog + engine as real quotes (never hard-coded numbers that go stale).
  const d = {
    imgLite: computeCreditCost(IMAGE_ROUTES.nano_banana_2_lite.providerCostUsd, 'image').creditCost,
    imgHq: computeCreditCost(IMAGE_ROUTES.nano_banana_2.providerCostUsd, 'image').creditCost,
    imgPro: computeCreditCost(IMAGE_ROUTES.nano_banana_pro.providerCostUsd, 'image').creditCost,
    vidLite: computeVideoCreditCost(0.05, 8, '720p', true, 'veo_3_1_lite'),
    vidFast: computeVideoCreditCost(0.1, 8, '720p', true, 'veo_3_1_fast'),
    vidStd: computeVideoCreditCost(0.4, 8, '720p', true, 'veo_3_1_standard'),
    musLyria: computeCreditCost(
      MUSIC_PROVIDER_COST_USD.lyria_3_pro,
      'music',
      DEFAULT_PRICING_FACTORS,
      getModelCogsRatioOverride('mus_lyria_3_pro')
    ).creditCost,
    musSuno: computeCreditCost(
      MUSIC_PROVIDER_COST_USD.suno_sonic_v5,
      'music',
      DEFAULT_PRICING_FACTORS,
      getModelCogsRatioOverride('mus_suno_sonic_v5')
    ).creditCost,
  };
  const pick = (id: string, fallback: number) => models?.find((m: any) => m.id === id)?.credit_cost ?? fallback;

  const imgLiteCost = pick('img_nano_banana_2_lite', d.imgLite);
  const imgHqCost = pick('img_nano_banana_2', d.imgHq);
  const imgProCost = pick('img_nano_banana_pro', d.imgPro);

  const vidLiteCost = pick('vid_veo_3_1_lite', d.vidLite);
  const vidFastCost = pick('vid_veo_3_1_fast', d.vidFast);
  const vidStdCost = pick('vid_veo_3_1_standard', d.vidStd);

  const musLyriaCost = pick('mus_lyria_3_pro', d.musLyria);
  const musSunoCost = pick('mus_suno_sonic_v5', d.musSuno);

  switch (focus) {
    case 'image':
      return [
        { label: 'Fast 1K images (for example)', count: Math.floor(credits / imgLiteCost) },
        { label: 'HQ 1K images (for example)', count: Math.floor(credits / imgHqCost) },
        { label: 'Cinematic 2K upscales (for example)', count: Math.floor(credits / imgProCost) },
      ];
    case 'video':
      return [
        { label: 'Veo 3.1 Lite 8s clips (for example)', count: Math.floor(credits / vidLiteCost) },
        { label: 'Veo 3.1 Fast 8s clips (for example)', count: Math.floor(credits / vidFastCost) },
        { label: 'Veo 3.1 Studio master clips (for example)', count: Math.floor(credits / vidStdCost) },
      ];
    case 'music':
      return [
        { label: 'Sonic v4.5 studio tracks (2 takes each, for example)', count: Math.floor(credits / musLyriaCost) },
        { label: 'Sonic v5 songs (2 takes, for example)', count: Math.floor(credits / musSunoCost) },
      ];
    case 'mixed':
    default:
      return [
        { label: 'Fast HD images (for example)', count: Math.floor(credits / imgLiteCost) },
        { label: 'Veo 3.1 video clips (8s, for example)', count: Math.floor(credits / vidLiteCost) },
        { label: 'Sonic v4.5 songs (2 takes, for example)', count: Math.floor(credits / musLyriaCost) },
      ];
  }
}

export interface QuoteGenerationParams {
  model: AiModelConfig;
  durationSeconds?: number;
  resolution?: '480p' | '720p' | '1080p' | '4k';
  includeAudio?: boolean;
  variantCount: number;
}

export interface QuoteGenerationResult {
  unitCost: number;
  totalCost: number;
  variantCount: number;
  /** Video only: the values Google will really be called with (and the quote is based on). Persist THESE. */
  durationSeconds?: number;
  resolution?: VideoResolution;
}

/**
 * Returns true if the given model can be paid for with promotional (free signup) credits.
 */
export function isPromoEligible(model: AiModelConfig | undefined | null): boolean {
  return Boolean(model && model.promo_eligible === true);
}

export interface ModelPriceTableEntry {
  label: string;
  resolution?: string;
  durationSeconds?: number;
  credits: number;
}

/**
 * Returns a ready-made price table for a model that the UI or audit tools can render
 * (e.g. "5 s · 720p = 770 credits"). For per-second models, returns 5 s, 10 s, 15 s, and max.
 */
export function getModelPriceTable(model: AiModelConfig): ModelPriceTableEntry[] {
  if (model.generation_type === 'video') {
    const durOpt = model.video_options?.durations;
    const isPerSecondRange =
      model.pricing_kind === 'per_second' ||
      (durOpt !== undefined && !Array.isArray(durOpt));

    if (isPerSecondRange) {
      const resolutions = model.video_options?.resolutions ?? ['480p', '720p', '1080p'];
      const maxDur =
        durOpt && !Array.isArray(durOpt) ? durOpt.max : 30;
      const sampleDurations = Array.from(new Set([5, 10, 15, maxDur])).filter(
        (d) => d <= maxDur
      );
      const rows: ModelPriceTableEntry[] = [];
      for (const res of resolutions) {
        for (const dur of sampleDurations) {
          const q = quoteGenerationCost({
            model,
            resolution: res as '480p' | '720p' | '1080p',
            durationSeconds: dur,
            variantCount: 1,
          });
          rows.push({
            label: `${dur} s · ${res} = ${q.unitCost} credits`,
            resolution: res,
            durationSeconds: dur,
            credits: q.unitCost,
          });
        }
      }
      return rows;
    }

    // Veo / per_clip video models: 4s/6s/8s @ 720p and 8s @ 1080p
    const veoCombos: Array<{ durationSeconds: number; resolution: '720p' | '1080p' }> = [
      { durationSeconds: 4, resolution: '720p' },
      { durationSeconds: 6, resolution: '720p' },
      { durationSeconds: 8, resolution: '720p' },
      { durationSeconds: 8, resolution: '1080p' },
    ];
    return veoCombos.map(({ durationSeconds, resolution }) => {
      const q = quoteGenerationCost({
        model,
        durationSeconds,
        resolution,
        variantCount: 1,
      });
      return {
        label: `${durationSeconds} s · ${resolution} = ${q.unitCost} credits`,
        resolution,
        durationSeconds,
        credits: q.unitCost,
      };
    });
  }

  const q = quoteGenerationCost({ model, variantCount: 1 });
  return [
    {
      label: `${q.unitCost} credits`,
      credits: q.unitCost,
    },
  ];
}

/**
 * Server-Authoritative Price Derivation
 * Single source of truth for generation quoting. Never trust client-provided costs.
 * Prices are DERIVED from provider_cost + providerCatalog on every call, never read from a stored
 * `credit_cost` column (which can go stale in the ai_models table).
 */
export function quoteGenerationCost(params: QuoteGenerationParams): QuoteGenerationResult {
  const { model, durationSeconds, resolution, variantCount } = params;
  const n = Math.max(1, variantCount);
  if (!model) {
    return {
      unitCost: 70,
      totalCost: 70 * n,
      variantCount: n,
    };
  }

  // Legacy shim: an unknown model object with no model_name (client fallback) keeps its supplied credit_cost.
  if (!model.model_name && model.credit_cost && model.generation_type !== 'video') {
    return { unitCost: model.credit_cost, totalCost: model.credit_cost * n, variantCount: n };
  }

  if (model.generation_type === 'video') {
    const durOpt = model.video_options?.durations;
    const isPerSecondRange =
      model.pricing_kind === 'per_second' ||
      (durOpt !== undefined && !Array.isArray(durOpt));

    if (isPerSecondRange) {
      const allowedResolutions = model.video_options?.resolutions ?? ['480p', '720p', '1080p'];
      const normRes: VideoResolution =
        resolution && allowedResolutions.includes(resolution) && (resolution === '480p' || resolution === '720p' || resolution === '1080p')
          ? resolution
          : '720p';
      const minDur = durOpt && !Array.isArray(durOpt) ? durOpt.min : 2;
      const maxDur = durOpt && !Array.isArray(durOpt) ? durOpt.max : 30;
      const requestedDur = Number(durationSeconds);
      const normDur =
        Number.isFinite(requestedDur) && requestedDur > 0
          ? Math.min(maxDur, Math.max(minDur, Math.round(requestedDur)))
          : 5;

      const catalogCostUsd = getPricingCostUsd(model.id || model.model_name, {
        resolution: normRes,
        durationSeconds: normDur,
        suppliers: model.suppliers,
      });
      const rawProviderCostUsd = catalogCostUsd > 0 ? catalogCostUsd : model.provider_cost * normDur;
      const unitCost = computeCreditCost(rawProviderCostUsd, 'video').creditCost;

      return {
        unitCost,
        totalCost: unitCost * n,
        variantCount: n,
        durationSeconds: normDur,
        resolution: normRes,
      };
    }

    const norm = normalizeVideoParams(resolution, durationSeconds);
    const unitCost = computeVideoCreditCost(model.provider_cost, norm.durationSeconds, norm.resolution, true, model.model_name);
    return {
      unitCost,
      totalCost: unitCost * n,
      variantCount: n,
      durationSeconds: norm.durationSeconds,
      resolution: norm.resolution,
    };
  }

  if (model.generation_type === 'music') {
    // Music providers bill PER TASK (each task returns 2 takes). The customer pays the full task price
    // no matter how many of the takes their plan shows, otherwise a 1-take plan sells at a loss.
    const modelKey = model.id || model.model_name;
    const catalogCostUsd = getPricingCostUsd(modelKey, {
      suppliers: model.suppliers,
    });
    const rawCostUsd = catalogCostUsd > 0 ? catalogCostUsd : model.provider_cost;
    const cogsOverride = getModelCogsRatioOverride(modelKey);
    const taskCost = computeCreditCost(rawCostUsd, 'music', DEFAULT_PRICING_FACTORS, cogsOverride).creditCost;
    return {
      unitCost: Math.ceil(taskCost / n),
      totalCost: taskCost,
      variantCount: n,
    };
  }

  // Image or other
  const catalogCostUsd = getPricingCostUsd(model.id || model.model_name, {
    suppliers: model.suppliers,
  });
  const rawCostUsd = catalogCostUsd > 0 ? catalogCostUsd : model.provider_cost;
  const unitCost = computeCreditCost(rawCostUsd, model.generation_type === 'voice' ? 'voice' : 'image').creditCost;
  return {
    unitCost,
    totalCost: unitCost * n,
    variantCount: n,
  };
}
