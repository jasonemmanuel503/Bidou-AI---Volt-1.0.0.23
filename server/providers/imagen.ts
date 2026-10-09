/**
 * server/providers/imagen.ts
 *
 * Plain-language summary:
 * Image generation entry point (`executeImageGeneration`).
 * - Routes Cloudflare models (`img_cf_flux1_schnell`, `img_cf_flux2_klein_4b`)
 *   to `executeCloudflareImageGeneration` in `cloudflare.ts`.
 * - Routes Google models (`nano_banana_2_lite`, `nano_banana_2`, `nano_banana_pro`)
 *   directly to the exact Google model ID in `IMAGE_ROUTES` that the customer
 *   chose and paid for (no longer tries `imagen-3.0-generate-002` first unless
 *   a catalog entry explicitly has `model_name === 'imagen_3'`).
 * - Records every attempt and outcome in `provider_cost_ledger` and preserves
 *   demo-mode placeholder behavior when keys are absent.
 */

import { GoogleGenAI } from '@google/genai';
import { GenerationTaskContext, VariantDispatchResult } from './types';
import { saveGenerationAsset } from '../storage';
import { recordProviderFailure, recordProviderSuccess } from './health';
import { isLiveMode } from '../config/mode';
import { IMAGE_ROUTES, getActualCostUsd } from '../../src/services/providerCatalog';
import { resolveGoogleModelId } from './routing';
import { executeCloudflareImageGeneration } from './cloudflare';
import { getProviderEnv, reserveSupplierBudget, withSupplierBudgetMutex } from './suppliers';
import { recordAttempt, markSucceeded, markFailed } from '../costLedger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

/**
 * Image Provider Adapter
 * Routes Cloudflare models to `cloudflare.ts` and Google models directly to the
 * customer's chosen model tier. Writes each image to storage and updates variant status.
 */
