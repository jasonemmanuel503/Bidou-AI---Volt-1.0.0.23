/**
 * server/providers/sunor.ts
 *
 * Plain-language summary:
 * Sunor API (`https://sunor.cc/api/v1`) music generation adapter for the
 * `mus_suno_v6` (Suno V6) model.
 *
 * Contract (verified against docs.sunor.cc on 2 Oct 2026):
 * - Base URL: `https://sunor.cc/api/v1` (configurable via `SUNOR_BASE_URL`).
 * - Auth header: `x-api-key: <SUNOR_API_KEY>` (never `Authorization: Bearer`).
 * - Create task: `POST /task` (HTTP 202 Accepted)
 *   `{ model: "suno", task_type: "music", audio_format: "mp3", input: { ... } }`
 *   Never sends `model_version` (defaults to V6).
 *   Never auto-retries `POST /task` (no idempotency key on Sunor).
 * - Poll task: `GET /task/{task_id}` (never faster than 1 req/s per task).
 *   Branches strictly on `data.status` (`pending` | `running` | `success` | `failure` | `timeout`)
 *   and `data.error_code` (`content_moderation` | `invalid_task_input` | `rate_limited` |
 *   `upstream_provider_error`), never on prose `error` text.
 * - Audio persistence: `audio_url` expires after 7 days, so every completed clip is
 *   downloaded immediately via `downloadMediaWithMetaSafe`, its format is determined
 *   from the response `Content-Type` header (never from the URL extension), and it is
 *   saved to persistent storage via `saveGenerationAsset`.
 */

import crypto from 'crypto';
import { GenerationTaskContext, VariantDispatchResult } from './types';
import { saveGenerationAsset, getStoragePath } from '../storage';
import { recordProviderFailure, recordProviderSuccess } from './health';
import { isLiveMode } from '../config/mode';
import { getActualCostUsd } from '../../src/services/providerCatalog';
import {
  CapabilityCheckParams,
  downloadMediaWithMetaSafe,
  fetchWithTimeout,
  getProviderEnv,
  hasSupplierCredentials,
  ProviderDispatchError,
  redactSecrets,
  registerSupplierCapability,
  reserveSupplierBudget,
  SUBMIT_TIMEOUT_MS,
  tripSupplierCircuit,
} from './suppliers';
import { recordAttempt, markSucceeded, markFailed, getAttempt } from '../costLedger';

export const SUNOR_DEFAULT_BASE_URL = 'https://sunor.cc/api/v1';
export const SUNOR_CREDIT_USD = 0.01; // 1 Sunor credit = $0.01 (10 credits = $0.10 per music task)

// Documented Sunor character limits
export const SUNOR_MAX_PROMPT_CHARS = 5000;
export const SUNOR_MAX_TAGS_CHARS = 1000;
export const SUNOR_MAX_TITLE_CHARS = 50;
export const SUNOR_MIN_POLL_INTERVAL_MS = 1000; // Never poll faster than once per second

export interface SunorClipMetadata {
  duration?: number;
  tags?: string;
}

export interface SunorClipResult {
  id?: string;
  audio_url?: string;
  image_url?: string;
  title?: string;
  metadata?: SunorClipMetadata;
}

export function getSunorBaseUrl(): string {
  const custom = (process.env.SUNOR_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!custom) return SUNOR_DEFAULT_BASE_URL;
  return custom.endsWith('/api/v1') ? custom : `${custom}/api/v1`;
}

export function supports(params: CapabilityCheckParams): boolean {
  return params.modelId === 'mus_suno_v6';
}

registerSupplierCapability('sunor', supports);

/**
 * Builds the `input` object for `POST /task` (`task_type: "music"`), clamping all strings
 * to Sunor's documented character limits (`SUNOR_MAX_PROMPT_CHARS`, `SUNOR_MAX_TAGS_CHARS`,
 * `SUNOR_MAX_TITLE_CHARS`).
 */
