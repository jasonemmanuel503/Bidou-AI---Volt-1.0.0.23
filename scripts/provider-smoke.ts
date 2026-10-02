/**
 * scripts/provider-smoke.ts
 *
 * Plain-language summary:
 * CLI verification and smoke test script for the Phase 3 multi-supplier adapters
 * (`cloudflare`, `kie`, `alibaba`), supplier router, dev caps, and cost ledger.
 *
 * Usage:
 *   npx tsx scripts/provider-smoke.ts <cloudflare|kie|alibaba|all> [--dry-run]
 *
 * With `--dry-run`:
 *   Uses a stubbed `globalThis.fetch` to verify request shapes, headers, body parameters
 *   (`enableFallback: false` on Kie, `X-DashScope-Async: enable` on Alibaba, JSON vs
 *   multipart/form-data on Cloudflare), response parsing (JSON base64, raw PNG bytes,
 *   Kie string/array `resultUrls` + 1080p endpoint, Alibaba task polling), error mapping
 *   (401/403, 429, 5xx, safety filter), 4s Veo routing (never sent to Kie), and
 *   dev cap simulation (`CF_DEV_DAILY_IMAGE_CAP=2` -> 3rd image returns `simulated: true`).
 *
 * Without `--dry-run`:
 *   Executes ONE tiny real call within dev caps:
 *   - cloudflare: 1 FLUX.1 schnell image
 *   - kie:        1 Veo 3.1 Lite clip
 *   - alibaba:    1 Wan 3.0 Standard clip (2s @ 480p)
 */

import fs from 'fs';
import path from 'path';
import {
  callCloudflareSingleImage,
  executeCloudflareImageGeneration,
  estimateCloudflareImageCostUsd,
} from '../server/providers/cloudflare';
import {
  startKieVideoVariant,
  pollKieOperation,
  supports as kieSupports,
} from '../server/providers/kie';
import {
  startAlibabaWanVariant,
  pollAlibabaWanOperation,
  estimateWanCostUsd,
} from '../server/providers/alibaba';
import {
  startSunorMusicTask,
  pollSunorMusicTask,
  submitSunorTask,
  buildSunorMusicInput,
  clearSunorPollCache,
  SUNOR_MAX_PROMPT_CHARS,
  SUNOR_MAX_TAGS_CHARS,
  SUNOR_MAX_TITLE_CHARS,
} from '../server/providers/sunor';
import { startMusicTask, pollMusicTask } from '../server/providers/musicapi';
import {
  resolveSuppliers,
  clearSupplierCache,
} from '../server/providers/suppliers';
import {
  clearInMemoryLedger,
  getInMemoryLedger,
  recordAttempt,
} from '../server/costLedger';
import { startVeoVariants } from '../server/providers/veo';
import type { GenerationTaskContext } from '../server/providers/types';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

// Minimal 1x1 transparent PNG bytes for stubbed responses
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, 'base64');
const TINY_MP4_BYTES = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');

