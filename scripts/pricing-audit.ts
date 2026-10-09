/**
 * Plain-language overview:
 * This standalone audit script (`npm run pricing:audit`) verifies that Bidou AI's model catalog,
 * supplier rates, and credit package prices satisfy all financial and safety gates before launch.
 *
 * Specifically, for every model and duration/resolution option in the catalog, it:
 * 1. Computes the provider cost in USD and XAF (for both the most expensive enabled supplier,
 *    which sets customer credit price, and the cheapest enabled supplier, which sets best-case cost).
 * 2. Verifies that the computed credit price matches the locked Master Context credit table
 *    (within at most 1 rounding step = 10 credits).
 * 3. Computes net gross margin (after the 2.5% payment processor fee, 3% FX buffer, retry allowance,
 *    and $0.002 variable storage/bandwidth cost) across all 4 active credit packs (Starter, Creator,
 *    Pro, Studio) at both the most expensive and cheapest supplier.
 * 4. Fails with exit code 1 if:
 *    - any credit value differs from the Master Context table by more than 10 credits,
 *    - any image margin is below 70% or any video/music margin is below 45% on the Studio pack
 *      at the most expensive supplier, or
 *    - any model has `active: true` while `licensing_verified: false`.
 */

import { INITIAL_AI_MODELS, INITIAL_PACKAGES } from '../src/services/configData';
import {
  DEFAULT_PRICING_FACTORS,
  computeCreditCost,
  getRetryAllowance,
  quoteGenerationCost,
} from '../src/services/pricingEngine';
import {
  PRICE_BOOK,
  getActualCostUsd,
  getPricingCostUsd,
  resolveCatalogModelKey,
} from '../src/services/providerCatalog';
import { AiModelConfig, SupplierId } from '../src/types';
import { COVER_ART_TIERS } from '../src/services/coverArtCatalog';

interface ExpectedScenario {
  modelId: string;
  optionLabel: string;
  resolution?: '480p' | '720p' | '1080p';
  durationSeconds?: number;
  expectedCredits: number;
}

