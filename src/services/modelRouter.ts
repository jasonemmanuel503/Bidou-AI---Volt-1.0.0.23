// Bidou AI Model Router
/**
 * BIDOU AI - Provider Abstraction Layer & Model Router
 * Implements Section 3.1: No code outside this module directly invokes a provider client.
 * Model selection is driven purely by the ai_models configuration.
 */

import { AiModelConfig, GenerationJob, GenerationType } from '../types';

export interface GenerateImageParams {
  userId: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16';
  qualityTier?: 'lite' | 'fast' | 'pro';
  referenceImageUrl?: string;
}

export interface GenerateVideoParams {
  userId: string;
  prompt: string;
  durationSeconds?: number;
  resolution?: '720p' | '1080p' | '4k';
  qualityTier?: 'lite' | 'fast' | 'standard';
  audioFlag?: boolean;
  referenceImageUrl?: string;
}

export interface GenerateMusicParams {
  userId: string;
  prompt: string;
  genre?: string;
  tonality?: string;
  lyrics?: string;
  qualityTier?: 'fast' | 'pro';
}

export interface GenerateVoiceParams {
  userId: string;
  text: string;
  voiceId?: string;
  language?: string;
}

export interface RouterDecision {
  selectedModel: AiModelConfig;
  fallbackTriggered: boolean;
  fallbackReason?: string;
}

export class ModelRouter {
  private models: AiModelConfig[];

  constructor(models: AiModelConfig[]) {
    this.models = models;
  }

  public updateModels(models: AiModelConfig[]) {
    this.models = models;
  }

  /**
   * Cost-Aware Model Resolution & Fallback Logic (Section 3.1)
   * Hard Rule: Before automatic fallback fires, compare alternate cost against primary.
   * Never silently fail over to a materially more expensive provider.
   */
  public resolveModel(
    type: GenerationType,
    preferredTier: string = 'fast',
    providerHealthMap: Record<string, boolean> = {}
  ): RouterDecision {
    // 1. Filter models matching generation type, active, and licensing_verified === true
    const eligibleModels = this.models.filter(
      (m) => m.generation_type === type && m.active && m.licensing_verified
    );

    if (eligibleModels.length === 0) {
      throw new Error(`No active, commercially verified models found for type: ${type}`);
    }

    // 2. Find primary match by quality tier
    let primary = eligibleModels.find((m) => m.quality_tier === preferredTier);
    if (!primary) {
      primary = eligibleModels[0];
    }

    // 3. Check health of primary provider
    const isPrimaryHealthy = providerHealthMap[primary.provider] ?? true;

    if (isPrimaryHealthy) {
      return {
        selectedModel: primary,
        fallbackTriggered: false,
      };
    }

    // 4. Provider is degraded/offline -> Cost-Aware Fallback Evaluation
    const fallbackCandidates = eligibleModels.filter(
      (m) => m.id !== primary!.id && (providerHealthMap[m.provider] ?? true)
    );

    if (fallbackCandidates.length === 0) {
      throw new Error(`Primary provider [${primary.provider}] is unavailable and no verified fallback exists.`);
    }

    // Sort candidate fallbacks by price proximity
    fallbackCandidates.sort((a, b) => a.provider_cost - b.provider_cost);
    const candidate = fallbackCandidates[0];

    // COST-AWARE FALLBACK RULE: If alternate is > 25% more expensive, block silent failover to protect margin
    const costRatio = candidate.provider_cost / primary.provider_cost;
    if (costRatio > 1.25) {
      console.warn(
        `[Cost-Aware Fallback Blocked] Candidate ${candidate.model_name} ($${candidate.provider_cost}) exceeds primary ${primary.model_name} ($${primary.provider_cost}) by ${(costRatio - 1) * 100}%.`
      );
      throw new Error(
        `Automated fallback blocked: Alternate provider exceeds approved cost threshold. Please retry shortly.`
      );
    }

    console.info(
      `[Cost-Aware Fallback Triggered] Switched from ${primary.model_name} ($${primary.provider_cost}) to ${candidate.model_name} ($${candidate.provider_cost})`
    );

    return {
      selectedModel: candidate,
      fallbackTriggered: true,
      fallbackReason: `Primary provider ${primary.provider} offline; cost-checked fallback to ${candidate.provider}`,
    };
  }

  /**
   * Resolves model for a requested model ID or falls back if provider is unhealthy.
   */
  public resolveRequestedModel(
    modelId: string,
    type: GenerationType,
    providerHealthMap: Record<string, boolean> = {}
  ): RouterDecision {
    const requested = this.models.find(
      (m) => m.id === modelId && m.generation_type === type && m.active && m.licensing_verified
    );

    if (requested && (providerHealthMap[requested.provider] ?? true)) {
      return {
        selectedModel: requested,
        fallbackTriggered: false,
      };
    }

    const preferredTier = requested?.quality_tier || 'fast';
    const decision = this.resolveModel(type, preferredTier, providerHealthMap);
    return {
      selectedModel: decision.selectedModel,
      fallbackTriggered: true,
      fallbackReason:
        decision.fallbackReason ||
        (requested
          ? `Primary provider [${requested.provider}] was unavailable`
          : `Requested model was unverified or inactive`),
    };
  }
}