export async function executeImageGeneration(
  ctx: GenerationTaskContext
): Promise<VariantDispatchResult[]> {
  // 1. Route Cloudflare FLUX models to the Cloudflare Workers AI adapter
  if (
    ctx.model.provider === 'cloudflare' ||
    ctx.model.id === 'img_cf_flux1_schnell' ||
    ctx.model.id === 'img_cf_flux2_klein_4b' ||
    ctx.model.id === 'img_cf_flux2_klein_9b' ||
    ctx.model.model_name?.startsWith('cf_flux')
  ) {
    return executeCloudflareImageGeneration(ctx);
  }

  const { userId, jobId, prompt, enhancedPrompt, aspectRatio = '1:1', variantCount } = ctx;
  const activePrompt = enhancedPrompt || prompt;
  const n = Math.max(1, Math.min(variantCount, 4));
  const env = getProviderEnv();

  const results: VariantDispatchResult[] = [];
  const ai = getGemini();

  if (!process.env.GEMINI_API_KEY) {
    if (isLiveMode()) {
      for (let i = 0; i < n; i++) {
        results.push({
          status: 'failed',
          errorMessage: 'PROVIDER_KEY_MISSING',
          supplier: 'google',
        });
      }
      return results;
    }
  }

  if (ai && process.env.GEMINI_API_KEY) {
    const isExplicitImagen3 = ctx.model.model_name === 'imagen_3';
    const route = IMAGE_ROUTES[ctx.model.model_name];
    if (!route && !isExplicitImagen3) {
      console.error(`[Image Provider] Unknown model_name: ${ctx.model.model_name}; failing closed`);
      if (isLiveMode()) {
        return Array.from({ length: n }).map(() => ({
          status: 'failed' as const,
          errorMessage: 'MODEL_NOT_CONFIGURED',
          supplier: 'google',
        }));
      }
    }

    const defaultModelId = isExplicitImagen3
      ? 'imagen-3.0-generate-002'
      : route?.googleModelId || 'gemini-3.1-flash-image-preview';
    const googleModel = resolveGoogleModelId(ctx.model.model_name || 'nano_banana_2', defaultModelId);
    const imageSize = route?.imageSize || (ctx.model.quality_tier === 'pro' ? '2K' : '1K');
    const estCostUsd = getActualCostUsd(ctx.model.id || ctx.model.model_name, 'google');
    const [simW, simH] = aspectRatio === '16:9' ? [1280, 720] : aspectRatio === '9:16' ? [720, 1280] : [1024, 1024];

    try {
      // Check supplier budget per variant before calling Google, protected by per-supplier async mutex (single server instance only)
      const variantPlans: Array<'call' | 'simulate_cap' | 'tripped'> = [];
      for (let i = 0; i < n; i++) {
        await withSupplierBudgetMutex('google', async () => {
          const budget = await reserveSupplierBudget('google', estCostUsd, 1, 'image');
          if (budget === 'cap_reached') {
            variantPlans.push('simulate_cap');
          } else if (budget === 'tripped') {
            variantPlans.push('tripped');
          } else {
            variantPlans.push('call');
            await recordAttempt({
              jobId,
              variantIndex: i,
              userId,
              modelId: ctx.model.id,
              supplier: 'google',
              upstreamModel: googleModel,
              env,
              units: 1,
              unitLabel: 'image',
              estCostUsd,
              creditsCharged: ctx.unitCost,
            });
          }
        });
      }

      if (variantPlans.every((p) => p === 'tripped')) {
        return Array.from({ length: n }).map(() => ({
          status: 'failed' as const,
          errorMessage: 'MODEL_TEMPORARILY_UNAVAILABLE',
          supplier: 'google',
          upstreamModel: googleModel,
        }));
      }

      let imagesData: Array<{ buffer: Buffer; mime: string } | 'simulated' | 'tripped' | null> = [];

      if (isExplicitImagen3) {
        const callCount = variantPlans.filter((p) => p === 'call').length;
        if (callCount > 0) {
          const response: any = await (ai.models as any).generateImages({
            model: googleModel,
            prompt: activePrompt,
            config: {
              numberOfImages: callCount,
              aspectRatio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '1:1',
              outputMimeType: 'image/png',
            },
          });
          const rawImgs = response?.generatedImages || [];
          let rawIdx = 0;
          for (const plan of variantPlans) {
            if (plan === 'simulate_cap') {
              imagesData.push('simulated');
            } else if (plan === 'tripped') {
              imagesData.push('tripped');
            } else {
              const img = rawImgs[rawIdx++];
              imagesData.push(
                img?.image?.imageBytes
                  ? { buffer: Buffer.from(img.image.imageBytes, 'base64'), mime: 'image/png' }
                  : null
              );
            }
          }
        }
      } else {
        // Call the exact Google model tier the customer chose (`gemini-3.1-flash-image-preview` or `gemini-3-pro-image-preview`)
        const calls = variantPlans.map(async (plan, idx) => {
          if (plan === 'simulate_cap') return 'simulated' as const;
          if (plan === 'tripped') return 'tripped' as const;

          const resp = await ai.models.generateContent({
            model: googleModel,
            contents: {
              parts: [{ text: `${activePrompt} (variation ${idx + 1}, seed ${Date.now() + idx})` }],
            },
            config: {
              imageConfig: {
                aspectRatio: (aspectRatio as any) || '1:1',
                imageSize,
              },
            } as any,
          });

          for (const part of resp.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data) {
              return {
                buffer: Buffer.from(part.inlineData.data, 'base64'),
                mime: part.inlineData.mimeType || 'image/png',
              };
            }
          }
          return null;
        });

        const settled = await Promise.allSettled(calls);
        for (const s of settled) {
          if (s.status === 'fulfilled') {
            imagesData.push(s.value);
          } else {
            imagesData.push(null);
          }
        }
      }

      if (imagesData.some((item) => item !== null && item !== 'tripped')) {
        recordProviderSuccess('google');

        for (let i = 0; i < n; i++) {
          const img = imagesData[i];
          if (img === 'simulated') {
            const placeholderUrl = `https://picsum.photos/seed/${jobId}-devcap-${i}/${simW}/${simH}`;
            results.push({
              status: 'completed',
              outputUrl: placeholderUrl,
              thumbnailUrl: placeholderUrl,
              supplier: 'google',
              upstreamModel: googleModel,
              estCostUsd: 0,
              actualCostUsd: 0,
              simulated: true,
            });
          } else if (img === 'tripped') {
            results.push({
              status: 'failed',
              errorMessage: 'MODEL_TEMPORARILY_UNAVAILABLE',
              supplier: 'google',
              upstreamModel: googleModel,
            });
          } else if (img) {
            const url = await saveGenerationAsset({
              userId,
              jobId,
              variantIndex: i,
              extension: 'png',
              contentType: img.mime,
              data: img.buffer,
            });

            await markSucceeded(jobId, i, 'google', estCostUsd);

            results.push({
              status: 'completed',
              outputUrl: url,
              thumbnailUrl: url,
              storagePath: `${userId}/${jobId}/${i}.png`,
              supplier: 'google',
              upstreamModel: googleModel,
              estCostUsd,
              actualCostUsd: estCostUsd,
              simulated: false,
            });
          } else {
            await markFailed(jobId, i, 'google', 'CONTENT_FILTERED_OR_EMPTY');
            results.push({
              status: 'failed',
              errorMessage: isLiveMode()
                ? 'PROVIDER_UNAVAILABLE'
                : 'Safety filter blocked variant or generation failed',
              supplier: 'google',
              upstreamModel: googleModel,
            });
          }
        }

        return results;
      }
    } catch (err: any) {
      console.error('[Imagen Provider] Generation failed:', err?.message || err);
      recordProviderFailure('google', err?.message || 'Google image generation failed');
      for (let i = 0; i < n; i++) {
        await markFailed(jobId, i, 'google', 'GOOGLE_IMAGE_EXCEPTION');
      }
      if (isLiveMode()) {
        for (let i = 0; i < n; i++) {
          results.push({
            status: 'failed',
            errorMessage: 'PROVIDER_UNAVAILABLE',
            supplier: 'google',
          });
        }
        return results;
      }
    }
  }

  if (isLiveMode()) {
    for (let i = 0; i < n; i++) {
      results.push({
        status: 'failed',
        errorMessage: 'PROVIDER_UNAVAILABLE',
        supplier: 'google',
      });
    }
    return results;
  }

  // DEMO ONLY: aspect-correct placeholder with visible processing delay
  const [w, h] = aspectRatio === '16:9' ? [1280, 720] : aspectRatio === '9:16' ? [720, 1280] : [1024, 1024];
  for (let i = 0; i < n; i++) {
    await sleep(2200 + i * 350);
    const placeholderUrl = `https://picsum.photos/seed/${jobId}-${i}/${w}/${h}`;
    results.push({
      status: 'completed',
      outputUrl: placeholderUrl,
      thumbnailUrl: placeholderUrl,
      supplier: 'google',
      simulated: true,
    });
  }

  return results;
}
