/**
 * server/providers/veo.ts
 *
 * Plain-language summary:
 * Unified video generation dispatcher (`startVeoVariants`) and operation poller
 * (`pollVeoOperation`) supporting multi-supplier routing across:
 *   - Kie.ai (`kie_` prefix) — priority 1 for 8s Veo 3.1 clips
 *   - Google Direct (`veo-3.1-*`) — priority 2 backup for 8s Veo & sole supplier for 4s/6s Veo
 *   - Alibaba DashScope (`wan_` prefix) — Wan 3.0 Standard & Prime (2–30s, 480p/720p/1080p)
 *   - Simulated (`sim_veo_` prefix) — demo mode and dev-cap fallback
 *
 * Guarantees:
 * - Same model only: never switches a customer to a different model.
 * - Never auto-retries the same POST. Moves to the next supplier of the SAME model
 *   only when an error occurs BEFORE the provider accepted the job (`isRetryableBeforeAcceptError`).
 */

import { GoogleGenAI, GenerateVideosOperation } from '@google/genai';
import { GenerationTaskContext, VariantDispatchResult } from './types';
import { saveGenerationAsset } from '../storage';
import { recordProviderFailure, recordProviderSuccess } from './health';
import { isLiveMode } from '../config/mode';
import { VEO_ROUTES, normalizeVideoParams, getActualCostUsd } from '../../src/services/providerCatalog';
import { resolveGoogleModelId } from './routing';
import { startKieVideoVariant, pollKieOperation } from './kie';
import { startAlibabaWanVariant, pollAlibabaWanOperation } from './alibaba';
import {
  downloadMediaBufferSafe,
  getProviderEnv,
  hasSupplierCredentials,
  isRetryableBeforeAcceptError,
  ModelTemporarilyUnavailableError,
  ProviderDispatchError,
  redactSecrets,
  resolveSuppliers,
  reserveSupplierBudget,
  SupplierPlan,
} from './suppliers';
import { recordAttempt, markSucceeded, markFailed } from '../costLedger';
import crypto from 'crypto';

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

async function dispatchGoogleVeoSingleVariant(params: {
  ctx: GenerationTaskContext;
  idx: number;
}): Promise<{ providerJobId: string; upstreamModel: string }> {
  const { ctx, idx } = params;
  const { prompt, enhancedPrompt, aspectRatio = '16:9', resolution = '720p', durationSeconds = 8, model } = ctx;
  const activePrompt = enhancedPrompt || prompt;

  const ai = getGemini();
  if (!ai || !process.env.GEMINI_API_KEY) {
    throw new ProviderDispatchError({
      message: 'PROVIDER_KEY_MISSING',
      code: 'PROVIDER_KEY_MISSING',
      retryableBeforeAccept: true,
    });
  }

  const route = VEO_ROUTES[model.model_name];
  if (!route) {
    throw new ProviderDispatchError({
      message: 'MODEL_NOT_CONFIGURED',
      code: 'MODEL_NOT_CONFIGURED',
      retryableBeforeAccept: false,
    });
  }

  const defaultModelId = route.googleModelId || 'veo-3.1-lite-generate-preview';
  const modelName = resolveGoogleModelId(model.model_name || 'veo_3_1_lite', defaultModelId);
  const normalized = normalizeVideoParams(resolution, durationSeconds);

  const config: any = {
    numberOfVideos: 1,
    aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
    resolution: normalized.resolution,
    durationSeconds: normalized.durationSeconds,
  };

  if (process.env.GOOGLE_VERTEX_PROJECT_ID) {
    config.seed = Math.floor(Math.random() * 1000000);
  }

  try {
    const op: any = await ai.models.generateVideos({
      model: modelName,
      prompt: activePrompt,
      config,
    });

    recordProviderSuccess('google');
    return {
      providerJobId: op?.name || `veo_op_${crypto.randomUUID()}_${idx}`,
      upstreamModel: modelName,
    };
  } catch (err: any) {
    const safeMsg = redactSecrets(err?.message || 'Google Veo dispatch error');
    console.error(`[Veo Provider] Error dispatching Google variant ${idx}:`, safeMsg);
    recordProviderFailure('google', safeMsg);

    const status = Number(err?.status || err?.statusCode || 0);
    const lower = safeMsg.toLowerCase();
    const isSafetyOrBadReq =
      status === 400 ||
      lower.includes('safety') ||
      lower.includes('blocked') ||
      lower.includes('invalid argument');

    throw new ProviderDispatchError({
      message: isSafetyOrBadReq ? safeMsg : 'PROVIDER_UNAVAILABLE',
      code: isSafetyOrBadReq ? 'GOOGLE_VEO_REJECTED' : 'GOOGLE_VEO_UNAVAILABLE',
      httpStatus: status || undefined,
      retryableBeforeAccept: !isSafetyOrBadReq,
      adminMessage: safeMsg,
    });
  }
}