const EXPECTED_SCENARIOS: ExpectedScenario[] = [
  // Images (1024px)
  { modelId: 'img_cf_flux1_schnell', optionLabel: '1024px image', expectedCredits: 10 },
  { modelId: 'img_cf_flux2_klein_4b', optionLabel: '1024px image', expectedCredits: 10 },
  { modelId: 'img_nano_banana_2_lite', optionLabel: '1K image', expectedCredits: 100 },
  { modelId: 'img_nano_banana_2', optionLabel: '1K image', expectedCredits: 190 },
  { modelId: 'img_nano_banana_pro', optionLabel: '2K image', expectedCredits: 370 },

  // Music (per 2-take song task)
  { modelId: 'mus_lyria_3_pro', optionLabel: '2-take song', expectedCredits: 300 },
  { modelId: 'mus_suno_sonic_v5', optionLabel: '2-take song', expectedCredits: 330 },
  { modelId: 'mus_suno_v6', optionLabel: '2-take song', expectedCredits: 410 },

  // Veo 3.1 Lite
  { modelId: 'vid_veo_3_1_lite', optionLabel: '720p · 4s', resolution: '720p', durationSeconds: 4, expectedCredits: 310 },
  { modelId: 'vid_veo_3_1_lite', optionLabel: '720p · 6s', resolution: '720p', durationSeconds: 6, expectedCredits: 470 },
  { modelId: 'vid_veo_3_1_lite', optionLabel: '720p · 8s', resolution: '720p', durationSeconds: 8, expectedCredits: 620 },
  { modelId: 'vid_veo_3_1_lite', optionLabel: '1080p · 8s', resolution: '1080p', durationSeconds: 8, expectedCredits: 990 },

  // Veo 3.1 Fast
  { modelId: 'vid_veo_3_1_fast', optionLabel: '720p · 4s', resolution: '720p', durationSeconds: 4, expectedCredits: 620 },
  { modelId: 'vid_veo_3_1_fast', optionLabel: '720p · 6s', resolution: '720p', durationSeconds: 6, expectedCredits: 920 },
  { modelId: 'vid_veo_3_1_fast', optionLabel: '720p · 8s', resolution: '720p', durationSeconds: 8, expectedCredits: 1230 },
  { modelId: 'vid_veo_3_1_fast', optionLabel: '1080p · 8s', resolution: '1080p', durationSeconds: 8, expectedCredits: 1470 },

  // Veo 3.1 Quality (standard)
  { modelId: 'vid_veo_3_1_standard', optionLabel: '720p · 4s', resolution: '720p', durationSeconds: 4, expectedCredits: 2450 },
  { modelId: 'vid_veo_3_1_standard', optionLabel: '720p · 6s', resolution: '720p', durationSeconds: 6, expectedCredits: 3670 },
  { modelId: 'vid_veo_3_1_standard', optionLabel: '720p · 8s', resolution: '720p', durationSeconds: 8, expectedCredits: 4900 },
  { modelId: 'vid_veo_3_1_standard', optionLabel: '1080p · 8s', resolution: '1080p', durationSeconds: 8, expectedCredits: 4900 },

  // Alibaba Wan 3.0 Standard
  { modelId: 'vid_wan_3_0_standard', optionLabel: '480p · 5s', resolution: '480p', durationSeconds: 5, expectedCredits: 390 },
  { modelId: 'vid_wan_3_0_standard', optionLabel: '480p · 10s', resolution: '480p', durationSeconds: 10, expectedCredits: 770 },
  { modelId: 'vid_wan_3_0_standard', optionLabel: '480p · 30s', resolution: '480p', durationSeconds: 30, expectedCredits: 2300 },
  { modelId: 'vid_wan_3_0_standard', optionLabel: '720p · 5s', resolution: '720p', durationSeconds: 5, expectedCredits: 770 },
  { modelId: 'vid_wan_3_0_standard', optionLabel: '720p · 10s', resolution: '720p', durationSeconds: 10, expectedCredits: 1540 },
  { modelId: 'vid_wan_3_0_standard', optionLabel: '720p · 30s', resolution: '720p', durationSeconds: 30, expectedCredits: 4590 },
  { modelId: 'vid_wan_3_0_standard', optionLabel: '1080p · 5s', resolution: '1080p', durationSeconds: 5, expectedCredits: 1540 },
  { modelId: 'vid_wan_3_0_standard', optionLabel: '1080p · 10s', resolution: '1080p', durationSeconds: 10, expectedCredits: 3060 },
  { modelId: 'vid_wan_3_0_standard', optionLabel: '1080p · 30s', resolution: '1080p', durationSeconds: 30, expectedCredits: 9170 },

  // Alibaba Wan 3.0 Prime
  { modelId: 'vid_wan_3_0_prime', optionLabel: '480p · 5s', resolution: '480p', durationSeconds: 5, expectedCredits: 530 },
  { modelId: 'vid_wan_3_0_prime', optionLabel: '480p · 10s', resolution: '480p', durationSeconds: 10, expectedCredits: 1050 },
  { modelId: 'vid_wan_3_0_prime', optionLabel: '480p · 30s', resolution: '480p', durationSeconds: 30, expectedCredits: 3120 },
  { modelId: 'vid_wan_3_0_prime', optionLabel: '720p · 5s', resolution: '720p', durationSeconds: 5, expectedCredits: 1080 },
  { modelId: 'vid_wan_3_0_prime', optionLabel: '720p · 10s', resolution: '720p', durationSeconds: 10, expectedCredits: 2150 },
  { modelId: 'vid_wan_3_0_prime', optionLabel: '720p · 30s', resolution: '720p', durationSeconds: 30, expectedCredits: 6420 },
  { modelId: 'vid_wan_3_0_prime', optionLabel: '1080p · 5s', resolution: '1080p', durationSeconds: 5, expectedCredits: 2150 },
  { modelId: 'vid_wan_3_0_prime', optionLabel: '1080p · 10s', resolution: '1080p', durationSeconds: 10, expectedCredits: 4290 },
  { modelId: 'vid_wan_3_0_prime', optionLabel: '1080p · 30s', resolution: '1080p', durationSeconds: 30, expectedCredits: 12840 },
];

