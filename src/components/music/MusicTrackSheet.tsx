import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  Pause,
  Heart,
  Star,
  Download,
  FolderPlus,
  ListMusic,
  Sparkles,
  Trash2,
  X,
  Loader2,
  Music as MusicIcon,
  Maximize2,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { GenerationJob, GenerationJobVariant, GenerationType } from '../../types';
import {
  deriveTrackTitle,
  deriveStyleChips,
  formatDuration,
  formatMusicModelName,
  resolveCoverArtUrl,
  resolveTrackDuration,
  getDeterministicCoverGradient,
} from '../../lib/musicMeta';
import { useTrackPlayback, TrackPlaybackMeta } from '../../lib/audioPlayback';

export interface MusicTrackSheetProps {
  isOpen: boolean;
  job: GenerationJob | null;
  variant: GenerationJobVariant | null;
  originElement?: HTMLElement | null;
  isFavorite: boolean;
  isHero: boolean;
  onClose: () => void;
  onToggleFavorite: (variantId: string) => void;
  onToggleHero: (variant: GenerationJobVariant) => void;
  onDownload: (url: string, filename: string, variantId: string) => void;
  onExpand: () => void;
  onOpenProjectPicker: (e: React.MouseEvent<HTMLElement>, job: GenerationJob, variant: GenerationJobVariant) => void;
  onOpenPlaylistPicker: (variant: GenerationJobVariant, job: GenerationJob, title: string, outputUrl: string) => void;
  onRemixPrompt?: (prompt: string, type: GenerationType) => void;
  onMoveToTrash: (job: GenerationJob, variant: GenerationJobVariant) => void;
}

