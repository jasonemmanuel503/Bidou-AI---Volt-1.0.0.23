/**
 * server/providers/musicapi.ts
 *
 * Plain-language summary:
 * MusicAPI.ai generation adapter for Sonic v4.5 (`mus_lyria_3_pro`) and
 * Sonic v5 (`mus_suno_sonic_v5`).
 *
 * Generates 2 takes (clips) per task and maps them onto variant indices 0 and 1.
 * Uses supplier routing, enforces strict allowed model versions (`sonic-v4-5` and `sonic-v5`),
 * checks daily budget / dev caps, and records attempts in `provider_cost_ledger`.
 */

import { GenerationTaskContext, VariantDispatchResult } from './types';
import { recordProviderFailure, recordProviderSuccess } from './health';
import { saveGenerationAsset } from '../storage';
import { isDemoMode, isLiveMode } from '../config/mode';
import { startSunorMusicTask, pollSunorMusicTask } from './sunor';
import {
  resolveSuppliers,
  hasSupplierCredentials,
  reserveSupplierBudget,
  withSupplierBudgetMutex,
  getProviderEnv,
} from './suppliers';
import { recordAttempt, markSucceeded, markFailed } from '../costLedger';
import { getActualCostUsd } from '../../src/services/providerCatalog';
import crypto from 'crypto';

import { composeStyle } from '../../src/services/musicStyles';
import { buildOccasionStyle } from '../occasionPrompts';

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n));
const MUSICAPI_BASE_URL = process.env.MUSICAPI_BASE_URL || 'https://api.musicapi.ai';

// Confirmed Sonic model versions supported by MusicAPI POST /api/v1/sonic/create
export const MUSICAPI_ALLOWED_UPSTREAM_MODELS = ['sonic-v4-5', 'sonic-v5'] as const;
export type MusicApiAllowedUpstreamModel = (typeof MUSICAPI_ALLOWED_UPSTREAM_MODELS)[number];

export function isAllowedMusicApiModel(mv?: string | null): mv is MusicApiAllowedUpstreamModel {
  return (
    typeof mv === 'string' &&
    (MUSICAPI_ALLOWED_UPSTREAM_MODELS as readonly string[]).includes(mv)
  );
}

/**
 * Starts a MusicAPI generation task for Sonic v4.5 or Sonic v5.
 * Fails closed if the routed upstream model is not in MUSICAPI_ALLOWED_UPSTREAM_MODELS.
 */
