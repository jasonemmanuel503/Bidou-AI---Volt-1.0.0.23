import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderPlus,
  Trash2,
  Sparkles,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  RefreshCw,
  Wand2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Image as ImageIcon,
} from 'lucide-react';
import { CircularAudioPlayer } from './CircularAudioPlayer';
import { usePlayableUrl, posterFor } from '../../services/media';
import { downloadAsset, getAssetFilename } from '../../lib/downloadAsset';
import { AiModelConfig } from '../../types';
import { INITIAL_AI_MODELS } from '../../services/configData';
import { getAuthToken } from '../../services/authToken';
import { toast } from '../../services/toast';
import { formatApiError } from '../../lib/errorMapping';

export interface LightboxItem {
  id: string;
  type: 'image' | 'video' | 'music' | 'voice';
  url: string;
  thumbnailUrl?: string;
  coverArtUrl?: string;
  prompt?: string;
  modelId?: string;
  modelName?: string;
  resolution?: string;
  durationSeconds?: number;
  creditCost?: number;
  variantId?: string;
  jobId?: string;
  aspectRatio?: string;
  // Metadata for action callbacks
  rawItem?: any;
}

export interface MediaLightboxProps {
  items: LightboxItem[];
  initialIndex?: number;
  mode?: 'full' | 'half' | 'minimized';
  onModeChange?: (mode: 'full' | 'half' | 'minimized') => void;
  onClose: () => void;
  onDownload?: (item: LightboxItem) => void;
  onUpscale?: (item: LightboxItem) => void;
  onAddToProject?: (item: LightboxItem) => void;
  onDelete?: (item: LightboxItem) => void | Promise<void>;
  onRestore?: (item: LightboxItem) => void;
  onRemix?: (prompt: string, type: any) => void;
  onReusePrompt?: (job: any) => void;
  models?: AiModelConfig[];
  onRefreshWallet?: () => void;
}

/**
 * Subcomponent for video playback in lightbox with signed same-origin URL and playback position preservation.
 */
interface LightboxVideoProps {
  variantId?: string;
  fallbackUrl: string;
  poster?: string;
  initialTime?: number;
  autoPlay?: boolean;
  isMuted?: boolean;
  className?: string;
  onSnapshot?: (snapshot: { currentTime: number; wasPlaying: boolean }) => void;
}

const LightboxVideo: React.FC<LightboxVideoProps> = ({
  variantId,
  fallbackUrl,
  poster,
  initialTime = 0,
  autoPlay = true,
  isMuted = false,
  className = '',
  onSnapshot,
}) => {
  const {
    url: playableUrl,
    isLoading,
    error,
    retry,
  } = usePlayableUrl(variantId, fallbackUrl, { mediaType: 'video' });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const initialTimeAppliedRef = useRef(false);

  useEffect(() => {
    initialTimeAppliedRef.current = false;
  }, [variantId, fallbackUrl]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
          <Loader2 size={24} className="animate-spin text-white" />
        </div>
      )}

      {error && !playableUrl ? (
        <div className="flex flex-col items-center justify-center gap-2 text-center p-4 bg-black/50 rounded-xl border border-white/10 z-10">
          <span className="text-xs text-[#A0A0AA]">Video playback unavailable</span>
          <button
            type="button"
            onClick={retry}
            className="text-xs text-[#FF8800] underline font-medium hover:text-amber-400 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : playableUrl ? (
        <video
          ref={videoRef}
          src={playableUrl}
          controls
          playsInline
          autoPlay={autoPlay}
          muted={isMuted}
          poster={posterFor(poster, playableUrl)}
          className={className}
          onLoadedMetadata={(e) => {
            if (initialTime > 0 && !initialTimeAppliedRef.current) {
              initialTimeAppliedRef.current = true;
              e.currentTarget.currentTime = initialTime;
            }
          }}
          onTimeUpdate={(e) => {
            onSnapshot?.({
              currentTime: e.currentTarget.currentTime,
              wasPlaying: !e.currentTarget.paused,
            });
          }}
          onPlay={(e) => {
            onSnapshot?.({
              currentTime: e.currentTarget.currentTime,
              wasPlaying: true,
            });
          }}
          onPause={(e) => {
            onSnapshot?.({
              currentTime: e.currentTarget.currentTime,
              wasPlaying: false,
            });
          }}
        />
      ) : null}
    </div>
  );
};

