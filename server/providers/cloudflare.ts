/**
 * server/providers/cloudflare.ts
 *
 * Plain-language summary:
 * Cloudflare Workers AI image generation adapter for:
 *   - `@cf/black-forest-labs/flux-1-schnell` (JSON body `{ prompt, steps: 4 }`, square 1024x1024)
 *   - `@cf/black-forest-labs/flux-2-klein-4b` (multipart/form-data with `prompt`, `steps='4'`, `width`, `height`)
 *
 * Branches on response `Content-Type` (JSON base64 vs raw image bytes), maps
 * 401/403, 429, and safety filter errors cleanly, enforces dev daily image caps,
 * records real cost in `costLedger`, and saves assets via `saveGenerationAsset`.
 */

import { GenerationTaskContext, VariantDispatchResult } from './types';
import { saveGenerationAsset } from '../storage';
import { recordProviderFailure, recordProviderSuccess } from './health';
import { isLiveMode } from '../config/mode';
import { getActualCostUsd } from '../../src/services/providerCatalog';
import {
  CapabilityCheckParams,
  CLOUDFLARE_IMAGE_TIMEOUT_MS,
  fetchWithTimeout,
  getProviderEnv,
  ProviderDispatchError,
   redactSecrets,
  registerSupplierCapability,
  reserveSupplierBudget,
  withSupplierBudgetMutex,
} from './suppliers';
import { recordAttempt, markSucceeded, markFailed } from '../costLedger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function supports(params: CapabilityCheckParams): boolean {
  return (
    params.modelId === 'img_cf_flux1_schnell' ||
    params.modelId === 'img_cf_flux2_klein_4b' ||
    params.modelId === 'img_cf_flux2_klein_9b'
  );
}

registerSupplierCapability('cloudflare', supports);

export function resolveCloudflareUpstreamModel(modelIdOrName: string): string {
  if (
    modelIdOrName === 'img_cf_flux2_klein_9b' ||
    modelIdOrName === 'cf_flux2_klein_9b' ||
    modelIdOrName.includes('flux-2-klein-9b')
  ) {
    return '@cf/black-forest-labs/flux-2-klein-9b';
  }
  if (
    modelIdOrName === 'img_cf_flux2_klein_4b' ||
    modelIdOrName === 'cf_flux2_klein_4b' ||
    modelIdOrName.includes('flux-2-klein-4b')
  ) {
    return '@cf/black-forest-labs/flux-2-klein-4b';
  }
  return '@cf/black-forest-labs/flux-1-schnell';
}

export function getDimensionsForAspectRatio(
  upstreamModel: string,
  aspectRatio?: string
): { width: number; height: number } {
  // flux-1-schnell has no width/height input -> square 1024x1024
  if (upstreamModel.includes('flux-1-schnell')) {
    return { width: 1024, height: 1024 };
  }
  // flux-2-klein-4b accepts width & height (multiples of 64 within 4 tiles)
  if (aspectRatio === '16:9') {
    return { width: 1024, height: 576 };
  }
  if (aspectRatio === '9:16') {
    return { width: 576, height: 1024 };
  }
  return { width: 1024, height: 1024 };
}

/**
 * Computes the Cloudflare Workers AI cost in USD from the catalog's PRICE_BOOK
 * (`getActualCostUsd`), scaling by output tile ratio relative to 1024x1024 (4 tiles).
 * Klein 9B costs 0.015 base MP + 0.002 extra output MP + 0.002 per input MP.
 */
export function estimateCloudflareImageCostUsd(
  upstreamModel: string,
  width: number = 1024,
  height: number = 1024,
  _steps: number = 4,
  inputImageCount: number = 0
): number {
  if (upstreamModel.includes('flux-2-klein-9b')) {
    const outputMp = (width * height) / 1_000_000;
    const extraOutputMp = Math.max(0, outputMp - 1.0);
    const cost = 0.015 + extraOutputMp * 0.002 + inputImageCount * 0.002;
    return Number(cost.toFixed(6));
  }
  const modelId = upstreamModel.includes('flux-2-klein-4b')
    ? 'img_cf_flux2_klein_4b'
    : 'img_cf_flux1_schnell';
  const base1024Cost = getActualCostUsd(modelId, 'cloudflare');
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  if (tiles === 4) {
    return base1024Cost;
  }
  return Number(((base1024Cost * tiles) / 4).toFixed(6));
}

