import assert from 'assert';
import fs from 'fs';
import path from 'path';
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
import type { GenerationJob, GenerationJobVariant } from '../src/types';

async function main() {
  console.log('===============================================================');
  console.log('PHASE 6B - FIX 4 VERIFICATION: Credit Hold vs Job Timeout');
  console.log('===============================================================\n');

  // Test 1: Code Inspection of Timeouts
  console.log('[TEST 1] Verifying timeout configuration in server.ts and server/jobs.ts...');
  const serverPath = path.join(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  assert(
    serverContent.includes("selectedModel.generation_type === 'video' ? 2100 : 600"),
    'server.ts must set 2100s (35 min) for video hold'
  );
  assert(
    serverContent.includes('Video hold (35 min / 2100 s) must exceed the 30-min job timeout (MAX_TIMEOUT_MS)'),
    'server.ts must contain explanation comment for video hold vs job timeout'
  );

  const jobsPath = path.join(process.cwd(), 'server', 'jobs.ts');
  const jobsContent = fs.readFileSync(jobsPath, 'utf8');
  assert(
    jobsContent.includes('MAX_TIMEOUT_MS = 30 * 60 * 1000'),
    'server/jobs.ts must have MAX_TIMEOUT_MS set to 30 minutes'
  );
  console.log('  -> PASS: Video hold is 35 min (2100s) and job timeout is 30 min (1800000ms).\n');

  // Test 2: Scenario A — Video job completing at 29 min is charged (not refunded)
  console.log('[TEST 2] Testing Scenario A: Video job completing at 29 min is charged...');
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const userA = 'user_test_scenario_a';
    const walletA = getOrCreateMockWallet(userA);
    walletA.balance = 1000;
    walletA.promo_balance = 0;

  const jobAId = `job_video_29m_${Date.now()}`;
  const videoHoldSeconds = 2100; // 35 min

  const resA = await reserveCreditsForJob({
    userId: userA,
    jobId: jobAId,
    amount: 310,
    timeoutSeconds: videoHoldSeconds,
  });

  assert(resA.reservationId, 'Reservation must succeed');
  assert.strictEqual(walletA.balance, 690, '310 credits must be reserved (held) from balance');

  const nowMs = Date.now();
  const created29mAgoIso = new Date(nowMs - 29 * 60 * 1000).toISOString();

  const jobARecord: GenerationJob = {
    id: jobAId,
    user_id: userA,
    type: 'video',
    provider: 'google',
    model_name: 'vid_veo_3_1_lite',
    status: 'processing',
    prompt: 'A fast drone flythrough',
    credits_reserved: 310,
    reservation_id: resA.reservationId,
    created_at: created29mAgoIso,
  } as any;

  const variantARecord: GenerationJobVariant = {
    id: `${jobAId}:0`,
    job_id: jobAId,
    user_id: userA,
    variant_index: 0,
    status: 'processing',
    credits_unit: 310,
    created_at: created29mAgoIso,
  } as any;

  await createGenerationJob(jobARecord);
  await insertJobVariants([variantARecord]);

  // Video completes at 29 min
  await updateJobVariant(jobAId, 0, {
    status: 'completed',
    output_url: 'https://storage.bidou.ai/videos/rendered_29m.mp4',
  });

  await finalizeAndSettleJob(jobAId, 'Veo render complete');

  const settledA = await getJobWithVariants(jobAId);
  assert(settledA.job, 'Job A must exist');
  assert.strictEqual(settledA.job.status, 'completed', 'Job status must be completed');
  assert.strictEqual(settledA.job.credits_consumed, 310, 'Job credits_consumed must be 310');
  assert.strictEqual(settledA.job.credits_refunded, 0, 'Job credits_refunded must be 0');
  assert.strictEqual(walletA.balance, 690, 'Wallet balance must remain charged (690 credits)');

  const txsA = await getUserTransactions(userA, 50, 0);
  const refundTxsA = txsA.filter(
    (tx: any) => tx.reference_id === jobAId && tx.type === 'generation_refund'
  );
  assert.strictEqual(refundTxsA.length, 0, 'No refund transactions must exist for 29m completed video');
  console.log('  -> PASS: 29m video job settled and charged, 0 refund rows created.\n');

  // Test 3: Scenario B — Video job reaching 30 min is failed with PROVIDER_TIMEOUT and refunded exactly once
  console.log('[TEST 3] Testing Scenario B: Video job reaching 30 min times out and is refunded exactly once...');
  const userB = 'user_test_scenario_b';
  const walletB = getOrCreateMockWallet(userB);
  walletB.balance = 1000;
  walletB.promo_balance = 0;

  const jobBId = `job_video_30m_${Date.now()}`;
  const resB = await reserveCreditsForJob({
    userId: userB,
    jobId: jobBId,
    amount: 310,
    timeoutSeconds: videoHoldSeconds, // 35 min hold
  });

  assert(resB.reservationId, 'Reservation B must succeed');
  assert.strictEqual(walletB.balance, 690, '310 credits must be reserved (held) from balance');

  // Created 31 minutes ago (exceeding MAX_TIMEOUT_MS = 30m, but BEFORE 35m hold expiry)
  const created31mAgoIso = new Date(nowMs - 31 * 60 * 1000).toISOString();

  const jobBRecord: GenerationJob = {
    id: jobBId,
    user_id: userB,
    type: 'video',
    provider: 'google',
    model_name: 'vid_veo_3_1_lite',
    status: 'processing',
    prompt: 'A sunset hyperlapse',
    credits_reserved: 310,
    reservation_id: resB.reservationId,
    created_at: created31mAgoIso,
  } as any;

  const variantBRecord: GenerationJobVariant = {
    id: `${jobBId}:0`,
    job_id: jobBId,
    user_id: userB,
    variant_index: 0,
    status: 'processing',
    credits_unit: 310,
    created_at: created31mAgoIso,
  } as any;

  await createGenerationJob(jobBRecord);
  await insertJobVariants([variantBRecord]);

  // Run orphan recovery loop which evaluates jobs older than MAX_TIMEOUT_MS
  await recoverOrphanedJobs();

  const settledB = await getJobWithVariants(jobBId);
  assert(settledB.job, 'Job B must exist');
  assert.strictEqual(settledB.job.status, 'failed', 'Timed-out job status must be failed');
  assert.strictEqual(settledB.job.error_message, 'PROVIDER_TIMEOUT', 'Job error_message must be PROVIDER_TIMEOUT');
  assert.strictEqual(settledB.job.credits_consumed, 0, 'Job credits_consumed must be 0');
  assert.strictEqual(settledB.job.credits_refunded, 310, 'Job credits_refunded must be 310');
  assert.strictEqual(walletB.balance, 1000, 'Wallet balance must be restored to 1000 credits');

  const txsB = await getUserTransactions(userB, 50, 0);
  const refundTxsB = txsB.filter(
    (tx: any) => tx.reference_id === jobBId && tx.type === 'generation_refund'
  );
  assert.strictEqual(refundTxsB.length, 1, 'Exactly one refund transaction row must exist');

  // Test idempotency: simulated cron sweep_expired_reservations at 35 min
  await settleJobReservation({
    reservationId: resB.reservationId,
    jobId: jobBId,
    userId: userB,
    consumedAmount: 0,
    reason: 'Reservation expired by sweeper',
  });

  const txsBAfter = await getUserTransactions(userB, 50, 0);
  const refundTxsBAfter = txsBAfter.filter(
    (tx: any) => tx.reference_id === jobBId && tx.type === 'generation_refund'
  );
  assert.strictEqual(refundTxsBAfter.length, 1, 'Idempotency preserved: refund row count remains exactly 1');
  assert.strictEqual(walletB.balance, 1000, 'Wallet balance remains 1000');
  console.log('  -> PASS: 30m job failed with PROVIDER_TIMEOUT, refunded exactly once.\n');

  } finally {
    if (savedUrl) process.env.SUPABASE_URL = savedUrl;
    if (savedKey) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }

  console.log('===============================================================');
  console.log('PHASE 6B FIX 4 VERIFICATION COMPLETE: ALL CHECKS PASSED [DEMO-MODE]');
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