export function buildSunorMusicInput(ctx: {
  prompt?: string;
  enhancedPrompt?: string;
  title?: string;
  genre?: string;
  tonality?: string;
  lyrics?: string;
}):
  | {
      gpt_description_prompt: string;
      make_instrumental: boolean;
    }
  | {
      prompt: string;
      tags: string;
      title: string;
      make_instrumental: boolean;
    } {
  const stylePrompt = (ctx.enhancedPrompt || ctx.prompt || '').trim();
  const rawLyrics = typeof ctx.lyrics === 'string' ? ctx.lyrics.trim() : '';
  const hasLyrics = rawLyrics.length > 0;

  const isDefaultMakossa =
    (!ctx.genre || ctx.genre === 'Makossa') &&
    (!ctx.tonality || ctx.tonality === 'Celebratory & Energetic') &&
    stylePrompt.length > 0 &&
    !stylePrompt.toLowerCase().includes('makossa');

  const combinedStyle = isDefaultMakossa
    ? stylePrompt
    : [stylePrompt, ctx.genre, ctx.tonality]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(', ') || 'Afrobeats';

  if (hasLyrics) {
    const clampedPrompt = rawLyrics.slice(0, SUNOR_MAX_PROMPT_CHARS);
    const clampedTags = (combinedStyle || 'Afrobeats').slice(0, SUNOR_MAX_TAGS_CHARS);
    const rawTitle =
      (ctx.title || '').trim() ||
      stylePrompt.split(',')[0]?.trim() ||
      'Untitled Track';
    const clampedTitle = rawTitle.slice(0, SUNOR_MAX_TITLE_CHARS);

    return {
      prompt: clampedPrompt,
      tags: clampedTags,
      title: clampedTitle,
      make_instrumental: false,
    };
  }

  const makeInstrumental = stylePrompt.toLowerCase().includes('instrumental');
  const clampedDescription = (combinedStyle || 'Afrobeats').slice(0, SUNOR_MAX_TAGS_CHARS);

  return {
    gpt_description_prompt: clampedDescription,
    make_instrumental: makeInstrumental,
  };
}

/**
 * Extracts only the documented stable fields from `data.output.result`.
 * Ignores any undocumented extra fields.
 */
export function parseSunorClips(rawResult: unknown): SunorClipResult[] {
  if (!Array.isArray(rawResult)) return [];
  const clips: SunorClipResult[] = [];

  for (const item of rawResult) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, any>;
    const rawMeta = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined;
    const durationNum = rawMeta?.duration !== undefined ? Number(rawMeta.duration) : undefined;

    clips.push({
      id: typeof raw.id === 'string' ? raw.id : undefined,
      audio_url: typeof raw.audio_url === 'string' ? raw.audio_url : undefined,
      image_url: typeof raw.image_url === 'string' ? raw.image_url : undefined,
      title: typeof raw.title === 'string' ? raw.title : undefined,
      metadata: rawMeta
        ? {
            duration: Number.isFinite(durationNum) && (durationNum as number) > 0 ? durationNum : undefined,
            tags: typeof rawMeta.tags === 'string' ? rawMeta.tags : undefined,
          }
        : undefined,
    });
  }

  return clips;
}

/**
 * Determines the audio file extension and MIME type strictly from the download's
 * `Content-Type` header (never from the URL extension).
 */