export const MusicTrackSheet: React.FC<MusicTrackSheetProps> = ({
  isOpen,
  job,
  variant,
  originElement,
  isFavorite,
  isHero,
  onClose,
  onToggleFavorite,
  onToggleHero,
  onDownload,
  onExpand,
  onOpenProjectPicker,
  onOpenPlaylistPicker,
  onRemixPrompt,
  onMoveToTrash,
}) => {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [coverImgError, setCoverImgError] = useState(false);

  const resolvedCoverUrl = useMemo(() => resolveCoverArtUrl(job, variant), [job, variant]);
  const fallbackDuration = useMemo(() => resolveTrackDuration(job), [job]);

  useEffect(() => {
    setCoverImgError(false);
  }, [resolvedCoverUrl, variant?.id]);

  const takeIndex = (variant?.variant_index ?? 0) + 1;
  const outputUrl =
    variant?.output_url || job?.output_urls?.[variant?.variant_index ?? 0] || '';
  const title = useMemo(() => (job ? deriveTrackTitle(job) : 'Untitled track'), [job]);
  const styleChips = useMemo(
    () => (job ? deriveStyleChips(job) : { visible: [], overflowCount: 0, all: [] }),
    [job]
  );
  const coverGradient = useMemo(
    () => getDeterministicCoverGradient(variant?.id || job?.id || 'sheet'),
    [variant?.id, job?.id]
  );

  const playbackMeta = useMemo<TrackPlaybackMeta>(
    () => ({
      variantId: variant?.id || `${job?.id || 'job'}_0`,
      jobId: job?.id || '',
      src: outputUrl,
      title,
      modelName: formatMusicModelName(job?.model_name, job?.model_id),
      genre: styleChips.visible[0] || job?.genre,
      tonality: styleChips.visible[1] || job?.tonality,
      coverArtUrl: !coverImgError ? resolvedCoverUrl : undefined,
      durationSeconds: fallbackDuration,
    }),
    [
      variant?.id,
      job?.id,
      outputUrl,
      title,
      job?.model_name,
      job?.model_id,
      styleChips.visible,
      job?.genre,
      job?.tonality,
      resolvedCoverUrl,
      fallbackDuration,
      coverImgError,
    ]
  );

  const { isActive, isPlaying, isLoading, currentTime, duration, toggle, seek } =
    useTrackPlayback(playbackMeta);

  const effectiveDuration = resolveTrackDuration(job, duration);
  const displayCurrentTime = isActive ? currentTime : 0;
  const progressRatio =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, (displayCurrentTime / effectiveDuration) * 100))
      : 0;

  // Focus trap & Esc handling + restore focus to originating row on close
  useEffect(() => {
    if (!isOpen) return;

    const prevFocused = originElement || (document.activeElement as HTMLElement | null);
    const timer = setTimeout(() => {
      const playBtn = sheetRef.current?.querySelector<HTMLButtonElement>('[data-sheet-play]');
      (playBtn || closeBtnRef.current)?.focus();
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && sheetRef.current) {
        const focusables = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (prevFocused && typeof prevFocused.focus === 'function') {
        setTimeout(() => prevFocused.focus(), 0);
      }
    };
  }, [isOpen, originElement, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && job && variant && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            aria-hidden="true"
          />

          {/* Bottom Sheet Dialog */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Track controls for ${title}`}
            initial={prefersReducedMotion ? { opacity: 0 } : { y: '100%' }}
            animate={prefersReducedMotion ? { opacity: 1 } : { y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-h-[90dvh] overflow-y-auto rounded-t-3xl overlay-panel border-t border-[#FF8800]/30 px-5 pt-3 flex flex-col gap-4 shadow-2xl"
          >
            {/* Drag Handle & Close */}
            <div className="relative flex items-center justify-center pt-1">
              <div className="w-10 h-1.5 rounded-full bg-black/20 dark:bg-white/20" />
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                aria-label="Close track sheet"
                className="absolute right-0 top-0 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {/* Large Square Cover (~240px) */}
            <div className="flex flex-col items-center gap-3 pt-1">
              <div
                className="relative w-56 h-56 max-w-[62vw] max-h-[62vw] rounded-2xl overflow-hidden shadow-xl border border-black/10 dark:border-white/10"
                style={
                  !resolvedCoverUrl || coverImgError ? { background: coverGradient } : undefined
                }
              >
                {resolvedCoverUrl && !coverImgError ? (
                  <img
                    src={resolvedCoverUrl}
                    alt={title}
                    referrerPolicy="no-referrer"
                    onError={() => setCoverImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/85">
                    <MusicIcon size={52} aria-hidden="true" />
                  </div>
                )}
              </div>

              {/* Title & Style Metadata */}
              <div className="w-full text-center px-2 min-w-0">
                <h3 className="text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
                  {title}
                </h3>
                <div className="flex items-center justify-center flex-wrap gap-1.5 text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
                  <span>{formatMusicModelName(job.model_name, job.model_id)}</span>
                  {styleChips.visible.map((chip) => (
                    <React.Fragment key={chip}>
                      <span aria-hidden="true">·</span>
                      <span>{chip}</span>
                    </React.Fragment>
                  ))}
                  {styleChips.overflowCount > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px]">+{styleChips.overflowCount}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Full-Width Seekable Scrubber with Times */}
            <div className="w-full flex flex-col gap-1.5 px-1">
              <div className="relative w-full h-7 flex items-center">
                <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/15 overflow-hidden pointer-events-none">
                  <div
                    className="h-full bg-brand-gradient"
                    style={{ width: `${progressRatio}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={effectiveDuration}
                  step={0.1}
                  value={displayCurrentTime}
                  aria-label={`Seek ${title}`}
                  aria-valuetext={`${formatDuration(displayCurrentTime)} of ${formatDuration(effectiveDuration)}`}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer focus-visible:opacity-100 focus-visible:accent-[#FF8800]"
                />
              </div>
              <div className="flex items-center justify-between font-mono tabular-nums text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                <span>{formatDuration(displayCurrentTime)}</span>
                <span>{formatDuration(effectiveDuration)}</span>
              </div>
            </div>

            {/* Big Play / Pause Button */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                data-sheet-play="true"
                onClick={toggle}
                aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
                aria-pressed={isPlaying}
                className="w-14 h-14 min-w-[56px] min-h-[56px] rounded-full bg-brand-gradient text-white shadow-lg flex items-center justify-center hover:opacity-95 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
              >
                {isLoading ? (
                  <Loader2 size={24} className="animate-spin text-white" aria-hidden="true" />
                ) : isPlaying ? (
                  <Pause size={24} className="fill-white" aria-hidden="true" />
                ) : (
                  <Play size={24} className="fill-white ml-0.5" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Vertical Action List (each >= 48px tall) */}
            <div className="flex flex-col gap-1 border-t border-black/5 dark:border-white/5 pt-3">
              <button
                type="button"
                onClick={() => onToggleFavorite(variant.id)}
                className="min-h-[48px] w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer text-left"
              >
                <Heart
                  size={18}
                  className={isFavorite ? 'text-[#FF8800] fill-[#FF8800] shrink-0' : 'text-[#F86A00] shrink-0'}
                  aria-hidden="true"
                />
                <span>{isFavorite ? 'Remove from favorites' : 'Favorite'}</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleHero(variant)}
                className="min-h-[48px] w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer text-left"
              >
                <Star
                  size={18}
                  className={isHero ? 'text-[#FFB020] fill-[#FFB020] shrink-0' : 'text-[#F86A00] shrink-0'}
                  aria-hidden="true"
                />
                <span>{isHero ? 'Hero selected' : 'Pick as Hero'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onDownload(outputUrl, `bidou-music-take-${takeIndex}.mp3`, variant.id);
                  onClose();
                }}
                className="min-h-[48px] w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer text-left"
              >
                <Download size={18} className="text-[#F86A00] shrink-0" aria-hidden="true" />
                <span>Download</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onExpand();
                }}
                className="min-h-[48px] w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer text-left"
              >
                <Maximize2 size={18} className="text-[#F86A00] shrink-0" aria-hidden="true" />
                <span>Expand in Lightbox</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  onClose();
                  onOpenProjectPicker(e, job, variant);
                }}
                className="min-h-[48px] w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer text-left"
              >
                <FolderPlus size={18} className="text-[#F86A00] shrink-0" aria-hidden="true" />
                <span>Add to project</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPlaylistPicker(variant, job, title, outputUrl);
                }}
                className="min-h-[48px] w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer text-left"
              >
                <ListMusic size={18} className="text-[#F86A00] shrink-0" aria-hidden="true" />
                <span>Add to playlist</span>
              </button>

              {onRemixPrompt && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRemixPrompt(job.prompt, 'music');
                  }}
                  className="min-h-[48px] w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer text-left"
                >
                  <Sparkles size={18} className="text-[#F86A00] shrink-0" aria-hidden="true" />
                  <span>Remix prompt</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onMoveToTrash(job, variant);
                }}
                className="min-h-[48px] w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer text-left"
              >
                <Trash2 size={18} className="shrink-0" aria-hidden="true" />
                <span>Move to trash</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
