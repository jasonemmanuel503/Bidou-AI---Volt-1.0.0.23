/**
 * server/providers/alibaba.ts
 *
 * Plain-language summary:
 * Alibaba Cloud Model Studio (DashScope) Wan 3.0 video generation adapter.
 *
 * Official Reference Findings (help.aliyun.com/en/model-studio/wan3-video-generation-api-reference):
 * - International (Singapore) base URL: `https://dashscope-intl.aliyuncs.com`
 *   (configurable via `DASHSCOPE_BASE_URL`; API keys are region-specific).
 * - Endpoint: `POST ${DASHSCOPE_BASE_URL}/api/v1/services/aigc/video-generation/video-synthesis`
 *   with header `X-DashScope-Async: enable`.
 * - Upstream model IDs: `wan3.0-video` (Standard) and `wan3.0-video-prime` (Prime).
 *   (Also normalizes catalog aliases `wan3.0-t2v` -> `wan3.0-video` and
 *   `wan3.0-t2v-prime` -> `wan3.0-video-prime`.)
 * - Parameters: `resolution` (`'480P' | '720P' | '1080P'`), `duration` (`2`–`30` integer seconds),
 *   `ratio` (`'16:9' | '9:16' | '1:1'`), `audio: true` (native audio included at no extra cost),
 *   `watermark: false`.
 * - Polling: `GET ${DASHSCOPE_BASE_URL}/api/v1/tasks/${taskId}`.
 * - Output URL expiration: DashScope OSS signed URLs expire after 24 hours, so we
 *   download the MP4 immediately on `SUCCEEDED` and store it via `saveGenerationAsset`.
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
import { markSucceeded, markFailed, getAttempt } from '../costLedger';

export function getDashScopeBaseUrl(): string {
  const custom = (process.env.DASHSCOPE_BASE_URL || '').trim().replace(/\/+$/, '');
  return custom || 'https://dashscope-intl.aliyuncs.com';
}

export function supports(params: CapabilityCheckParams): boolean {
  const { modelId, durationSeconds = 5, resolution = '720p' } = params;
  const isWan = modelId === 'vid_wan_3_0_standard' || modelId === 'vid_wan_3_0_prime';
  if (!isWan) return false;
  const dur = Number(durationSeconds);
  if (!Number.isFinite(dur) || dur < 2 || dur > 30) return false;
  const resLower = String(resolution).toLowerCase();
  if (resLower !== '480p' && resLower !== '720p' && resLower !== '1080p') return false;
  return true;
}

registerSupplierCapability('alibaba', supports);

/**
 * Maps catalog/model aliases (`wan3.0-t2v`, `wan3.0-t2v-prime`, `vid_wan_3_0_standard`, etc.)
 * to the official DashScope Wan 3.0 model identifiers (`wan3.0-video`, `wan3.0-video-prime`).
 */
export function resolveAlibabaUpstreamModel(modelIdOrUpstream: string): 'wan3.0-video' | 'wan3.0-video-prime' {
  if (modelIdOrUpstream.includes('prime')) {
    return 'wan3.0-video-prime';
  }
  return 'wan3.0-video';
}

export function estimateWanCostUsd(
  modelId: string,
  resolution: string = '720p',
  durationSeconds: number = 5
): number {
  const resNorm = (resolution.toLowerCase() === '480p'
    ? '480p'
    : resolution.toLowerCase() === '1080p'
      ? '1080p'
      : '720p') as '480p' | '720p' | '1080p';
  const dur = Math.max(2, Math.min(30, Math.round(Number(durationSeconds) || 5)));
  return getActualCostUsd(modelId, 'alibaba', { resolution: resNorm, durationSeconds: dur });
}

/**
 * Submits a single Wan 3.0 video synthesis task to Alibaba DashScope.
 * NEVER auto-retries a POST.
 */