export function resolveAudioFormatFromContentType(rawContentType?: string | null): {
  extension: 'mp3' | 'wav';
  contentType: 'audio/mpeg' | 'audio/wav';
} {
  const base = String(rawContentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();

  if (
    base === 'audio/wav' ||
    base === 'audio/x-wav' ||
    base === 'audio/wave' ||
    base === 'audio/vnd.wave'
  ) {
    return { extension: 'wav', contentType: 'audio/wav' };
  }

  return { extension: 'mp3', contentType: 'audio/mpeg' };
}

/**
 * Maps Sunor's documented `data.error_code` (and `timeout` status) to internal error codes.
 * Never branches on prose `error` text.
 */
export function mapSunorErrorCode(
  errorCode?: string | null,
  status?: string | null
): {
  userErrorCode: string;
  ledgerErrorCode: string;
  countsAgainstHealth: boolean;
} {
  const code = String(errorCode || '').trim().toLowerCase();

  switch (code) {
    case 'content_moderation':
      return {
        userErrorCode: 'CONTENT_MODERATION',
        ledgerErrorCode: 'content_moderation',
        countsAgainstHealth: false,
      };
    case 'invalid_task_input':
      return {
        userErrorCode: 'INVALID_TASK_INPUT',
        ledgerErrorCode: 'invalid_task_input',
        countsAgainstHealth: false,
      };
    case 'rate_limited':
      return {
        userErrorCode: 'RATE_LIMITED',
        ledgerErrorCode: 'rate_limited',
        countsAgainstHealth: true,
      };
    case 'upstream_provider_error':
      return {
        userErrorCode: 'PROVIDER_UNAVAILABLE',
        ledgerErrorCode: 'upstream_provider_error',
        countsAgainstHealth: true,
      };
    default: {
      if (String(status || '').toLowerCase() === 'timeout') {
        return {
          userErrorCode: 'PROVIDER_TIMEOUT',
          ledgerErrorCode: code || 'timeout',
          countsAgainstHealth: true,
        };
      }
      return {
        userErrorCode: 'PROVIDER_UNAVAILABLE',
        ledgerErrorCode: code || 'sunor_failure',
        countsAgainstHealth: true,
      };
    }
  }
}

/**
 * Submits a single `POST /task` call to Sunor.
 * NEVER automatically retries a failed POST (Sunor has no idempotency key).
 * Only HTTP 503 marks `retryableBeforeAccept = true` because Sunor documents that
 * 503 means a dependency was unavailable and the task was never created.
 */
export async function submitSunorTask(params: {
  ctx: GenerationTaskContext;
  abortSignal?: AbortSignal;
}): Promise<{
  taskId: string;
  creditsCharged?: number;
}> {
  const apiKey = (process.env.SUNOR_API_KEY || '').trim();
  if (!apiKey) {
    throw new ProviderDispatchError({
      message: 'PROVIDER_KEY_MISSING',
      code: 'PROVIDER_KEY_MISSING',
      retryableBeforeAccept: false,
    });
  }

  const input = buildSunorMusicInput(params.ctx);
  // Always send audio_format: "mp3". Do NOT send model_version (defaults to V6).
  const requestBody = {
    model: 'suno',
    task_type: 'music',
    audio_format: 'mp3',
    input,
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${getSunorBaseUrl()}/task`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
      },
      SUBMIT_TIMEOUT_MS,
      params.abortSignal ?? params.ctx.abortSignal
    );
  } catch (err: any) {
    const safeMsg = redactSecrets(err?.message || 'Sunor POST /task network error or timeout');
    recordProviderFailure('sunor', safeMsg);
    // Network error / timeout on POST /task: outcome is unknown, NEVER resubmit.
    throw new ProviderDispatchError({
      message: 'PROVIDER_UNAVAILABLE',
      code: 'SUNOR_CREATE_NETWORK_UNKNOWN',
      retryableBeforeAccept: false,
      adminMessage: safeMsg,
    });
  }

  const status = response.status;
  const retryAfterHeader = response.headers.get('retry-after');
  const rawText = await response.text().catch(() => '');
  let json: any = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }

  if (!response.ok || (json?.code && Number(json.code) >= 400)) {
    const effectiveStatus = status >= 400 ? status : Number(json?.code || 500);
    const adminDetail = redactSecrets(rawText.slice(0, 200) || `HTTP ${effectiveStatus}`);

    if (effectiveStatus === 400) {
      // 400 invalid input (nothing charged, do not count as provider health outage)
      throw new ProviderDispatchError({
        message: 'INVALID_TASK_INPUT',
        code: 'SUNOR_INVALID_INPUT_400',
        httpStatus: 400,
        retryableBeforeAccept: false,
        adminMessage: adminDetail,
      });
    }

    if (effectiveStatus === 401 || effectiveStatus === 403) {
      recordProviderFailure('sunor', `auth_error_${effectiveStatus}`);
      throw new ProviderDispatchError({
        message: 'PROVIDER_UNAVAILABLE',
        code: `SUNOR_AUTH_${effectiveStatus}`,
        httpStatus: effectiveStatus,
        retryableBeforeAccept: false,
        adminMessage: adminDetail,
      });
    }

    if (effectiveStatus === 402) {
      recordProviderFailure('sunor', 'insufficient_sunor_credits_402');
      await tripSupplierCircuit('sunor', 'Sunor returned HTTP 402 (insufficient supplier credits)');
      throw new ProviderDispatchError({
        message: 'PROVIDER_UNAVAILABLE',
        code: 'SUNOR_CREDITS_EXHAUSTED_402',
        httpStatus: 402,
        retryableBeforeAccept: false,
        adminMessage: adminDetail,
      });
    }

    if (effectiveStatus === 429) {
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      recordProviderFailure(
        'sunor',
        `rate_limited_429${Number.isFinite(retryAfterSec) ? ` (retry-after=${retryAfterSec}s)` : ''}`
      );
      throw new ProviderDispatchError({
        message: 'RATE_LIMITED',
        code: 'SUNOR_RATE_LIMITED_429',
        httpStatus: 429,
        retryableBeforeAccept: false,
        adminMessage: adminDetail,
      });
    }

    if (effectiveStatus === 503) {
      // 503 dependency unavailable: task never created, safe to mark retryableBeforeAccept: true
      recordProviderFailure('sunor', 'dependency_unavailable_503');
      throw new ProviderDispatchError({
        message: 'PROVIDER_UNAVAILABLE',
        code: 'SUNOR_DEPENDENCY_UNAVAILABLE_503',
        httpStatus: 503,
        retryableBeforeAccept: true,
        adminMessage: adminDetail,
      });
    }

    // 500 unknown / 502 upstream error: outcome unknown or failed, NEVER auto-resubmit
    recordProviderFailure('sunor', `http_${effectiveStatus}`);
    throw new ProviderDispatchError({
      message: 'PROVIDER_UNAVAILABLE',
      code: `SUNOR_HTTP_${effectiveStatus}`,
      httpStatus: effectiveStatus,
      retryableBeforeAccept: false,
      adminMessage: adminDetail,
    });
  }

  const data = json?.data || json;
  const taskId = data?.task_id;
  if (!taskId || typeof taskId !== 'string') {
    recordProviderFailure('sunor', 'missing_task_id');
    throw new ProviderDispatchError({
      message: 'PROVIDER_UNAVAILABLE',
      code: 'SUNOR_MISSING_TASK_ID',
      retryableBeforeAccept: false,
      adminMessage: 'Sunor 202 response missing data.task_id',
    });
  }

  const rawCharged = Number(data?.credits_charged);
  const creditsCharged = Number.isFinite(rawCharged) && rawCharged > 0 ? rawCharged : undefined;

  recordProviderSuccess('sunor');
  return {
    taskId,
    creditsCharged,
  };
}

/**
 * Starts a Suno V6 music generation task via Sunor (`mus_suno_v6`).
 * Returns 2 variant dispatch results linked to `sunor_<taskId>:0` and `sunor_<taskId>:1`.
 */
export async function startSunorMusicTask(
  ctx: GenerationTaskContext
): Promise<VariantDispatchResult[]> {
  const { userId, jobId, model, unitCost, variantCount } = ctx;
  const n = Math.max(1, Math.min(variantCount || 2, 2));
  const env = getProviderEnv();
  const hasCreds = hasSupplierCredentials('sunor');

  if (!hasCreds) {
    if (isLiveMode()) {
      return Array.from({ length: n }).map(() => ({
        status: 'failed' as const,
        errorMessage: 'PROVIDER_KEY_MISSING',
        supplier: 'sunor',
        upstreamModel: 'suno',
      }));
    }

    const simBatchId = crypto.randomUUID();
    return Array.from({ length: n }).map((_, idx) => ({
      providerJobId: `sunor_sim_${simBatchId}:${idx}`,
      status: 'processing' as const,
      supplier: 'sunor',
      upstreamModel: 'suno',
      estCostUsd: 0,
      actualCostUsd: 0,
      simulated: true,
    }));
  }

  const estCostUsd = getActualCostUsd(model?.id || 'mus_suno_v6', 'sunor') || 0.10;
  const budget = await reserveSupplierBudget('sunor', estCostUsd, 1, 'music');

  if (budget === 'cap_reached') {
    const simBatchId = crypto.randomUUID();
    return Array.from({ length: n }).map((_, idx) => ({
      providerJobId: `sunor_sim_${simBatchId}:${idx}`,
      status: 'processing' as const,
      supplier: 'sunor',
      upstreamModel: 'suno',
      estCostUsd: 0,
      actualCostUsd: 0,
      simulated: true,
    }));
  }

  if (budget === 'tripped') {
    return Array.from({ length: n }).map(() => ({
      status: 'failed' as const,
      errorMessage: 'MODEL_TEMPORARILY_UNAVAILABLE',
      supplier: 'sunor',
      upstreamModel: 'suno',
    }));
  }

  // Record 1 song task attempt in provider_cost_ledger (variant_index = 0 represents the 2-take task)
  await recordAttempt({
    jobId,
    variantIndex: 0,
    userId,
    modelId: model?.id || 'mus_suno_v6',
    supplier: 'sunor',
    upstreamModel: 'suno',
    env,
    units: 1,
    unitLabel: 'song',
    estCostUsd,
    creditsCharged: (unitCost || 0) * n,
  });

  try {
    const { taskId, creditsCharged } = await submitSunorTask({
      ctx,
      abortSignal: ctx.abortSignal,
    });

    const actualEstUsd =
      creditsCharged !== undefined
        ? Number((creditsCharged * SUNOR_CREDIT_USD).toFixed(6))
        : estCostUsd;

    return Array.from({ length: n }).map((_, idx) => ({
      providerJobId: `sunor_${taskId}:${idx}`,
      status: 'processing' as const,
      supplier: 'sunor',
      upstreamModel: 'suno',
      estCostUsd: idx === 0 ? actualEstUsd : 0,
      simulated: false,
    }));
  } catch (err: any) {
    const errCode = err instanceof ProviderDispatchError ? err.code : 'SUNOR_DISPATCH_ERR';
    const userMessage =
      err instanceof ProviderDispatchError ? err.message : 'PROVIDER_UNAVAILABLE';
    console.error('[Sunor Provider] Error starting music task:', redactSecrets(err?.adminMessage || err?.message || String(err)));
    await markFailed(jobId, 0, 'sunor', errCode);

    if (!isLiveMode() && userMessage !== 'INVALID_TASK_INPUT') {
      const simBatchId = crypto.randomUUID();
      return Array.from({ length: n }).map((_, idx) => ({
        providerJobId: `sunor_sim_${simBatchId}:${idx}`,
        status: 'processing' as const,
        supplier: 'sunor',
        upstreamModel: 'suno',
        estCostUsd: 0,
        actualCostUsd: 0,
        simulated: true,
      }));
    }

    return Array.from({ length: n }).map(() => ({
      status: 'failed' as const,
      errorMessage: userMessage,
      supplier: 'sunor',
      upstreamModel: 'suno',
    }));
  }
}

interface CachedTaskPoll {
  fetchedAt: number;
  fetchRef: typeof fetch;
  lastVariantIndex: number;
  payload: any;
}

const taskPollCache = new Map<string, CachedTaskPoll>();
const inFlightTaskPolls = new Map<string, Promise<any>>();

export function clearSunorPollCache(): void {
  taskPollCache.clear();
  inFlightTaskPolls.clear();
}

async function fetchSunorTaskStatusRateLimited(
  taskId: string,
  apiKey: string,
  variantIndex: number
): Promise<any> {
  const now = Date.now();
  const cached = taskPollCache.get(taskId);

  if (cached && cached.fetchRef === globalThis.fetch) {
    const statusLower = String(cached.payload?.data?.status ?? cached.payload?.status ?? '').toLowerCase();
    const isTerminal = statusLower === 'success' || statusLower === 'failure' || statusLower === 'timeout';
    const elapsed = now - cached.fetchedAt;

    // Reuse cached response when terminal or when the sibling variant (e.g. take 1 right after take 0) polls within 1s
    if (isTerminal || (elapsed < SUNOR_MIN_POLL_INTERVAL_MS && cached.lastVariantIndex !== variantIndex)) {
      cached.lastVariantIndex = variantIndex;
      return cached.payload;
    }

    // Enforce minimum 1s interval between polls for the same task
    if (elapsed < SUNOR_MIN_POLL_INTERVAL_MS) {
      const waitMs = SUNOR_MIN_POLL_INTERVAL_MS - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  const existingInFlight = inFlightTaskPolls.get(taskId);
  if (existingInFlight) {
    return existingInFlight;
  }

  const fetchRef = globalThis.fetch;
  const pollPromise = (async () => {
    const res = await fetchWithTimeout(
      `${getSunorBaseUrl()}/task/${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
        },
      },
      SUBMIT_TIMEOUT_MS
    );

    if (!res.ok) {
      throw new Error(`Sunor poll HTTP ${res.status}`);
    }

    const json = await res.json();
    taskPollCache.set(taskId, {
      fetchedAt: Date.now(),
      fetchRef,
      lastVariantIndex: variantIndex,
      payload: json,
    });
    return json;
  })();

  inFlightTaskPolls.set(taskId, pollPromise);
  try {
    return await pollPromise;
  } finally {
    inFlightTaskPolls.delete(taskId);
  }
}