export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  items,
  initialIndex = 0,
  mode: initialMode = 'full',
  onModeChange,
  onClose,
  onDownload,
  onUpscale,
  onAddToProject,
  onDelete,
  onRestore,
  onRemix,
  onReusePrompt,
  models,
  onRefreshWallet,
}) => {
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(initialIndex, items.length - 1))
  );
  // Three window states: 'full' (inset-0), 'half' (70vw/70vh), 'minimized' (280px docked bottom-4 right-4)
  const [windowState, setWindowState] = useState<'full' | 'half' | 'minimized'>(initialMode);

  const updateWindowState = (newMode: 'full' | 'half' | 'minimized') => {
    setWindowState(newMode);
    onModeChange?.(newMode);
  };
  const [isMuted, setIsMuted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pre-download choice and upscale states
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isUpscalingScale, setIsUpscalingScale] = useState<string | null>(null);
  const [upscaleSuccessScale, setUpscaleSuccessScale] = useState<string | null>(null);
  const [upscaleError, setUpscaleError] = useState<{
    message: string;
    type: 'upscale' | 'download';
    downloadUrl?: string;
    scale?: string;
  } | null>(null);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);

  // References for focus trap & scroll lock
  const triggerElementRef = useRef<Element | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Touch swipe support (Mobile)
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const currentItem: LightboxItem | undefined = items[currentIndex];

  // Phase 5.4: Lift playback state (currentTime & wasPlaying) so minimizing/expanding preserves time
  const [mediaSnapshot, setMediaSnapshot] = useState<{
    itemId: string;
    currentTime: number;
    wasPlaying: boolean;
  }>({
    itemId: currentItem?.id || '',
    currentTime: 0,
    wasPlaying: true,
  });

  const handleMediaSnapshot = useCallback(
    (snap: { currentTime: number; wasPlaying: boolean }) => {
      if (!currentItem) return;
      setMediaSnapshot({
        itemId: currentItem.id,
        currentTime: snap.currentTime,
        wasPlaying: snap.wasPlaying,
      });
    },
    [currentItem]
  );

  // Capture previously focused element on mount to restore upon close
  useEffect(() => {
    triggerElementRef.current = document.activeElement;
    return () => {
      if (triggerElementRef.current && (triggerElementRef.current as HTMLElement).focus) {
        (triggerElementRef.current as HTMLElement).focus();
      }
    };
  }, []);

  // Sync index if initialIndex changes
  useEffect(() => {
    setCurrentIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
  }, [initialIndex, items.length]);

  // Lock body scroll and prevent layout shift when full or half mode is active
  useEffect(() => {
    if (windowState === 'minimized') {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      return;
    }

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [windowState]);

  // Focus trap for accessibility
  useEffect(() => {
    if (windowState === 'minimized') return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(dialog.querySelectorAll(focusableSelector)) as HTMLElement[];
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    dialog.addEventListener('keydown', handleTabKey);
    return () => dialog.removeEventListener('keydown', handleTabKey);
  }, [windowState]);

  // Navigation handlers — reset media snapshot when moving to another take
  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => {
      const nextIdx = prev > 0 ? prev - 1 : items.length - 1;
      setMediaSnapshot({
        itemId: items[nextIdx]?.id || '',
        currentTime: 0,
        wasPlaying: true,
      });
      return nextIdx;
    });
  }, [items]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const nextIdx = prev < items.length - 1 ? prev + 1 : 0;
      setMediaSnapshot({
        itemId: items[nextIdx]?.id || '',
        currentTime: 0,
        wasPlaying: true,
      });
      return nextIdx;
    });
  }, [items]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          setWindowState((prev) => (prev === 'full' ? 'half' : 'full'));
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setIsMuted((prev) => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrev, handleNext]);

  // Touch swipe handling (Left / Right / Down to close)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
    const diffY = e.changedTouches[0].clientY - touchStartYRef.current;

    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX > 60) handlePrev();
      else if (diffX < -60) handleNext();
    } else {
      // Swipe down to close
      if (diffY > 80) onClose();
    }
  };

  if (!currentItem) return null;

  // Render poster src with media-fragment fallback
  const posterSrc = currentItem.thumbnailUrl ?? `${currentItem.url}#t=0.1`;

  // Determine available scales based on producing model max_upscale
  const availableScales = useMemo(() => {
    if (!currentItem || currentItem.type !== 'image') return [];
    const modelList = models && models.length > 0 ? models : INITIAL_AI_MODELS;
    const model = modelList.find(
      (m) =>
        (currentItem.modelId && m.id === currentItem.modelId) ||
        (currentItem.modelName && (m.model_name === currentItem.modelName || m.display_name === currentItem.modelName)) ||
        (currentItem.rawItem?.model_id && m.id === currentItem.rawItem.model_id) ||
        (currentItem.rawItem?.model_name && m.model_name === currentItem.rawItem.model_name) ||
        (currentItem.rawItem?.job?.model_id && m.id === currentItem.rawItem.job.model_id) ||
        (currentItem.rawItem?.job?.model_name && m.model_name === currentItem.rawItem.job.model_name)
    );
    const maxScale = model?.max_upscale || '2k';
    const SCALE_ORDER: Record<string, number> = { '720p': 1, '1080p': 2, '1k': 2, '2k': 3, '4k': 4 };
    const maxRank = SCALE_ORDER[maxScale] || 3;

    const list = [
      { scale: '1k', label: '1K Standard', cost: 35, rank: 2 },
      { scale: '2k', label: '2K Quad HD', cost: 70, rank: 3 },
      { scale: '4k', label: '4K Ultra HD', cost: 140, rank: 4 },
    ];
    return list.filter((item) => item.rank <= maxRank);
  }, [currentItem, models]);

  // Reset menu and error states when changing item
  useEffect(() => {
    setShowDownloadMenu(false);
    setUpscaleError(null);
    setUpscaleSuccessScale(null);
  }, [currentIndex, currentItem?.id]);

  // Click outside listener for download menu popover
  useEffect(() => {
    if (!showDownloadMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showDownloadMenu]);

  // Default download handler if none passed
  const triggerDownload = async () => {
    if (onDownload) {
      onDownload(currentItem);
    } else {
      const filename = getAssetFilename(currentItem.type, currentItem.id);
      await downloadAsset(currentItem.url, filename, { showToast: true });
    }
  };

  // Main Download button trigger (opens menu for images, direct download for other media)
  const handleMainDownloadClick = () => {
    if (currentItem.type === 'image') {
      setShowDownloadMenu((prev) => !prev);
    } else {
      triggerDownload();
    }
  };

  // Download original asset handler
  const handleDownloadOriginal = async () => {
    setShowDownloadMenu(false);
    if (onDownload) {
      onDownload(currentItem);
    } else {
      const filename = getAssetFilename(currentItem.type, currentItem.id);
      await downloadAsset(currentItem.url, filename, { showToast: true });
    }
  };

  // Synchronous upscale request with automatic post-upscale download
  const handleUpscaleAndDownload = async (targetScale: string) => {
    if (!currentItem || isUpscalingScale) return;
    const variantId =
      currentItem.variantId ||
      currentItem.rawItem?.variant?.id ||
      currentItem.rawItem?.id ||
      currentItem.id;
    if (!variantId) {
      toast.error('Unable to locate variant ID for upscale');
      return;
    }

    // Fast-path: Check if this scale was already upscaled and cached
    const existingUrl =
      currentItem.rawItem?.variant?.upscaled_urls?.[targetScale] ||
      currentItem.rawItem?.upscaled_urls?.[targetScale];

    if (existingUrl) {
      const filename = getAssetFilename(currentItem.type, currentItem.id, targetScale);
      try {
        await downloadAsset(existingUrl, filename, { showToast: true, throwOnError: true });
        setShowDownloadMenu(false);
      } catch (err: any) {
        setUpscaleError({
          message: "Upscaled image is ready, but download couldn't start — tap to retry.",
          type: 'download',
          downloadUrl: existingUrl,
          scale: targetScale,
        });
      }
      return;
    }

    setIsUpscalingScale(targetScale);
    setUpscaleError(null);
    setUpscaleSuccessScale(null);
    toast.info(`We're upscaling your image to ${targetScale.toUpperCase()} — download will start automatically when finished.`);

    try {
      const token = getAuthToken();
      const idempotencyKey = crypto.randomUUID();

      const res = await fetch(`/api/ai/variant/${variantId}/upscale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ targetScale, idempotencyKey }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        let msg = data.detail || data.error || 'Upscale failed';
        if (data.error === 'INSUFFICIENT_CREDITS') {
          msg = `Insufficient credits. Need ${data.required || 35} credits.`;
        } else {
          msg = formatApiError(data.error, data.detail);
        }
        setUpscaleError({ message: msg, type: 'upscale', scale: targetScale });
        toast.error(msg);
        return;
      }

      const outputUrl = data.outputUrl || data.upscale?.output_url;
      if (!outputUrl) {
        throw new Error('No output URL returned from upscale service');
      }

      // Update variant cached upscaled URLs in memory if present
      if (currentItem.rawItem) {
        if (currentItem.rawItem.variant) {
          if (!currentItem.rawItem.variant.upscaled_urls) {
            currentItem.rawItem.variant.upscaled_urls = {};
          }
          currentItem.rawItem.variant.upscaled_urls[targetScale] = outputUrl;
        }
        if (!currentItem.rawItem.upscaled_urls) {
          currentItem.rawItem.upscaled_urls = {};
        }
        currentItem.rawItem.upscaled_urls[targetScale] = outputUrl;
      }

      onRefreshWallet?.();

      // Trigger automatic download of upscaled asset
      const filename = getAssetFilename(currentItem.type, currentItem.id, targetScale);
      try {
        await downloadAsset(outputUrl, filename, { showToast: false, throwOnError: true });
        setUpscaleSuccessScale(targetScale);
        toast.success(`Upscale to ${targetScale.toUpperCase()} complete! Download started.`);
        setTimeout(() => {
          setShowDownloadMenu(false);
          setUpscaleSuccessScale(null);
        }, 1800);
      } catch (dlErr: any) {
        console.warn('Upscaled download failed:', dlErr);
        setUpscaleError({
          message: "Upscale finished, but the download couldn't start — tap to retry.",
          type: 'download',
          downloadUrl: outputUrl,
          scale: targetScale,
        });
        toast.warning("Upscale finished, but the download couldn't start — tap to retry.");
      }
    } catch (err: any) {
      console.error('Upscale operation failed:', err);
      const msg = err.message || 'Failed to upscale image. Please try again.';
      setUpscaleError({ message: msg, type: 'upscale', scale: targetScale });
      toast.error(msg);
    } finally {
      setIsUpscalingScale(null);
    }
  };

  // Retry manual download handler for upscale completion
  const handleRetryDownload = async (url: string, scale?: string) => {
    if (!currentItem) return;
    try {
      const filename = getAssetFilename(currentItem.type, currentItem.id, scale);
      await downloadAsset(url, filename, { showToast: true, throwOnError: true });
      setUpscaleError(null);
      setUpscaleSuccessScale(scale || 'done');
      toast.success('Download started successfully!');
      setTimeout(() => {
        setShowDownloadMenu(false);
        setUpscaleSuccessScale(null);
      }, 1500);
    } catch (err: any) {
      console.warn('Retry download failed, opening fallback in new tab:', err);
      window.open(url, '_blank', 'noopener');
    }
  };

  const handleDelete = async () => {
    if (!currentItem || !onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(currentItem);
    } catch {
      // Error handled by parent toast/rollback
    } finally {
      setIsDeleting(false);
    }
  };

  const isCurrentItemSnapshot = mediaSnapshot.itemId === currentItem.id;
  const initialPlaybackTime = isCurrentItemSnapshot ? mediaSnapshot.currentTime : 0;
  const initialAutoPlay = isCurrentItemSnapshot ? mediaSnapshot.wasPlaying : true;

  // Minimized docked bar view (280px wide at bottom-4 right-4)
  if (windowState === 'minimized') {
    return createPortal(
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        className="fixed bottom-4 right-4 z-50 w-72 rounded-2xl bg-[#18181B]/95 text-white border border-[#FF8800]/40 shadow-2xl p-3 flex flex-col gap-2 backdrop-blur-md"
        role="region"
        aria-label="Minimized media player"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 truncate pr-2">
            <span className="w-2 h-2 rounded-full bg-[#FF8800] animate-pulse shrink-0" />
            <span className="text-xs font-semibold truncate text-[#F5F5F7]">
              {currentItem.prompt || `${currentItem.type.toUpperCase()} Preview`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateWindowState('full')}
              className="p-1.5 rounded-lg text-[#A0A0AA] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Expand full screen"
            >
              <Maximize2 size={13} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#A0A0AA] hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer"
              title="Close player"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Small media preview in minimized player */}
        <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black/40 flex items-center justify-center">
          {currentItem.type === 'video' ? (
            <LightboxVideo
              variantId={currentItem.variantId}
              fallbackUrl={currentItem.url}
              poster={posterSrc}
              initialTime={initialPlaybackTime}
              autoPlay={initialAutoPlay}
              isMuted={isMuted}
              className="w-full h-full object-contain"
              onSnapshot={handleMediaSnapshot}
            />
          ) : currentItem.type === 'music' ? (
            <CircularAudioPlayer
              src={currentItem.url}
              variantId={currentItem.variantId}
              coverArtUrl={currentItem.coverArtUrl}
              title={currentItem.prompt}
              size={120}
              autoPlay={initialAutoPlay}
              initialTime={initialPlaybackTime}
              onSnapshot={handleMediaSnapshot}
              showControls={false}
            />
          ) : (
            <img
              src={currentItem.url}
              alt={currentItem.prompt || 'Preview image'}
              className="w-full h-full object-cover"
            />
          )}
        </div>
      </motion.div>,
      document.body
    );
  }

  // Full or Half modal view
  const isHalf = windowState === 'half';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => {
          if (!isHalf) onClose();
        }}
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        aria-hidden="true"
      />

      {/* Main Dialog Window */}
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={currentItem.prompt || `Preview of ${currentItem.type}`}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        className={`relative z-10 flex flex-col bg-[#121214] text-[#F5F5F7] overflow-hidden shadow-2xl transition-all ${
          isHalf
            ? 'w-[90vw] md:w-[70vw] h-[85vh] md:h-[70vh] rounded-3xl border border-[#FF8800]/30'
            : 'w-full h-full inset-0'
        }`}
      >
        {/* Top Controls Header (pointer-events-none on outer gradient, pointer-events-auto only on controls) */}
        <div className="absolute top-0 inset-x-0 p-4 z-30 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none">
          {/* Batch Take Counter / Indicator */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-xs font-mono font-bold text-white border border-white/10">
              {currentIndex + 1} / {items.length}
            </span>
            {currentItem.modelName && (
              <span className="hidden sm:inline-block px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-mono text-[#A0A0AA]">
                {currentItem.modelName}
              </span>
            )}
          </div>

          {/* Window mode toggles */}
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Full / Half toggle (hidden on mobile) */}
            <button
              type="button"
              onClick={() => updateWindowState(isHalf ? 'full' : 'half')}
              className="hidden md:flex p-2 rounded-xl bg-black/60 hover:bg-white/20 text-white backdrop-blur-md transition-colors cursor-pointer"
              title={isHalf ? 'Full screen (F)' : 'Windowed mode (F)'}
              aria-label={isHalf ? 'Full screen' : 'Windowed mode'}
            >
              {isHalf ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </button>

            {/* Minimize to dock bar */}
            <button
              type="button"
              onClick={() => updateWindowState('minimized')}
              className="p-2 rounded-xl bg-black/60 hover:bg-white/20 text-white backdrop-blur-md transition-colors cursor-pointer"
              title="Minimize to player"
              aria-label="Minimize player"
            >
              <Minimize2 size={16} className="rotate-45" />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-black/60 hover:bg-rose-500/80 text-white backdrop-blur-md transition-colors cursor-pointer"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Previous & Next Navigation Buttons */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous take"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95"
            >
              <ChevronLeft size={24} />
            </button>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Next take"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}

        {/* Media Canvas Stage — pointer-events-auto and never blocked by top header */}
        <div className="flex-1 w-full h-full flex items-center justify-center p-6 md:p-12 overflow-hidden relative z-10 pointer-events-auto">
          {currentItem.type === 'video' ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <LightboxVideo
                variantId={currentItem.variantId}
                fallbackUrl={currentItem.url}
                poster={posterSrc}
                initialTime={initialPlaybackTime}
                autoPlay={initialAutoPlay}
                isMuted={isMuted}
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                onSnapshot={handleMediaSnapshot}
              />
            </div>
          ) : currentItem.type === 'music' ? (
            <div className="flex flex-col items-center justify-center gap-6">
              <CircularAudioPlayer
                src={currentItem.url}
                variantId={currentItem.variantId}
                coverArtUrl={currentItem.coverArtUrl}
                title={currentItem.prompt}
                artist={currentItem.modelName || 'Bidou Studio'}
                size={isHalf ? 220 : 280}
                autoPlay={initialAutoPlay}
                initialTime={initialPlaybackTime}
                onSnapshot={handleMediaSnapshot}
                showControls
              />
            </div>
          ) : (
            <img
              src={currentItem.url}
              alt={currentItem.prompt || 'Generated art visual'}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
            />
          )}
        </div>

        {/* Footer info & Action bar */}
        <div className="p-4 px-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent border-t border-white/10 z-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1 max-w-xl">
            <span className="text-xs md:text-sm font-semibold text-white line-clamp-2">
              {currentItem.prompt || 'Untitled Generation'}
            </span>
            <div className="flex items-center gap-3 text-[11px] font-mono text-[#A0A0AA]">
              {currentItem.resolution && <span>{currentItem.resolution}</span>}
              {currentItem.durationSeconds && <span>{currentItem.durationSeconds}s</span>}
              {currentItem.creditCost && <span>{currentItem.creditCost} credits</span>}
            </div>
          </div>

          {/* Action buttons (Download, Upscale, Project, Remix, Reuse, Restore, Trash) */}
          <div className="flex items-center gap-2 flex-wrap">
            {onRestore && (
              <button
                type="button"
                onClick={() => onRestore(currentItem)}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>Restore</span>
              </button>
            )}

            {onUpscale && currentItem.type === 'image' && (
              <button
                type="button"
                onClick={() => onUpscale(currentItem)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles size={14} className="text-[#FF8800]" />
                <span>Upscale</span>
              </button>
            )}

            {onAddToProject && (
              <button
                type="button"
                onClick={() => onAddToProject(currentItem)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FolderPlus size={14} />
                <span>Add to Project</span>
              </button>
            )}

            {onRemix && (
              <button
                type="button"
                onClick={() => onRemix(currentItem.prompt || '', currentItem.type)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Remix</span>
              </button>
            )}

            {onReusePrompt && currentItem.rawItem && (
              <button
                type="button"
                onClick={() => onReusePrompt(currentItem.rawItem)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Wand2 size={14} />
                <span>Reuse Prompt</span>
              </button>
            )}

            {/* Download button with pre-download choice popover for images */}
            <div className="relative" ref={downloadMenuRef}>
              <button
                type="button"
                onClick={handleMainDownloadClick}
                disabled={!!isUpscalingScale}
                className="px-4 py-1.5 rounded-xl bg-brand-gradient hover:opacity-90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-70"
                aria-haspopup={currentItem.type === 'image' ? 'dialog' : undefined}
                aria-expanded={showDownloadMenu}
              >
                {isUpscalingScale ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-white" />
                    <span>Upscaling ({isUpscalingScale.toUpperCase()})...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Download</span>
                  </>
                )}
              </button>

              {/* Pre-Download Interstitial Popover */}
              <AnimatePresence>
                {showDownloadMenu && currentItem.type === 'image' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.16 }}
                    className="absolute bottom-full right-0 mb-3 w-72 sm:w-84 max-w-[calc(100vw-32px)] rounded-2xl bg-[#18181B]/95 dark:bg-[#121215]/95 backdrop-blur-2xl border border-white/15 p-3.5 shadow-2xl z-50 text-left"
                    role="dialog"
                    aria-label="Download options"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <Download size={14} className="text-[#FF8800]" />
                        <span className="text-xs font-bold text-white">Download Options</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDownloadMenu(false)}
                        className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        aria-label="Close download menu"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Option: Download Original */}
                    <button
                      type="button"
                      onClick={handleDownloadOriginal}
                      disabled={!!isUpscalingScale}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/10 text-white transition-colors group cursor-pointer disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                          <ImageIcon size={15} />
                        </div>
                        <div className="text-left">
                          <div className="text-xs font-semibold text-white">Original Quality</div>
                          <div className="text-[10px] text-zinc-400">Download directly as generated</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        Free
                      </span>
                    </button>

                    {/* Upscale Tiers Section */}
                    {availableScales.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 my-2.5 px-1">
                          <div className="h-px bg-white/10 flex-1" />
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                            Upscale with AI & Download
                          </span>
                          <div className="h-px bg-white/10 flex-1" />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          {availableScales.map((tier) => {
                            const isCurrent = isUpscalingScale === tier.scale;
                            const isCached = !!(
                              currentItem.rawItem?.variant?.upscaled_urls?.[tier.scale] ||
                              currentItem.rawItem?.upscaled_urls?.[tier.scale]
                            );

                            return (
                              <button
                                key={tier.scale}
                                type="button"
                                disabled={!!isUpscalingScale}
                                onClick={() => handleUpscaleAndDownload(tier.scale)}
                                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-[#FF8800]/40 text-white transition-all group cursor-pointer disabled:opacity-50"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-lg bg-[#FF8800]/10 border border-[#FF8800]/20 flex items-center justify-center text-[#FF8800] group-hover:bg-[#FF8800]/20 transition-colors">
                                    {isCurrent ? (
                                      <Loader2 size={15} className="animate-spin text-[#FF8800]" />
                                    ) : (
                                      <Sparkles size={15} />
                                    )}
                                  </div>
                                  <div className="text-left">
                                    <div className="text-xs font-semibold text-white">
                                      {tier.label}
                                    </div>
                                    <div className="text-[10px] text-zinc-400">
                                      {tier.scale === '4k'
                                        ? 'Ultra HD 3840px enhanced clarity'
                                        : tier.scale === '2k'
                                        ? 'High-res 2048px enhanced clarity'
                                        : 'Crisp 1080p standard enhancement'}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  {isCached ? (
                                    <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                                      Ready
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-[#FF8800] bg-[#FF8800]/10 px-2 py-0.5 rounded-md border border-[#FF8800]/20">
                                      {tier.cost} credits
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {/* Upscale In-Progress Status Banner */}
                    {isUpscalingScale && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-[#FF8800]/10 border border-[#FF8800]/25 flex items-start gap-2.5 text-xs text-[#FF8800]">
                        <Loader2 size={15} className="animate-spin shrink-0 mt-0.5 text-[#FF8800]" />
                        <div className="leading-snug text-left">
                          <span className="font-semibold text-white">
                            Upscaling to {isUpscalingScale.toUpperCase()}...
                          </span>
                          <p className="text-[11px] text-zinc-300 dark:text-zinc-400 mt-0.5">
                            We're upscaling your image — download will start automatically when it's finished.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Success State Banner */}
                    {upscaleSuccessScale && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-xs text-emerald-400">
                        <CheckCircle2 size={15} className="shrink-0" />
                        <span>Upscale complete! Download started.</span>
                      </div>
                    )}

                    {/* Error State with Distinct Retry for CORS/Download vs Upscale failure */}
                    {upscaleError && (
                      <div
                        className={`mt-2.5 p-2.5 rounded-xl border flex flex-col gap-1.5 text-xs text-left ${
                          upscaleError.type === 'download'
                            ? 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                            : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {upscaleError.type === 'download' ? (
                            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-400" />
                          ) : (
                            <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                          )}
                          <div className="flex-1">
                            <div className="font-semibold text-white">
                              {upscaleError.type === 'download' ? 'Download Interrupted' : 'Upscale Failed'}
                            </div>
                            <p className="text-[11px] mt-0.5 leading-snug">{upscaleError.message}</p>
                          </div>
                        </div>

                        {upscaleError.type === 'download' && upscaleError.downloadUrl && (
                          <div className="flex items-center gap-2 mt-1 pt-1.5 border-t border-amber-500/20">
                            <button
                              type="button"
                              onClick={() => handleRetryDownload(upscaleError.downloadUrl!, upscaleError.scale)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold text-[11px] transition-colors cursor-pointer"
                            >
                              Tap to Retry
                            </button>
                            <button
                              type="button"
                              onClick={() => window.open(upscaleError.downloadUrl!, '_blank', 'noopener')}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-[11px] transition-colors cursor-pointer"
                            >
                              Open in New Tab
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {onDelete && (
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDelete}
                className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 transition-colors cursor-pointer ml-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isDeleting ? 'Moving to Trash...' : 'Move to Trash'}
                aria-label={isDeleting ? 'Moving to Trash...' : 'Move to Trash'}
              >
                {isDeleting ? (
                  <Loader2 size={14} className="animate-spin text-rose-400" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
