/**
 * server/providers/kie.ts
 *
 * Plain-language summary:
 * Kie.ai Veo 3.1 video adapter (`veo3_lite`, `veo3_fast`, `veo3`).
 * - Submit: POST https://api.kie.ai/api/v1/veo/generate
 *   with `enableFallback: false` (CRITICAL: prevents Kie from silently rendering
 *   a lower model/resolution) and `enableTranslation: false` (passes the user's
 *   exact art-direction prompt verbatim to Veo 3.1).
 * - Poll: GET https://api.kie.ai/api/v1/veo/record-info?taskId=...
 *   Handles `resultUrls` whether returned as a JSON string or an array.
 * - 1080p: When 1080p is requested, calls GET /api/v1/veo/get-1080p-video?taskId=...
 *   if available, then immediately downloads the MP4 via `downloadMediaBufferSafe`
 *   (Kie URLs expire quickly) and saves it to storage via `saveGenerationAsset`.
 * - Cost accounting: converts `creditsConsumed` with `1 Kie credit = $0.005`
 *   into `actual_cost_usd` in `provider_cost_ledger`.
 */

import { VariantDispatchResult } from './types';
import { saveGenerationAsset } from '../storage';
import { recordProviderFailure, recordProviderSuccess } from './health';
import { isLiveMode } from '../config/mode';
import { getJobWithVariants } from '../db';
import { getActualCostUsd } from '../../src/services/providerCatalog';
import {
  CapabilityCheckParams,
  downloadMediaBufferSafe,
  fetchWithTimeout,
  ProviderDispatchError,
  redactSecrets,
  registerSupplierCapability,
  SUBMIT_TIMEOUT_MS,
} from './suppliers';
import { markSucceeded, markFailed } from '../costLedger';

const KIE_BASE_URL = 'https://api.kie.ai';
const KIE_CREDIT_USD = 0.005; // 1 Kie credit = $0.005

/**
 * Capability check:
 * Confirmed against docs.kie.ai/veo3-api: Kie.ai Veo 3.1 generates 8-second clips
 * in 16:9 or 9:16 aspect ratios (720p default + 1080p via get-1080p-video).
 * 4s and 6s Veo requests return `false` here so `resolveSuppliers` routes them
 * straight to Google direct.
 */
export function supports(params: CapabilityCheckParams): boolean {
  const { modelId, durationSeconds = 8, resolution = '720p', aspectRatio = '16:9' } = params;
  const isVeo =
    modelId === 'vid_veo_3_1_lite' ||
    modelId === 'vid_veo_3_1_fast' ||
    modelId === 'vid_veo_3_1_standard';
  if (!isVeo) return false;
  if (Number(durationSeconds) !== 8) return false;
  if (resolution !== '720p' && resolution !== '1080p') return false;
  if (aspectRatio !== '16:9' && aspectRatio !== '9:16') return false;
  return true;
}

registerSupplierCapability('kie', supports);

export function resolveKieUpstreamModel(modelIdOrName: string): 'veo3_lite' | 'veo3_fast' | 'veo3' {
  if (modelIdOrName.includes('lite')) return 'veo3_lite';
  if (modelIdOrName.includes('fast')) return 'veo3_fast';
  return 'veo3';
}

/**
 * Submits a single Veo 3.1 generation task to Kie.ai.
 * NEVER auto-retries a POST (prevents double-billing).
 * Hardcodes `enableFallback: false` so customers always receive the exact model tier they paid for.
 */
