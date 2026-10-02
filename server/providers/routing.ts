/**
 * Provider routing helpers (server only).
 *
 * The Google model actually called for a tier can be overridden WITHOUT a code change by setting
 *   GEMINI_MODEL_<MODEL_NAME_UPPERCASE>=<google-model-id>
 * e.g. GEMINI_MODEL_NANO_BANANA_PRO=gemini-3-pro-image-preview
 *      GEMINI_MODEL_VEO_3_1_LITE=veo-3.1-lite-generate-preview
 * Use this if Google renames/retires a preview model id. Defaults live in src/services/providerCatalog.ts.
 *
 * IMPORTANT: an override must point at a model in the SAME price tier, otherwise the customer's price
 * no longer matches Google's bill. Never route a tier to a different tier as a "fallback".
 */
const logged = new Set<string>();

export function resolveGoogleModelId(modelName: string, defaultId: string): string {
  const override = process.env[`GEMINI_MODEL_${modelName.toUpperCase()}`]?.trim();
  const id = override || defaultId;
  const key = `${modelName}->${id}`;
  if (!logged.has(key)) {
    logged.add(key);
    console.log(`[Route] ${modelName} -> ${id}${override ? ' (env override)' : ''}`);
  }
  return id;
}

import { ModelRouter, RouterDecision } from '../../src/services/modelRouter';
import { AiModelConfig } from '../../src/types';

/**
 * Cross-model fallback is strictly opt-in (Phase 4 Step 2).
 * Never silently switches a customer to a different model unless the caller
 * explicitly passes `allowFallback === true` (or `ALLOW_CROSS_MODEL_FALLBACK=true` in env).
 */
export function isCrossModelFallbackEnabled(requestAllowFallback?: boolean): boolean {
  if (requestAllowFallback === true) return true;
  return (process.env.ALLOW_CROSS_MODEL_FALLBACK || '').trim().toLowerCase() === 'true';
}

export function resolveModelWithOptInFallback(params: {
  requestedModel: AiModelConfig;
  allModels: AiModelConfig[];
  healthMap: Record<string, boolean>;
  allowFallback?: boolean;
}): RouterDecision {
  const { requestedModel, allModels, healthMap, allowFallback } = params;
  const isHealthy = healthMap[requestedModel.provider] ?? true;

  if (isHealthy || !isCrossModelFallbackEnabled(allowFallback)) {
    return {
      selectedModel: requestedModel,
      fallbackTriggered: false,
    };
  }

  const router = new ModelRouter(allModels);
  return router.resolveRequestedModel(requestedModel.id, requestedModel.generation_type, healthMap);
}