function getSupplierCostsUsd(
  model: AiModelConfig,
  resolution?: string,
  durationSeconds?: number
): {
  maxSupplier: string;
  maxCostUsd: number;
  minSupplier: string;
  minCostUsd: number;
} {
  const key = resolveCatalogModelKey(model.id || model.model_name);
  const book = PRICE_BOOK[key];
  const enabledSuppliers: SupplierId[] = model.suppliers?.length
    ? model.suppliers.filter((s) => s.enabled !== false).map((s) => s.supplier)
    : book
    ? (Object.keys(book) as SupplierId[])
    : [];

  if (enabledSuppliers.length === 0) {
    const fallbackUsd =
      model.generation_type === 'video'
        ? model.provider_cost * (durationSeconds ?? 8)
        : model.provider_cost;
    return {
      maxSupplier: model.provider,
      maxCostUsd: fallbackUsd,
      minSupplier: model.provider,
      minCostUsd: fallbackUsd,
    };
  }

  let maxSupplier = enabledSuppliers[0];
  let maxCostUsd = -Infinity;
  let minSupplier = enabledSuppliers[0];
  let minCostUsd = Infinity;

  for (const sup of enabledSuppliers) {
    const c = getActualCostUsd(key, sup, { resolution, durationSeconds });
    if (c > maxCostUsd) {
      maxCostUsd = c;
      maxSupplier = sup;
    }
    if (c < minCostUsd) {
      minCostUsd = c;
      minSupplier = sup;
    }
  }

  return { maxSupplier, maxCostUsd, minSupplier, minCostUsd };
}

function computeMarginPercentOnPack(
  rawCostUsd: number,
  model: AiModelConfig,
  creditsCharged: number,
  packPriceFcfa: number,
  packCredits: number
): { effectiveCostXaf: number; rawCostXaf: number; marginPct: number } {
  const f = DEFAULT_PRICING_FACTORS;
  const retry = getRetryAllowance(model.generation_type);
  const effectiveCostUsd = rawCostUsd * (1 + retry) + f.variable_expenses_allocation_usd;
  const fxRateBuffered = f.usd_to_xaf_rate * (1 + f.fx_buffer_pct);
  const rawCostXaf = rawCostUsd * fxRateBuffered;
  const effectiveCostXaf = effectiveCostUsd * fxRateBuffered;

  const creditValueXaf = packPriceFcfa / packCredits;
  const grossRevenueXaf = creditsCharged * creditValueXaf;
  const netRevenueAfterFeeXaf = grossRevenueXaf * (1 - f.payment_fee_pct);

  const marginPct =
    netRevenueAfterFeeXaf > 0
      ? ((netRevenueAfterFeeXaf - effectiveCostXaf) / netRevenueAfterFeeXaf) * 100
      : -100;

  return { effectiveCostXaf, rawCostXaf, marginPct };
}