export async function startKieVideoVariant(params: {
  upstreamModel: string;
  prompt: string;
  aspectRatio?: string;
  referenceImageUrl?: string;
  abortSignal?: AbortSignal;
}): Promise<{ providerJobId: string; upstreamModel: string }> {
  const apiKey = (process.env.KIE_API_KEY || '').trim();
  if (!apiKey) {
    throw new ProviderDispatchError({
      message: 'PROVIDER_KEY_MISSING',
      code: 'PROVIDER_KEY_MISSING',
      retryableBeforeAccept: true,
    });
  }

  const aspectRatio = params.aspectRatio === '9:16' ? '9:16' : '16:9';
  const hasRefImage = Boolean(params.referenceImageUrl);

  // Guaranteed: enableFallback MUST be false so Kie never downgrades to a cheaper model/720p fallback.
  // enableTranslation is false so art-direction prompts are sent verbatim to Veo 3.1.
  const requestBody: Record<string, any> = {
    prompt: params.prompt,
    model: params.upstreamModel,
    aspect_ratio: aspectRatio,
    generationType: hasRefImage ? 'FIRST_AND_LAST_FRAMES_2_VIDEO' : 'TEXT_2_VIDEO',
    enableFallback: false,
    enableTranslation: false,
  };

  if (hasRefImage && params.referenceImageUrl) {
    requestBody.imageUrls = [params.referenceImageUrl];
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${KIE_BASE_URL}/api/v1/veo/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      SUBMIT_TIMEOUT_MS,
      params.abortSignal
    );
  } catch (err: any) {
    const msg = redactSecrets(err?.message || 'Kie.ai submit timeout or network error');
    recordProviderFailure('kie', msg);
    throw new ProviderDispatchError({
      message: 'PROVIDER_TIMEOUT',
      code: 'KIE_SUBMIT_TIMEOUT',
      retryableBeforeAccept: true,
      adminMessage: msg,
    });
  }

  const rawText = await response.text().catch(() => '');
  let json: any = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }

  if (!response.ok || (json && json.code && Number(json.code) !== 200)) {
    const apiCode = Number(json?.code || response.status || 500);
    const apiMsg = redactSecrets(String(json?.msg || json?.message || rawText || `HTTP ${response.status}`));
    recordProviderFailure('kie', `code=${apiCode} ${apiMsg.slice(0, 160)}`);

    const lower = apiMsg.toLowerCase();
    const isQuotaOrRate =
      response.status === 429 ||
      apiCode === 429 ||
      apiCode === 402 ||
      lower.includes('insufficient') ||
      lower.includes('balance') ||
      lower.includes('credit') ||
      lower.includes('rate limit') ||
      lower.includes('quota');

    const isServerErr = response.status >= 500 || apiCode >= 500;
    const isAuthErr = response.status === 401 || response.status === 403 || apiCode === 401 || apiCode === 403;

    throw new ProviderDispatchError({
      message: 'PROVIDER_UNAVAILABLE',
      code: `KIE_ERR_${apiCode}`,
      httpStatus: response.status,
      retryableBeforeAccept: isQuotaOrRate || isServerErr || isAuthErr,
      adminMessage: apiMsg.slice(0, 200),
    });
  }

  const taskId = json?.data?.taskId || json?.taskId;
  if (!taskId || typeof taskId !== 'string') {
    const msg = 'Kie.ai response missing data.taskId';
    recordProviderFailure('kie', msg);
    throw new ProviderDispatchError({
      message: 'PROVIDER_UNAVAILABLE',
      code: 'KIE_MISSING_TASK_ID',
      retryableBeforeAccept: true,
      adminMessage: msg,
    });
  }

  recordProviderSuccess('kie');
  return {
    providerJobId: `kie_${taskId}`,
    upstreamModel: params.upstreamModel,
  };
}

/**
 * Parses `resultUrls` from Kie.ai record-info response, handling both JSON string
 * (`'["https://..."]'`) and native string array (`['https://...']`).
 */
export function parseKieResultUrls(data: any): string[] {
  if (!data) return [];
  const raw =
    data?.response?.resultUrls ??
    data?.resultUrls ??
    data?.result_urls ??
    data?.response?.videoUrls ??
    null;

  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((u): u is string => typeof u === 'string' && u.length > 0);
        }
      } catch {
        // fall through
      }
    }
    if (trimmed.startsWith('http')) {
      return [trimmed];
    }
  }
  return [];
}

/**
 * Fetches the 1080p video URL from Kie.ai's dedicated endpoint:
 * GET https://api.kie.ai/api/v1/veo/get-1080p-video?taskId=...&index=0
 */
export async function fetchKie1080pUrl(taskId: string, apiKey: string): Promise<{
  url: string | null;
  extraCreditsConsumed: number;
}> {
  try {
    const res = await fetchWithTimeout(
      `${KIE_BASE_URL}/api/v1/veo/get-1080p-video?taskId=${encodeURIComponent(taskId)}&index=0`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      SUBMIT_TIMEOUT_MS
    );
    if (!res.ok) return { url: null, extraCreditsConsumed: 0 };
    const json: any = await res.json().catch(() => null);
    const url =
      json?.data?.resultUrl ||
      json?.data?.url ||
      json?.data?.videoUrl ||
      (typeof json?.data === 'string' && json.data.startsWith('http') ? json.data : null);
    const extraCredits = Number(json?.data?.creditsConsumed || 0);
    return {
      url: typeof url === 'string' ? url : null,
      extraCreditsConsumed: Number.isFinite(extraCredits) ? extraCredits : 0,
    };
  } catch {
    return { url: null, extraCreditsConsumed: 0 };
  }
}