export async function startMusicTask(
  ctx: GenerationTaskContext
): Promise<VariantDispatchResult[]> {
  const modelId = ctx.model?.id || '';

  // Route Suno V6 to Sunor provider
  if (
    modelId === 'mus_suno_v6' ||
    ctx.model?.model_name === 'suno_v6' ||
    ctx.model?.provider === 'sunor'
  ) {
    return startSunorMusicTask(ctx);
  }

  const { genre = 'Afrobeats', tonality, lyrics, title } = ctx;
  const apiKey = (process.env.MUSICAPI_API_KEY || '').trim();
  const TAGS_MAX = parseInt(process.env.MUSICAPI_TAGS_MAX || '200', 10);
  const LYRICS_MAX = parseInt(process.env.MUSICAPI_LYRICS_MAX || '3000', 10);

  // The description is NOT lyrics. Lyrics must already be on ctx (written by ensureLyrics in jobs.ts).
  if (!lyrics || !lyrics.trim()) {
    return [{ status: 'failed', errorMessage: 'LYRICS_UNAVAILABLE' }, { status: 'failed', errorMessage: 'LYRICS_UNAVAILABLE' }];
  }
  if (!ctx.upstreamModel) {
    return [{ status: 'failed', errorMessage: 'MODEL_ROUTE_MISSING' }, { status: 'failed', errorMessage: 'MODEL_ROUTE_MISSING' }];
  }

  const occ = ctx.occasion ? buildOccasionStyle(ctx.occasion.id, ctx.occasion.subId) : null;
  const { tags, negativeTags } = composeStyle({
    genre,
    tonality,
    occasionTags: occ?.tags,
    occasionNegative: occ?.negative,
    extraTags: ctx.extraTags,
    maxLen: TAGS_MAX,
  });

  const body: Record<string, unknown> = {
    custom_mode: true,
    prompt: clip(lyrics, LYRICS_MAX),               // lyrics, with [Verse]/[Chorus] markers
    tags,
    title: clip((title || ctx.prompt || 'Untitled').replace(/\s+/g, ' ').trim(), 80),
    mv: ctx.upstreamModel,                           // from model_suppliers — see 3.5
    make_instrumental: false,
  };
  // NOT VERIFIED against MusicAPI docs: only enable by env after testing against the live API.
  if (negativeTags && process.env.MUSICAPI_SEND_NEGATIVE_TAGS === 'true') body.negative_tags = negativeTags;
  // DO NOT send `audo_lyrics` / `auto_lyrics` — not confirmed in MusicAPI's SDK docs.

  const apiKeyMissing = !apiKey;
  if (apiKeyMissing && isLiveMode()) {
    return [{ status: 'failed', errorMessage: 'PROVIDER_KEY_MISSING' }, { status: 'failed', errorMessage: 'PROVIDER_KEY_MISSING' }];
  }

  const n = Math.max(1, Math.min(ctx.variantCount || 2, 2));

  if (!apiKey) {
    // Fallback simulated takes for preview / demo environments (DEMO ONLY)
    const simBatchId = crypto.randomUUID();
    return Array.from({ length: n }).map((_, idx) => ({
      providerJobId: `sim_music_${simBatchId}:${idx}`,
      status: 'processing' as const,
      supplier: 'musicapi' as const,
      upstreamModel: ctx.upstreamModel,
      estCostUsd: 0,
      actualCostUsd: 0,
      simulated: true,
    }));
  }

  // Dev cap & daily spend circuit breaker check, protected by in-process async mutex
  const estCostUsd =
    getActualCostUsd(modelId, 'musicapi') ||
    (modelId === 'mus_lyria_3_pro' ? 0.11 : 0.12);

  let earlyMusicResult: VariantDispatchResult[] | null = null;

  await withSupplierBudgetMutex('musicapi', async () => {
    const budget = await reserveSupplierBudget('musicapi', estCostUsd, 1, 'music');
    if (budget === 'tripped') {
      earlyMusicResult = Array.from({ length: n }).map(() => ({
        status: 'failed' as const,
        errorMessage: 'MODEL_TEMPORARILY_UNAVAILABLE',
        supplier: 'musicapi' as const,
        upstreamModel: ctx.upstreamModel,
      }));
      return;
    }

    if (budget === 'cap_reached') {
      const simBatchId = crypto.randomUUID();
      earlyMusicResult = Array.from({ length: n }).map((_, idx) => ({
        providerJobId: `sim_music_${simBatchId}:${idx}`,
        status: 'processing' as const,
        supplier: 'musicapi' as const,
        upstreamModel: ctx.upstreamModel,
        estCostUsd: 0,
        actualCostUsd: 0,
        simulated: true,
      }));
      return;
    }

    // Record 1 task attempt in provider_cost_ledger (variant_index = 0)
    await recordAttempt({
      jobId: ctx.jobId,
      variantIndex: 0,
      userId: ctx.userId,
      modelId: modelId || 'mus_lyria_3_pro',
      supplier: 'musicapi',
      upstreamModel: ctx.upstreamModel,
      env: getProviderEnv(),
      units: 1,
      unitLabel: 'task',
      estCostUsd,
      creditsCharged: (ctx.unitCost || 0) * n,
    });
  });

  if (earlyMusicResult) {
    return earlyMusicResult;
  }

  try {
    console.info('[MusicAPI] create', { mv: body.mv, tags: body.tags, title: body.title });
    const response = await fetch(`${MUSICAPI_BASE_URL}/api/v1/sonic/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `MusicAPI HTTP error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`
      );
    }

    const resJson: any = await response.json();
    const taskId = resJson?.task_id || resJson?.data?.task_id;
    if (!taskId) {
      throw new Error('MusicAPI responded without a task_id');
    }

    recordProviderSuccess('musicapi');

    // Return n processing variants linked to this single task ID
    return Array.from({ length: n }).map((_, idx) => ({
      providerJobId: `${taskId}:${idx}`,
      status: 'processing' as const,
      supplier: 'musicapi' as const,
      upstreamModel: ctx.upstreamModel,
      estCostUsd: idx === 0 ? estCostUsd : 0,
      simulated: false,
    }));
  } catch (err: any) {
    console.error('[MusicAPI Provider] Error starting task:', err?.message || err);
    recordProviderFailure('musicapi', err?.message || 'musicapi_start_error');
    await markFailed(ctx.jobId, 0, 'musicapi', 'MUSICAPI_DISPATCH_ERR');

    if (isLiveMode()) {
      return Array.from({ length: n }).map(() => ({
        status: 'failed' as const,
        errorMessage: 'PROVIDER_UNAVAILABLE',
        supplier: 'musicapi' as const,
        upstreamModel: ctx.upstreamModel,
      }));
    }

    const simBatchId = crypto.randomUUID();
    return Array.from({ length: n }).map((_, idx) => ({
      providerJobId: `sim_music_${simBatchId}:${idx}`,
      status: 'processing' as const,
      supplier: 'musicapi' as const,
      upstreamModel: ctx.upstreamModel,
      estCostUsd: 0,
      actualCostUsd: 0,
      simulated: true,
    }));
  }
}

/**
 * Polls a MusicAPI task or completes simulated takes.
 */
export async function pollMusicTask(params: {
  providerJobId: string;
  userId: string;
  jobId: string;
  variantIndex: number;
}): Promise<VariantDispatchResult> {
  if (params.providerJobId.startsWith('sunor_')) {
    return pollSunorMusicTask(params);
  }

  const { providerJobId, userId, jobId, variantIndex } = params;
  const [taskId] = providerJobId.split(':');

  if (taskId.startsWith('sim_music_')) {
    if (isLiveMode()) {
      return {
        status: 'failed',
        errorMessage: 'PROVIDER_UNAVAILABLE',
        supplier: 'musicapi',
      };
    }
    // Return curated authentic musical clips (DEMO ONLY)
    const sampleTakes = [
      '/samples/demo-track.mp3',
      '/samples/demo-track-2.mp3',
    ];
    const takeUrl = sampleTakes[variantIndex % sampleTakes.length];
    return {
      status: 'completed',
      outputUrl: takeUrl,
      thumbnailUrl: '/samples/demo-track.mp3',
      supplier: 'musicapi',
      simulated: true,
    };
  }

  const apiKey = (process.env.MUSICAPI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      status: 'failed',
      errorMessage: 'PROVIDER_KEY_MISSING',
      supplier: 'musicapi',
    };
  }

  try {
    const res = await fetch(`${MUSICAPI_BASE_URL}/api/v1/sonic/task/${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`MusicAPI poll failed with status ${res.status}`);
    }

    const resJson: any = await res.json();

    // MusicAPI.ai puts the songs directly in `data` as an ARRAY,
    // with per-clip progress in a `state` field: 'pending' | 'running' | 'succeeded' | 'failed'.
    const rawData = resJson?.data ?? resJson;
    const clipList: any[] = Array.isArray(rawData)
      ? rawData
      : (rawData?.clips || rawData?.tracks || []);

    const clip = clipList[variantIndex] || clipList[0];
    const clipState = (clip?.state || clip?.status || '').toLowerCase();

    // No clip yet, or still queued/generating -> keep polling.
    if (!clip || clipState === 'pending' || clipState === 'queued' || clipState === 'running' || clipState === 'processing') {
      return {
        providerJobId,
        status: 'processing',
        supplier: 'musicapi',
      };
    }

    if (clipState === 'failed' || clipState === 'error') {
      recordProviderFailure('musicapi', clip?.error_message || 'clip_failed');
      await markFailed(jobId, 0, 'musicapi', clip?.error_message || 'CLIP_FAILED');
      return {
        status: 'failed',
        errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : (clip?.error_message || 'Music generation failed'),
        supplier: 'musicapi',
      };
    }

    // clipState is 'succeeded' (or unrecognized-but-present) -> expect the audio to be ready.
    if (!clip?.audio_url) {
      if (clipState === 'succeeded') {
        return {
          providerJobId,
          status: 'processing',
          supplier: 'musicapi',
        };
      }
      return {
        status: 'failed',
        errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : `Clip take #${variantIndex} audio was not returned by provider`,
        supplier: 'musicapi',
      };
    }

    recordProviderSuccess('musicapi');
    await markSucceeded(jobId, 0, 'musicapi');

    const rawDuration = Number(clip.duration);
    return {
      status: 'completed',
      outputUrl: clip.audio_url,
      thumbnailUrl: clip.image_url || clip.image_large_url || undefined,
      durationSeconds: Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : undefined,
      supplier: 'musicapi',
      simulated: false,
    };
  } catch (err: any) {
    console.error('[MusicAPI Poller] Exception during task poll:', err?.message || err);
    recordProviderFailure('musicapi', err?.message || 'poll_exception');
    return {
      status: 'failed',
      errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : (err?.message || 'Music task polling exception'),
      supplier: 'musicapi',
    };
  }
}