function runAudit(): void {
  const activePacks = INITIAL_PACKAGES.filter((p) => p.active);
  const studioPack = activePacks.find((p) => p.id === 'pkg_studio');
  if (!studioPack) {
    console.error('FAIL: Studio pack (pkg_studio) not found in active INITIAL_PACKAGES');
    process.exit(1);
  }

  console.log('====================================================================================================');
  console.log('BIDOU AI — PRICING & MARGIN AUDIT (credit_retail_value_xaf =', DEFAULT_PRICING_FACTORS.credit_retail_value_xaf, 'XAF)');
  console.log('Active Credit Packs:');
  for (const p of activePacks) {
    const xafPerCredit = (p.price_fcfa / p.credits).toFixed(4);
    console.log(`  - ${p.name.padEnd(8)} : ${String(p.credits).padStart(6)} credits | ${String(p.price_fcfa).padStart(6)} FCFA (${xafPerCredit} FCFA/credit)`);
  }
  console.log('====================================================================================================\n');

  let hasFailures = false;

  // 1. Licensing gate check across all INITIAL_AI_MODELS
  console.log('--- 1. Model Licensing & Activation Gate Check ---');
  for (const model of INITIAL_AI_MODELS) {
    const invalidActive = model.active && !model.licensing_verified;
    if (invalidActive) {
      hasFailures = true;
      console.log(
        `FAIL [LICENSING] ${model.id.padEnd(26)} active=${model.active} licensing_verified=${model.licensing_verified} (active model MUST have licensing_verified=true)`
      );
    } else {
      console.log(
        `PASS [LICENSING] ${model.id.padEnd(26)} active=${String(model.active).padEnd(5)} licensing_verified=${String(model.licensing_verified).padEnd(5)} promo=${String(Boolean(model.promo_eligible)).padEnd(5)} premium=${Boolean(model.is_premium)}`
      );
    }
  }
  console.log('');

  // 2. Scenario credit & margin checks
  console.log('--- 2. Scenario Credit Price & Pack Margin Audit ---');
  console.log(
    'STATUS | MODEL ID                  | OPTION       | EXP_CR | GOT_CR | MAX_SUP (XAF eff)  | MIN_SUP (XAF eff)  | MARGINS @ MAX SUP (St/Cr/Pr/Stu)      | MARGINS @ MIN SUP (St/Cr/Pr/Stu)'
  );
  console.log('-'.repeat(175));

  for (const sc of EXPECTED_SCENARIOS) {
    const model = INITIAL_AI_MODELS.find((m) => m.id === sc.modelId);
    if (!model) {
      hasFailures = true;
      console.log(`FAIL   | ${sc.modelId.padEnd(25)} | ${sc.optionLabel.padEnd(12)} | Model missing from INITIAL_AI_MODELS`);
      continue;
    }

    const quote = quoteGenerationCost({
      model,
      resolution: sc.resolution,
      durationSeconds: sc.durationSeconds,
      variantCount: 1,
    });
    const gotCredits =
      model.generation_type === 'music' ? quote.totalCost : quote.unitCost;
    const creditDiff = Math.abs(gotCredits - sc.expectedCredits);

    const { maxSupplier, maxCostUsd, minSupplier, minCostUsd } = getSupplierCostsUsd(
      model,
      sc.resolution,
      sc.durationSeconds
    );

    const maxPackMargins = activePacks.map((p) =>
      computeMarginPercentOnPack(maxCostUsd, model, gotCredits, p.price_fcfa, p.credits)
    );
    const minPackMargins = activePacks.map((p) =>
      computeMarginPercentOnPack(minCostUsd, model, gotCredits, p.price_fcfa, p.credits)
    );

    const studioMaxMargin = computeMarginPercentOnPack(
      maxCostUsd,
      model,
      gotCredits,
      studioPack.price_fcfa,
      studioPack.credits
    );

    const minTargetMarginPct = model.generation_type === 'image' ? 70 : 45;
    const creditOk = creditDiff <= 10;
    const marginOk = studioMaxMargin.marginPct + 1e-6 >= minTargetMarginPct;
    const rowPass = creditOk && marginOk;

    if (!rowPass) {
      hasFailures = true;
    }

    const maxMarginsStr = maxPackMargins.map((m) => `${m.marginPct.toFixed(1)}%`).join(' / ');
    const minMarginsStr = minPackMargins.map((m) => `${m.marginPct.toFixed(1)}%`).join(' / ');

    const maxSupLabel = `${maxSupplier}:${studioMaxMargin.effectiveCostXaf.toFixed(1)}F`;
    const minStudio = computeMarginPercentOnPack(
      minCostUsd,
      model,
      gotCredits,
      studioPack.price_fcfa,
      studioPack.credits
    );
    const minSupLabel = `${minSupplier}:${minStudio.effectiveCostXaf.toFixed(1)}F`;

    console.log(
      `${(rowPass ? 'PASS' : 'FAIL').padEnd(6)} | ${sc.modelId.padEnd(25)} | ${sc.optionLabel.padEnd(12)} | ${String(sc.expectedCredits).padStart(6)} | ${String(gotCredits).padStart(6)} | ${maxSupLabel.padEnd(18)} | ${minSupLabel.padEnd(18)} | ${maxMarginsStr.padEnd(37)} | ${minMarginsStr}`
    );

    if (!creditOk) {
      console.error(
        `  -> FAIL reason: Credit mismatch for ${sc.modelId} (${sc.optionLabel}): expected ${sc.expectedCredits}, got ${gotCredits} (diff ${creditDiff} > 10)`
      );
    }
    if (!marginOk) {
      console.error(
        `  -> FAIL reason: Studio margin at most expensive supplier (${maxSupplier}) is ${studioMaxMargin.marginPct.toFixed(2)}%, below target ${minTargetMarginPct}%`
      );
    }
  }

  console.log('-'.repeat(175));

  // --- 3. Cover Art Tier Price Floor Audit (COVER_ART_PRICE_FLOOR_CHECK) ---
  console.log('\n--- 3. Cover Art Tier Price Floor Audit (COVER_ART_PRICE_FLOOR_CHECK) ---');
  console.log('TIER     | ENGINE                | COST/VER (USD) | 2x COST (USD) | FLOOR CR | CHARGED CR | MARGIN @ STUDIO | STATUS');
  console.log('-'.repeat(105));

  for (const tierId of ['standard', 'pro'] as const) {
    const tier = COVER_ART_TIERS[tierId];
    const totalProviderCostUsd = tier.optionsCount * tier.providerCostUsdPerVersion;
    const computedFloor = computeCreditCost(totalProviderCostUsd, 'image');
    const charged = tier.creditCost;
    const floorOk = charged >= computedFloor.creditCost;

    const studioMargin = computeMarginPercentOnPack(
      totalProviderCostUsd,
      { generation_type: 'image' } as any,
      charged,
      studioPack.price_fcfa,
      studioPack.credits
    );

    const statusStr = floorOk ? 'PASS' : 'FAIL';
    if (!floorOk) {
      hasFailures = true;
      console.error(
        `  -> FAIL reason: Cover Art ${tier.name} charged price (${charged}) is below engine floor (${computedFloor.creditCost})`
      );
    }

    console.log(
      `${tier.name.padEnd(8)} | ${tier.engineName.padEnd(21)} | $${tier.providerCostUsdPerVersion.toFixed(3).padStart(12)} | $${totalProviderCostUsd.toFixed(3).padStart(11)} | ${String(computedFloor.creditCost).padStart(8)} | ${String(charged).padStart(10)} | ${studioMargin.marginPct.toFixed(1)}%`.padEnd(95) +
      ` | ${statusStr}`
    );
  }

  // Also verify Standard fallback engine (nb2lite)
  const nb2LiteCostUsd = 2 * 0.0336;
  const nb2LiteFloor = computeCreditCost(nb2LiteCostUsd, 'image');
  const nb2LitePass = COVER_ART_TIERS.standard.creditCost >= nb2LiteFloor.creditCost;
  console.log(
    `Standard (nb2lite fallback)       | $0.034        | $${nb2LiteCostUsd.toFixed(3)}       | ${String(nb2LiteFloor.creditCost).padStart(8)} | ${String(COVER_ART_TIERS.standard.creditCost).padStart(10)} | Floor check: ${nb2LitePass ? 'PASS' : 'FAIL'}`
  );
  if (!nb2LitePass) {
    hasFailures = true;
  }
  console.log('-'.repeat(105));

  if (hasFailures) {
    console.error('\nAUDIT RESULT: FAIL (one or more checks failed)');
    process.exit(1);
  } else {
    console.log('\nAUDIT RESULT: PASS (all credit tables, Studio pack margin floors, and licensing gates verified)');
    process.exit(0);
  }
}

runAudit();