/**
 * Video Provider Dispatcher (Veo 3.1 via Kie.ai / Google Direct + Wan 3.0 via Alibaba)
 * Resolves ordered supplier candidates for the exact chosen model, enforces dev caps
 * and prod circuit breakers, and falls back across suppliers of the SAME model only
 * when an error happens before the provider accepted the job.
 */
export async function startVeoVariants(
  ctx: GenerationTaskContext
): Promise<VariantDispatchResult[]> {
  const {
    userId,
    jobId,
    prompt,
    enhancedPrompt,
    negativePrompt,
    aspectRatio = '16:9',
    resolution = '720p',
    durationSeconds = 8,
    variantCount,
    model,
    unitCost,
    referenceImageUrl,
  } = ctx;

  const activePrompt = enhancedPrompt || prompt;
  const n = Math.max(1, Math.min(variantCount, 4));
  const env = getProviderEnv();
  const isWanModel =
    model.id === 'vid_wan_3_0_standard' ||
    model.id === 'vid_wan_3_0_prime' ||
    model.provider === 'alibaba';

  // For Veo models, normalize duration to 4 | 6 | 8; for Wan models, clamp 2..30s
  const effectiveDuration = isWanModel
    ? Math.max(2, Math.min(30, Math.round(Number(durationSeconds) || 5)))
    : normalizeVideoParams(resolution, durationSeconds).durationSeconds;

  const effectiveResolution = isWanModel
    ? (String(resolution).toLowerCase() === '480p'
        ? '480p'
        : String(resolution).toLowerCase() === '1080p'
          ? '1080p'
          : '720p')
    : normalizeVideoParams(resolution, durationSeconds).resolution;

  // Check if unknown Veo model in live mode when not a Wan model
  if (!isWanModel && !VEO_ROUTES[model.model_name]) {
    console.error(`[Veo] Unknown model_name: ${model.model_name}; cannot route video`);
    if (isLiveMode()) {
      return Array.from({ length: n }).map(() => ({
        status: 'failed' as const,
        errorMessage: 'MODEL_NOT_CONFIGURED',
      }));
    }
  }

  let plans: SupplierPlan[] = [];
  try {
    plans = await resolveSuppliers(model.id, {
      durationSeconds: effectiveDuration,
      resolution: effectiveResolution,
      aspectRatio,
      hasReferenceImage: Boolean(referenceImageUrl),
      allowUnconfiguredInDev: env === 'dev',
    });
  } catch (err: any) {
    if (!isLiveMode()) {
      // Demo mode with no keys -> return simulated jobs
      return Array.from({ length: n }).map((_, i) => ({
        providerJobId: `sim_veo_${crypto.randomUUID()}_${i}`,
        status: 'processing' as const,
        simulated: true,
      }));
    }

    // Check if any supplier for this model even has credentials configured
    const anyConfigured = isWanModel
      ? hasSupplierCredentials('alibaba')
      : hasSupplierCredentials('kie') || hasSupplierCredentials('google');

    const errCode =
      err instanceof ModelTemporarilyUnavailableError && anyConfigured
        ? 'MODEL_TEMPORARILY_UNAVAILABLE'
        : 'PROVIDER_KEY_MISSING';

    return Array.from({ length: n }).map(() => ({
      status: 'failed' as const,
      errorMessage: errCode,
    }));
  }

  const dispatchSingleVariant = async (idx: number): Promise<VariantDispatchResult> => {
    let lastError: any = null;
    let sawTrippedOrUnavailable = false;

    for (const plan of plans) {
      const units = isWanModel ? effectiveDuration : 1;
      const unitLabel = isWanModel ? 'second' : 'clip';
      const hasCreds = hasSupplierCredentials(plan.supplier);

      // In demo mode without credentials for this supplier, try next configured supplier or simulate
      if (!hasCreds) {
        if (!isLiveMode() && plan === plans[plans.length - 1]) {
          return {
            providerJobId: `sim_veo_${crypto.randomUUID()}_${idx}`,
            status: 'processing',
            supplier: plan.supplier,
            upstreamModel: plan.upstreamModel,
            estCostUsd: 0,
            actualCostUsd: 0,
            simulated: true,
          };
        }
        continue;
      }

      const budget = await reserveSupplierBudget(plan.supplier, plan.estCostUsd, units, 'video');
      if (budget === 'cap_reached') {
        // Dev hard cap reached -> return simulated video job (never fails in dev)
        return {
          providerJobId: `sim_veo_${crypto.randomUUID()}_${idx}`,
          status: 'processing',
          supplier: plan.supplier,
          upstreamModel: plan.upstreamModel,
          estCostUsd: 0,
          actualCostUsd: 0,
          simulated: true,
        };
      }

      if (budget === 'tripped') {
        sawTrippedOrUnavailable = true;
        continue;
      }

      await recordAttempt({
        jobId,
        variantIndex: idx,
        userId,
        modelId: model.id,
        supplier: plan.supplier,
        upstreamModel: plan.upstreamModel,
        env,
        units,
        unitLabel,
        estCostUsd: plan.estCostUsd,
        creditsCharged: unitCost,
      });

      // Dispatch ONCE to this supplier (NEVER auto-retry the same POST)
      try {
        if (plan.supplier === 'kie') {
          const kieRes = await startKieVideoVariant({
            upstreamModel: plan.upstreamModel,
            prompt: activePrompt,
            aspectRatio,
            referenceImageUrl,
            abortSignal: ctx.abortSignal,
          });
          return {
            providerJobId: kieRes.providerJobId,
            status: 'processing',
            supplier: 'kie',
            upstreamModel: kieRes.upstreamModel,
            estCostUsd: plan.estCostUsd,
            simulated: false,
          };
        }

        if (plan.supplier === 'alibaba') {
          const wanRes = await startAlibabaWanVariant({
            modelId: model.id,
            upstreamModel: plan.upstreamModel,
            prompt: activePrompt,
            negativePrompt,
            resolution: effectiveResolution,
            durationSeconds: effectiveDuration,
            aspectRatio,
            referenceImageUrl,
            abortSignal: ctx.abortSignal,
          });
          return {
            providerJobId: wanRes.providerJobId,
            status: 'processing',
            supplier: 'alibaba',
            upstreamModel: wanRes.upstreamModel,
            estCostUsd: wanRes.estCostUsd,
            simulated: false,
          };
        }

        if (plan.supplier === 'google') {
          const googleRes = await dispatchGoogleVeoSingleVariant({ ctx, idx });
          return {
            providerJobId: googleRes.providerJobId,
            status: 'processing',
            supplier: 'google',
            upstreamModel: googleRes.upstreamModel,
            estCostUsd: plan.estCostUsd,
            simulated: false,
          };
        }
      } catch (err: any) {
        lastError = err;
        const errCode = err?.code || 'DISPATCH_ERROR';
        await markFailed(jobId, idx, plan.supplier, errCode);

        // Rule 2.7: Only try the next supplier of the SAME model if the error occurred
        // before the provider accepted the job and is retryable (network/timeout/5xx/429/quota).
        if (isRetryableBeforeAcceptError(err)) {
          sawTrippedOrUnavailable = true;
          console.warn(
            `[Video Router] Supplier "${plan.supplier}" failed before job acceptance (${errCode}); trying next supplier for ${model.id} if available.`
          );
          continue;
        }

        // Non-retryable error (e.g., prompt safety block / 400): stop immediately
        break;
      }
    }

    if (!isLiveMode()) {
      return {
        providerJobId: `sim_veo_${crypto.randomUUID()}_${idx}`,
        status: 'processing',
        simulated: true,
      };
    }

    const finalErrorMsg =
      lastError && !isRetryableBeforeAcceptError(lastError)
        ? lastError.message || 'PROVIDER_UNAVAILABLE'
        : sawTrippedOrUnavailable && plans.length > 1
          ? 'PROVIDER_UNAVAILABLE'
          : lastError?.message || 'MODEL_TEMPORARILY_UNAVAILABLE';

    return {
      status: 'failed',
      errorMessage: finalErrorMsg,
    };
  };

  const settled = await Promise.allSettled(
    Array.from({ length: n }).map((_, idx) => dispatchSingleVariant(idx))
  );

  const results: VariantDispatchResult[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      results.push(s.value);
    } else {
      results.push({
        status: 'failed',
        errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : (s.reason?.message || 'Failed to dispatch video operation'),
      });
    }
  }

  return results;
}

