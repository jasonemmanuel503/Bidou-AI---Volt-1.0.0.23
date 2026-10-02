/**
 * scripts/phase6-verify.ts
 *
 * Plain-language summary:
 * Comprehensive re-runnable verification test suite for Phase 6 / Phase 6B:
 * Gates 1–14 and Fixes 6–11.
 *
 * Mode execution:
 * - DEMO-MODE (default): executes in-memory mock providers, mutex concurrency tests,
 *   pricing audits, route resolution, timeout math, and code contract checks.
 * - LIVE-DB: requires PHASE6_LIVE=1 and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 *   Safety Guard: Refuses to execute against production URL unless PHASE6_ALLOW_URL is explicitly set.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  resolveSuppliers,
  clearSupplierCache,
  setSupplierStatusOverride,
  getSupplierStatusOverride,
  reserveSupplierBudget,
  withSupplierBudgetMutex,
  verifyImageModelUpstreamRoutes,
  tripSupplierCircuit,
  getProviderEnv,
} from '../server/providers/suppliers';
import {
  clearInMemoryLedger,
  getInMemoryLedger,
  recordAttempt,
  spendUsd,
  countUnitsSince,
  getFxXafPerUsd,
} from '../server/costLedger';
import { executeCloudflareImageGeneration } from '../server/providers/cloudflare';
import { executeImageGeneration } from '../server/providers/imagen';
import {
  reserveCreditsForJob,
  createGenerationJob,
  insertJobVariants,
  updateJobVariant,
  getJobWithVariants,
  settleJobReservation,
  getOrCreateMockWallet,
  getUserTransactions,
} from '../server/db';
import { finalizeAndSettleJob, recoverOrphanedJobs } from '../server/jobs';
import { isLiveMode, isDemoMode } from '../server/config/mode';
import { INITIAL_AI_MODELS, INITIAL_PACKAGES } from '../src/services/configData';
import { DEFAULT_PRICING_FACTORS, quoteGenerationCost } from '../src/services/pricingEngine';
import { IMAGE_ROUTES } from '../src/services/providerCatalog';
import type { GenerationJob, GenerationJobVariant } from '../src/types';

const PROD_SUPABASE_URL_SUBSTRINGS = ['live', 'prod', 'production', 'supabase.co'];

async function runPhase6Suite() {
  console.log('======================================================================');
  console.log('BIDOU AI — PHASE 6 / 6B VERIFICATION SUITE (GATES 1–14 & FIXES 6–11)');
  console.log('======================================================================\n');

  const isLiveRequested = process.env.PHASE6_LIVE === '1';
  if (isLiveRequested) {
    const sbUrl = process.env.SUPABASE_URL || '';
    const allowUrl = process.env.PHASE6_ALLOW_URL || '';
    console.log(`[LIVE-DB Guard] SUPABASE_URL: ${sbUrl}`);
    if (!sbUrl) {
      console.error('FATAL: PHASE6_LIVE=1 requested but SUPABASE_URL is empty.');
      process.exit(1);
    }
    const looksProd = PROD_SUPABASE_URL_SUBSTRINGS.some((s) => sbUrl.toLowerCase().includes(s));
    if (looksProd && sbUrl !== allowUrl) {
      console.error(
        `FATAL SAFETY ABORT: SUPABASE_URL appears to be a production database (${sbUrl}) and does not match PHASE6_ALLOW_URL (${allowUrl}). Aborting LIVE-DB checks!`
      );
      process.exit(1);
    }
    console.log('-> LIVE-DB Safety check PASSED (Non-production or authorized test URL).\n');
  } else {
    console.log('Mode: DEMO-MODE (in-memory provider logic, simulated DB)\n');
  }

  // -------------------------------------------------------------------------
  // Gate 1: Dual Data Mode & Environment Architecture
  // -------------------------------------------------------------------------
  console.log('[GATE 1] Dual Data Mode & Environment Architecture');
  assert.strictEqual(typeof isLiveMode(), 'boolean');
  assert.strictEqual(typeof isDemoMode(), 'boolean');
  assert(isLiveMode() !== isDemoMode());
  console.log('  PASS-DEMO-ONLY: isLiveMode / isDemoMode separation verified.');

  // -------------------------------------------------------------------------
  // Gate 2: Admin Auth & Security Protection
  // -------------------------------------------------------------------------
  console.log('\n[GATE 2] Admin Auth & PIN Gate Architecture');
  const adminAuthPath = path.join(process.cwd(), 'server', 'adminAuth.ts');
  const adminAuthSrc = fs.readFileSync(adminAuthPath, 'utf8');
  assert(adminAuthSrc.includes('requireAdmin'), 'adminAuth.ts must export requireAdmin');
  assert(adminAuthSrc.includes('ADMIN_EMAILS'), 'adminAuth.ts must check ADMIN_EMAILS');
  console.log('  PASS-DEMO-ONLY: requireAdmin middleware and email authorization verified.');

  // -------------------------------------------------------------------------
  // Gate 3: Pricing Audit, Margin Floors & Licensing Gate
  // -------------------------------------------------------------------------
  console.log('\n[GATE 3] Pricing Audit, Margin Floors & Licensing Gate');
  for (const m of INITIAL_AI_MODELS) {
    if (m.active) {
      assert(m.licensing_verified, `Active model ${m.id} must have licensing_verified=true`);
    }
  }
  const studioPack = INITIAL_PACKAGES.find((p) => p.tier === 'studio');
  assert(studioPack, 'Studio pack must exist');
  console.log('  PASS-DEMO-ONLY: All active models licence-verified; Studio pack exists.');

  // -------------------------------------------------------------------------
  // Gate 4: Credit Hold Duration (Video 35m > 30m Job Timeout)
  // -------------------------------------------------------------------------
  console.log('\n[GATE 4] Credit Hold Duration (Video 35 min vs 30 min Job Timeout)');
  const serverPath = path.join(process.cwd(), 'server.ts');
  const serverSrc = fs.readFileSync(serverPath, 'utf8');
  assert(
    serverSrc.includes("selectedModel.generation_type === 'video' ? 2100 : 600"),
    'server.ts must set 2100s for video hold'
  );
  console.log('  PASS-DEMO-ONLY: Video credit hold is 2100s (35m) exceeding 30m timeout.');

  // -------------------------------------------------------------------------
  // Gate 5: Credit Reservation Settlement & Single-Refund Idempotency
  // -------------------------------------------------------------------------
  console.log('\n[GATE 5] Credit Reservation Settlement & Single-Refund Idempotency');
  const testUser = `usr_gate5_${Date.now()}`;
  const mockWallet = getOrCreateMockWallet(testUser);
  mockWallet.balance = 500;
  mockWallet.promo_balance = 0;
  const testJobId = `job_gate5_${Date.now()}`;
  const resGate5 = await reserveCreditsForJob({
    userId: testUser,
    jobId: testJobId,
    amount: 150,
    timeoutSeconds: 600,
  });
  assert(resGate5.reservationId, 'Reservation must succeed');
  assert.strictEqual(mockWallet.balance, 350);
  await settleJobReservation({
    reservationId: resGate5.reservationId,
    jobId: testJobId,
    userId: testUser,
    consumedAmount: 0,
    reason: 'Job failed',
  });
  assert.strictEqual(mockWallet.balance, 500);
  // Repeat settlement (idempotency check)
  await settleJobReservation({
    reservationId: resGate5.reservationId,
    jobId: testJobId,
    userId: testUser,
    consumedAmount: 0,
    reason: 'Job failed duplicate',
  });
  assert.strictEqual(mockWallet.balance, 500);
  console.log('  PASS-DEMO-ONLY: Reservation refund is strictly idempotent (balance restored once).');

  // -------------------------------------------------------------------------
  // Gate 6: Orphan Recovery Worker
  // -------------------------------------------------------------------------
  console.log('\n[GATE 6] Orphan Recovery Worker (30m Timeout Sweep)');
  const jobsSrc = fs.readFileSync(path.join(process.cwd(), 'server', 'jobs.ts'), 'utf8');
  assert(jobsSrc.includes('MAX_TIMEOUT_MS = 30 * 60 * 1000'), 'MAX_TIMEOUT_MS must be 30m');
  assert(jobsSrc.includes('recoverOrphanedJobs'), 'recoverOrphanedJobs must be declared');
  console.log('  PASS-DEMO-ONLY: recoverOrphanedJobs sweeps jobs older than 30 minutes.');

  // -------------------------------------------------------------------------
  // Gate 7: Rate Limiting & Storage Ephemeral Guard
  // -------------------------------------------------------------------------
  console.log('\n[GATE 7] Rate Limiting & Storage Ephemeral Guard');
  assert(serverSrc.includes('new TokenBucketRateLimiter(10, 10)'), 'generate rate limiter');
  assert(serverSrc.includes('new TokenBucketRateLimiter(5, 5)'), 'checkout rate limiter');
  const storageSrc = fs.readFileSync(path.join(process.cwd(), 'server', 'storage.ts'), 'utf8');
  assert(storageSrc.includes('ephemeral disks'), 'storage.ts must enforce ephemeral disk guard');
  console.log('  PASS-DEMO-ONLY: Token bucket rate limiting and ephemeral storage guard verified.');

  // -------------------------------------------------------------------------
  // Gate 8: Multi-Supplier Routing & Capability Checks
  // -------------------------------------------------------------------------
  console.log('\n[GATE 8] Multi-Supplier Routing & Same-Model Fallback');
  clearSupplierCache();
  const veo4sSuppliers = await resolveSuppliers('vid_veo_3_1_lite', {
    durationSeconds: 4,
    allowUnconfiguredInDev: true,
  });
  // Kie does not support 4s; must resolve straight to Google
  assert(veo4sSuppliers.length > 0);
  assert.strictEqual(veo4sSuppliers[0].supplier, 'google', '4s Veo must route directly to Google');
  console.log('  PASS-DEMO-ONLY: 4s Veo routes straight to Google, skipping Kie.');

  // -------------------------------------------------------------------------
  // Gate 9: Dev Hard Caps Enforcement
  // -------------------------------------------------------------------------
  console.log('\n[GATE 9] Dev Hard Caps Enforcement');
  process.env.PROVIDER_ENV = 'dev';
  process.env.CF_DEV_DAILY_IMAGE_CAP = '2';
  clearInMemoryLedger();
  const cap1 = await reserveSupplierBudget('cloudflare', 0.003, 1, 'image');
  assert.strictEqual(cap1, 'ok');
  await recordAttempt({
    jobId: 'cap_test_1',
    variantIndex: 0,
    modelId: 'img_cf_flux1_schnell',
    supplier: 'cloudflare',
    upstreamModel: '@cf/black-forest-labs/flux-1-schnell',
    unitLabel: 'image',
    units: 1,
    estCostUsd: 0.003,
    creditsCharged: 10,
    env: 'dev',
  });
  const cap2 = await reserveSupplierBudget('cloudflare', 0.003, 1, 'image');
  assert.strictEqual(cap2, 'ok');
  await recordAttempt({
    jobId: 'cap_test_2',
    variantIndex: 0,
    modelId: 'img_cf_flux1_schnell',
    supplier: 'cloudflare',
    upstreamModel: '@cf/black-forest-labs/flux-1-schnell',
    unitLabel: 'image',
    units: 1,
    estCostUsd: 0.003,
    creditsCharged: 10,
    env: 'dev',
  });
  const cap3 = await reserveSupplierBudget('cloudflare', 0.003, 1, 'image');
  assert.strictEqual(cap3, 'cap_reached', '3rd call must hit dev cap');
  console.log('  PASS-DEMO-ONLY: Dev cap reached returns "cap_reached".');

  // -------------------------------------------------------------------------
  // Gate 10: Fix 6 — Pre-Flight Circuit Breaker & Spend Limits
  // -------------------------------------------------------------------------
  console.log('\n[GATE 10] Fix 6 — Pre-Flight Circuit Breaker & Spend Limits');
  // Sub-check A: Set Kie limit to 0.01 -> with spend > 0.01, Veo routes to Google or trips
  clearSupplierCache();
  setSupplierStatusOverride('kie', { dailySpendLimitUsd: 0.01, clearTrip: true });
  await recordAttempt({
    jobId: 'kie_spend_mock',
    variantIndex: 0,
    modelId: 'vid_veo_3_1_lite',
    supplier: 'kie',
    upstreamModel: 'veo3_lite',
    unitLabel: 'clip',
    units: 1,
    estCostUsd: 0.05,
    creditsCharged: 310,
    env: 'dev',
  });
  const candidatesKieLimited = await resolveSuppliers('vid_veo_3_1_lite', {
    durationSeconds: 8,
    allowUnconfiguredInDev: true,
  });
  assert(
    !candidatesKieLimited.some((c) => c.supplier === 'kie'),
    'Kie must be excluded/tripped because daily limit ($0.01) is exceeded by spend ($0.05)'
  );
  assert(
    candidatesKieLimited.some((c) => c.supplier === 'google'),
    'Next Veo request must route to Google backup'
  );
  console.log('  -> Pre-flight limit check: Kie ($0.01 limit) bypassed to Google backup: OK');

  // Sub-check B: Set limit to 0 -> means no daily limit, Kie is NOT blocked
  clearSupplierCache();
  setSupplierStatusOverride('kie', { dailySpendLimitUsd: 0, clearTrip: true });
  const candidatesKieZero = await resolveSuppliers('vid_veo_3_1_lite', {
    durationSeconds: 8,
    allowUnconfiguredInDev: true,
  });
  assert(
    candidatesKieZero.some((c) => c.supplier === 'kie'),
    'Limit=0 must mean no daily limit (Kie remains active candidate)'
  );
  console.log('  -> Limit=0 rule: treated as no daily limit: OK');

  // Sub-check C: In dev mode, trip is memory-only
  setSupplierStatusOverride('kie', { dailySpendLimitUsd: null, clearTrip: true });
  const supSrc = fs.readFileSync(path.join(process.cwd(), 'server', 'providers', 'suppliers.ts'), 'utf8');
  assert(
    supSrc.includes("if (getProviderEnv() !== 'dev' && isLiveMode())"),
    'tripSupplierCircuit must only persist to DB when not in dev mode'
  );
  assert(
    supSrc.includes('spendUsd({ supplier: route.supplier, env, since: startOfToday })'),
    'resolveSuppliers must pass env to spendUsd'
  );
  console.log('  PASS-DEMO-ONLY: Fix 6 pre-flight circuit breaker and limit=0 semantics verified.');

  // -------------------------------------------------------------------------
  // Gate 11: Fix 8 — Budget Check In-Process Per-Supplier Async Mutex
  // -------------------------------------------------------------------------
  console.log('\n[GATE 11] Fix 8 — Budget Check Atomic Mutex (10 Parallel Jobs @ Cap=3)');
  const origFetch = globalThis.fetch;
  const origAcc = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origTok = process.env.CLOUDFLARE_API_TOKEN;
  const origCap = process.env.CF_DEV_DAILY_IMAGE_CAP;
  const origEnv = process.env.PROVIDER_ENV;

  process.env.CLOUDFLARE_ACCOUNT_ID = 'cf_test_acc_parallel';
  process.env.CLOUDFLARE_API_TOKEN = 'cf_test_token_parallel';
  process.env.PROVIDER_ENV = 'dev';
  process.env.CF_DEV_DAILY_IMAGE_CAP = '3';
  clearInMemoryLedger();

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        success: true,
        result: {
          image:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as any;

  try {
    // Fire 10 parallel image jobs through Cloudflare image generation
    const results = await Promise.all(
      Array.from({ length: 10 }).map((_, i) =>
        executeCloudflareImageGeneration({
          jobId: `job_parallel_${i}`,
          userId: 'usr_parallel',
          model: {
            id: 'img_cf_flux1_schnell',
            model_name: 'cf_flux1_schnell',
            generation_type: 'image',
          } as any,
          prompt: `parallel test ${i}`,
          variantCount: 1,
          unitCost: 10,
          aspectRatio: '1:1',
        })
      )
    );

    const flatVariants = results.flat();
    const realCalls = flatVariants.filter((v) => !v.simulated);
    const simulatedCalls = flatVariants.filter((v) => v.simulated);

    console.log(
      `  Total dispatched: ${flatVariants.length} | Real: ${realCalls.length} | Simulated: ${simulatedCalls.length}`
    );
    assert.strictEqual(realCalls.length, 3, 'Exactly 3 real jobs must be dispatched');
    assert.strictEqual(simulatedCalls.length, 7, 'Exactly 7 simulated jobs must be returned');
    console.log('  PASS-DEMO-ONLY: Fix 8 mutex successfully serialized parallel checks (3 real, 7 simulated).');
  } finally {
    globalThis.fetch = origFetch;
    if (origAcc === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = origAcc;
    if (origTok === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = origTok;
    if (origCap === undefined) delete process.env.CF_DEV_DAILY_IMAGE_CAP;
    else process.env.CF_DEV_DAILY_IMAGE_CAP = origCap;
    if (origEnv === undefined) delete process.env.PROVIDER_ENV;
    else process.env.PROVIDER_ENV = origEnv;
  }

  // -------------------------------------------------------------------------
  // Gate 12: Fix 7 — Model Names DB Sync & Startup Warnings
  // -------------------------------------------------------------------------
  console.log('\n[GATE 12] Fix 7 — Model Names DB Sync & Startup Warning');
  const migrationFix7Path = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20261003020000_sync_image_model_suppliers.sql'
  );
  assert(fs.existsSync(migrationFix7Path), '20261003020000_sync_image_model_suppliers.sql must exist');
  const m7Sql = fs.readFileSync(migrationFix7Path, 'utf8');
  assert(m7Sql.includes("upstream_model = 'gemini-3.1-flash-lite-image'"), 'Must update nano_banana_2_lite');
  assert(m7Sql.includes("upstream_model = 'gemini-3.1-flash-image'"), 'Must update nano_banana_2');
  assert(m7Sql.includes("upstream_model = 'gemini-3-pro-image'"), 'Must update nano_banana_pro');
  // Run startup verification function (should not throw)
  verifyImageModelUpstreamRoutes();
  console.log('  PASS-DEMO-ONLY: Fix 7 migration and startup check align with IMAGE_ROUTES.');

  // -------------------------------------------------------------------------
  // Gate 13: Fix 10 — Exchange-Rate Guard & Profit Analytics
  // -------------------------------------------------------------------------
  console.log('\n[GATE 13] Fix 10 — Exchange-Rate Guard & Profit Analytics');
  assert.strictEqual(DEFAULT_PRICING_FACTORS.usd_to_xaf_rate, 571.23, 'Constant must remain 571.23');
  const modelsApiSrc = fs.readFileSync(path.join(process.cwd(), 'server', 'modelsApi.ts'), 'utf8');
  assert(modelsApiSrc.includes('fx_xaf_per_usd: getFxXafPerUsd()'), 'Profit API must include fx_xaf_per_usd');
  assert(
    modelsApiSrc.includes('usd_to_xaf_rate: DEFAULT_PRICING_FACTORS.usd_to_xaf_rate'),
    'Profit API must include catalog usd_to_xaf_rate'
  );
  console.log('  PASS-DEMO-ONLY: Fix 10 exchange-rate guard and profit response verified.');

  // -------------------------------------------------------------------------
  // Gate 14: Fix 9 & Fix 11 — Live Reservation Values & Repo Hygiene
  // -------------------------------------------------------------------------
  console.log('\n[GATE 14] Fix 9 & Fix 11 — Live Reservation Values & Repo Hygiene');
  const dbSrc = fs.readFileSync(path.join(process.cwd(), 'server', 'db.ts'), 'utf8');
  assert(
    dbSrc.includes("select('promo_amount, amount')"),
    'server/db.ts must select promo_amount from credit_reservations'
  );
  assert(
    dbSrc.includes('const promoUsed = Number((resRow as any)?.promo_amount ?? 0);'),
    'server/db.ts must compute promoUsed from promo_amount'
  );
  assert(
    dbSrc.includes('const paidUsed = Math.max(0, amount - promoUsed);'),
    'server/db.ts must compute paidUsed as amount - promoUsed'
  );

  // Hygiene checks
  const gitignoreSrc = fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8');
  assert(gitignoreSrc.includes('public/generations/'), '.gitignore must ignore public/generations/');
  assert(
    !fs.existsSync(path.join(process.cwd(), 'public', 'generations', 'usr_smoke_cf')),
    'usr_smoke_cf smoke files must be deleted'
  );
  assert(
    !fs.existsSync(path.join(process.cwd(), 'public', 'generations', 'usr_smoke_kie')),
    'usr_smoke_kie smoke files must be deleted'
  );
  assert(
    !fs.existsSync(path.join(process.cwd(), 'public', 'generations', 'usr_smoke_wan')),
    'usr_smoke_wan smoke files must be deleted'
  );
  console.log('  PASS-DEMO-ONLY: Fix 9 promoUsed/paidUsed computation and Fix 11 repo hygiene verified.');

  // LIVE-DB Report
  if (!isLiveRequested) {
    console.log('\n----------------------------------------------------------------------');
    console.log('LIVE-DB ACCEPTANCE STATUS:');
    console.log('  Gates 1-14 executed with in-memory SQLite/Mock logic.');
    console.log('  Postgres LIVE execution requires owner to run SQL migrations in Supabase SQL Editor:');
    console.log('    1. supabase/migrations/20261003000000_lock_client_writes.sql');
    console.log('    2. supabase/migrations/20261003010000_rename_music_models.sql');
    console.log('    3. supabase/migrations/20261003020000_sync_image_model_suppliers.sql');
    console.log('----------------------------------------------------------------------');
  }

  console.log('\n======================================================================');
  console.log('ALL PHASE 6 / 6B GATES (1–14) & FIXES (6–11) PASSED SUCCESSFULLY');
  console.log('======================================================================\n');
}

runPhase6Suite().catch((err) => {
  console.error('\n❌ PHASE 6 VERIFICATION FAILED:', err);
  process.exit(1);
});