export async function startAlibabaWanVariant(params: {
  modelId: string;
  upstreamModel: string;
  prompt: string;
  negativePrompt?: string;
  resolution?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  referenceImageUrl?: string;
  abortSignal?: AbortSignal;
}): Promise<{ providerJobId: string; upstreamModel: string; estCostUsd: number }> {
  const apiKey = (process.env.DASHSCOPE_API_KEY || '').trim();
  if (!apiKey) {
    throw new ProviderDispatchError({
      message: 'PROVIDER_KEY_MISSING',
      code: 'PROVIDER_KEY_MISSING',
      retryableBeforeAccept: true,
    });
  }

  const baseUrl = getDashScopeBaseUrl();
  const upstreamModel = resolveAlibabaUpstreamModel(params.upstreamModel || params.modelId);
  const resUpper = String(params.resolution || '720p').toUpperCase() as '480P' | '720P' | '1080P';
  const duration = Math.max(2, Math.min(30, Math.round(Number(params.durationSeconds) || 5)));
  const ratio = params.aspectRatio === '9:16' ? '9:16' : params.aspectRatio === '1:1' ? '1:1' : '16:9';
  const estCostUsd = estimateWanCostUsd(params.modelId, params.resolution || '720p', duration);

  const inputPayload: Record<string, any> = {
    prompt: params.prompt,
  };
  if (params.negativePrompt) {
    inputPayload.negative_prompt = params.negativePrompt;
  }
  if (params.referenceImageUrl) {
    inputPayload.img_url = params.referenceImageUrl;
  }

  const requestBody = {
    model: upstreamModel,
    input: inputPayload,
    parameters: {
      resolution: resUpper,
      duration,
      ratio,
      audio: true,
      watermark: false,
      prompt_extend: true,
    },
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify(requestBody),
      },
      SUBMIT_TIMEOUT_MS,
      params.abortSignal
    );
  } catch (err: any) {
    const msg = redactSecrets(err?.message || 'Alibaba DashScope submit timeout or network error');
    recordProviderFailure('alibaba', msg);
    throw new ProviderDispatchError({
      message: 'PROVIDER_TIMEOUT',
      code: 'WAN_SUBMIT_TIMEOUT',
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

  if (!response.ok || json?.code) {
    const errCode = String(json?.code || `HTTP_${response.status}`);
    const errMsg = redactSecrets(String(json?.message || rawText || `HTTP ${response.status}`));
    recordProviderFailure('alibaba', `${errCode}: ${errMsg.slice(0, 160)}`);

    const lower = (errCode + ' ' + errMsg).toLowerCase();
    const isSafety =
      lower.includes('datainspectionfailed') ||
      lower.includes('inappropriate') ||
      lower.includes('content security') ||
      lower.includes('safety');

    if (isSafety) {
      throw new ProviderDispatchError({
        message: 'Prompt triggered the safety filter. Please adjust your prompt and try again.',
        code: 'WAN_SAFETY_FILTER',
        httpStatus: response.status,
        retryableBeforeAccept: false,
      });
    }

    const isRetryable =
      response.status === 429 ||
      response.status >= 500 ||
      lower.includes('throttling') ||
      lower.includes('quota') ||
      lower.includes('arrearage');

    throw new ProviderDispatchError({
      message: 'PROVIDER_UNAVAILABLE',
      code: errCode,
      httpStatus: response.status,
      retryableBeforeAccept: isRetryable,
      adminMessage: errMsg.slice(0, 200),
    });
  }

  const taskId = json?.output?.task_id || json?.task_id;
  if (!taskId || typeof taskId !== 'string') {
    console.warn('[Alibaba Wan] Unexpected submit response shape (missing output.task_id):', redactSecrets(rawText.slice(0, 300)));
    recordProviderFailure('alibaba', 'Missing output.task_id');
    throw new ProviderDispatchError({
      message: 'PROVIDER_UNAVAILABLE',
      code: 'WAN_MISSING_TASK_ID',
      retryableBeforeAccept: true,
    });
  }

  recordProviderSuccess('alibaba');
  return {
    providerJobId: `wan_${taskId}`,
    upstreamModel,
    estCostUsd,
  };
}

/**
 * Polls a `wan_<taskId>` task on DashScope, downloads the MP4 immediately upon `SUCCEEDED`,
 * stores it via `saveGenerationAsset`, and records the actual cost in `provider_cost_ledger`.
 */
export async function pollAlibabaWanOperation(params: {
  operationName: string;
  userId: string;
  jobId: string;
  variantIndex: number;
}): Promise<VariantDispatchResult> {
  const { operationName, userId, jobId, variantIndex } = params;
  const taskId = operationName.replace(/^wan_/, '');
  const apiKey = (process.env.DASHSCOPE_API_KEY || '').trim();

  if (!apiKey) {
    return {
      status: 'failed',
      errorMessage: 'PROVIDER_KEY_MISSING',
      supplier: 'alibaba',
    };
  }

  const baseUrl = getDashScopeBaseUrl();

  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      SUBMIT_TIMEOUT_MS
    );

    if (!res.ok) {
      throw new Error(`DashScope task poll HTTP ${res.status}`);
    }

    const json: any = await res.json();
    const output = json?.output || {};
    const taskStatus = String(output?.task_status || json?.task_status || '').toUpperCase();

    if (taskStatus === 'PENDING' || taskStatus === 'RUNNING' || taskStatus === 'QUEUED') {
      return {
        providerJobId: operationName,
        status: 'processing',
        supplier: 'alibaba',
      };
    }

    if (taskStatus === 'FAILED' || taskStatus === 'CANCELED' || taskStatus === 'UNKNOWN') {
      const errCode = String(output?.code || json?.code || `WAN_${taskStatus}`);
      const errMsg = redactSecrets(String(output?.message || json?.message || `Wan 3.0 task ${taskStatus}`));
      recordProviderFailure('alibaba', `${errCode}: ${errMsg}`);
      await markFailed(jobId, variantIndex, 'alibaba', errCode);
      return {
        status: 'failed',
        errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : errMsg,
        supplier: 'alibaba',
      };
    }

    if (taskStatus !== 'SUCCEEDED') {
      console.warn(
        '[Alibaba Wan] Unexpected task_status during poll:',
        redactSecrets(JSON.stringify({ taskStatus, hasOutput: Boolean( json?.output ) }))
      );
      return {
        providerJobId: operationName,
        status: 'processing',
        supplier: 'alibaba',
      };
    }

    const videoUrl: string | undefined =
      output?.video_url ||
      output?.results?.[0]?.url ||
      output?.video?.url ||
      json?.video_url;

    if (!videoUrl || typeof videoUrl !== 'string') {
      console.warn(
        '[Alibaba Wan] SUCCEEDED response missing video_url:',
        redactSecrets(JSON.stringify(Object.keys(output)))
      );
      await markFailed(jobId, variantIndex, 'alibaba', 'WAN_MISSING_VIDEO_URL');
      return {
        status: 'failed',
        errorMessage: 'Wan 3.0 task succeeded but video_url was missing',
        supplier: 'alibaba',
      };
    }

    // Download MP4 immediately (DashScope OSS signed URLs expire after 24 hours)
    const buffer = await downloadMediaBufferSafe(videoUrl);

    const outputUrl = await saveGenerationAsset({
      userId,
      jobId,
      variantIndex,
      extension: 'mp4',
      contentType: 'video/mp4',
      data: buffer,
    });

    // Compute actual cost from usage duration if reported, else job parameters or recorded attempt
    const recordedAttempt = getAttempt(jobId, variantIndex, 'alibaba');
    let modelId = recordedAttempt?.model_id || 'vid_wan_3_0_standard';
    let resolution: string | undefined = output?.resolution || json?.parameters?.resolution;
    let durationSeconds = Number(
      json?.usage?.video_duration || output?.video_duration || recordedAttempt?.units || 5
    );
    try {
      const { job } = await getJobWithVariants(jobId);
      if (job?.model_id) modelId = job.model_id;
      if (job?.resolution) resolution = job.resolution;
      if (job?.duration_seconds && (!json?.usage?.video_duration && !output?.video_duration)) {
        durationSeconds = job.duration_seconds;
      }
    } catch {
      // ignore in standalone smoke test
    }

    const actualCostUsd = resolution
      ? estimateWanCostUsd(modelId, resolution, durationSeconds)
      : recordedAttempt && recordedAttempt.units > 0
        ? Number(((recordedAttempt.est_cost_usd / recordedAttempt.units) * durationSeconds).toFixed(6))
        : estimateWanCostUsd(modelId, '720p', durationSeconds);
    await markSucceeded(jobId, variantIndex, 'alibaba', actualCostUsd);
    recordProviderSuccess('alibaba');

    return {
      status: 'completed',
      outputUrl,
      storagePath: `${userId}/${jobId}/${variantIndex}.mp4`,
      supplier: 'alibaba',
      actualCostUsd,
    };
  } catch (err: any) {
    const safeMsg = redactSecrets(err?.message || 'Failed to poll or download Alibaba Wan video');
    console.error('[Alibaba Poller] Error checking task:', safeMsg);
    recordProviderFailure('alibaba', safeMsg);
    return {
      status: 'failed',
      errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : safeMsg,
      supplier: 'alibaba',
    };
  }
}