/**
 * Polls an individual video operation status across Kie.ai (`kie_`), Alibaba Wan (`wan_`),
 * simulated jobs (`sim_veo_`), and Google Direct Veo operations.
 */
export async function pollVeoOperation(params: {
  operationName: string;
  userId: string;
  jobId: string;
  variantIndex: number;
}): Promise<VariantDispatchResult> {
  const { operationName, userId, jobId, variantIndex } = params;

  // 1. Route Kie.ai tasks
  if (operationName.startsWith('kie_')) {
    return pollKieOperation(params);
  }

  // 2. Route Alibaba DashScope Wan 3.0 tasks
  if (operationName.startsWith('wan_')) {
    return pollAlibabaWanOperation(params);
  }

  // 3. Handle simulated / dev-cap mock operations
  if (operationName.startsWith('sim_veo_')) {
    if (isLiveMode() && getProviderEnv() === 'prod') {
      return {
        status: 'failed',
        errorMessage: 'PROVIDER_UNAVAILABLE',
      };
    }
    return {
      status: 'completed',
      outputUrl: '/samples/demo-video.mp4',
      thumbnailUrl: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&auto=format&fit=crop&q=80',
      simulated: true,
    };
  }

  // 4. Google Direct Veo operation polling
  const ai = getGemini();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!ai || !apiKey) {
    return {
      status: 'failed',
      errorMessage: 'PROVIDER_KEY_MISSING',
      supplier: 'google',
    };
  }

  try {
    const op = new GenerateVideosOperation();
    op.name = operationName;
    const updated: any = await ai.operations.getVideosOperation({ operation: op });

    if (!updated.done) {
      return {
        providerJobId: operationName,
        status: 'processing',
        supplier: 'google',
      };
    }

    if (updated.error) {
      const errMsg = redactSecrets(updated.error.message || 'Veo generation error');
      recordProviderFailure('google', errMsg);
      await markFailed(jobId, variantIndex, 'google', String(updated.error.code || 'GOOGLE_VEO_OP_ERR'));
      return {
        status: 'failed',
        errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : errMsg,
        supplier: 'google',
      };
    }

    // Video generation completed
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      await markFailed(jobId, variantIndex, 'google', 'GOOGLE_VEO_MISSING_URI');
      return {
        status: 'failed',
        errorMessage: 'Operation marked done but video URI was missing',
        supplier: 'google',
      };
    }

    // Download the video buffer safely (HTTPS only, no private IPs, 120s timeout, max 200 MB)
    const buffer = await downloadMediaBufferSafe(uri, { 'x-goog-api-key': apiKey });

    // Save to storage
    const outputUrl = await saveGenerationAsset({
      userId,
      jobId,
      variantIndex,
      extension: 'mp4',
      contentType: 'video/mp4',
      data: buffer,
    });

    await markSucceeded(jobId, variantIndex, 'google');
    recordProviderSuccess('google');
    return {
      status: 'completed',
      outputUrl,
      storagePath: `${userId}/${jobId}/${variantIndex}.mp4`,
      supplier: 'google',
    };
  } catch (err: any) {
    const safeMsg = redactSecrets(err?.message || 'Failed to poll or download Veo video');
    console.error('[Veo Poller] Error checking operation:', safeMsg);
    recordProviderFailure('google', safeMsg);
    await markFailed(jobId, variantIndex, 'google', 'GOOGLE_VEO_POLL_ERR');
    return {
      status: 'failed',
      errorMessage: isLiveMode() ? 'PROVIDER_UNAVAILABLE' : safeMsg,
      supplier: 'google',
    };
  }
}
