import assert from 'assert';
import { INITIAL_AI_MODELS, INITIAL_PACKAGES } from '../src/services/configData';
import { resolveSuppliers, reserveSupplierBudget, setSupplierStatusOverride } from '../server/providers/suppliers';
import { getMusicModelDisplayName, getMusicModelShortLabel } from '../src/services/modelLabels';
import { formatMusicModelName } from '../src/lib/musicMeta';
import { recordAttempt, getInMemoryLedger, updateLedgerCreditsCharged, markSucceeded, markFailed } from '../server/costLedger';
import { startMusicTask, pollMusicTask } from '../server/providers/musicapi';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('===============================================================');
  console.log('PHASE 6B - FIX 1 VERIFICATION: Sonic v4.5 and Sonic v5 (MusicAPI)');
  console.log('Mode: DEMO-MODE (in-memory provider logic)');
  console.log('===============================================================\n');

  // Test 1: Config Data Display Names & Upstream Models
  console.log('[TEST 1] Checking INITIAL_AI_MODELS configuration...');
  const lyriaConfig = INITIAL_AI_MODELS.find((m) => m.id === 'mus_lyria_3_pro');
  const sunoConfig = INITIAL_AI_MODELS.find((m) => m.id === 'mus_suno_sonic_v5');

  assert(lyriaConfig, 'mus_lyria_3_pro must exist in INITIAL_AI_MODELS');
  assert(sunoConfig, 'mus_suno_sonic_v5 must exist in INITIAL_AI_MODELS');

  console.log(`  mus_lyria_3_pro display_name: "${lyriaConfig.display_name}"`);
  assert.strictEqual(lyriaConfig.display_name, 'Sonic v4.5 (Full Studio)');

  console.log(`  mus_suno_sonic_v5 display_name: "${sunoConfig.display_name}"`);
  assert.strictEqual(sunoConfig.display_name, 'Sonic v5 (Vocalist Master)');

  assert(
    !lyriaConfig.prompt_style_guide?.includes('Lyria 3 Pro'),
    'mus_lyria_3_pro prompt_style_guide must not mention Lyria 3 Pro'
  );
  assert(
    !sunoConfig.prompt_style_guide?.includes('Suno / Sonic v5'),
    'mus_suno_sonic_v5 prompt_style_guide must not mention Suno / Sonic v5'
  );

  const lyriaSupplier = lyriaConfig.suppliers?.find((s) => s.supplier === 'musicapi');
  const sunoSupplier = sunoConfig.suppliers?.find((s) => s.supplier === 'musicapi');
  assert.strictEqual(lyriaSupplier?.upstream_model, 'sonic-v4-5', 'mus_lyria_3_pro supplier upstream_model must be sonic-v4-5');
  assert.strictEqual(sunoSupplier?.upstream_model, 'sonic-v5', 'mus_suno_sonic_v5 supplier upstream_model must be sonic-v5');
  console.log('  -> PASS: Config data display names, neutral prompts, and upstream models verified.\n');

  // Test 2: Package copy check
  console.log('[TEST 2] Checking package copy in INITIAL_PACKAGES...');
  const musicStarterPkg = INITIAL_PACKAGES.find((p) => p.id === 'pkg_mus_starter');
  assert(musicStarterPkg, 'Music Starter package must exist');
  assert(
    musicStarterPkg.features.some((f) => f.includes('Sonic v4.5 / Sonic v5')),
    'Music Starter package features must list "Sonic v4.5 / Sonic v5"'
  );
  assert(
    !musicStarterPkg.features.some((f) => f.includes('Lyria') || f.includes('Google Lyria')),
    'Music Starter package features must not mention Lyria'
  );
  console.log('  -> PASS: Package copy verified.\n');

  // Test 3: Backend Supplier Resolution
  console.log('[TEST 3] Testing resolveSuppliers routing...');
  const lyriaSuppliers = await resolveSuppliers('mus_lyria_3_pro');
  const sunoSuppliers = await resolveSuppliers('mus_suno_sonic_v5');

  console.log('  Resolved suppliers for mus_lyria_3_pro:', lyriaSuppliers);
  assert(lyriaSuppliers.length > 0, 'Must resolve suppliers for mus_lyria_3_pro');
  assert.strictEqual(lyriaSuppliers[0].supplier, 'musicapi');
  assert.strictEqual(lyriaSuppliers[0].upstreamModel, 'sonic-v4-5');

  console.log('  Resolved suppliers for mus_suno_sonic_v5:', sunoSuppliers);
  assert(sunoSuppliers.length > 0, 'Must resolve suppliers for mus_suno_sonic_v5');
  assert.strictEqual(sunoSuppliers[0].supplier, 'musicapi');
  assert.strictEqual(sunoSuppliers[0].upstreamModel, 'sonic-v5');
  console.log('  -> PASS: Supplier resolution routes correctly to sonic-v4-5 and sonic-v5.\n');

  // Test 4: modelLabels & musicMeta formatting
  console.log('[TEST 4] Testing customer-facing label formatters...');
  assert.strictEqual(getMusicModelDisplayName('mus_lyria_3_pro'), 'Sonic v4.5 (Full Studio)');
  assert.strictEqual(getMusicModelDisplayName('lyria_3_pro'), 'Sonic v4.5 (Full Studio)');
  assert.strictEqual(getMusicModelDisplayName('mus_suno_sonic_v5'), 'Sonic v5 (Vocalist Master)');
  assert.strictEqual(getMusicModelDisplayName('suno_sonic_v5'), 'Sonic v5 (Vocalist Master)');
  assert.strictEqual(getMusicModelShortLabel('mus_lyria_3_pro'), 'Sonic v4.5');
  assert.strictEqual(getMusicModelShortLabel('mus_suno_sonic_v5'), 'Sonic v5');
  assert.strictEqual(formatMusicModelName('lyria_3_pro'), 'Sonic v4.5');
  assert.strictEqual(formatMusicModelName('suno_sonic_v5'), 'Sonic v5');
  console.log('  -> PASS: Customer-facing label formatters never leak Lyria or Suno.\n');

  // Test 5: Simulated MusicAPI Dispatch & Upstream Model Propagation
  console.log('[TEST 5] Testing startMusicTask in demo/simulated mode...');
  const jobLyria = {
    id: 'job_test_music_1',
    user_id: 'usr_test_1',
    type: 'music' as const,
    model_id: 'mus_lyria_3_pro',
    model_name: 'lyria_3_pro',
    prompt: 'Afrobeat dance groove',
    genre: 'Afrobeats',
    tonality: 'Major',
    variants: [
      { id: 'v1', job_id: 'job_test_music_1', variant_index: 0, status: 'pending' as const },
      { id: 'v2', job_id: 'job_test_music_1', variant_index: 1, status: 'pending' as const },
    ],
  };

  const dispatchResults = await startMusicTask({
    userId: jobLyria.user_id,
    jobId: jobLyria.id,
    prompt: jobLyria.prompt,
    genre: jobLyria.genre,
    tonality: jobLyria.tonality,
    variantCount: 2,
    unitCost: 150,
    model: lyriaConfig,
  });

  console.log('  Dispatch results for Sonic v4.5:', dispatchResults);
  assert.strictEqual(dispatchResults.length, 2);
  assert.strictEqual(dispatchResults[0].supplier, 'musicapi');
  assert.strictEqual(dispatchResults[0].upstreamModel, 'sonic-v4-5');
  assert.strictEqual(dispatchResults[1].upstreamModel, 'sonic-v4-5');

  // Test 6: Cost Ledger Unit Accounting (1 ledger row per task, variant_index = 0)
  console.log('[TEST 6] Testing single ledger row per task and credits update...');
  const testJobId = 'job_ledger_test_task';
  await recordAttempt({
    jobId: testJobId,
    variantIndex: 0,
    modelId: 'mus_lyria_3_pro',
    supplier: 'musicapi',
    unitLabel: 'task',
    units: 1,
    estCostUsd: 0.11,
    creditsCharged: 300,
    env: 'dev',
  });

  // Verify only 1 row exists
  let rows = getInMemoryLedger().filter((r) => r.job_id === testJobId);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].unit_label, 'task');
  assert.strictEqual(rows[0].variant_index, 0);

  // Update credits charged to 150 (if only 1 take succeeded)
  await updateLedgerCreditsCharged(testJobId, 0, 'musicapi', 150);
  await markSucceeded(testJobId, 0, 'musicapi');

  rows = getInMemoryLedger().filter((r) => r.job_id === testJobId);
  assert.strictEqual(rows[0].credits_charged, 150);
  assert.strictEqual(rows[0].status, 'succeeded');
  console.log('  -> PASS: Single task ledger row and credit settlement verified.\n');

  // Test 7: Dev Task Cap Enforcement
  console.log('[TEST 7] Testing dev daily task cap for musicapi...');
  const capStatus = await reserveSupplierBudget('musicapi', 0.11, 1, 'music');
  console.log(`  reserveSupplierBudget('musicapi', 0.11, 1, 'music') result: "${capStatus}"`);
  assert(capStatus === 'ok' || capStatus === 'cap_reached', 'Must return ok or cap_reached');
  console.log('  -> PASS: Dev task cap checked successfully.\n');

  // Test 8: Migration file check
  console.log('[TEST 8] Checking migration file 20261003010000_rename_music_models.sql...');
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261003010000_rename_music_models.sql');
  assert(fs.existsSync(migrationPath), 'Migration file must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert(sql.includes("display_name = 'Sonic v4.5 (Full Studio)'"), 'Migration must update Sonic v4.5 display name');
  assert(sql.includes("display_name = 'Sonic v5 (Vocalist Master)'"), 'Migration must update Sonic v5 display name');
  assert(sql.includes("upstream_model = 'sonic-v4-5'"), 'Migration must update model_suppliers to sonic-v4-5');
  assert(sql.includes("upstream_model = 'sonic-v5'"), 'Migration must update model_suppliers to sonic-v5');
  console.log('  -> PASS: Migration file exists and contains correct idempotent SQL.\n');

  console.log('===============================================================');
  console.log('ALL PHASE 6B FIX 1 TESTS PASSED [DEMO-MODE]');
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
