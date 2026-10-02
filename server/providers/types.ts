export interface VariantDispatchResult {
  providerJobId?: string;   // for async providers (Veo operation, MusicAPI task ID)
  outputUrl?: string;       // for sync providers (image URL, audio URL)
  thumbnailUrl?: string;
  durationSeconds?: number;
  storagePath?: string;     // bucket key for byte purge / retention
  status: 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  supplier?: string;
  upstreamModel?: string;
  estCostUsd?: number;
  actualCostUsd?: number;
  simulated?: boolean;
}

export interface GenerationTaskContext {
  userId: string;
  jobId: string;
  prompt: string;
  title?: string;
  upstreamModel?: string;                 // resolved from model_suppliers, music only
  occasion?: { id: string; subId?: string; details: Record<string, string> } | null;
  extraTags?: string[];
  enhancedPrompt?: string;
  negativePrompt?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | string;
  resolution?: '720p' | '1080p' | '4k' | string;
  durationSeconds?: number;
  audioFlag?: boolean;
  genre?: string;
  tonality?: string;
  lyrics?: string;
  coverArtUrl?: string;
  referenceImageUrl?: string;
  model: {
    id: string;
    provider: string;
    model_name: string;
    display_name: string;
    generation_type: 'image' | 'video' | 'music' | 'voice';
    quality_tier: string;
    provider_cost: number;
    credit_cost: number;
  };
  variantCount: number;
  unitCost: number;
  abortSignal?: AbortSignal;
}