async function runCloudflareDryRun(): Promise<void> {
  console.log('\n=== [DRY-RUN] 1. Cloudflare Adapter & Dev Cap Verification ===');
  const origFetch = globalThis.fetch;
  const origAcc = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origTok = process.env.CLOUDFLARE_API_TOKEN;
  const origCap = process.env.CF_DEV_DAILY_IMAGE_CAP;
  const origEnv = process.env.PROVIDER_ENV;

  process.env.CLOUDFLARE_ACCOUNT_ID = 'cf_test_acc_123456';
  process.env.CLOUDFLARE_API_TOKEN = 'cf_test_secret_token_987654';
  process.env.PROVIDER_ENV = 'dev';
  clearInMemoryLedger();

  try {
    // 1A. Test flux-1-schnell JSON request + JSON base64 response
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(
        JSON.stringify({ success: true, result: { image: TINY_PNG_BASE64 } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const schnellRes = await callCloudflareSingleImage({
      upstreamModel: '@cf/black-forest-labs/flux-1-schnell',
      prompt: 'A sunlit market in Douala',
      aspectRatio: '1:1',
    });

    assert(
      capturedUrl.endsWith('/ai/run/@cf/black-forest-labs/flux-1-schnell'),
      `Expected schnell URL, got ${capturedUrl}`
    );
    const parsedBody = JSON.parse(String(capturedInit?.body || '{}'));
    assert(parsedBody.steps === 4, `Expected steps=4 for schnell, got ${parsedBody.steps}`);
    assert(schnellRes.buffer.byteLength === TINY_PNG_BYTES.byteLength, 'Decoded base64 PNG buffer size mismatch');
    assert(Math.abs(schnellRes.estCostUsd - 0.000633) < 1e-6, `Expected $0.000633, got ${schnellRes.estCostUsd}`);
    console.log(
      `PASS [Cloudflare schnell JSON->base64] supplier=cloudflare upstream=@cf/black-forest-labs/flux-1-schnell estCostUsd=$${schnellRes.estCostUsd}`
    );

    // 1B. Test flux-2-klein-4b multipart/form-data request + raw binary bytes response
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(TINY_PNG_BYTES, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }) as typeof fetch;

    const kleinRes = await callCloudflareSingleImage({
      upstreamModel: '@cf/black-forest-labs/flux-2-klein-4b',
      prompt: 'Futuristic glowing mask',
      aspectRatio: '16:9',
    });

    assert(
      capturedUrl.endsWith('/ai/run/@cf/black-forest-labs/flux-2-klein-4b'),
      `Expected klein-4b URL, got ${capturedUrl}`
    );
    assert(capturedInit?.body instanceof FormData, 'Expected FormData body for flux-2-klein-4b');
    const fd = capturedInit?.body as FormData;
    assert(fd.get('steps') === '4', `Expected FormData steps='4', got ${fd.get('steps')}`);
    assert(fd.get('width') === '1024' && fd.get('height') === '576', 'Expected 1024x576 FormData dimensions for 16:9');
    assert(kleinRes.buffer.byteLength === TINY_PNG_BYTES.byteLength, 'Raw binary image byte length mismatch');
    console.log(
      `PASS [Cloudflare klein-4b FormData->bytes] supplier=cloudflare upstream=@cf/black-forest-labs/flux-2-klein-4b estCostUsd=$${kleinRes.estCostUsd}`
    );

    // 1C. Error mapping checks: 401/403, 429, 500, safety filter
    for (const errCase of [
      { status: 403, body: 'Forbidden', expRetryable: false, expCode: 'CF_AUTH_ERROR' },
      { status: 429, body: 'Rate limit exceeded', expRetryable: true, expCode: 'CF_RATE_LIMIT' },
      { status: 502, body: 'Bad gateway', expRetryable: true, expCode: 'CF_HTTP_502' },
      { status: 400, body: 'NSFW safety filter triggered', expRetryable: false, expCode: 'SAFETY_FILTER' },
    ]) {
      globalThis.fetch = (async () =>
        new Response(errCase.body, { status: errCase.status })) as typeof fetch;

      let caught: any = null;
      try {
        await callCloudflareSingleImage({
          upstreamModel: '@cf/black-forest-labs/flux-1-schnell',
          prompt: 'test',
        });
      } catch (e) {
        caught = e;
      }
      assert(caught, `Expected error for HTTP ${errCase.status}`);
      assert(caught.code === errCase.expCode, `Expected code ${errCase.expCode}, got ${caught.code}`);
      assert(
        caught.retryableBeforeAccept === errCase.expRetryable,
        `Expected retryable=${errCase.expRetryable} for ${errCase.status}`
      );
    }
    console.log('PASS [Cloudflare Error Mapping] 403 (non-retryable), 429 (retryable), 502 (retryable), safety filter (non-retryable)');

    // 1D. Acceptance Check #4: With PROVIDER_ENV=dev and CF_DEV_DAILY_IMAGE_CAP=2,
    //     the 3rd image returns a simulated placeholder with simulated = true, not an error.
    clearInMemoryLedger();
    process.env.CF_DEV_DAILY_IMAGE_CAP = '2';
    let cfApiCalls = 0;
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.includes('api.cloudflare.com')) {
        cfApiCalls++;
      }
      return new Response(
        JSON.stringify({ success: true, result: { image: TINY_PNG_BASE64 } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const ctx3: GenerationTaskContext = {
      userId: 'usr_smoke_cf',
      jobId: 'job_smoke_cf_cap',
      prompt: 'Vibrant street art in Yaounde',
      aspectRatio: '1:1',
      model: {
        id: 'img_cf_flux1_schnell',
        provider: 'cloudflare',
        model_name: 'cf_flux1_schnell',
        display_name: 'FLUX.1 Schnell (Draft 1K)',
        generation_type: 'image',
        quality_tier: 'lite',
        provider_cost: 0.000633,
        credit_cost: 10,
      },
      variantCount: 3,
      unitCost: 10,
    };

    const batchRes = await executeCloudflareImageGeneration(ctx3);
    assert(batchRes.length === 3, `Expected 3 variant results, got ${batchRes.length}`);
    assert(cfApiCalls === 2, `Expected exactly 2 real Cloudflare API calls under CF_DEV_DAILY_IMAGE_CAP=2, got ${cfApiCalls}`);
    assert(batchRes[0].status === 'completed' && batchRes[0].simulated === false, '1st image should be real (simulated=false)');
    assert(batchRes[1].status === 'completed' && batchRes[1].simulated === false, '2nd image should be real (simulated=false)');
    assert(
      batchRes[2].status === 'completed' && batchRes[2].simulated === true,
      `3rd image must succeed with simulated=true when cap=2, got status=${batchRes[2].status} simulated=${batchRes[2].simulated}`
    );
    const ledgerRows = getInMemoryLedger();
    console.log(
      `PASS [Dev Cap CF_DEV_DAILY_IMAGE_CAP=2] 1st: simulated=${batchRes[0].simulated}, 2nd: simulated=${batchRes[1].simulated}, 3rd: simulated=${batchRes[2].simulated} (url=${batchRes[2].outputUrl})`
    );
    console.log('Ledger Row Sample (Cloudflare):', JSON.stringify(ledgerRows[0]));
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
}

async function runKieDryRun(): Promise<void> {
  console.log('\n=== [DRY-RUN] 2. Kie.ai Veo 3.1 Adapter & 4s Routing Verification ===');
  const origFetch = globalThis.fetch;
  const origKieKey = process.env.KIE_API_KEY;
  const origGemKey = process.env.GEMINI_API_KEY;
  const origEnv = process.env.PROVIDER_ENV;

  process.env.KIE_API_KEY = 'kie_test_secret_key_123456';
  process.env.GEMINI_API_KEY = 'gem_test_secret_key_123456';
  process.env.PROVIDER_ENV = 'dev';
  clearSupplierCache();
  clearInMemoryLedger();

  try {
    // 2A. Acceptance Check #5: Verify a 4s Veo request is NEVER sent to Kie
    assert(
      kieSupports({ modelId: 'vid_veo_3_1_lite', durationSeconds: 4, resolution: '720p', aspectRatio: '16:9' }) === false,
      'kie.supports() must return false for 4s clips'
    );
    assert(
      kieSupports({ modelId: 'vid_veo_3_1_lite', durationSeconds: 8, resolution: '720p', aspectRatio: '16:9' }) === true,
      'kie.supports() must return true for 8s clips'
    );

    const suppliersFor4s = await resolveSuppliers('vid_veo_3_1_lite', {
      durationSeconds: 4,
      resolution: '720p',
      aspectRatio: '16:9',
    });
    assert(
      suppliersFor4s.every((s) => s.supplier !== 'kie') && suppliersFor4s[0]?.supplier === 'google',
      `Expected 4s Veo request to skip Kie and route to Google, got: ${suppliersFor4s.map((s) => s.supplier).join(',')}`
    );

    const suppliersFor8s = await resolveSuppliers('vid_veo_3_1_lite', {
      durationSeconds: 8,
      resolution: '720p',
      aspectRatio: '16:9',
    });
    assert(
      suppliersFor8s[0]?.supplier === 'kie' && suppliersFor8s[1]?.supplier === 'google',
      `Expected 8s Veo request to route kie (priority 1) -> google (priority 2)`
    );
    console.log(
      `PASS [4s vs 8s Veo Routing] 4s suppliers=[${suppliersFor4s.map((s) => s.supplier).join(', ')}] | 8s suppliers=[${suppliersFor8s.map((s) => s.supplier).join(', ')}]`
    );

    // 2B. Test Kie submit (verifying enableFallback: false) + record-info poll (JSON string resultUrls) + MP4 download + ledger cost
    let submitBody: any = null;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/veo/generate')) {
        submitBody = JSON.parse(String(init?.body || '{}'));
        return new Response(
          JSON.stringify({ code: 200, msg: 'success', data: { taskId: 'task_kie_999' } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/api/v1/veo/record-info')) {
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              taskId: 'task_kie_999',
              successFlag: 1,
              // Test JSON-encoded string array for resultUrls
              resultUrls: JSON.stringify(['https://cdn.kie.ai/videos/sample_999.mp4']),
              creditsConsumed: 35, // 35 * $0.005 = $0.175
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url === 'https://cdn.kie.ai/videos/sample_999.mp4') {
        return new Response(TINY_MP4_BYTES, {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': String(TINY_MP4_BYTES.byteLength) },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    await recordAttempt({
      jobId: 'job_smoke_kie',
      variantIndex: 0,
      userId: 'usr_smoke_kie',
      modelId: 'vid_veo_3_1_lite',
      supplier: 'kie',
      upstreamModel: 'veo3_lite',
      env: 'dev',
      units: 1,
      unitLabel: 'clip',
      estCostUsd: 0.175,
      creditsCharged: 620,
    });

    const started = await startKieVideoVariant({
      upstreamModel: 'veo3_lite',
      prompt: 'Drone shot over Kribi waterfalls at golden hour',
      aspectRatio: '16:9',
    });

    assert(started.providerJobId === 'kie_task_kie_999', `Expected kie_task_kie_999, got ${started.providerJobId}`);
    assert(submitBody?.enableFallback === false, 'CRITICAL: enableFallback MUST be false in Kie submit body');
    assert(submitBody?.model === 'veo3_lite', `Expected model=veo3_lite, got ${submitBody?.model}`);

    const polled = await pollKieOperation({
      operationName: started.providerJobId,
      userId: 'usr_smoke_kie',
      jobId: 'job_smoke_kie',
      variantIndex: 0,
    });

    assert(polled.status === 'completed', `Expected completed status, got ${polled.status}`);
    assert(Math.abs((polled.actualCostUsd || 0) - 0.175) < 1e-6, `Expected actualCostUsd=$0.175 (35 * $0.005), got ${polled.actualCostUsd}`);
    const kieLedger = getInMemoryLedger().find((r) => r.job_id === 'job_smoke_kie');
    assert(kieLedger?.status === 'succeeded' && kieLedger?.actual_cost_usd === 0.175, 'Kie ledger row not updated with actual_cost_usd=0.175');

    console.log(
      `PASS [Kie.ai Task Flow] supplier=kie upstream=veo3_lite enableFallback=${submitBody.enableFallback} actualCostUsd=$${polled.actualCostUsd}`
    );
    console.log('Ledger Row Sample (Kie.ai):', JSON.stringify(kieLedger));
  } finally {
    globalThis.fetch = origFetch;
    if (origKieKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = origKieKey;
    if (origGemKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origGemKey;
    if (origEnv === undefined) delete process.env.PROVIDER_ENV;
    else process.env.PROVIDER_ENV = origEnv;
    clearSupplierCache();
  }
}

async function runAlibabaDryRun(): Promise<void> {
  console.log('\n=== [DRY-RUN] 3. Alibaba DashScope Wan 3.0 Adapter Verification ===');
  const origFetch = globalThis.fetch;
  const origKey = process.env.DASHSCOPE_API_KEY;
  const origEnv = process.env.PROVIDER_ENV;

  process.env.DASHSCOPE_API_KEY = 'dashscope_test_key_123456';
  process.env.PROVIDER_ENV = 'dev';
  clearInMemoryLedger();

  try {
    let submitHeaders: any = null;
    let submitBody: any = null;

    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/services/aigc/video-generation/video-synthesis')) {
        submitHeaders = init?.headers;
        submitBody = JSON.parse(String(init?.body || '{}'));
        return new Response(
          JSON.stringify({
            request_id: 'req_wan_1',
            output: { task_id: 'wan_task_777', task_status: 'PENDING' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/api/v1/tasks/wan_task_777')) {
        return new Response(
          JSON.stringify({
            request_id: 'req_wan_2',
            output: {
              task_id: 'wan_task_777',
              task_status: 'SUCCEEDED',
              video_url: 'https://dashscope-result-sgp.oss-ap-southeast-1.aliyuncs.com/wan_777.mp4',
            },
            usage: { video_duration: 2 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.startsWith('https://dashscope-result-sgp.oss-ap-southeast-1.aliyuncs.com/')) {
        return new Response(TINY_MP4_BYTES, {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': String(TINY_MP4_BYTES.byteLength) },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const estCost = estimateWanCostUsd('vid_wan_3_0_standard', '480p', 2);
    await recordAttempt({
      jobId: 'job_smoke_wan',
      variantIndex: 0,
      userId: 'usr_smoke_wan',
      modelId: 'vid_wan_3_0_standard',
      supplier: 'alibaba',
      upstreamModel: 'wan3.0-video',
      env: 'dev',
      units: 2,
      unitLabel: 'second',
      estCostUsd: estCost,
      creditsCharged: 160,
    });

    const started = await startAlibabaWanVariant({
      modelId: 'vid_wan_3_0_standard',
      upstreamModel: 'wan3.0-t2v',
      prompt: 'Street dancer in Abidjan under neon lights',
      resolution: '480p',
      durationSeconds: 2,
      aspectRatio: '16:9',
    });

    assert(started.providerJobId === 'wan_wan_task_777', `Expected wan_wan_task_777, got ${started.providerJobId}`);
    assert(
      submitHeaders?.['X-DashScope-Async'] === 'enable',
      'Expected X-DashScope-Async: enable header on DashScope submit'
    );
    assert(submitBody?.model === 'wan3.0-video', `Expected model=wan3.0-video, got ${submitBody?.model}`);
    assert(
      submitBody?.parameters?.resolution === '480P' && submitBody?.parameters?.duration === 2,
      `Expected resolution=480P & duration=2, got ${JSON.stringify(submitBody?.parameters)}`
    );

    const polled = await pollAlibabaWanOperation({
      operationName: started.providerJobId,
      userId: 'usr_smoke_wan',
      jobId: 'job_smoke_wan',
      variantIndex: 0,
    });

    assert(polled.status === 'completed', `Expected completed status, got ${polled.status}`);
    assert(Math.abs((polled.actualCostUsd || 0) - 0.10) < 1e-6, `Expected actualCostUsd=$0.10 (2s @ $0.05/s), got ${polled.actualCostUsd}`);
    const wanLedger = getInMemoryLedger().find((r) => r.job_id === 'job_smoke_wan');
    assert(wanLedger?.status === 'succeeded', 'Wan ledger row should be marked succeeded');

    console.log(
      `PASS [Alibaba Wan 3.0 Task Flow] supplier=alibaba upstream=${started.upstreamModel} estCostUsd=$${started.estCostUsd} actualCostUsd=$${polled.actualCostUsd}`
    );
    console.log('Ledger Row Sample (Alibaba):', JSON.stringify(wanLedger));
  } finally {
    globalThis.fetch = origFetch;
    if (origKey === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = origKey;
    if (origEnv === undefined) delete process.env.PROVIDER_ENV;
    else process.env.PROVIDER_ENV = origEnv;
  }
}

async function runSunorDryRun(): Promise<void> {
  console.log('\n=== [DRY-RUN] 4. Sunor (Suno V6) Adapter, Error Codes & Dev Cap Verification ===');
  const origFetch = globalThis.fetch;
  const origKey = process.env.SUNOR_API_KEY;
  const origMusicKey = process.env.MUSICAPI_API_KEY;
  const origEnv = process.env.PROVIDER_ENV;
  const origCap = process.env.SUNOR_DEV_TOTAL_USD_CAP;

  process.env.SUNOR_API_KEY = 'sunor_test_secret_key_123456';
  process.env.MUSICAPI_API_KEY = 'musicapi_test_secret_key_123456';
  process.env.PROVIDER_ENV = 'dev';
  clearSupplierCache();
  clearInMemoryLedger();
  clearSunorPollCache();

  try {
    // 4A. Verify strict supplier isolation: mus_suno_v6 -> sunor only; mus_suno_sonic_v5 & mus_lyria_3_pro -> musicapi only
    const v6Suppliers = await resolveSuppliers('mus_suno_v6');
    assert(
      v6Suppliers.length === 1 && v6Suppliers[0].supplier === 'sunor' && v6Suppliers[0].upstreamModel === 'suno',
      `Expected mus_suno_v6 to route exclusively to sunor/suno, got ${JSON.stringify(v6Suppliers)}`
    );
    const v5Suppliers = await resolveSuppliers('mus_suno_sonic_v5');
    assert(
      v5Suppliers.every((s) => s.supplier !== 'sunor'),
      'mus_suno_sonic_v5 must NEVER fall back to sunor'
    );
    const lyriaSuppliers = await resolveSuppliers('mus_lyria_3_pro');
    assert(
      lyriaSuppliers.every((s) => s.supplier !== 'sunor'),
      'mus_lyria_3_pro must NEVER fall back to sunor'
    );
    console.log('PASS [Sunor Model Isolation] mus_suno_v6 -> sunor only; existing models never route to sunor');

    // 4B. Input clamping checks (Inspiration vs Custom mode)
    const overlongLyrics = 'L'.repeat(SUNOR_MAX_PROMPT_CHARS + 500);
    const overlongStyle = 'S'.repeat(SUNOR_MAX_TAGS_CHARS + 300);
    const overlongTitle = 'T'.repeat(SUNOR_MAX_TITLE_CHARS + 40);
    const customInput = buildSunorMusicInput({
      prompt: overlongStyle,
      lyrics: overlongLyrics,
      title: overlongTitle,
    });
    assert(
      'prompt' in customInput &&
        customInput.prompt.length === SUNOR_MAX_PROMPT_CHARS &&
        customInput.tags.length === SUNOR_MAX_TAGS_CHARS &&
        customInput.title.length === SUNOR_MAX_TITLE_CHARS,
      'Custom mode input did not clamp prompt (5000), tags (1000), and title (50)'
    );

    const inspirationInput = buildSunorMusicInput({
      prompt: `${overlongStyle} instrumental`,
    });
    assert(
      'gpt_description_prompt' in inspirationInput &&
        inspirationInput.gpt_description_prompt.length === SUNOR_MAX_TAGS_CHARS &&
        inspirationInput.make_instrumental === true,
      'Inspiration mode input did not clamp gpt_description_prompt (1000) or detect instrumental'
    );
    console.log('PASS [Sunor Input Shapes & Clamping] Custom mode (5000/1000/50) & Inspiration mode (1000)');

    // 4C. Full task lifecycle: POST /task (202) -> GET /task/{id} (2 clips) -> download audio (Content-Type) -> save asset -> ledger
    let submitHeaders: any = null;
    let submitBody: any = null;
    let createCallCount = 0;

    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/task') && init?.method === 'POST') {
        createCallCount++;
        submitHeaders = init?.headers;
        submitBody = JSON.parse(String(init?.body || '{}'));
        return new Response(
          JSON.stringify({
            code: 202,
            data: {
              task_id: 'sunor_task_v6_001',
              status: 'pending',
              credits_charged: 10,
            },
          }),
          { status: 202, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.endsWith('/api/v1/task/sunor_task_v6_001')) {
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              task_id: 'sunor_task_v6_001',
              status: 'success',
              credits_charged: 10,
              output: {
                result: [
                  {
                    id: 'clip_1',
                    audio_url: 'https://cdn.sunor.cc/audio/clip_1_no_ext',
                    image_url: 'https://cdn.sunor.cc/images/clip_1.jpg',
                    title: 'Douala Midnight Groove',
                    undocumented_extra_field: 'should_be_ignored',
                    metadata: { duration: 142.4, tags: 'makossa, afrobeats' },
                  },
                  {
                    id: 'clip_2',
                    audio_url: 'https://cdn.sunor.cc/audio/clip_2.mp3?token=xyz',
                    image_url: 'https://cdn.sunor.cc/images/clip_2.jpg',
                    title: 'Douala Midnight Groove (Take 2)',
                    metadata: { duration: 138.9, tags: 'makossa, afrobeats' },
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.startsWith('https://cdn.sunor.cc/audio/clip_1')) {
        return new Response(TINY_MP4_BYTES, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg; charset=binary' },
        });
      }
      if (url.startsWith('https://cdn.sunor.cc/audio/clip_2')) {
        // Return audio/wav even though URL has .mp3 to verify Content-Type wins over URL extension
        return new Response(TINY_MP4_BYTES, {
          status: 200,
          headers: { 'content-type': 'audio/wav' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const ctxV6: GenerationTaskContext = {
      userId: 'usr_smoke_sunor',
      jobId: 'job_smoke_sunor_1',
      prompt: 'Upbeat Cameroonian Makossa with brass section and electric guitar',
      model: {
        id: 'mus_suno_v6',
        provider: 'Suno',
        model_name: 'suno_v6',
        display_name: 'Suno V6',
        generation_type: 'music',
        quality_tier: 'pro',
        provider_cost: 0.10,
        credit_cost: 410,
      },
      variantCount: 2,
      unitCost: 205,
    };

    const startedVariants = await startMusicTask(ctxV6);
    assert(startedVariants.length === 2, `Expected 2 variants, got ${startedVariants.length}`);
    assert(
      startedVariants[0].providerJobId === 'sunor_sunor_task_v6_001:0' &&
        startedVariants[1].providerJobId === 'sunor_sunor_task_v6_001:1',
      `Unexpected providerJobIds: ${startedVariants.map((v) => v.providerJobId).join(', ')}`
    );
    assert(submitHeaders?.['x-api-key'] === 'sunor_test_secret_key_123456', 'Missing x-api-key header');
    assert(!submitHeaders?.['Authorization'], 'Must NOT send Authorization Bearer header to Sunor');
    assert(
      submitBody?.model === 'suno' &&
        submitBody?.task_type === 'music' &&
        submitBody?.audio_format === 'mp3' &&
        !('model_version' in submitBody),
      `Invalid Sunor request envelope: ${JSON.stringify(submitBody)}`
    );

    const take0 = await pollMusicTask({
      providerJobId: startedVariants[0].providerJobId!,
      userId: 'usr_smoke_sunor',
      jobId: 'job_smoke_sunor_1',
      variantIndex: 0,
    });
    const take1 = await pollMusicTask({
      providerJobId: startedVariants[1].providerJobId!,
      userId: 'usr_smoke_sunor',
      jobId: 'job_smoke_sunor_1',
      variantIndex: 1,
    });

    assert(take0.status === 'completed' && take0.storagePath?.endsWith('0.mp3'), `Expected take 0 stored as .mp3, got ${take0.storagePath}`);
    assert(take1.status === 'completed' && take1.storagePath?.endsWith('1.wav'), `Expected take 1 stored as .wav (from Content-Type), got ${take1.storagePath}`);
    assert(take0.durationSeconds === 142, `Expected durationSeconds=142, got ${take0.durationSeconds}`);
    assert(Math.abs((take0.actualCostUsd || 0) - 0.10) < 1e-6, `Expected actualCostUsd=$0.10, got ${take0.actualCostUsd}`);

    const sunorLedger = getInMemoryLedger().find((r) => r.job_id === 'job_smoke_sunor_1');
    assert(
      sunorLedger?.status === 'succeeded' && Math.abs((sunorLedger?.actual_cost_usd || 0) - 0.10) < 1e-6,
      'Sunor ledger row not marked succeeded with $0.10'
    );
    console.log(
      `PASS [Sunor V6 Task Flow] supplier=sunor upstream=suno actualCostUsd=$${take0.actualCostUsd} take0=${take0.storagePath} take1=${take1.storagePath}`
    );

    // 4D. Poll error_code branching (content_moderation, invalid_task_input, rate_limited, upstream_provider_error, timeout)
    for (const [idx, errCase] of [
      { status: 'failure', error_code: 'content_moderation', expUser: 'CONTENT_MODERATION' },
      { status: 'failure', error_code: 'invalid_task_input', expUser: 'INVALID_TASK_INPUT' },
      { status: 'failure', error_code: 'rate_limited', expUser: 'RATE_LIMITED' },
      { status: 'failure', error_code: 'upstream_provider_error', expUser: 'PROVIDER_UNAVAILABLE' },
      { status: 'timeout', error_code: undefined, expUser: 'PROVIDER_TIMEOUT' },
    ].entries()) {
      clearSunorPollCache();
      const tid = `err_task_${idx}`;
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              task_id: tid,
              status: errCase.status,
              error_code: errCase.error_code,
              error: 'Misleading prose text that must be ignored',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )) as typeof fetch;

      const res = await pollSunorMusicTask({
        providerJobId: `sunor_${tid}:0`,
        userId: 'usr_smoke_sunor',
        jobId: `job_err_${idx}`,
        variantIndex: 0,
      });
      assert(
        res.status === 'failed' && res.errorMessage === errCase.expUser,
        `Expected ${errCase.expUser} for (${errCase.status}, ${errCase.error_code}), got ${res.errorMessage}`
      );
    }
    console.log('PASS [Sunor Poll error_code Branching] content_moderation, invalid_task_input, rate_limited, upstream_provider_error, timeout');

    // 4E. Create error handling: verify NO auto-retry on 500, and retryableBeforeAccept=true ONLY on 503
    let postAttempts500 = 0;
    globalThis.fetch = (async () => {
      postAttempts500++;
      return new Response(JSON.stringify({ code: 500, error: 'Internal Server Error' }), { status: 500 });
    }) as typeof fetch;

    let caught500: any = null;
    try {
      await submitSunorTask({ ctx: ctxV6 });
    } catch (e) {
      caught500 = e;
    }
    assert(postAttempts500 === 1, `POST /task must NEVER auto-retry on 500, got ${postAttempts500} calls`);
    assert(caught500?.retryableBeforeAccept === false, '500 must have retryableBeforeAccept=false');

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 503, error: 'Dependency unavailable' }), { status: 503 })) as typeof fetch;
    let caught503: any = null;
    try {
      await submitSunorTask({ ctx: ctxV6 });
    } catch (e) {
      caught503 = e;
    }
    assert(caught503?.retryableBeforeAccept === true, '503 (task never created) must have retryableBeforeAccept=true');
    console.log('PASS [Sunor Create Idempotency Safety] 1 attempt on 500 (retryable=false), 503 (retryable=true)');

    // 4F. Dev cap SUNOR_DEV_TOTAL_USD_CAP=0.10 -> 2nd song returns simulated=true
    process.env.SUNOR_DEV_TOTAL_USD_CAP = '0.10';
    const cappedRes = await startSunorMusicTask({
      ...ctxV6,
      jobId: 'job_smoke_sunor_capped',
    });
    assert(
      cappedRes[0].status === 'processing' && cappedRes[0].simulated === true,
      `Expected simulated=true when SUNOR_DEV_TOTAL_USD_CAP=$0.10 is reached, got ${JSON.stringify(cappedRes[0])}`
    );
    console.log('PASS [Dev Cap SUNOR_DEV_TOTAL_USD_CAP=0.10] 2nd task returns simulated=true without calling Sunor API');
  } finally {
    globalThis.fetch = origFetch;
    if (origKey === undefined) delete process.env.SUNOR_API_KEY;
    else process.env.SUNOR_API_KEY = origKey;
    if (origMusicKey === undefined) delete process.env.MUSICAPI_API_KEY;
    else process.env.MUSICAPI_API_KEY = origMusicKey;
    if (origEnv === undefined) delete process.env.PROVIDER_ENV;
    else process.env.PROVIDER_ENV = origEnv;
    if (origCap === undefined) delete process.env.SUNOR_DEV_TOTAL_USD_CAP;
    else process.env.SUNOR_DEV_TOTAL_USD_CAP = origCap;
    clearSupplierCache();
    clearSunorPollCache();
    try {
      fs.rmSync(path.join(process.cwd(), 'public', 'generations', 'usr_smoke_sunor'), {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore cleanup errors
    }
  }
}

async function runLiveSmoke(target: 'cloudflare' | 'kie' | 'alibaba'): Promise<void> {
  process.env.PROVIDER_ENV = 'dev';
  clearInMemoryLedger();

  if (target === 'cloudflare') {
    const estCost = estimateCloudflareImageCostUsd('@cf/black-forest-labs/flux-1-schnell', 1024, 1024, 4);
    const ctx: GenerationTaskContext = {
      userId: 'usr_live_smoke',
      jobId: `job_smoke_cf_${Date.now()}`,
      prompt: 'Minimalist geometric sun icon over warm terracotta background',
      aspectRatio: '1:1',
      model: {
        id: 'img_cf_flux1_schnell',
        provider: 'cloudflare',
        model_name: 'cf_flux1_schnell',
        display_name: 'FLUX.1 Schnell (Draft 1K)',
        generation_type: 'image',
        quality_tier: 'lite',
        provider_cost: estCost,
        credit_cost: 10,
      },
      variantCount: 1,
      unitCost: 10,
    };
    const res = await executeCloudflareImageGeneration(ctx);
    console.log('[LIVE SMOKE: cloudflare]', {
      supplier: 'cloudflare',
      upstreamModel: '@cf/black-forest-labs/flux-1-schnell',
      estCostUsd: estCost,
      result: res[0],
      ledgerRow: getInMemoryLedger()[0] || null,
    });
    return;
  }

  if (target === 'kie') {
    const ctx: GenerationTaskContext = {
      userId: 'usr_live_smoke',
      jobId: `job_smoke_kie_${Date.now()}`,
      prompt: 'Calm ocean waves at sunset, static tripod shot',
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 8,
      model: {
        id: 'vid_veo_3_1_lite',
        provider: 'google',
        model_name: 'veo_3_1_lite',
        display_name: 'Google Veo 3.1 Lite',
        generation_type: 'video',
        quality_tier: 'lite',
        provider_cost: 0.05,
        credit_cost: 620,
      },
      variantCount: 1,
      unitCost: 620,
    };
    const res = await startVeoVariants(ctx);
    console.log('[LIVE SMOKE: kie]', {
      supplier: res[0]?.supplier || 'kie',
      upstreamModel: res[0]?.upstreamModel || 'veo3_lite',
      estCostUsd: res[0]?.estCostUsd ?? 0.175,
      result: res[0],
      ledgerRow: getInMemoryLedger()[0] || null,
    });
    return;
  }

  if (target === 'alibaba') {
    const estCost = estimateWanCostUsd('vid_wan_3_0_standard', '480p', 2);
    const ctx: GenerationTaskContext = {
      userId: 'usr_live_smoke',
      jobId: `job_smoke_wan_${Date.now()}`,
      prompt: 'Soft rain falling on green banana leaves, close up',
      aspectRatio: '16:9',
      resolution: '480p',
      durationSeconds: 2,
      model: {
        id: 'vid_wan_3_0_standard',
        provider: 'alibaba',
        model_name: 'wan_3_0_standard',
        display_name: 'Wan 3.0 Standard',
        generation_type: 'video',
        quality_tier: 'standard',
        provider_cost: 0.10,
        credit_cost: 160,
      },
      variantCount: 1,
      unitCost: 160,
    };
    const res = await startVeoVariants(ctx);
    console.log('[LIVE SMOKE: alibaba]', {
      supplier: res[0]?.supplier || 'alibaba',
      upstreamModel: res[0]?.upstreamModel || 'wan3.0-video',
      estCostUsd: estCost,
      result: res[0],
      ledgerRow: getInMemoryLedger()[0] || null,
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const target = (args.find((a) => !a.startsWith('--')) || 'all').toLowerCase();

  if (!['cloudflare', 'kie', 'alibaba', 'sunor', 'all'].includes(target)) {
    console.error('Usage: npx tsx scripts/provider-smoke.ts <cloudflare|kie|alibaba|sunor|all> [--dry-run]');
    process.exit(1);
  }

  if (dryRun) {
    const origSupUrl = process.env.SUPABASE_URL;
    const origSupKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      if (target === 'cloudflare' || target === 'all') await runCloudflareDryRun();
      if (target === 'kie' || target === 'all') await runKieDryRun();
      if (target === 'alibaba' || target === 'all') await runAlibabaDryRun();
      if (target === 'sunor' || target === 'all') await runSunorDryRun();
      console.log('\n✅ ALL DRY-RUN PROVIDER SMOKE CHECKS PASSED');
    } finally {
      if (origSupUrl !== undefined) process.env.SUPABASE_URL = origSupUrl;
      if (origSupKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origSupKey;
    }
    return;
  }

  if (target === 'all') {
    await runLiveSmoke('cloudflare');
    await runLiveSmoke('kie');
    await runLiveSmoke('alibaba');
  } else {
    await runLiveSmoke(target as 'cloudflare' | 'kie' | 'alibaba');
  }
}

main().catch((err) => {
  console.error('❌ Provider smoke test failed:', err);
  process.exit(1);
});
