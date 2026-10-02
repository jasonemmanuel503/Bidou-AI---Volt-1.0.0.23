// Bidou AI Unified Prompt Box
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Plus,
  Upload,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  Wand2,
  X,
  FileMusic,
  Disc,
  Check,
  ChevronDown,
  SlidersHorizontal,
  AlertCircle,
  CornerDownLeft,
  Lock,
  Settings,
} from 'lucide-react';
import { AiModelConfig, GenerationType, PlanTier, RestoreRequest } from '../../types';
export type { RestoreRequest };
import { CustomSelect } from '../common/CustomSelect';
import { GradientBorder } from '../common/GradientBorder';
import { InlineNotice } from '../common/InlineNotice';
import { quoteGenerationCost, ModelPriceTableEntry } from '../../services/pricingEngine';
import { COVER_ART_ROUTE_KEY } from '../../services/providerCatalog';
import { TIER_VARIANT_CAP, TIER_RANK } from '../../services/tiers';
import { getEnhanceErrorPresentation, EnhanceErrorPresentation } from '../../lib/errorMapping';
import type { PlanLimitInfo } from '../../services/apiClient';
import { toast } from '../../services/toast';
import { genreOptions, tonalityOptions } from '../../services/musicStyles';

export interface EnhancePromptContext {
  rawPrompt: string;
  mediaType: string;
  modelId: string;
  aspectRatio?: string;
  variantCount?: number;
  durationSeconds?: number;
  resolution?: string;
  genre?: string;
  tonality?: string;
  hasReferenceImage?: boolean;
  previousVariants?: string[];
  occasion?: any;
  language?: string;
}

export interface TabState {
  prompt: string;
  originalPrompt: string;
  modelId: string;
  aspectRatio: '1:1' | '16:9' | '9:16';
  variantCount: number;
  referenceFileUrl: string | null;
  referenceFileName: string;
  // video only
  videoDuration: number;
  videoResolution: '480p' | '720p' | '1080p';
  // music only
  musicTitle: string;
  musicGenre: string;
  musicTonality: string;
  musicLyrics: string;
  musicLanguage?: string;
  musicOccasion?: any;
  coverArtUrl: string | null;
}

export interface PrefillRequest {
  prompt: string;
  type: GenerationType;
  token: number;
}

const getSavedModelForTab = (type: GenerationType): string | null => {
  try {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`bidou:last_model:${type}`);
    }
  } catch {
    // ignore
  }
  return null;
};

const saveModelForTab = (type: GenerationType, modelId: string): void => {
  try {
    if (typeof window !== 'undefined' && modelId) {
      localStorage.setItem(`bidou:last_model:${type}`, modelId);
    }
  } catch {
    // ignore
  }
};

export const makeDefaultTabState = (
  type: GenerationType,
  models: AiModelConfig[],
  initialPrompt = '',
  planTier: PlanTier = 'free'
): TabState => {
  const tabModels = models.filter((m) => m.generation_type === type && m.active && m.licensing_verified);
  const savedModelId = getSavedModelForTab(type);
  const validSaved = savedModelId && tabModels.some((m) => m.id === savedModelId) ? savedModelId : null;
  const defaultModelId = validSaved || tabModels[0]?.id || (
    type === 'image' ? 'img_nano_banana_2_lite' :
    type === 'video' ? 'vid_veo_3_1_lite' :
    type === 'music' ? 'mus_lyria_3_pro' : ''
  );
  const defaultModel = tabModels.find((m) => m.id === defaultModelId) || tabModels[0];
  const tierCap = TIER_VARIANT_CAP[planTier] ?? 1;
  const defaultMusicVariants = Math.min(2, tierCap);
  const durOpt = defaultModel?.video_options?.durations;
  const defaultDur = Array.isArray(durOpt)
    ? (durOpt.includes(6) ? 6 : durOpt[0] ?? 4)
    : durOpt && typeof durOpt === 'object'
    ? Math.max(durOpt.min, Math.min(durOpt.max, 5))
    : 6;

  return {
    prompt: initialPrompt,
    originalPrompt: '',
    modelId: defaultModelId,
    aspectRatio: type === 'video' ? '16:9' : (type === 'image' ? '16:9' : '1:1'),
    variantCount: type === 'music' ? defaultMusicVariants : 1,
    referenceFileUrl: null,
    referenceFileName: '',
    videoDuration: defaultDur,
    videoResolution: '720p',
    musicTitle: '',
    musicGenre: 'Makossa',
    musicTonality: 'Celebratory & Energetic',
    musicLyrics: '',
    musicLanguage: 'French / English / Camfranglais',
    musicOccasion: null,
    coverArtUrl: null,
  };
};

export interface UnifiedPromptBoxProps {
  models: AiModelConfig[];
  activeTab: GenerationType;
  onTabChange: (tab: GenerationType) => void;
  planTier?: PlanTier;
  planLimits?: Record<PlanTier, PlanLimitInfo>;
  providerEnv?: 'dev' | 'prod';
  hasSimulatedVariants?: boolean;
  onRequestUpgrade?: () => void;
  onGenerateImage: (params: {
    prompt: string;
    enhancedPrompt?: string;
    modelId: string;
    aspectRatio: string;
    referenceImageUrl?: string;
    variantCount?: number;
    clientSettings?: Record<string, any>;
  }) => Promise<void>;
  onGenerateVideo: (params: {
    prompt: string;
    enhancedPrompt?: string;
    modelId: string;
    durationSeconds: number;
    resolution: '480p' | '720p' | '1080p';
    aspectRatio: string;
    referenceImageUrl?: string;
    variantCount?: number;
    clientSettings?: Record<string, any>;
  }) => Promise<void>;
  onGenerateMusic: (params: {
    prompt: string;
    enhancedPrompt?: string;
    modelId: string;
    genre: string;
    tonality: string;
    lyrics?: string;
    title?: string;
    variantCount?: number;
    occasion?: any;
    language?: string;
    clientSettings?: Record<string, any>;
  }) => Promise<void>;
  onEnhancePrompt: (context: EnhancePromptContext) => Promise<string>;
  onGenerateLyrics: (params: {
    title: string;
    genre: string;
    tonality: string;
    description?: string;
    language?: string;
    occasion?: any;
    instructions?: string;
  }) => Promise<string>;
  onRewriteLyrics: (lyrics: string) => Promise<string>;
  onGenerateCoverArt: (params: { title: string; genre: string }) => Promise<string>;
  isGenerating?: boolean;
  prefillRequest?: PrefillRequest | null;
  prefilledPrompt?: string;
  restoreRequest?: RestoreRequest | null;
  walletBalance?: number;
  paidBalance?: number;
  promoBalance?: number;
  onInsufficientCredits?: (params: {
    required: number;
    available: number;
    variantCount: number;
    unitCost: number;
    mediaType: GenerationType;
    errorCode?: string;
    errorMessage?: string;
  }) => void;
}