/**
 * Polls a `kie_<taskId>` operation, downloads the MP4 immediately upon completion,
 * stores it via `saveGenerationAsset`, and updates `provider_cost_ledger` with the real cost.
 */
export async function pollKieOperation(params: {
  operationName: string;
  userId: string;
  jobId: string;
  variantIndex: number;
}): Promise<VariantDispatchResult> {
  const { operationName, userId, jobId, variantIndex } = params;
  const taskId = operationName.replace(/^kie_/, '');
  const apiKey = (process.env.KIE_API_KEY || '').trim();

  if (!apiKey) {
    return {
      status: 'failed',
      errorMessage: 'PROVIDER_KEY_MISSING',
      supplier: 'kie',
    };
  }

  try {
    const res = await fetchWithTimeout(
      `${KIE_BASE_URL}/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      SUBMIT_TIMEOUT_MS
    );

    if (!res.ok) {
      throw new Error(`Kie record-info HTTP ${res.status}`);
    }

    const json: any = await res.json();
    const data = json?.data || json;
    const successFlag = data?.successFlag;

    // successFlag: 0 = generating, 1 = success, 2 or 3 = failed
    if (successFlag === 0 || successFlag === '0' || data?.status === 'pending' || data?.status === 'processing') {
      return {
        providerJobId: operationName,
        status: 'processing',
        supplier: 'kie',
      };
    }

    if (successFlag === 2 || successFlag === 3 || successFlag === '2' || successFlag === '3' || data?.status === 'failed') {
      const errCode = String(data?.errorCode || `FLAG_${successFlag}`);
      const errMsg = redactSecrets(String(data?.errorMessage || 'Kie.ai video generation failed'));
      recordProviderFailure('kie', `${errCode}: ${errMsg}`);
      await markFailed(jobId, variantIndex, 'kie', errCode);
      return {
        status: 'failed',
        errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : errMsg,
        supplier: 'kie',
      };
    }

    const urls = parseKieResultUrls(data);
    let videoUrl = urls[0] || null;
    let totalKieCredits = Number(data?.creditsConsumed ?? data?. response?.creditsConsumed ?? 0);

    // Check if the parent job requested 1080p
    let requested1080p = false;
    let modelId = 'vid_veo_3_1_fast';
    try {
      const { job } = await getJobWithVariants(jobId);
      if (job?.resolution === '1080p') {
        requested1080p = true;
      }
      if (job?.model_id) {
        modelId = job.model_id;
      }
    } catch {
      // ignore lookup failure in smoke/standalone tests
    }

    if (requested1080p) {
      const hd = await fetchKie1080pUrl(taskId, apiKey);
      if (hd.url) {
        videoUrl = hd.url;
        totalKieCredits += hd.extraCreditsConsumed;
      }
    }

    if (!videoUrl) {
      await markFailed(jobId, variantIndex, 'kie', 'MISSING_RESULT_URL');
      return {
        status: 'failed',
        errorMessage: 'Kie.ai marked task complete but resultUrls was empty',
        supplier: 'kie',
      };
    }

    // Download the MP4 immediately (Kie URLs expire quickly)
    const buffer = await downloadMediaBufferSafe(videoUrl);

    const outputUrl = await saveGenerationAsset({
      userId,
      jobId,
      variantIndex,
      extension: 'mp4',
      contentType: 'video/mp4',
      data: buffer,
    });

    // Convert Kie credits consumed -> USD (`1 Kie credit = $0.005`), or fall back to catalog rate
    const actualCostUsd =
      Number.isFinite(totalKieCredits) && totalKieCredits > 0
        ? Number((totalKieCredits * KIE_CREDIT_USD).toFixed(6))
        : getActualCostUsd(modelId, 'kie', {
            resolution: requested1080p ? '1080p' : '720p',
            durationSeconds: 8,
          });

    await markSucceeded(jobId, variantIndex, 'kie', actualCostUsd);
    recordProviderSuccess('kie');

    return {
      status: 'completed',
      outputUrl,
      storagePath: `${userId}/${jobId}/${variantIndex}.mp4`,
      supplier: 'kie',
      actualCostUsd,
    };
  } catch (err: any) {
    const safeMsg = redactSecrets(err?.message || 'Failed to poll or download Kie.ai video');
    console.error('[Kie Poller] Error checking operation:', safeMsg);
    recordProviderFailure('kie', safeMsg);
    return {
      status: 'failed',
      errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : safeMsg,
      supplier: 'kie',
    };
  }
}