function detectImageFormat(buffer: Buffer, contentTypeHeader?: string | null): {
  extension: 'png' | 'jpg';
  contentType: string;
} {
  const ct = (contentTypeHeader || '').toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  if (ct.includes('png')) {
    return { extension: 'png', contentType: 'image/png' };
  }
  // Inspect magic bytes
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  return { extension: 'png', contentType: 'image/png' };
}

function isSafetyFilterMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('nsfw') ||
    lower.includes('safety') ||
    lower.includes('moderation') ||
    lower.includes('content policy') ||
    lower.includes('flagged') ||
    lower.includes('inappropriate')
  );
}

/**
 * Calls Cloudflare Workers AI for a single image variant (NEVER auto-retries a POST).
 */
export async function callCloudflareSingleImage(params: {
  upstreamModel: string;
  prompt: string;
  aspectRatio?: string;
  abortSignal?: AbortSignal;
  referenceImages?: { buffer: Buffer; mime: string }[];
}): Promise<{ buffer: Buffer; extension: 'png' | 'jpg'; contentType: string; estCostUsd: number }> {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();

  if (!accountId || !apiToken) {
    throw new ProviderDispatchError({
      message: 'PROVIDER_KEY_MISSING',
      code: 'PROVIDER_KEY_MISSING',
      retryableBeforeAccept: true,
    });
  }

  // Truncate prompt to 2048 chars (never fail on long prompt)
  const truncatedPrompt = (params.prompt || '').slice(0, 2048);
  const { width, height } = getDimensionsForAspectRatio(params.upstreamModel, params.aspectRatio);
  const refCount = params.referenceImages?.length || 0;
  const estCostUsd = estimateCloudflareImageCostUsd(params.upstreamModel, width, height, 4, refCount);

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${params.upstreamModel}`;

  let requestInit: RequestInit;
  if (params.upstreamModel.includes('flux-2-klein-9b') || params.upstreamModel.includes('flux-2-klein-4b')) {
    const form = new FormData();
    form.append('prompt', truncatedPrompt);
    form.append('steps', '4');
    form.append('width', String(width));
    form.append('height', String(height));

    if (params.referenceImages && params.referenceImages.length > 0) {
      params.referenceImages.slice(0, 4).forEach((img, idx) => {
        const blob = new Blob([new Uint8Array(img.buffer)], { type: img.mime || 'image/jpeg' });
        form.append(`input_image_${idx}`, blob, `input_${idx}.jpg`);
      });
    }

    requestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      body: form,
    };
  } else {
    requestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: truncatedPrompt,
        steps: 4,
      }),
    };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, requestInit, CLOUDFLARE_IMAGE_TIMEOUT_MS, params.abortSignal);
  } catch (err: any) {
    const msg = redactSecrets(err?.message || 'Cloudflare request timeout or network error');
    recordProviderFailure('cloudflare', msg);
    throw new ProviderDispatchError({
      message: 'PROVIDER_TIMEOUT',
      code: 'PROVIDER_TIMEOUT',
      retryableBeforeAccept: true,
      adminMessage: msg,
    });
  }

  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    const errText = redactSecrets(await response.text().catch(() => ''));
    if (response.status === 401 || response.status === 403) {
      const adminMsg = 'Cloudflare token needs the Workers AI permission';
      console.error(`[Cloudflare] HTTP ${response.status}: ${adminMsg}`);
      recordProviderFailure('cloudflare', adminMsg);
      throw new ProviderDispatchError({
        message: 'PROVIDER_UNAVAILABLE',
        code: 'CF_AUTH_ERROR',
        httpStatus: response.status,
        retryableBeforeAccept: false,
        adminMessage: adminMsg,
      });
    }

    if (response.status === 429) {
      recordProviderFailure('cloudflare', 'HTTP 429 rate limited');
      throw new ProviderDispatchError({
        message: 'PROVIDER_UNAVAILABLE',
        code: 'CF_RATE_LIMIT',
        httpStatus: 429,
        retryableBeforeAccept: true,
        adminMessage: `Cloudflare 429: ${errText.slice(0, 200)}`,
      });
    }

    if (isSafetyFilterMessage(errText)) {
      throw new ProviderDispatchError({
        message:
          'Prompt triggered the safety filter. Please add a bit more descriptive context (single-word prompts can trigger false positives).',
        code: 'SAFETY_FILTER',
        httpStatus: response.status,
        retryableBeforeAccept: false,
      });
    }

    const retryable = response.status >= 500;
    recordProviderFailure('cloudflare', `HTTP ${response.status}: ${errText.slice(0, 160)}`);
    throw new ProviderDispatchError({
      message: 'PROVIDER_UNAVAILABLE',
      code: `CF_HTTP_${response.status}`,
      httpStatus: response.status,
      retryableBeforeAccept: retryable,
      adminMessage: errText.slice(0, 200),
    });
  }

  // Branch on response Content-Type: JSON -> base64 result.image, otherwise raw image bytes
  if (contentType.toLowerCase().includes('application/json')) {
    const json: any = await response.json();
    if (json?.success === false || json?.errors?.length) {
      const errDetail = redactSecrets(JSON.stringify(json.errors || json));
      if (isSafetyFilterMessage(errDetail)) {
        throw new ProviderDispatchError({
          message:
            'Prompt triggered the safety filter. Please add a bit more descriptive context (single-word prompts can trigger false positives).',
          code: 'SAFETY_FILTER',
          retryableBeforeAccept: false,
        });
      }
      recordProviderFailure('cloudflare', errDetail.slice(0, 160));
      throw new ProviderDispatchError({
        message: 'PROVIDER_UNAVAILABLE',
        code: 'CF_API_ERROR',
        retryableBeforeAccept: false,
      });
    }

    const b64: string | undefined = json?.result?.image || json?.image;
    if (!b64 || typeof b64 !== 'string') {
      throw new ProviderDispatchError({
        message:
          'Prompt triggered the safety filter. Please add a bit more descriptive context (single-word prompts can trigger false positives).',
        code: 'SAFETY_FILTER',
        retryableBeforeAccept: false,
      });
    }

    const cleanB64 = b64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanB64, 'base64');
    const fmt = detectImageFormat(buffer, null);
    recordProviderSuccess('cloudflare');
    return { buffer, extension: fmt.extension, contentType: fmt.contentType, estCostUsd };
  }

  // Raw binary image bytes
  const ab = await response.arrayBuffer();
  const buffer = Buffer.from(ab);
  if (buffer.byteLength === 0) {
    throw new ProviderDispatchError({
      message:
        'Prompt triggered the safety filter. Please add a bit more descriptive context (single-word prompts can trigger false positives).',
      code: 'SAFETY_FILTER',
      retryableBeforeAccept: false,
    });
  }

  const fmt = detectImageFormat(buffer, contentType);
  recordProviderSuccess('cloudflare');
  return { buffer, extension: fmt.extension, contentType: fmt.contentType, estCostUsd };
}

/**
 * Generates up to `variantCount` Cloudflare images in parallel (`Promise.allSettled`),
 * enforcing dev caps and recording every attempt in `provider_cost_ledger`.
 */
export async function executeCloudflareImageGeneration(
  ctx: GenerationTaskContext
): Promise<VariantDispatchResult[]> {
  const { userId, jobId, prompt, enhancedPrompt, aspectRatio = '1:1', variantCount, model, unitCost } = ctx;
  const activePrompt = enhancedPrompt || prompt;
  const n = Math.max(1, Math.min(variantCount, 4));
  const upstreamModel = resolveCloudflareUpstreamModel(model.id || model.model_name);
  const { width, height } = getDimensionsForAspectRatio(upstreamModel, aspectRatio);
  const estCostUsd = estimateCloudflareImageCostUsd(upstreamModel, width, height, 4);
  const env = getProviderEnv();
  const [simW, simH] = aspectRatio === '16:9' ? [1280, 720] : aspectRatio === '9:16' ? [720, 1280] : [1024, 1024];

  const hasKeys = Boolean(
    (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim() &&
    (process.env.CLOUDFLARE_API_TOKEN || '').trim()
  );

  // Demo mode without keys -> return simulated placeholders
  if (!hasKeys && !isLiveMode()) {
    const demoResults: VariantDispatchResult[] = [];
    for (let i = 0; i < n; i++) {
      await sleep(900 + i * 200);
      const placeholderUrl = `https://picsum.photos/seed/${jobId}-${i}/${simW}/${simH}`;
      demoResults.push({
        status: 'completed',
        outputUrl: placeholderUrl,
        thumbnailUrl: placeholderUrl,
        supplier: 'cloudflare',
        upstreamModel,
        estCostUsd: 0,
        actualCostUsd: 0,
        simulated: true,
      });
    }
    return demoResults;
  }

  if (!hasKeys && isLiveMode()) {
    return Array.from({ length: n }).map(() => ({
      status: 'failed' as const,
      errorMessage: 'PROVIDER_KEY_MISSING',
      supplier: 'cloudflare',
      upstreamModel,
    }));
  }

  // Check budget for each variant sequentially so daily cap accounting is exact,
  // protected by in-process async mutex (single server instance only) to serialize check + recordAttempt.
  const variantPlans: Array<'call' | 'simulate_cap' | 'tripped'> = [];
  for (let i = 0; i < n; i++) {
    await withSupplierBudgetMutex('cloudflare', async () => {
      const budget = await reserveSupplierBudget('cloudflare', estCostUsd, 1, 'image');
      if (budget === 'cap_reached') {
        variantPlans.push('simulate_cap');
      } else if (budget === 'tripped') {
        variantPlans.push('tripped');
      } else {
        variantPlans.push('call');
        // Record attempt immediately so concurrent/subsequent checks in the same batch see it
        await recordAttempt({
          jobId,
          variantIndex: i,
          userId,
          modelId: model.id,
          supplier: 'cloudflare',
          upstreamModel,
          env,
          units: 1,
          unitLabel: 'image',
          estCostUsd,
          creditsCharged: unitCost,
        });
      }
    });
  }

  const tasks = variantPlans.map(async (plan, idx): Promise<VariantDispatchResult> => {
    if (plan === 'simulate_cap') {
      const placeholderUrl = `https://picsum.photos/seed/${jobId}-devcap-${idx}/${simW}/${simH}`;
      return {
        status: 'completed',
        outputUrl: placeholderUrl,
        thumbnailUrl: placeholderUrl,
        supplier: 'cloudflare',
        upstreamModel,
        estCostUsd: 0,
        actualCostUsd: 0,
        simulated: true,
      };
    }

    if (plan === 'tripped') {
      return {
        status: 'failed',
        errorMessage: 'MODEL_TEMPORARILY_UNAVAILABLE',
        supplier: 'cloudflare',
        upstreamModel,
      };
    }

    const variedPrompt = n > 1 ? `${activePrompt} (variation ${idx + 1})` : activePrompt;
    const res = await callCloudflareSingleImage({
      upstreamModel,
      prompt: variedPrompt,
      aspectRatio,
      abortSignal: ctx.abortSignal,
    });

    const url = await saveGenerationAsset({
      userId,
      jobId,
      variantIndex: idx,
      extension: res.extension,
      contentType: res.contentType,
      data: res.buffer,
    });

    await markSucceeded(jobId, idx, 'cloudflare', res.estCostUsd);

    return {
      status: 'completed',
      outputUrl: url,
      thumbnailUrl: url,
      storagePath: `${userId}/${jobId}/${idx}.${res.extension}`,
      supplier: 'cloudflare',
      upstreamModel,
      estCostUsd: res.estCostUsd,
      actualCostUsd: res.estCostUsd,
      simulated: false,
    };
  });

  const settled = await Promise.allSettled(tasks);
  const results: VariantDispatchResult[] = [];

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'fulfilled') {
      results.push(s.value);
    } else {
      const err: any = s.reason;
      const code = err?.code || 'CF_DISPATCH_FAILED';
      await markFailed(jobId, i, 'cloudflare', code);
      results.push({
        status: 'failed',
        errorMessage: err?.message || 'PROVIDER_UNAVAILABLE',
        supplier: 'cloudflare',
        upstreamModel,
      });
    }
  }

  return results;
}