export const UnifiedPromptBox: React.FC<UnifiedPromptBoxProps> = ({
  models,
  activeTab,
  onTabChange,
  planTier = 'free',
  planLimits,
  providerEnv = 'prod',
  hasSimulatedVariants = false,
  onRequestUpgrade,
  onGenerateImage,
  onGenerateVideo,
  onGenerateMusic,
  onEnhancePrompt,
  onGenerateLyrics,
  onRewriteLyrics,
  onGenerateCoverArt,
  isGenerating = false,
  prefillRequest = null,
  prefilledPrompt = '',
  restoreRequest = null,
  walletBalance,
  paidBalance,
  promoBalance,
  onInsufficientCredits,
}) => {
  // Per-tab state (Section 4.3.1)
  const [tabStates, setTabStates] = useState<Record<GenerationType, TabState>>(() => ({
    image: makeDefaultTabState('image', models, activeTab === 'image' ? (prefillRequest?.prompt || prefilledPrompt) : '', planTier as PlanTier),
    video: makeDefaultTabState('video', models, activeTab === 'video' ? (prefillRequest?.prompt || prefilledPrompt) : '', planTier as PlanTier),
    music: makeDefaultTabState('music', models, activeTab === 'music' ? (prefillRequest?.prompt || prefilledPrompt) : '', planTier as PlanTier),
    voice: makeDefaultTabState('voice', models, activeTab === 'voice' ? (prefillRequest?.prompt || prefilledPrompt) : '', planTier as PlanTier),
  }));

  const current = tabStates[activeTab] || makeDefaultTabState(activeTab, models, '', planTier as PlanTier);
  const patchTab = (patch: Partial<TabState>, tab: GenerationType = activeTab) => {
    if (patch.modelId) {
      saveModelForTab(tab, patch.modelId);
    }
    setTabStates((s) => ({ ...s, [tab]: { ...(s[tab] || makeDefaultTabState(tab, models, '', planTier as PlanTier)), ...patch } }));
  };

  // Subtle note when resolution/duration snaps automatically
  const [videoSnapNote, setVideoSnapNote] = useState<string | null>(null);
  // Desktop grouped model picker popover state
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelPickerOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [modelPickerOpen]);

  // Textarea reference for programmatic auto-resize fallback (Safari, Firefox)
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mobile/Tablet Settings Modal state and draft pattern (Section 4 — Issue 2)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [draft, setDraft] = useState<TabState | null>(null);

  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalPanelRef = useRef<HTMLElement>(null);
  const wasSettingsOpenRef = useRef(false);

  const openSettings = () => {
    setDraft({ ...current });
    setSettingsModalOpen(true);
  };

  const closeSettings = () => {
    setSettingsModalOpen(false);
  };

  // Close the drawer if activeTab changes (the draft belongs to the old tab)
  useEffect(() => {
    if (settingsModalOpen) {
      setSettingsModalOpen(false);
    }
  }, [activeTab]);

  // Close on Escape key (discard semantics — leaves current completely unchanged)
  useEffect(() => {
    if (!settingsModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSettings();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsModalOpen]);

  // Focus-restore effect guarded by wasSettingsOpenRef so focus returns to trigger only after a real open->close (never on mount)
  useEffect(() => {
    if (settingsModalOpen) {
      wasSettingsOpenRef.current = true;
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus({ preventScroll: true });
      }, 50);
      return () => clearTimeout(timer);
    } else if (wasSettingsOpenRef.current) {
      wasSettingsOpenRef.current = false;
      settingsTriggerRef.current?.focus({ preventScroll: true });
    }
  }, [settingsModalOpen]);

  // Fallback auto-resize for browsers without native field-sizing support (Safari, Firefox)
  useLayoutEffect(() => {
    if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content')) {
      return;
    }
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.4 : 300;
    const targetHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${targetHeight}px`;
  }, [current.prompt]);

  // Track if textarea has more scrollable content below viewport (for mobile fade indicator)
  const [canScrollDown, setCanScrollDown] = useState(false);
  const checkTextareaScroll = () => {
    const el = textareaRef.current;
    if (!el) {
      setCanScrollDown(false);
      return;
    }
    const hasOverflow = el.scrollHeight > el.clientHeight + 4;
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 6;
    setCanScrollDown(hasOverflow && !isAtBottom);
  };

  useLayoutEffect(() => {
    checkTextareaScroll();
  }, [current.prompt, activeTab]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onScroll = () => checkTextareaScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Enhancement ephemeral states
  const [enhanceHistory, setEnhanceHistory] = useState<string[]>([]);
  const [enhanceError, setEnhanceError] = useState<EnhanceErrorPresentation | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Prefill handling: respond to prefillRequest.token changes by writing into target tab's slot (Section 4.3.3)
  const lastPrefillTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (prefillRequest && prefillRequest.token !== lastPrefillTokenRef.current) {
      lastPrefillTokenRef.current = prefillRequest.token;
      patchTab(
        {
          prompt: prefillRequest.prompt,
          originalPrompt: '',
        },
        prefillRequest.type
      );
      if (prefillRequest.type === activeTab) {
        setEnhanceHistory([]);
        setEnhanceError(null);
      }
    }
  }, [prefillRequest, activeTab]);

  // Backwards-compatibility for string prefilledPrompt if prefillRequest is not used
  const lastPrefilledPromptRef = useRef<string>('');
  useEffect(() => {
    if (!prefillRequest && prefilledPrompt && prefilledPrompt !== lastPrefilledPromptRef.current) {
      lastPrefilledPromptRef.current = prefilledPrompt;
      patchTab({ prompt: prefilledPrompt, originalPrompt: '' }, activeTab);
      setEnhanceHistory([]);
      setEnhanceError(null);
    }
  }, [prefilledPrompt, prefillRequest, activeTab]);

  // Section 5.3.4: Restore prompt & full studio snapshot for Retry / Reuse Prompt
  const [referenceNote, setReferenceNote] = useState<string | null>(null);
  const lastRestoreTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (restoreRequest && restoreRequest.token !== lastRestoreTokenRef.current) {
      lastRestoreTokenRef.current = restoreRequest.token;
      const { tab, settings } = restoreRequest;
      if (!tab || !settings) return;

      setTabStates((prev) => {
        const existing = prev[tab] || makeDefaultTabState(tab, models);
        const restoredPrompt =
          settings.enhancedPrompt ||
          settings.originalPrompt ||
          settings.prompt ||
          existing.prompt;

        return {
          ...prev,
          [tab]: {
            ...existing,
            prompt: restoredPrompt,
            originalPrompt: settings.originalPrompt || '',
            modelId: settings.modelId || existing.modelId,
            aspectRatio: settings.aspectRatio || existing.aspectRatio,
            variantCount:
              typeof settings.variantCount === 'number'
                ? settings.variantCount
                : existing.variantCount,
            videoDuration:
              typeof settings.videoDuration === 'number'
                ? settings.videoDuration
                : existing.videoDuration,
            videoResolution: settings.videoResolution || existing.videoResolution,
            musicGenre: settings.musicGenre || existing.musicGenre,
            musicTonality: settings.musicTonality || existing.musicTonality,
            musicTitle: settings.musicTitle || existing.musicTitle,
            musicLyrics: settings.musicLyrics || existing.musicLyrics,
            referenceFileName: settings.referenceFileName || '',
            referenceFileUrl: null, // Binary file cannot be restored from snapshot
          },
        };
      });

      if (settings.referenceFileName) {
        setReferenceNote(`Re-attach ${settings.referenceFileName} if you want to reuse it.`);
      } else {
        setReferenceNote(null);
      }
      setEnhanceHistory([]);
      setEnhanceError(null);
    }
  }, [restoreRequest, models]);

  // Track previous models for unavailable toast notification
  const prevModelsRef = useRef<AiModelConfig[] | null>(null);

  // Ensure tabs have valid model IDs when models list is available or updated
  useEffect(() => {
    const prevModels = prevModelsRef.current;
    prevModelsRef.current = models;

    setTabStates((prev) => {
      let changed = false;
      const next = { ...prev };
      (['image', 'video', 'music', 'voice'] as GenerationType[]).forEach((type) => {
        const typeModels = models.filter((m) => m.generation_type === type && m.active && m.licensing_verified);
        const currentModelId = next[type]?.modelId;
        const isValid = typeModels.some((m) => m.id === currentModelId);
        if (!isValid && typeModels.length > 0) {
          const newModel = typeModels[0];
          next[type] = {
            ...next[type],
            modelId: newModel.id,
          };
          changed = true;

          // If the previous model was valid before, notify user that it became unavailable
          if (prevModels !== null && currentModelId) {
            const oldModel = prevModels.find(
              (m) => m.id === currentModelId && m.generation_type === type && m.active && m.licensing_verified
            );
            if (oldModel && oldModel.id !== newModel.id) {
              toast.info(
                `"${oldModel.display_name}" is no longer available — switched to "${newModel.display_name}".`
              );
            }
          }
        }
      });
      return changed ? next : prev;
    });
  }, [models]);

  // Clear enhance error when active tab changes
  useEffect(() => {
    setEnhanceError(null);
  }, [activeTab]);

  // Models filtered by active tab
  const tabModels = models.filter((m) => m.generation_type === activeTab && m.active && m.licensing_verified);
  const activeModel = tabModels.find((m) => m.id === current.modelId) || tabModels[0];

  // Variant count selector & authoritative tier clamping (Section 4c)
  const maxVariants = activeModel?.max_concurrent_variants ?? 1;
  const tierCap = TIER_VARIANT_CAP[planTier || 'free'] ?? 1;
  const effectiveCap = activeTab === 'music'
    ? Math.min(2, tierCap)
    : Math.min(maxVariants, tierCap);

  useEffect(() => {
    if (current.variantCount > effectiveCap) {
      patchTab({ variantCount: effectiveCap });
    }
  }, [effectiveCap, current.variantCount]);

  // If activeModel has restricted supported_aspect_ratios, clamp current.aspectRatio
  useEffect(() => {
    if (
      activeModel?.supported_aspect_ratios &&
      activeModel.supported_aspect_ratios.length > 0 &&
      !activeModel.supported_aspect_ratios.includes(current.aspectRatio)
    ) {
      patchTab({ aspectRatio: activeModel.supported_aspect_ratios[0] as any });
    }
  }, [activeModel?.id, activeModel?.supported_aspect_ratios, current.aspectRatio]);

  // Dynamic video options for activeModel
  const videoResolutions: Array<'480p' | '720p' | '1080p'> =
    (activeModel?.video_options?.resolutions as Array<'480p' | '720p' | '1080p'> | undefined) &&
    activeModel!.video_options!.resolutions.length > 0
      ? (activeModel!.video_options!.resolutions as Array<'480p' | '720p' | '1080p'>)
      : ['720p', '1080p'];

  const videoDurationsOption = activeModel?.video_options?.durations ?? [4, 6, 8];
  const isRangeDuration = !Array.isArray(videoDurationsOption);
  const isVeoModel = Boolean(activeModel?.model_name?.startsWith('veo_'));
  const maxPlanVideoSeconds =
    activeModel?.video_options?.max_duration_by_plan?.[planTier] ??
    planLimits?.[planTier]?.max_video_seconds ??
    (planTier === 'pro' || planTier === 'studio' ? 30 : 15);

  // Snap video resolution & duration when activeModel changes
  useEffect(() => {
    if (activeTab !== 'video' || !activeModel) return;
    let nextRes = current.videoResolution;
    let nextDur = current.videoDuration;
    let snappedReason: string | null = null;

    if (!videoResolutions.includes(nextRes)) {
      nextRes = videoResolutions.includes('720p') ? '720p' : videoResolutions[0];
    }

    if (Array.isArray(videoDurationsOption)) {
      if (isVeoModel && nextRes === '1080p' && nextDur !== 8) {
        nextDur = 8;
        snappedReason = '1080p on Veo 3.1 requires an 8 s clip — duration set to 8 s.';
      } else if (!videoDurationsOption.includes(nextDur)) {
        nextDur = videoDurationsOption.includes(6)
          ? 6
          : videoDurationsOption[0] ?? 4;
      }
    } else {
      const clampedMax = Math.min(videoDurationsOption.max, maxPlanVideoSeconds);
      if (nextDur < videoDurationsOption.min || nextDur > clampedMax) {
        nextDur = Math.min(clampedMax, Math.max(videoDurationsOption.min, 5));
      }
    }

    if (nextRes !== current.videoResolution || nextDur !== current.videoDuration) {
      patchTab({ videoResolution: nextRes, videoDuration: nextDur });
      if (snappedReason) {
        setVideoSnapNote(snappedReason);
      }
    }
  }, [activeModel?.id, activeTab]);

  const handleVideoResolutionChange = (res: '480p' | '720p' | '1080p', isDraft = false) => {
    let nextDur = isDraft && draft ? draft.videoDuration : current.videoDuration;
    let note: string | null = null;
    if (Array.isArray(videoDurationsOption)) {
      if (isVeoModel && res === '1080p' && nextDur !== 8) {
        nextDur = 8;
        note = '1080p on Veo 3.1 only supports 8 s — snapped duration to 8 s.';
      } else if (!videoDurationsOption.includes(nextDur)) {
        nextDur = videoDurationsOption[0] ?? 8;
      }
    }
    setVideoSnapNote(note);
    if (isDraft) {
      setDraft((d) => (d ? { ...d, videoResolution: res, videoDuration: nextDur } : d));
    } else {
      patchTab({ videoResolution: res, videoDuration: nextDur });
    }
  };

  const handleVideoDurationChange = (dur: number, isDraft = false) => {
    if (dur > maxPlanVideoSeconds) {
      if (isDraft) closeSettings();
      onRequestUpgrade?.();
      return;
    }
    if (Array.isArray(videoDurationsOption) && isVeoModel && (isDraft ? draft?.videoResolution : current.videoResolution) === '1080p' && dur !== 8) {
      setVideoSnapNote('4 s and 6 s require 720p on Veo 3.1.');
      return;
    }
    setVideoSnapNote(null);
    if (isDraft) {
      setDraft((d) => (d ? { ...d, videoDuration: dur } : d));
    } else {
      patchTab({ videoDuration: dur });
    }
  };

  // Textarea state and change handler
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    patchTab({ prompt: e.target.value, originalPrompt: '' });
    setEnhanceHistory([]);
    setEnhanceError(null);
  };

  // Music async states
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [isRewritingLyrics, setIsRewritingLyrics] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isTrackDetailsOpen, setIsTrackDetailsOpen] = useState(false);

  // Live quote cost breakdown driven by server price_table / credit_cost when present, falling back to quoteGenerationCost
  const effectiveVariantCount = activeTab === 'music' ? effectiveCap : current.variantCount;
  const baseQuote = quoteGenerationCost({
    model: activeModel,
    durationSeconds: current.videoDuration,
    resolution: current.videoResolution,
    includeAudio: true,
    variantCount: effectiveVariantCount,
  });

  const serverPriceTable = (activeModel as (AiModelConfig & { price_table?: ModelPriceTableEntry[] }) | undefined)?.price_table;
  const matchedServerRow =
    activeTab === 'video' && Array.isArray(serverPriceTable)
      ? serverPriceTable.find(
          (r) =>
            r.resolution === current.videoResolution &&
            r.durationSeconds === current.videoDuration
        )
      : undefined;

  const unitCost =
    activeTab === 'video'
      ? matchedServerRow?.credits ?? baseQuote.unitCost
      : activeTab === 'music'
      ? Math.ceil((activeModel?.credit_cost || baseQuote.totalCost) / Math.max(1, effectiveVariantCount))
      : activeModel?.credit_cost || baseQuote.unitCost;

  const totalCost =
    activeTab === 'music'
      ? activeModel?.credit_cost || baseQuote.totalCost
      : unitCost * effectiveVariantCount;

  const quote = {
    ...baseQuote,
    unitCost,
    totalCost,
    variantCount: effectiveVariantCount,
  };

  const isPerSecondVideo =
    activeTab === 'video' &&
    (activeModel?.pricing_kind === 'per_second' || isRangeDuration);
  const perSecondRate =
    isPerSecondVideo && current.videoDuration > 0
      ? Math.round(quote.unitCost / current.videoDuration)
      : null;

  // Compute which credit bucket will pay
  const availPromo = Math.max(0, Math.round(promoBalance ?? 0));
  const availPaid =
    paidBalance !== undefined
      ? Math.max(0, Math.round(paidBalance))
      : Math.max(0, Math.round((walletBalance ?? 0) - availPromo));
  const modelAllowsPromo = Boolean(activeModel?.promo_eligible);
  const effectiveAvailableBalance = modelAllowsPromo ? availPromo + availPaid : availPaid;
  const promoToUse = modelAllowsPromo ? Math.min(availPromo, quote.totalCost) : 0;
  const paidToUse = Math.max(0, quote.totalCost - promoToUse);

  const isPromoBlockedOnly =
    typeof walletBalance === 'number' &&
    !modelAllowsPromo &&
    availPromo > 0 &&
    availPaid < quote.totalCost &&
    availPromo + availPaid >= quote.totalCost;

  const isInsufficient =
    typeof walletBalance === 'number' && quote.totalCost > effectiveAvailableBalance;
  const shortfall =
    typeof walletBalance === 'number' && isInsufficient
      ? quote.totalCost - effectiveAvailableBalance
      : 0;
  const maxAffordable =
    typeof walletBalance === 'number' && quote.unitCost > 0
      ? Math.floor(effectiveAvailableBalance / quote.unitCost)
      : 0;

  const bucketNoticeText = (() => {
    if (!activeModel) return '';
    if (modelAllowsPromo) {
      if (promoToUse > 0 && paidToUse > 0) {
        return `Uses ${promoToUse.toLocaleString()} free + ${paidToUse.toLocaleString()} paid credits`;
      }
      if (promoToUse > 0) {
        return `Uses ${promoToUse.toLocaleString()} free credits`;
      }
      return `Uses ${quote.totalCost.toLocaleString()} paid credits (free credits OK)`;
    }
    if (availPromo > 0) {
      return 'Requires paid credits — free credits work on fast image models';
    }
    return `Uses ${quote.totalCost.toLocaleString()} paid credits`;
  })();

  // Cover art add-on cost derived from providerCatalog
  const coverModel = models.find((m) => m.model_name === COVER_ART_ROUTE_KEY);
  const coverArtCost = coverModel ? quoteGenerationCost({ model: coverModel, variantCount: 1 }).totalCost : 80;

  // High-value confirmation dialog state (Section 3.3)
  const [highValueConfirmOpen, setHighValueConfirmOpen] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);

  // Handle Prompt Enhancement (Section 2.3.1)
  const handleEnhance = async () => {
    if (!current.prompt.trim() || isEnhancing) return;

    // The FIRST enhance click captures the user's own words as the
    // immutable source. Every later click re-rolls from that source,
    // so enhancement never compounds.
    const source = current.originalPrompt || current.prompt;
    if (!current.originalPrompt) patchTab({ originalPrompt: current.prompt });

    setIsEnhancing(true);
    setEnhanceError(null);
    try {
      const enhanced = await onEnhancePrompt({
        rawPrompt: source,
        mediaType: activeTab,
        modelId: activeModel?.id ?? '',
        aspectRatio: current.aspectRatio,
        variantCount: current.variantCount,
        durationSeconds: activeTab === 'video' ? current.videoDuration : undefined,
        resolution:     activeTab === 'video' ? current.videoResolution : undefined,
        genre:          activeTab === 'music' ? current.musicGenre : undefined,
        tonality:       activeTab === 'music' ? current.musicTonality : undefined,
        occasion:       activeTab === 'music' ? current.musicOccasion : undefined,
        language:       activeTab === 'music' ? current.musicLanguage : undefined,
        hasReferenceImage: !!current.referenceFileUrl,
        previousVariants: enhanceHistory, // so Gemini avoids repeating itself
      });
      patchTab({ prompt: enhanced });
      setEnhanceHistory((h) => [...h, enhanced].slice(-3));
    } catch (e: any) {
      const presentation = getEnhanceErrorPresentation(e);
      setEnhanceError(presentation);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileName = file.name;
      const reader = new FileReader();
      reader.onload = (event) => {
        patchTab({
          referenceFileName: fileName,
          referenceFileUrl: event.target?.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearUpload = () => {
    patchTab({
      referenceFileUrl: null,
      referenceFileName: '',
    });
  };

  // Handle Music Lyrics Generation & Rewrite
  const handleGenerateLyricsClick = async () => {
    setIsGeneratingLyrics(true);
    setLyricsError(null);
    try {
      const generated = await onGenerateLyrics({
        title: current.musicTitle || 'Chant de Joie',
        genre: current.musicGenre,
        tonality: current.musicTonality,
        description: current.prompt,
        language: current.musicLanguage,
        occasion: current.musicOccasion,
      });
      patchTab({ musicLyrics: generated });
    } catch (err: any) {
      console.error('[Lyrics Generation Error]', err);
      setLyricsError(err?.message || 'Failed to generate lyrics. Please check your connection and try again.');
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  const handleRewriteLyricsClick = async () => {
    if (!current.musicLyrics.trim()) return;
    setIsRewritingLyrics(true);
    try {
      const rewritten = await onRewriteLyrics(current.musicLyrics);
      patchTab({ musicLyrics: rewritten });
    } finally {
      setIsRewritingLyrics(false);
    }
  };

  // Handle Cover Art Generation
  const handleCoverArtClick = async () => {
    setIsGeneratingCover(true);
    try {
      const cover = await onGenerateCoverArt({
        title: current.musicTitle || 'African Rhythm Single',
        genre: current.musicGenre,
      });
      patchTab({ coverArtUrl: cover });
    } finally {
      setIsGeneratingCover(false);
    }
  };

  // Handle Submit / Trigger Generation (Section 2.3.5 & 4.3.2 & 5.3.1)
  const executeFinalGeneration = async () => {
    const snapshot = { ...current }; // captured for retry (Section 5)
    const isEnhanced = !!snapshot.originalPrompt && snapshot.originalPrompt !== snapshot.prompt;
    const finalPrompt = isEnhanced ? snapshot.originalPrompt : snapshot.prompt;
    const enhancedPrompt = isEnhanced ? snapshot.prompt : undefined;

    const clientSettings = {
      tab: activeTab,
      modelId: activeModel?.id || snapshot.modelId,
      aspectRatio: snapshot.aspectRatio,
      variantCount: snapshot.variantCount,
      videoDuration: snapshot.videoDuration,
      videoResolution: snapshot.videoResolution,
      musicTitle: snapshot.musicTitle,
      musicGenre: snapshot.musicGenre,
      musicTonality: snapshot.musicTonality,
      musicLyrics: snapshot.musicLyrics,
      musicLanguage: snapshot.musicLanguage,
      musicOccasion: snapshot.musicOccasion,
      occasion: snapshot.musicOccasion,
      language: snapshot.musicLanguage,
      originalPrompt: snapshot.originalPrompt || snapshot.prompt,
      enhancedPrompt: isEnhanced ? snapshot.prompt : null,
      referenceFileName: snapshot.referenceFileName || null,
    };

    try {
      if (activeTab === 'image') {
        await onGenerateImage({
          prompt: finalPrompt,
          enhancedPrompt,
          modelId: activeModel?.id || snapshot.modelId,
          aspectRatio: snapshot.aspectRatio,
          referenceImageUrl: snapshot.referenceFileUrl || undefined,
          variantCount: snapshot.variantCount,
          clientSettings,
        });
      } else if (activeTab === 'video') {
        await onGenerateVideo({
          prompt: finalPrompt,
          enhancedPrompt,
          modelId: activeModel?.id || snapshot.modelId,
          durationSeconds: snapshot.videoDuration,
          resolution: snapshot.videoResolution,
          aspectRatio: snapshot.aspectRatio,
          referenceImageUrl: snapshot.referenceFileUrl || undefined,
          variantCount: snapshot.variantCount,
          clientSettings,
        });
      } else if (activeTab === 'music') {
        await onGenerateMusic({
          prompt: finalPrompt,
          enhancedPrompt,
          modelId: activeModel?.id || snapshot.modelId,
          genre: snapshot.musicGenre,
          tonality: snapshot.musicTonality,
          lyrics: snapshot.musicLyrics || undefined,
          title: snapshot.musicTitle || undefined,
          occasion: snapshot.musicOccasion,
          language: snapshot.musicLanguage,
          variantCount: effectiveCap,
          clientSettings: {
            ...clientSettings,
            title: snapshot.musicTitle || undefined,
            musicGenre: snapshot.musicGenre,
            musicTonality: snapshot.musicTonality,
            occasion: snapshot.musicOccasion,
            language: snapshot.musicLanguage,
          },
        });
      }

      // Success — clear ONLY this tab's prompt and attachment.
      // Model, aspect ratio and variant count persist: those are
      // working preferences, not one-shot input.
      patchTab({
        prompt: '',
        originalPrompt: '',
        referenceFileUrl: null,
        referenceFileName: '',
        musicTitle: activeTab === 'music' ? '' : current.musicTitle,
        musicLyrics: activeTab === 'music' ? '' : current.musicLyrics,
      });
      setEnhanceHistory([]);
      setEnhanceError(null);
    } catch (err) {
      // Failure — preserve everything so the user can retry immediately.
      console.warn('[Studio] Generation dispatch failed, prompt preserved:', err);
    }
  };

  const handleTriggerGenerate = async () => {
    if (!current.prompt.trim() || isGenerating) return;

    if (isPromoBlockedOnly) {
      onInsufficientCredits?.({
        required: quote.totalCost,
        available: availPaid,
        variantCount: quote.variantCount,
        unitCost: quote.unitCost,
        mediaType: activeTab,
        errorCode: 'PROMO_NOT_ALLOWED_FOR_MODEL',
        errorMessage: 'Free welcome credits can only be used on fast image models. Top up paid credits to use this model.',
      });
      return;
    }

    if (typeof walletBalance === 'number' && quote.totalCost > effectiveAvailableBalance) {
      onInsufficientCredits?.({
        required: quote.totalCost,
        available: effectiveAvailableBalance,
        variantCount: quote.variantCount,
        unitCost: quote.unitCost,
        mediaType: activeTab,
      });
      return;
    }

    if (quote.totalCost >= 5000) {
      setHighValueConfirmOpen(true);
      return;
    }

    await executeFinalGeneration();
  };

  const getModelMinPriceText = (m: AiModelConfig): string => {
    const pt = (m as AiModelConfig & { price_table?: ModelPriceTableEntry[] }).price_table;
    if (m.generation_type === 'video') {
      if (Array.isArray(pt) && pt.length > 0) {
        const minCredits = Math.min(...pt.map((r) => r.credits));
        return `from ${minCredits.toLocaleString()} credits`;
      }
      return `from ${m.credit_cost.toLocaleString()} credits`;
    }
    return `from ${m.credit_cost.toLocaleString()} credits`;
  };

  const getModelGroupLabel = (m: AiModelConfig): 'Fast & cheap' | 'Balanced' | 'Cinematic' => {
    if (m.quality_tier === 'lite') return 'Fast & cheap';
    if (m.quality_tier === 'standard') return 'Balanced';
    return 'Cinematic';
  };

  const groupedTabModels = (['Fast & cheap', 'Balanced', 'Cinematic'] as const)
    .map((group) => ({
      group,
      items: tabModels.filter((m) => getModelGroupLabel(m) === group),
    }))
    .filter((g) => g.items.length > 0);

  const isModelPlanLocked = (m: AiModelConfig): { locked: boolean; requiredTier?: PlanTier } => {
    const minTier = m.min_plan_tier;
    if (!minTier) return { locked: false };
    const userRank = TIER_RANK[planTier || 'free'] ?? 0;
    const reqRank = TIER_RANK[minTier] ?? 0;
    return { locked: userRank < reqRank, requiredTier: minTier };
  };

  const getRequiredTierForDuration = (dur: number): PlanTier => {
    const order: PlanTier[] = ['free', 'starter', 'creator', 'pro', 'studio'];
    for (const t of order) {
      const maxS =
        activeModel?.video_options?.max_duration_by_plan?.[t] ??
        planLimits?.[t]?.max_video_seconds ??
        (t === 'pro' || t === 'studio' ? 30 : 15);
      if (dur <= maxS) return t;
    }
    return 'pro';
  };

  const supportedRatios = activeModel?.supported_aspect_ratios;
  const aspectRatioOptions = [
    {
      value: '16:9',
      label: '16:9',
      disabled: supportedRatios ? !supportedRatios.includes('16:9') : false,
      disabledReason:
        supportedRatios && !supportedRatios.includes('16:9')
          ? `Not supported by ${activeModel?.display_name || 'selected model'}`
          : undefined,
    },
    {
      value: '9:16',
      label: '9:16',
      disabled: supportedRatios ? !supportedRatios.includes('9:16') : false,
      disabledReason:
        supportedRatios && !supportedRatios.includes('9:16')
          ? `Not supported by ${activeModel?.display_name || 'selected model'}`
          : undefined,
    },
    {
      value: '1:1',
      label: '1:1',
      disabled: supportedRatios ? !supportedRatios.includes('1:1') : false,
      disabledReason:
        supportedRatios && !supportedRatios.includes('1:1')
          ? `Not supported by ${activeModel?.display_name || 'selected model'}`
          : undefined,
    },
  ];

  const getPlaceholderText = () => {
    switch (activeTab) {
      case 'video':
        return 'What video would you like to create? (e.g. Cinematic aerial shot over Mount Cameroon...)';
      case 'music':
        return 'What music would you like to compose? (e.g. Upbeat Makossa rhythm with live brass...)';
      case 'image':
      default:
        return 'What can we create today? (e.g. Afrofuturistic portrait with glowing gold Ndop pattern...)';
    }
  };

  return (
    <GradientBorder mode="always" radius={24} thickness={1.5} glow className="w-full">
      <div className="rounded-[22.5px] bg-[#FFFFFF] dark:bg-[#18181B] p-3 sm:p-4 flex flex-col gap-3 shadow-xl">
        {/* ========================================================================= */}
        {/* 1. TOP ROW — MEDIA-TYPE TABS INSIDE THE BOX                                */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-1 p-0.5 rounded-full bg-black/5 dark:bg-white/5">
            <button
              type="button"
              onClick={() => onTabChange('image')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'image'
                  ? 'bg-brand-gradient text-white shadow-sm shadow-[#F86A00]/20'
                  : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
            >
              <ImageIcon size={14} />
              <span>Image</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('video')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'video'
                  ? 'bg-brand-gradient text-white shadow-sm shadow-[#F86A00]/20'
                  : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
            >
              <VideoIcon size={14} />
              <span>Video</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('music')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'music'
                  ? 'bg-brand-gradient text-white shadow-sm shadow-[#F86A00]/20'
                  : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
            >
              <MusicIcon size={14} />
              <span>Music</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] font-mono">
              Powered by Bidou AI
            </span>
          </div>
        </div>

        {/* Inline Enhance Error Alert (Section 2.3.1 & 4d) */}
        {enhanceError && (
          <InlineNotice
            variant={enhanceError.code === 'NETWORK_ERROR' ? 'error' : 'warning'}
            icon={Wand2}
            title={enhanceError.title}
            message={enhanceError.message}
            devHint={enhanceError.devHint}
            onRetry={enhanceError.canRetry ? handleEnhance : undefined}
            onDismiss={() => setEnhanceError(null)}
          />
        )}

        {/* Section 5.3.4: Reference file reuse notification note */}
        {referenceNote && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs animate-fade-in">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle size={14} className="shrink-0 text-amber-500" />
              <span className="truncate">{referenceNote}</span>
            </div>
            <button
              type="button"
              onClick={() => setReferenceNote(null)}
              className="text-[11px] font-semibold underline opacity-80 hover:opacity-100 cursor-pointer shrink-0 ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. PROMPT TEXTAREA (MAIN FREEFORM INPUT - SITS DIRECTLY IN SHELL)         */}
        {/* ========================================================================= */}
        <div className="relative w-full">
          <textarea
            ref={textareaRef}
            id="unified-prompt-input"
            rows={3}
            value={current.prompt}
            onChange={handlePromptChange}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleTriggerGenerate();
              }
            }}
            placeholder={getPlaceholderText()}
            className="w-full px-2 sm:px-3 py-1.5 bg-transparent text-base sm:text-sm text-[#1A1A1E] dark:text-[#F5F5F7] placeholder-[#8E8E98] dark:placeholder-[#71717A] focus:outline-none transition-colors resize-none leading-relaxed min-h-[110px] sm:min-h-[135px] max-h-[40dvh] field-sizing-content overflow-y-auto overscroll-contain prompt-box-scrollbar"
          />

          {/* Mobile Bottom Fade Mask Indicator: subtle visual clue when content overflows (hidden on desktop) */}
          <div
            aria-hidden="true"
            className={`sm:hidden pointer-events-none absolute bottom-0 left-0 right-0 h-7 bg-gradient-to-t from-[#FFFFFF] dark:from-[#18181B] to-transparent transition-opacity duration-200 ${
              canScrollDown ? 'opacity-90' : 'opacity-0'
            }`}
          />

          {/* Reference File Thumbnail Attachment Indicator */}
          {current.referenceFileUrl && (
            <div className="absolute bottom-2 right-2 flex items-center gap-2 p-1.5 pr-2.5 rounded-xl bg-black/80 text-white text-[11px] backdrop-blur-md">
              {current.referenceFileUrl.startsWith('data:image') ? (
                <img
                  src={current.referenceFileUrl}
                  alt="Ref"
                  className="w-6 h-6 object-cover rounded-lg"
                />
              ) : (
                <Upload size={14} className="text-[#FF8800]" />
              )}
              <span className="truncate max-w-[100px]">{current.referenceFileName || 'Attached'}</span>
              <button
                type="button"
                onClick={handleClearUpload}
                className="hover:text-[#E74C3C] transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. MEDIA-SPECIFIC EXTRA FIELDS (MUSIC TAB ONLY) — COLLAPSIBLE DISCLOSURE   */}
        {/* ========================================================================= */}
        {activeTab === 'music' && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setIsTrackDetailsOpen(!isTrackDetailsOpen)}
              className="flex items-center justify-between px-3 py-2 rounded-xl glass-panel text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:border-[#FF8800]/40 transition-all cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={13} className="text-[#F86A00]" />
                <span>Track details</span>
                <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] font-normal">
                  {current.musicTitle ? `(${current.musicTitle})` : '(Title, genre, lyrics & cover art)'}
                </span>
              </div>
              <ChevronDown
                size={14}
                className={`text-[#6B6B75] transition-transform duration-200 ${
                  isTrackDetailsOpen ? 'rotate-180 text-[#F86A00]' : ''
                }`}
              />
            </button>

            {isTrackDetailsOpen && (
              <div className="flex flex-col gap-3 p-3.5 rounded-2xl glass-panel-subtle border border-[#FF8800]/20 bg-black/5 dark:bg-white/5 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Song Title */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                      Track Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Soleil de Wouri"
                      value={current.musicTitle}
                      onChange={(e) => patchTab({ musicTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl glass-panel text-base sm:text-xs text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:ring-1 focus:ring-[#F86A00]"
                    />
                  </div>

                  {/* African Genre Dropdown */}
                  <div className="flex flex-col">
                    <CustomSelect
                      label="African Genre"
                      options={genreOptions(current.musicGenre)}
                      value={current.musicGenre}
                      onChange={(val) => patchTab({ musicGenre: val })}
                    />
                  </div>

                  {/* Tonality / Emotion Dropdown */}
                  <div className="flex flex-col">
                    <CustomSelect
                      label="Vibe & Tonality"
                      options={tonalityOptions()}
                      value={current.musicTonality}
                      onChange={(val) => patchTab({ musicTonality: val })}
                    />
                  </div>
                </div>

                {/* Lyrics Section */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[#FF8800]/10">
                  {lyricsError && (
                    <div className="mb-1">
                      <InlineNotice
                        variant="error"
                        title="Lyrics Generation Failed"
                        message={lyricsError}
                        onDismiss={() => setLyricsError(null)}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-1.5">
                      <FileMusic size={13} className="text-[#F86A00]" />
                      <span>Lyrics & Vocals (Optional)</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateLyricsClick}
                        disabled={isGeneratingLyrics}
                        className="flex items-center gap-1 text-[11px] font-bold text-brand-gradient hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50"
                      >
                        <Wand2 size={11} />
                        <span>{isGeneratingLyrics ? 'Writing…' : 'AI Lyricist'}</span>
                      </button>

                      {current.musicLyrics.trim() && (
                        <button
                          type="button"
                          onClick={handleRewriteLyricsClick}
                          disabled={isRewritingLyrics}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg glass-panel text-[10px] font-bold text-[#F86A00] hover:border-[#FF8800] transition-all cursor-pointer disabled:opacity-50"
                        >
                          <span>{isRewritingLyrics ? 'Enhancing…' : 'AI Rewrite (300 FCFA)'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="w-full">
                    <textarea
                      rows={2}
                      value={current.musicLyrics}
                      onChange={(e) => patchTab({ musicLyrics: e.target.value })}
                      placeholder="Write custom lyrics in French, English, Duala, Ewondo, or Pidgin — or click AI Lyricist above to auto-compose verse & chorus."
                      className="w-full p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 text-base sm:text-xs text-[#1A1A1E] dark:text-[#F5F5F7] placeholder-[#A0A0AA] focus:outline-none focus:border-[#FF8800]/40 transition-colors resize-none"
                    />
                  </div>
                </div>

                {/* Cover Art Generator Button */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-2">
                    {current.coverArtUrl ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={current.coverArtUrl}
                          alt="Cover"
                          className="w-8 h-8 rounded-lg object-cover border border-[#FF8800]"
                        />
                        <span className="text-[11px] text-[#2ECC71] font-semibold flex items-center gap-1">
                          <Check size={12} />
                          Cover Art Ready
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
                        Need album cover art for your track?
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleCoverArtClick}
                    disabled={isGeneratingCover}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel text-xs font-semibold text-[#F86A00] border border-[#FF8800]/30 hover:border-[#FF8800] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Disc size={13} />
                    <span>{isGeneratingCover ? 'Generating…' : `Generate Cover Art (${coverArtCost} FCFA)`}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Video Extra Specs (Dynamic Duration & Resolution driven by video_options) — Desktop only */}
        {activeTab === 'video' && (
          <div className="hidden lg:flex flex-col gap-1.5 px-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
              {/* Dynamic Duration Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">Duration:</span>
                {Array.isArray(videoDurationsOption) ? (
                  videoDurationsOption.map((dur) => {
                    const overPlan = dur > maxPlanVideoSeconds;
                    const reqTier = overPlan ? getRequiredTierForDuration(dur) : undefined;
                    const veo1080Blocked = isVeoModel && current.videoResolution === '1080p' && dur !== 8;
                    const isSelected = current.videoDuration === dur;
                    return (
                      <button
                        key={dur}
                        type="button"
                        disabled={veo1080Blocked}
                        onClick={() => handleVideoDurationChange(dur, false)}
                        title={
                          overPlan
                            ? `Requires ${reqTier?.toUpperCase()} plan — click to view plans`
                            : veo1080Blocked
                            ? '1080p on Veo 3.1 requires 8 s (switch to 720p for 4 s / 6 s)'
                            : `${dur} seconds`
                        }
                        className={`px-2.5 py-1 rounded-full font-mono text-[11px] flex items-center gap-1 transition-colors ${
                          overPlan
                            ? 'border border-amber-500/30 text-amber-500/80 hover:border-amber-500 cursor-pointer'
                            : veo1080Blocked
                            ? 'opacity-35 cursor-not-allowed border border-black/10 dark:border-white/10'
                            : isSelected
                            ? 'bg-brand-gradient text-white font-bold cursor-pointer'
                            : 'border border-black/10 dark:border-white/10 hover:border-[#FF8800]/40 text-[#6B6B75] dark:text-[#A0A0AA] cursor-pointer'
                        }`}
                      >
                        <span>{dur}s</span>
                        {overPlan && (
                          <>
                            <Lock size={10} />
                            <span className="uppercase text-[9px]">{reqTier}</span>
                          </>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={videoDurationsOption.min}
                      max={videoDurationsOption.max}
                      step={videoDurationsOption.step || 1}
                      value={current.videoDuration}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        handleVideoDurationChange(val, false);
                      }}
                      className="w-28 accent-[#F86A00] cursor-pointer"
                    />
                    <span className="font-mono text-[11px] font-bold text-[#F86A00] min-w-[32px]">
                      {current.videoDuration}s
                    </span>
                    {videoDurationsOption.max > maxPlanVideoSeconds && (
                      <button
                        type="button"
                        onClick={() => onRequestUpgrade?.()}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-mono hover:bg-amber-500/20 cursor-pointer"
                        title="Click to unlock longer clips"
                      >
                        <Lock size={10} />
                        <span>
                          Max {maxPlanVideoSeconds}s ({getRequiredTierForDuration(videoDurationsOption.max).toUpperCase()} for {videoDurationsOption.max}s)
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Dynamic Resolution Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">Quality:</span>
                {videoResolutions.map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => handleVideoResolutionChange(res, false)}
                    className={`px-2.5 py-1 rounded-full font-mono text-[11px] cursor-pointer transition-colors ${
                      current.videoResolution === res
                        ? 'bg-brand-gradient text-white font-bold'
                        : 'border border-black/10 dark:border-white/10 hover:border-[#FF8800]/40 text-[#6B6B75] dark:text-[#A0A0AA]'
                    }`}
                  >
                    {res === '1080p' ? '1080p FHD' : res === '720p' ? '720p HD' : '480p SD'}
                  </button>
                ))}
              </div>
            </div>

            {videoSnapNote && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-amber-500 font-medium">
                <span>{videoSnapNote}</span>
                <button
                  type="button"
                  onClick={() => setVideoSnapNote(null)}
                  className="text-[10px] underline opacity-80 hover:opacity-100 cursor-pointer"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. BOTTOM ROW — EXACT ORDER MANDATED BY SPEC (SECTION 3.5)                */}
        {/* Order: (1) '+' upload, (2) Model selector, (3) Aspect-ratio, (4) Buttons */}
        {/* ========================================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-black/5 dark:border-white/5">
          <div className="flex items-center flex-wrap gap-2 flex-1">
            {/* 1. '+' Upload Button */}
            <label
              title="Upload reference media"
              className="w-9 h-9 rounded-full border border-black/10 dark:border-white/10 hover:border-[#FF8800] dark:hover:border-[#FF8800] bg-black/[0.02] dark:bg-white/[0.03] flex items-center justify-center text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-all cursor-pointer shrink-0"
            >
              <Plus size={18} className="text-[#F86A00]" />
              <input
                type="file"
                accept={
                  activeTab === 'image'
                    ? 'image/*'
                    : activeTab === 'video'
                    ? 'image/*,video/*'
                    : 'audio/*,image/*'
                }
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* Mobile/Tablet Settings Trigger */}
            <button
              type="button"
              ref={settingsTriggerRef}
              onClick={openSettings}
              aria-label="Generation settings"
              className="w-9 h-9 rounded-full border border-black/10 dark:border-white/10 hover:border-[#FF8800] dark:hover:border-[#FF8800] bg-black/[0.02] dark:bg-white/[0.03] flex items-center justify-center text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-all cursor-pointer shrink-0 lg:hidden"
            >
              <Settings size={18} className="text-[#F86A00]" />
            </button>

            {/* Desktop Inline Controls */}
            <div className="hidden lg:flex items-center flex-wrap gap-2">
              {/* 2. Grouped Model Picker Popover */}
              <div className="relative" ref={modelPickerRef}>
                <button
                  type="button"
                  onClick={() => setModelPickerOpen((o) => !o)}
                  className="px-3 py-1.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 hover:border-[#FF8800]/50 flex items-center gap-2 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] transition-all cursor-pointer"
                >
                  <span className="truncate max-w-[150px]">{activeModel?.display_name || 'Select Model'}</span>
                  {activeModel?.promo_eligible && (
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                      Free credits OK
                    </span>
                  )}
                  {activeModel?.is_premium && (
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-[#FF8800]/15 text-[#FF8800] border border-[#FF8800]/30">
                      Premium
                    </span>
                  )}
                  <ChevronDown size={13} className={`text-[#6B6B75] transition-transform ${modelPickerOpen ? 'rotate-180 text-[#F86A00]' : ''}`} />
                </button>

                {modelPickerOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-80 max-h-96 overflow-y-auto rounded-2xl overlay-panel border border-[#FF8800]/25 shadow-2xl p-2 z-50">
                    {groupedTabModels.map((grp) => (
                      <div key={grp.group} className="mb-2 last:mb-0">
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA]">
                          {grp.group}
                        </div>
                        <div className="flex flex-col gap-1">
                          {grp.items.map((m) => {
                            const selected = m.id === current.modelId;
                            const { locked, requiredTier } = isModelPlanLocked(m);
                            const minPriceLabel = getModelMinPriceText(m);
                            const shortTag = m.is_premium
                              ? 'Premium'
                              : m.promo_eligible
                              ? 'Free credits OK'
                              : m.quality_tier === 'lite'
                              ? 'Fast'
                              : 'Standard';

                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  if (locked) {
                                    setModelPickerOpen(false);
                                    onRequestUpgrade?.();
                                    return;
                                  }
                                  patchTab({ modelId: m.id });
                                  setModelPickerOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                  selected
                                    ? 'bg-[#FF8800]/15 border border-[#FF8800]/40'
                                    : locked
                                    ? 'opacity-60 hover:bg-black/5 dark:hover:bg-white/5'
                                    : 'hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
                                      {m.display_name}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                        m.is_premium
                                          ? 'bg-[#FF8800]/15 text-[#FF8800] border border-[#FF8800]/30'
                                          : m.promo_eligible
                                          ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                          : 'bg-black/10 dark:bg-white/10 text-[#6B6B75] dark:text-[#A0A0AA]'
                                      }`}
                                    >
                                      {shortTag}
                                    </span>
                                    {locked && requiredTier && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-500 border border-amber-500/30">
                                        <Lock size={9} />
                                        {requiredTier}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] font-mono text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                                    {minPriceLabel}
                                  </div>
                                </div>
                                {selected && <Check size={14} className="text-[#F86A00] shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Aspect-Ratio Selector */}
              {activeTab !== 'music' && (
                <div className="w-36 sm:w-40">
                  <CustomSelect
                    label=""
                    variant="pill"
                    forcePlacement="top"
                    options={aspectRatioOptions}
                    value={current.aspectRatio}
                    onChange={(val) => patchTab({ aspectRatio: val as any })}
                  />
                </div>
              )}

              {/* 3.1 & 3.2: Variant Count Selector */}
              {activeTab !== 'music' ? (
                <div className="flex items-center gap-1 p-0.5 rounded-full bg-black/5 dark:bg-white/5 shrink-0">
                  {[1, 2, 3, 4].map((n) => {
                    const isTierLocked = n > tierCap;
                    const modelDisabled = n > maxVariants;
                    const costForN = n * quote.unitCost;
                    const creditExceeded = typeof walletBalance === 'number' && costForN > effectiveAvailableBalance;
                    const disabled = modelDisabled || creditExceeded;

                    let tooltip = `Generate ${n} variant${n > 1 ? 's' : ''}`;
                    if (isTierLocked) {
                      const reqTier = n === 2 ? 'Starter' : n === 3 ? 'Creator' : 'Pro';
                      tooltip = `Upgrade to ${reqTier} to generate ${n} variants at once`;
                    } else if (modelDisabled) {
                      tooltip = `${activeModel?.display_name || 'This model'} supports up to ${maxVariants} at once`;
                    } else if (creditExceeded) {
                      tooltip = maxAffordable > 0
                        ? `Exceeds balance. Affordable up to ${maxAffordable} variant${maxAffordable > 1 ? 's' : ''}`
                        : 'Exceeds balance';
                    }

                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={!isTierLocked && disabled}
                        onClick={() => {
                          if (isTierLocked) {
                            onRequestUpgrade?.();
                            return;
                          }
                          patchTab({ variantCount: n });
                        }}
                        title={tooltip}
                        className={`px-2.5 py-1 rounded-full font-mono text-[11px] transition-colors flex items-center gap-1 cursor-pointer ${
                          isTierLocked
                            ? 'opacity-40 hover:opacity-80 text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00]'
                            : current.variantCount === n
                            ? 'bg-brand-gradient text-white font-bold'
                            : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                        } ${!isTierLocked && disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        <span>{n}×</span>
                        {isTierLocked && <Lock size={10} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ) : tierCap <= 1 ? (
                <button
                  type="button"
                  onClick={() => onRequestUpgrade?.()}
                  title="Upgrade to Starter to generate 2 takes at once"
                  className="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 font-mono text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <span>1 take · Free</span>
                  <Lock size={10} className="shrink-0" />
                </button>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 font-mono text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] shrink-0">
                  2 takes included
                </span>
              )}
            </div>
          </div>

          {/* 4. Live Cost Breakdown, Bucket Indicator, TEST MODE badge & Generate Button */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 justify-end">
            {providerEnv === 'dev' && (
              <span
                title="Provider environment is set to dev — caps & test safety active"
                className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30 shrink-0"
              >
                TEST MODE
              </span>
            )}
            {hasSimulatedVariants && (
              <span
                title="Current preview includes simulated test samples"
                className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shrink-0"
              >
                Test sample
              </span>
            )}

            <div className="flex flex-col items-end leading-tight px-1 whitespace-nowrap">
              <span className={`text-xs font-mono font-bold ${isInsufficient || isPromoBlockedOnly ? 'text-rose-500' : 'text-[#1A1A1E] dark:text-[#F5F5F7]'}`}>
                {quote.totalCost.toLocaleString()} credits
                {quote.variantCount > 1 && ` (${quote.variantCount} × ${quote.unitCost.toLocaleString()})`}
              </span>
              {isPerSecondVideo && perSecondRate ? (
                <span className="text-[10px] font-mono text-[#F86A00]">
                  {current.videoDuration} s × {perSecondRate.toLocaleString()} credits/s = {quote.unitCost.toLocaleString()} credits
                </span>
              ) : null}
              {isPromoBlockedOnly ? (
                <button
                  type="button"
                  onClick={() => onRequestUpgrade?.()}
                  className="text-[10px] font-mono text-amber-500 hover:underline font-semibold cursor-pointer"
                >
                  Requires paid credits — free credits work on fast image models
                </button>
              ) : isInsufficient ? (
                <span className="text-[10px] font-mono text-rose-500 font-semibold">
                  Need {shortfall.toLocaleString()} more
                </span>
              ) : bucketNoticeText ? (
                <span className="text-[10px] font-mono text-[#6B6B75] dark:text-[#A0A0AA]">
                  {bucketNoticeText}
                </span>
              ) : null}
            </div>

            {current.originalPrompt && current.originalPrompt !== current.prompt && (
              <button
                type="button"
                onClick={() => {
                  patchTab({ prompt: current.originalPrompt, originalPrompt: '' });
                  setEnhanceHistory([]);
                  setEnhanceError(null);
                }}
                className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors cursor-pointer px-2 py-1 whitespace-nowrap underline underline-offset-2"
                title="Revert to your original un-enhanced prompt"
              >
                Revert to my prompt
              </button>
            )}

            <button
              type="button"
              onClick={handleEnhance}
              disabled={isEnhancing || !current.prompt.trim()}
              title="Enhance prompt with Gemini AI"
              className="h-9 min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] hover:border-[#FF8800]/40 transition-all cursor-pointer disabled:opacity-40"
            >
              <Wand2 size={13} className={isEnhancing ? 'animate-spin text-[#F86A00]' : ''} />
              <span className="hidden md:inline">Enhance</span>
            </button>

            <button
              type="button"
              id="unified-generate-btn"
              onClick={handleTriggerGenerate}
              disabled={!current.prompt.trim() || isGenerating || (isInsufficient && !isPromoBlockedOnly)}
              aria-disabled={!current.prompt.trim() || isGenerating || (isInsufficient && !isPromoBlockedOnly)}
              aria-busy={isGenerating}
              aria-label={
                activeTab === 'image'
                  ? 'Generate image'
                  : activeTab === 'video'
                  ? 'Generate video'
                  : 'Compose track'
              }
              title={
                isPromoBlockedOnly
                  ? 'Requires paid credits — click to top up'
                  : isInsufficient
                  ? `Not enough credits. Need ${shortfall.toLocaleString()} more`
                  : activeTab === 'image'
                  ? 'Generate image'
                  : activeTab === 'video'
                  ? 'Generate video'
                  : 'Compose track'
              }
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full shrink-0 flex items-center justify-center transition-all ${
                isPromoBlockedOnly
                  ? 'bg-amber-500/90 text-white border border-amber-400/40 shadow-sm cursor-pointer'
                  : isInsufficient
                  ? 'bg-rose-600/80 text-white/90 border border-rose-500/40 shadow-sm shadow-rose-600/20 cursor-not-allowed opacity-75'
                  : !current.prompt.trim() || isGenerating
                  ? 'bg-brand-gradient text-white opacity-40 cursor-not-allowed'
                  : 'bg-brand-gradient text-white shadow-md shadow-[#F86A00]/25 hover:opacity-95 active:scale-95 cursor-pointer'
              }`}
            >
              {isGenerating ? (
                <svg
                  className="animate-spin w-[18px] h-[18px] text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    opacity="0.25"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeDasharray="56"
                    strokeDashoffset="42"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <CornerDownLeft size={18} className="text-white" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* High-Value Confirmation Modal (>= 5000 credits, Section 3.3) */}
      {highValueConfirmOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-[#18181B] p-6 overflow-hidden border border-[#FF8800]/30 shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-brand-gradient" />
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#FFB020]/15 text-[#FFB020] flex items-center justify-center mb-3">
                <AlertCircle size={26} />
              </div>
              <h4 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7] mb-1">
                Confirm Generation
              </h4>
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mb-4 leading-relaxed">
                This will use <strong className="text-[#F86A00] font-mono font-bold">{quote.totalCost.toLocaleString()} credits</strong> ({quote.variantCount} × {quote.unitCost.toLocaleString()}). Continue?
              </p>
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setHighValueConfirmOpen(false)}
                  className="flex-1 py-2.5 rounded-xl glass-panel text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setHighValueConfirmOpen(false);
                    await executeFinalGeneration();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-brand-gradient text-xs font-bold text-white shadow-md shadow-[#F86A00]/25 hover:opacity-95 cursor-pointer"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Mobile/Tablet Per-Tab Settings Slide-in Sheet (Section 4 — Issue 2) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {settingsModalOpen && draft && (() => {
            const draftModel = tabModels.find((m) => m.id === draft.modelId) || activeModel;
            const draftSupportedRatios = draftModel?.supported_aspect_ratios || ['16:9', '9:16', '1:1'];
            const draftMaxVariants = draftModel?.max_concurrent_variants ?? 1;

            const handleSelectModel = (m: AiModelConfig) => {
              const modelMinTier = (m as any).min_plan_tier as PlanTier | undefined;
              const isLocked = modelMinTier && planTier ? (
                modelMinTier === 'studio' ? planTier !== 'studio' :
                modelMinTier === 'pro' ? !['pro', 'studio'].includes(planTier) :
                modelMinTier === 'creator' ? !['creator', 'pro', 'studio'].includes(planTier) :
                modelMinTier === 'starter' ? planTier === 'free' : false
              ) : false;

              if (isLocked) {
                closeSettings();
                onRequestUpgrade?.();
                return;
              }

              let nextRatio = draft.aspectRatio;
              if (
                m.supported_aspect_ratios &&
                m.supported_aspect_ratios.length > 0 &&
                !m.supported_aspect_ratios.includes(nextRatio)
              ) {
                nextRatio = m.supported_aspect_ratios[0] as any;
              }

              const newMaxVariants = m.max_concurrent_variants ?? 1;
              const newEffectiveMax = activeTab === 'music'
                ? Math.min(2, tierCap)
                : Math.min(newMaxVariants, tierCap);
              const nextVariants = Math.min(draft.variantCount, newEffectiveMax);

              setDraft((d) => d ? {
                ...d,
                modelId: m.id,
                aspectRatio: nextRatio,
                variantCount: Math.max(1, nextVariants),
              } : d);
            };

            const saveSettings = () => {
              if (draft) {
                patchTab({
                  modelId: draft.modelId,
                  aspectRatio: draft.aspectRatio,
                  variantCount: draft.variantCount,
                  videoDuration: draft.videoDuration,
                  videoResolution: draft.videoResolution,
                });
              }
              closeSettings();
            };

            return (
              <div className="fixed inset-0 z-[60] lg:hidden">
                {/* Dimmed Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={closeSettings}
                  className="absolute inset-0 bg-black/60 backdrop-blur-md"
                />

                {/* Slide-In from RIGHT (matching specification) */}
                <motion.aside
                  ref={modalPanelRef}
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                  className="absolute right-0 top-0 bottom-0 w-[min(92vw,380px)] h-[100dvh] overlay-panel border-l border-[#FF8800]/25 flex flex-col overflow-hidden shadow-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="settings-sheet-title"
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && modalPanelRef.current) {
                      const focusableEls = modalPanelRef.current.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                      );
                      if (focusableEls.length > 0) {
                        const firstEl = focusableEls[0];
                        const lastEl = focusableEls[focusableEls.length - 1];
                        if (e.shiftKey && document.activeElement === firstEl) {
                          e.preventDefault();
                          lastEl.focus();
                        } else if (!e.shiftKey && document.activeElement === lastEl) {
                          e.preventDefault();
                          firstEl.focus();
                        }
                      }
                    }
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-black/5 dark:border-white/5 shrink-0">
                    <div className="flex items-center gap-2">
                      <Settings size={18} className="text-[#F86A00]" />
                      <h3 id="settings-sheet-title" className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                        {activeTab === 'image' ? 'Image Settings' : activeTab === 'video' ? 'Video Settings' : 'Music Settings'}
                      </h3>
                    </div>
                    <button
                      type="button"
                      ref={closeButtonRef}
                      onClick={closeSettings}
                      aria-label="Close settings"
                      className="p-1.5 rounded-lg text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Body — Exactly ONE scrollable container */}
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-5 app-scroll">
                    {/* 1. Model Selector — Grouped Inline Radio Cards */}
                    <div className="flex flex-col gap-3">
                      <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                        Model
                      </label>
                      {groupedTabModels.map((grp) => (
                        <div key={grp.group} className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] px-1">
                            {grp.group}
                          </span>
                          {grp.items.map((m) => {
                            const isSelected = draft.modelId === m.id;
                            const { locked: isLocked, requiredTier: modelMinTier } = isModelPlanLocked(m);
                            const minPriceLabel = getModelMinPriceText(m);
                            const shortTag = m.is_premium
                              ? 'Premium'
                              : m.promo_eligible
                              ? 'Free credits OK'
                              : m.quality_tier === 'lite'
                              ? 'Fast'
                              : 'Standard';

                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => handleSelectModel(m)}
                                className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                                  isSelected
                                    ? 'border-[#FF8800] bg-[#FF8800]/10 dark:bg-[#FF8800]/15'
                                    : 'border-black/10 dark:border-white/10 hover:border-[#FF8800]/40 bg-black/[0.02] dark:bg-white/[0.02]'
                                } ${isLocked ? 'opacity-60' : ''}`}
                              >
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-xs font-bold ${isSelected ? 'text-[#F86A00]' : 'text-[#1A1A1E] dark:text-[#F5F5F7]'}`}>
                                      {m.display_name}
                                    </span>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                        m.is_premium
                                          ? 'bg-[#FF8800]/20 text-[#F86A00]'
                                          : m.promo_eligible
                                          ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                          : 'bg-black/10 dark:bg-white/10 text-[#6B6B75] dark:text-[#A0A0AA]'
                                      }`}
                                    >
                                      {shortTag}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-mono text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                                    {minPriceLabel}
                                    {modelMinTier && modelMinTier !== 'free' && ` · ${modelMinTier.toUpperCase()}`}
                                  </span>
                                </div>

                                <div className="shrink-0 ml-2">
                                  {isLocked ? (
                                    <div className="flex items-center gap-1 text-[11px] font-semibold text-[#F86A00]">
                                      <Lock size={12} />
                                      <span>{modelMinTier ? modelMinTier.toUpperCase() : 'Upgrade'}</span>
                                    </div>
                                  ) : isSelected ? (
                                    <div className="w-5 h-5 rounded-full bg-brand-gradient text-white flex items-center justify-center">
                                      <Check size={12} strokeWidth={3} />
                                    </div>
                                  ) : (
                                    <div className="w-5 h-5 rounded-full border border-black/20 dark:border-white/20" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* 2. Video Extra Specs (Video Tab only — Dynamic from draftModel.video_options) */}
                    {activeTab === 'video' && (() => {
                      const dRes: Array<'480p' | '720p' | '1080p'> =
                        (draftModel?.video_options?.resolutions as Array<'480p' | '720p' | '1080p'> | undefined)?.length
                          ? (draftModel!.video_options!.resolutions as Array<'480p' | '720p' | '1080p'>)
                          : ['720p', '1080p'];
                      const dDurOpt = draftModel?.video_options?.durations ?? [4, 6, 8];
                      const dIsVeo = Boolean(draftModel?.model_name?.startsWith('veo_'));
                      const dMaxPlan =
                        draftModel?.video_options?.max_duration_by_plan?.[planTier] ??
                        planLimits?.[planTier]?.max_video_seconds ??
                        (planTier === 'pro' || planTier === 'studio' ? 30 : 15);

                      return (
                        <div className="flex flex-col gap-4 pt-3 border-t border-black/5 dark:border-white/5">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                              Duration
                            </label>
                            {Array.isArray(dDurOpt) ? (
                              <div className="grid grid-cols-3 gap-2">
                                {dDurOpt.map((dur) => {
                                  const overPlan = dur > dMaxPlan;
                                  const reqTier = overPlan ? getRequiredTierForDuration(dur) : undefined;
                                  const veo1080Blocked = dIsVeo && draft.videoResolution === '1080p' && dur !== 8;
                                  const isSelected = draft.videoDuration === dur;
                                  return (
                                    <button
                                      key={dur}
                                      type="button"
                                      disabled={veo1080Blocked}
                                      onClick={() => handleVideoDurationChange(dur, true)}
                                      className={`py-2 px-3 rounded-xl font-mono text-xs transition-colors text-center flex items-center justify-center gap-1 ${
                                        overPlan
                                          ? 'border border-amber-500/30 text-amber-500 cursor-pointer'
                                          : veo1080Blocked
                                          ? 'opacity-35 cursor-not-allowed border border-black/10 dark:border-white/10'
                                          : isSelected
                                          ? 'bg-brand-gradient text-white font-bold shadow-sm cursor-pointer'
                                          : 'border border-black/10 dark:border-white/10 hover:border-[#FF8800]/40 text-[#6B6B75] dark:text-[#A0A0AA] cursor-pointer'
                                      }`}
                                    >
                                      <span>{dur}s</span>
                                      {overPlan && (
                                        <>
                                          <Lock size={10} />
                                          <span className="uppercase text-[9px]">{reqTier}</span>
                                        </>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                  <input
                                    type="range"
                                    min={dDurOpt.min}
                                    max={dDurOpt.max}
                                    step={dDurOpt.step || 1}
                                    value={draft.videoDuration}
                                    onChange={(e) => handleVideoDurationChange(Number(e.target.value), true)}
                                    className="flex-1 accent-[#F86A00]"
                                  />
                                  <span className="font-mono text-xs font-bold text-[#F86A00] min-w-[36px]">
                                    {draft.videoDuration}s
                                  </span>
                                </div>
                                {dDurOpt.max > dMaxPlan && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      closeSettings();
                                      onRequestUpgrade?.();
                                    }}
                                    className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[11px] font-mono cursor-pointer"
                                  >
                                    <span>Max {dMaxPlan}s on {planTier.toUpperCase()}</span>
                                    <span className="flex items-center gap-1 font-bold">
                                      <Lock size={10} />
                                      Unlock {dDurOpt.max}s ({getRequiredTierForDuration(dDurOpt.max).toUpperCase()})
                                    </span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                              Quality
                            </label>
                            <div className={`grid grid-cols-${Math.min(3, dRes.length)} gap-2`}>
                              {dRes.map((res) => (
                                <button
                                  key={res}
                                  type="button"
                                  onClick={() => handleVideoResolutionChange(res, true)}
                                  className={`py-2 px-3 rounded-xl font-mono text-xs cursor-pointer transition-colors text-center ${
                                    draft.videoResolution === res
                                      ? 'bg-brand-gradient text-white font-bold shadow-sm'
                                      : 'border border-black/10 dark:border-white/10 hover:border-[#FF8800]/40 text-[#6B6B75] dark:text-[#A0A0AA]'
                                  }`}
                                >
                                  {res === '1080p' ? '1080p FHD' : res === '720p' ? '720p HD' : '480p SD'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 3. Aspect Ratio (Image & Video Tabs) — 3 Inline Buttons */}
                    {activeTab !== 'music' && (
                      <div className="flex flex-col gap-1.5 pt-3 border-t border-black/5 dark:border-white/5">
                        <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                          Aspect Ratio
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['16:9', '9:16', '1:1'] as const).map((ratio) => {
                            const isSupported = draftSupportedRatios.includes(ratio);
                            const isSelected = draft.aspectRatio === ratio;

                            return (
                              <button
                                key={ratio}
                                type="button"
                                disabled={!isSupported}
                                onClick={() => setDraft((d) => d ? { ...d, aspectRatio: ratio } : d)}
                                title={!isSupported ? `Not supported by ${draftModel?.display_name || 'selected model'}` : undefined}
                                className={`py-2.5 px-3 rounded-xl font-mono text-xs cursor-pointer transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                                  isSelected
                                    ? 'bg-brand-gradient text-white font-bold shadow-sm'
                                    : isSupported
                                    ? 'border border-black/10 dark:border-white/10 hover:border-[#FF8800]/40 text-[#6B6B75] dark:text-[#A0A0AA]'
                                    : 'border border-black/5 dark:border-white/5 text-[#A0A0AA]/40 opacity-40 cursor-not-allowed'
                                }`}
                              >
                                <span>{ratio}</span>
                                <span className="text-[10px] opacity-75">
                                  {ratio === '16:9' ? 'Landscape' : ratio === '9:16' ? 'Portrait' : 'Square'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 4. Variant Count (Image & Video) or Takes Display (Music) */}
                    <div className="flex flex-col gap-1.5 pt-3 border-t border-black/5 dark:border-white/5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                          {activeTab !== 'music' ? `Parallel Variants (${draft.variantCount}×)` : 'Music Generation Takes'}
                        </label>
                      </div>
                      {activeTab !== 'music' ? (
                        <div className="grid grid-cols-4 gap-2 p-1 rounded-2xl bg-black/5 dark:bg-white/5">
                          {[1, 2, 3, 4].map((n) => {
                            const isTierLocked = n > tierCap;
                            const modelDisabled = n > draftMaxVariants;
                            const costForN = n * (draftModel?.credit_cost ?? 10);
                            const creditExceeded = typeof walletBalance === 'number' && costForN > walletBalance;
                            const disabled = modelDisabled || creditExceeded;

                            let tooltip = `Generate ${n} variant${n > 1 ? 's' : ''}`;
                            if (isTierLocked) {
                              const reqTier = n === 2 ? 'Starter' : n === 3 ? 'Creator' : 'Pro';
                              tooltip = `Upgrade to ${reqTier} to generate ${n} variants at once`;
                            } else if (modelDisabled) {
                              tooltip = `${draftModel?.display_name || 'This model'} supports up to ${draftMaxVariants} at once`;
                            } else if (creditExceeded) {
                              tooltip = maxAffordable > 0
                                ? `Exceeds balance. Affordable up to ${maxAffordable} variant${maxAffordable > 1 ? 's' : ''}`
                                : 'Exceeds balance';
                            }

                            return (
                              <button
                                key={n}
                                type="button"
                                disabled={!isTierLocked && disabled}
                                onClick={() => {
                                  if (isTierLocked) {
                                    closeSettings();
                                    onRequestUpgrade?.();
                                    return;
                                  }
                                  setDraft((d) => d ? { ...d, variantCount: n } : d);
                                }}
                                title={tooltip}
                                className={`py-2 rounded-xl font-mono text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                                  isTierLocked
                                    ? 'opacity-40 hover:opacity-80 text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00]'
                                    : draft.variantCount === n
                                    ? 'bg-brand-gradient text-white font-bold shadow-sm'
                                    : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                                } ${!isTierLocked && disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                              >
                                <span>{n}×</span>
                                {isTierLocked && <Lock size={10} className="shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      ) : tierCap <= 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            closeSettings();
                            onRequestUpgrade?.();
                          }}
                          title="Upgrade to Starter to generate 2 takes at once"
                          className="w-full py-2.5 px-3 rounded-xl bg-black/5 dark:bg-white/5 font-mono text-xs text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#F86A00] transition-colors flex items-center justify-between cursor-pointer"
                        >
                          <span>1 take · Free Plan</span>
                          <div className="flex items-center gap-1 text-[11px] text-[#F86A00]">
                            <Lock size={12} className="shrink-0" />
                            <span>Upgrade to 2 takes</span>
                          </div>
                        </button>
                      ) : (
                        <div className="w-full py-2.5 px-3 rounded-xl bg-black/5 dark:bg-white/5 font-mono text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                          2 takes included ({planTier} Plan)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer — Shrink 0, calls saveSettings */}
                  <div className="p-4 border-t border-black/5 dark:border-white/5 shrink-0 bg-white/80 dark:bg-[#18181B]/80 backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={saveSettings}
                      className="w-full py-3 rounded-xl bg-brand-gradient text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity cursor-pointer text-center"
                    >
                      Update Settings
                    </button>
                  </div>
                </motion.aside>
              </div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}
    </GradientBorder>
  );
};