/**
 * Polls a Sunor music task (`sunor_<taskId>:<variantIndex>`), downloads completed audio
 * immediately using `downloadMediaWithMetaSafe`, inspects `Content-Type` for the real format,
 * saves to storage via `saveGenerationAsset`, and updates `provider_cost_ledger`.
 */
export async function pollSunorMusicTask(params: {
  providerJobId: string;
  userId: string;
  jobId: string;
  variantIndex: number;
}): Promise<VariantDispatchResult> {
  const { providerJobId, userId, jobId, variantIndex } = params;
  const [prefixedTaskId] = providerJobId.split(':');
  const taskId = prefixedTaskId.replace(/^sunor_/, '');

  if (taskId.startsWith('sim_')) {
    if (isLiveMode() && getProviderEnv() === 'prod') {
      return {
        status: 'failed',
        errorMessage: 'PROVIDER_UNAVAILABLE',
        supplier: 'sunor',
      };
    }
    const sampleTakes = ['/samples/demo-track.mp3', '/samples/demo-track-2.mp3'];
    return {
      status: 'completed',
      outputUrl: sampleTakes[variantIndex % sampleTakes.length],
      thumbnailUrl: '/samples/demo-track.mp3',
      supplier: 'sunor',
      upstreamModel: 'suno',
      simulated: true,
    };
  }

  const apiKey = (process.env.SUNOR_API_KEY || '').trim();
  if (!apiKey) {
    return {
      status: 'failed',
      errorMessage: 'PROVIDER_KEY_MISSING',
      supplier: 'sunor',
      upstreamModel: 'suno',
    };
  }

  try {
    const resJson = await fetchSunorTaskStatusRateLimited(taskId, apiKey, variantIndex);
    const data = resJson?.data ?? resJson;
    const status = String(data?.status || '').toLowerCase();

    if (status === 'pending' || status === 'running') {
      return {
        providerJobId,
        status: 'processing',
        supplier: 'sunor',
        upstreamModel: 'suno',
      };
    }

    if (status === 'failure' || status === 'timeout') {
      const mapped = mapSunorErrorCode(data?.error_code, status);
      if (mapped.countsAgainstHealth) {
        recordProviderFailure('sunor', mapped.ledgerErrorCode);
      }
      // Sunor refunds its credits on every failure; mark ledger row as failed (cost $0)
      await markFailed(jobId, 0, 'sunor', mapped.ledgerErrorCode);
      if (variantIndex !== 0 && getAttempt(jobId, variantIndex, 'sunor')) {
        await markFailed(jobId, variantIndex, 'sunor', mapped.ledgerErrorCode);
      }
      return {
        status: 'failed',
        errorMessage: mapped.userErrorCode,
        supplier: 'sunor',
        upstreamModel: 'suno',
      };
    }

    if (status !== 'success') {
      return {
        providerJobId,
        status: 'processing',
        supplier: 'sunor',
        upstreamModel: 'suno',
      };
    }

    const clips = parseSunorClips(data?.output?.result);
    const clip = clips[variantIndex] ?? clips[0];

    if (!clip || !clip.audio_url) {
      recordProviderFailure('sunor', 'missing_audio_url');
      await markFailed(jobId, 0, 'sunor', 'SUNOR_MISSING_AUDIO_URL');
      return {
        status: 'failed',
        errorMessage: 'PROVIDER_UNAVAILABLE',
        supplier: 'sunor',
        upstreamModel: 'suno',
      };
    }

    // Download audio immediately (Sunor audio_url expires after 7 days)
    const { buffer, contentType: rawContentType } = await downloadMediaWithMetaSafe(clip.audio_url);
    const { extension, contentType } = resolveAudioFormatFromContentType(rawContentType);

    const outputUrl = await saveGenerationAsset({
      userId,
      jobId,
      variantIndex,
      extension,
      contentType,
      data: buffer,
    });
    const storagePath = getStoragePath(userId, jobId, variantIndex, extension);

    const creditsCharged = Number(data?.credits_charged);
    const actualCostUsd =
      Number.isFinite(creditsCharged) && creditsCharged > 0
        ? Number((creditsCharged * SUNOR_CREDIT_USD).toFixed(6))
        : getActualCostUsd('mus_suno_v6', 'sunor') || 0.10;

    await markSucceeded(jobId, 0, 'sunor', actualCostUsd);
    if (variantIndex !== 0 && getAttempt(jobId, variantIndex, 'sunor')) {
      await markSucceeded(jobId, variantIndex, 'sunor', actualCostUsd);
    }
    recordProviderSuccess('sunor');

    const rawDuration = Number(clip.metadata?.duration);
    const durationSeconds =
      Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : undefined;
    const thumbnailUrl =
      typeof clip.image_url === 'string' && clip.image_url.trim().length > 0
        ? clip.image_url.trim()
        : undefined;

    return {
      status: 'completed',
      outputUrl,
      thumbnailUrl,
      durationSeconds,
      storagePath,
      supplier: 'sunor',
      upstreamModel: 'suno',
      actualCostUsd,
      simulated: false,
    };
  } catch (err: any) {
    const safeMsg = redactSecrets(err?.message || 'Sunor task poll or download error');
    console.error('[Sunor Poller] Exception during task poll:', safeMsg);
    recordProviderFailure('sunor', safeMsg);
    return {
      status: 'failed',
      errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : safeMsg,
      supplier: 'sunor',
      upstreamModel: 'suno',
    };
  }
}
