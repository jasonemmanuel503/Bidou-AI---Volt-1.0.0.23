import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  Pause,
  Heart,
  Star,
  Download,
  Maximize2,
  MoreHorizontal,
  FolderPlus,
  ListMusic,
  Sparkles,
  Trash2,
  AlertCircle,
  RotateCcw,
  Loader2,
  Music as MusicIcon,
} from 'lucide-react';
import { GenerationJob, GenerationJobVariant, GenerationType } from '../../types';
import { formatApiError } from '../../lib/errorMapping';
import {
  MusicContainerTier,
  deriveTrackTitle,
  deriveStyleChips,
  formatDuration,
  formatMusicModelName,
  resolveCoverArtUrl,
  resolveTrackDuration,
  getDeterministicCoverGradient,
} from '../../lib/musicMeta';
import { useTrackPlayback, TrackPlaybackMeta } from '../../lib/audioPlayback';

export interface MusicTrackRowProps {
  job: GenerationJob;
  variant: GenerationJobVariant;
  takeIndex: number;
  showTakeLabel: boolean;
  tier: MusicContainerTier;
  isFavorite: boolean;
  isHero: boolean;
  onToggleFavorite: (variantId: string) => void;
  onToggleHero: (variant: GenerationJobVariant) => void;
  onDownload: (url: string, filename: string, variantId: string) => void;
  onExpand: () => void;
  onOpenProjectPicker: (e: React.MouseEvent<HTMLElement>, job: GenerationJob, variant: GenerationJobVariant) => void;
  onOpenPlaylistPicker: (variant: GenerationJobVariant, job: GenerationJob, title: string, outputUrl: string) => void;
  onRemixPrompt?: (prompt: string, type: GenerationType) => void;
  onReusePrompt?: (job: GenerationJob) => void;
  onMoveToTrash: (job: GenerationJob, variant: GenerationJobVariant) => void;
  onOpenMobileSheet: (job: GenerationJob, variant: GenerationJobVariant, triggerEl: HTMLElement | null) => void;
}

const ROW_HEIGHT_CLASS: Record<MusicContainerTier, string> = {
  wide: 'h-[76px]',
  medium: 'h-[72px]',
  compact: 'h-[64px]',
};

const COVER_SIZE_CLASS: Record<MusicContainerTier, string> = {
  wide: 'w-[60px] h-[60px]',
  medium: 'w-[56px] h-[56px]',
  compact: 'w-[52px] h-[52px]',
};

/**
 * Isolated 500ms progress ticker so only processing rows re-render during composition.
 */
const ProcessingRowContent: React.FC<{
  job: GenerationJob;
  takeIndex: number;
  showTakeLabel: boolean;
  tier: MusicContainerTier;
}> = ({ job, takeIndex, showTakeLabel, tier }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const progressPct = useMemo(() => {
    const startedAtMs = job.started_at
      ? new Date(job.started_at).getTime()
      : job.created_at
      ? new Date(job.created_at).getTime()
      : now;
    const elapsed = Math.max(0, (now - startedAtMs) / 1000);
    const estimated = job.estimated_duration_seconds || 90;
    return Math.min(92, (elapsed / estimated) * 100);
  }, [job.started_at, job.created_at, job.estimated_duration_seconds, now]);

  const coverSize = COVER_SIZE_CLASS[tier];

  return (
    <>
      {/* Brand gradient cover with subtle animated equalizer */}
      <div
        className={`${coverSize} rounded-xl bg-brand-gradient shrink-0 flex items-center justify-center shadow-xs relative overflow-hidden`}
        aria-hidden="true"
      >
        <div className="flex items-end gap-1 h-5">
          <span className="w-1 bg-white/95 rounded-full h-3 animate-pulse motion-reduce:animate-none" />
          <span
            className="w-1 bg-white/95 rounded-full h-5 animate-bounce motion-reduce:animate-none"
            style={{ animationDuration: '900ms' }}
          />
          <span
            className="w-1 bg-white/95 rounded-full h-2.5 animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: '180ms' }}
          />
          <span
            className="w-1 bg-white/95 rounded-full h-4 animate-bounce motion-reduce:animate-none"
            style={{ animationDuration: '1100ms', animationDelay: '90ms' }}
          />
        </div>
      </div>

      {/* Text & percentage */}
      <div className="min-w-0 flex-1 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {showTakeLabel && (
              <span className="font-mono text-[11px] font-semibold text-[#F86A00] shrink-0">
                Take {takeIndex}
              </span>
            )}
            <span className="text-xs sm:text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
              Composing with {formatMusicModelName(job.model_name, job.model_id)}…
            </span>
          </div>
          {job.genre && (
            <p className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] truncate mt-0.5">
              {job.genre}
              {job.tonality ? ` · ${job.tonality}` : ''}
            </p>
          )}
        </div>

        <span className="font-mono tabular-nums text-xs font-semibold text-[#F86A00] shrink-0">
          {Math.round(progressPct)}%
        </span>
      </div>

      {/* Thin progress bar pinned to bottom of row */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-black/10 dark:bg-white/10 overflow-hidden pointer-events-none">
        <div
          className="h-full bg-brand-gradient transition-all duration-300 motion-reduce:transition-none"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </>
  );
};

const MusicTrackRowInner: React.FC<MusicTrackRowProps> = ({
  job,
  variant,
  takeIndex,
  showTakeLabel,
  tier,
  isFavorite,
  isHero,
  onToggleFavorite,
  onToggleHero,
  onDownload,
  onExpand,
  onOpenProjectPicker,
  onOpenPlaylistPicker,
  onRemixPrompt,
  onReusePrompt,
  onMoveToTrash,
  onOpenMobileSheet,
}) => {
  const effectiveStatus = variant.status || job.status;
  const outputUrl = variant.output_url || job.output_urls?.[variant.variant_index ?? takeIndex - 1] || '';
  const title = useMemo(() => deriveTrackTitle(job), [job]);
  const styleChips = useMemo(() => deriveStyleChips(job), [job]);
  const resolvedCoverUrl = useMemo(() => resolveCoverArtUrl(job, variant), [job, variant]);
  const fallbackDuration = useMemo(() => resolveTrackDuration(job), [job]);
  const coverGradient = useMemo(
    () => getDeterministicCoverGradient(variant.id || `${job.id}_${takeIndex}`),
    [variant.id, job.id, takeIndex]
  );

  const [coverImgError, setCoverImgError] = useState(false);
  useEffect(() => {
    setCoverImgError(false);
  }, [resolvedCoverUrl]);

  const playbackMeta = useMemo<TrackPlaybackMeta>(
    () => ({
      variantId: variant.id || `${job.id}_${takeIndex - 1}`,
      jobId: job.id,
      src: outputUrl,
      title,
      modelName: formatMusicModelName(job.model_name, job.model_id),
      genre: styleChips.visible[0] || job.genre,
      tonality: styleChips.visible[1] || job.tonality,
      coverArtUrl: !coverImgError ? resolvedCoverUrl : undefined,
      durationSeconds: fallbackDuration,
    }),
    [
      variant.id,
      job.id,
      outputUrl,
      title,
      job.model_name,
      job.model_id,
      styleChips.visible,
      job.genre,
      job.tonality,
      resolvedCoverUrl,
      fallbackDuration,
      coverImgError,
      takeIndex,
    ]
  );

  const { isActive, isPlaying, isLoading, currentTime, duration, error: playbackError, toggle, seek } =
    useTrackPlayback(playbackMeta);

  const effectiveDuration = resolveTrackDuration(job, duration);
  const displayCurrentTime = isActive ? currentTime : 0;
  const progressRatio =
    effectiveDuration > 0 ? Math.min(100, Math.max(0, (displayCurrentTime / effectiveDuration) * 100)) : 0;

  // Overflow menu state for wide & medium tiers
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const rowRef = useRef<HTMLDivElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    moreBtnRef.current?.focus();
  }, []);

  const openDesktopMenu = useCallback(() => {
    if (!moreBtnRef.current || typeof window === 'undefined') return;
    const rect = moreBtnRef.current.getBoundingClientRect();
    const menuW = 208;
    const menuH = tier === 'medium' ? 276 : 200;
    let left = rect.right - menuW;
    if (left < 12) left = 12;
    if (left + menuW > window.innerWidth - 12) left = window.innerWidth - menuW - 12;

    const flipUp = rect.bottom + menuH > window.innerHeight - 16;
    const top = flipUp ? Math.max(12, rect.top - menuH - 6) : rect.bottom + 6;
    setMenuPos({ top, left });
    setMenuOpen(true);
  }, [tier]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (
        moreBtnRef.current?.contains(e.target as Node) ||
        menuContainerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    const onScrollOrResize = () => setMenuOpen(false);

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [menuOpen, closeMenu]);

  // Focus first item when desktop menu opens
  useEffect(() => {
    if (menuOpen && menuContainerRef.current) {
      const first = menuContainerRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]');
      first?.focus();
    }
  }, [menuOpen]);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!menuContainerRef.current) return;
    const items = Array.from(menuContainerRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setMenuOpen(false);
    }
  };

  // Row keyboard support: Space toggles play when row itself or non-input is focused
  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (effectiveStatus !== 'completed') return;
    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    if (e.key === ' ' && tagName !== 'button' && tagName !== 'input') {
      e.preventDefault();
      toggle();
    }
  };

  const rowHeight = ROW_HEIGHT_CLASS[tier];
  const coverSize = COVER_SIZE_CLASS[tier];

  // ---------------------------------------------------------------------------
  // STATE 1: QUEUED
  // ---------------------------------------------------------------------------
  if (effectiveStatus === 'queued') {
    return (
      <div
        role="listitem"
        className={`relative w-full ${rowHeight} px-3.5 flex items-center gap-3.5 min-w-0 select-none`}
      >
        <div
          className={`${coverSize} rounded-xl shrink-0 bg-black/10 dark:bg-white/10 animate-pulse motion-reduce:animate-none`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {showTakeLabel && (
            <span className="font-mono text-[11px] font-semibold text-[#F86A00] shrink-0">
              Take {takeIndex}
            </span>
          )}
          <span className="text-xs sm:text-sm font-medium text-[#6B6B75] dark:text-[#A0A0AA] truncate">
            Waiting for an inference slot…
          </span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // STATE 2: PROCESSING
  // ---------------------------------------------------------------------------
  if (effectiveStatus === 'processing') {
    return (
      <div
        role="listitem"
        className={`relative w-full ${rowHeight} px-3.5 flex items-center gap-3.5 min-w-0 select-none`}
      >
        <ProcessingRowContent
          job={job}
          takeIndex={takeIndex}
          showTakeLabel={showTakeLabel}
          tier={tier}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // STATE 4: FAILED (single-line, single alert icon, Credits refunded pill, Retry prefill)
  // ---------------------------------------------------------------------------
  if (effectiveStatus === 'failed' || (!outputUrl && effectiveStatus !== 'completed')) {
    const errorText = formatApiError(variant.error_message || job.error_message) || 'Generation failed';
    return (
      <div
        role="listitem"
        className={`relative w-full ${rowHeight} px-3.5 flex items-center justify-between gap-2.5 min-w-0 bg-rose-500/[0.06] dark:bg-rose-500/[0.08]`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <AlertCircle size={16} className="text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
          {showTakeLabel && (
            <span className="font-mono text-[11px] font-semibold text-rose-700 dark:text-rose-300 shrink-0">
              Take {takeIndex}
            </span>
          )}
          <span
            title={errorText}
            className="text-xs sm:text-sm font-medium text-rose-700 dark:text-rose-300 truncate min-w-0"
          >
            {errorText}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] sm:text-[11px] font-semibold whitespace-nowrap">
            Credits refunded
          </span>

          <button
            type="button"
            onClick={() => {
              if (onReusePrompt) {
                onReusePrompt(job);
              } else if (onRemixPrompt) {
                onRemixPrompt(job.prompt, 'music');
              }
            }}
            className="min-h-[32px] [@media(pointer:coarse)]:min-h-[44px] px-3 py-1.5 rounded-xl bg-brand-gradient text-white text-xs font-semibold shadow-xs hover:opacity-95 active:scale-95 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>Retry</span>
          </button>

          <button
            type="button"
            onClick={() => onMoveToTrash(job, variant)}
            title="Delete failed take permanently"
            aria-label={`Delete failed Take ${takeIndex} permanently`}
            className="min-h-[32px] [@media(pointer:coarse)]:min-h-[44px] px-2.5 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold active:scale-95 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
          >
            <Trash2 size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // STATE 3: COMPLETED
  // ---------------------------------------------------------------------------
  const handleRowBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tier !== 'compact') return;
    // On compact tier, tapping the row body opens MusicTrackSheet
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;
    onOpenMobileSheet(job, variant, rowRef.current);
  };

  const downloadFilename = `bidou-music-take-${takeIndex}.mp3`;

  return (
    <div
      ref={rowRef}
      role="listitem"
      tabIndex={0}
      onKeyDown={handleRowKeyDown}
      onClick={handleRowBodyClick}
      className={`group relative w-full ${rowHeight} px-3.5 flex items-center gap-3 sm:gap-3.5 min-w-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FF8800] ${
        tier === 'compact' ? 'cursor-pointer active:bg-black/[0.04] dark:active:bg-white/[0.04]' : ''
      } ${
        isActive
          ? 'bg-[#FF8800]/[0.07] dark:bg-[#FF8800]/[0.1]'
          : 'hover:bg-black/[0.025] dark:hover:bg-white/[0.025]'
      }`}
    >
      {/* 1. Square Cover with Play/Pause Button Overlay (Tab stop 1) */}
      <div
        className={`relative ${coverSize} rounded-xl overflow-hidden shrink-0 shadow-xs border border-black/10 dark:border-white/10`}
        style={
          !resolvedCoverUrl || coverImgError
            ? { background: coverGradient }
            : undefined
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
          <div className="w-full h-full flex items-center justify-center text-white/80" aria-hidden="true">
            <MusicIcon size={tier === 'compact' ? 18 : 20} />
          </div>
        )}

        <button
          type="button"
          aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
          aria-pressed={isPlaying}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity cursor-pointer focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FF8800] ${
            isPlaying || isLoading
              ? 'opacity-100'
              : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100'
          }`}
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin text-white" aria-hidden="true" />
          ) : isPlaying ? (
            <Pause size={18} className="fill-white" aria-hidden="true" />
          ) : (
            <Play size={18} className="fill-white ml-0.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* 2. Title & Metadata Column (Tab stop 2) */}
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <div className="flex items-center gap-1.5 min-w-0">
          {showTakeLabel && (
            <span className="font-mono text-[11px] font-semibold text-[#F86A00] shrink-0">
              Take {takeIndex}
            </span>
          )}
          {isHero && (
            <span
              className="inline-flex items-center gap-0.5 text-[#FFB020] text-[11px] font-semibold shrink-0"
              title="Hero track"
            >
              <Star size={11} className="fill-[#FFB020]" aria-hidden="true" />
              <span className="sr-only">Hero</span>
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (tier === 'compact') {
                onOpenMobileSheet(job, variant, rowRef.current);
              } else {
                onExpand();
              }
            }}
            title={title}
            className={`min-w-0 truncate text-left text-xs sm:text-sm font-semibold transition-colors cursor-pointer rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800] ${
              isActive
                ? 'text-[#F86A00] dark:text-[#FF8800]'
                : 'text-[#1A1A1E] dark:text-[#F5F5F7] hover:text-[#F86A00] dark:hover:text-[#FF8800]'
            }`}
          >
            {title}
          </button>
        </div>

        {/* Second line metadata */}
        {tier === 'compact' ? (
          <div className="flex items-center gap-1.5 text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] truncate mt-0.5">
            <span className="truncate">{styleChips.visible[0] || job.genre || job.tonality || 'Studio Track'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums shrink-0">
              {isActive && displayCurrentTime > 0
                ? `${formatDuration(displayCurrentTime)} / ${formatDuration(effectiveDuration)}`
                : formatDuration(effectiveDuration)}
            </span>
            {playbackError && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-rose-500 font-medium shrink-0">{playbackError}</span>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] truncate mt-0.5">
            {styleChips.visible.length > 0 ? (
              styleChips.visible.map((chip, idx) => (
                <React.Fragment key={chip}>
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <span className="truncate max-w-[140px]">{chip}</span>
                </React.Fragment>
              ))
            ) : (
              <span>Studio Track</span>
            )}
            {styleChips.overflowCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[10px] shrink-0">+{styleChips.overflowCount}</span>
              </>
            )}
            {playbackError && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                  }}
                  className="text-rose-500 hover:underline font-medium shrink-0 cursor-pointer"
                >
                  {playbackError} · Retry
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 3. Scrubber / Time Column */}
      {tier === 'wide' && (
        <div
          className="flex items-center gap-2.5 w-[240px] lg:w-[300px] shrink-0 px-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="font-mono tabular-nums text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] w-9 text-right shrink-0">
            {formatDuration(displayCurrentTime)}
          </span>
          <div className="relative flex-1 flex items-center h-6">
            <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/15 overflow-hidden pointer-events-none">
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
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer focus-visible:opacity-100 focus-visible:accent-[#FF8800] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
            />
          </div>
          <span className="font-mono tabular-nums text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] w-9 shrink-0">
            {formatDuration(effectiveDuration)}
          </span>
        </div>
      )}

      {tier === 'medium' && (
        <div
          className="flex items-center gap-2 shrink-0 px-1"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="font-mono tabular-nums text-xs text-[#6B6B75] dark:text-[#A0A0AA] whitespace-nowrap">
            {formatDuration(displayCurrentTime)} / {formatDuration(effectiveDuration)}
          </span>
          <input
            type="range"
            min={0}
            max={effectiveDuration}
            step={1}
            value={displayCurrentTime}
            aria-label={`Seek ${title}`}
            aria-valuetext={`${formatDuration(displayCurrentTime)} of ${formatDuration(effectiveDuration)}`}
            onChange={(e) => seek(Number(e.target.value))}
            className="sr-only focus:not-sr-only focus:w-20 focus:accent-[#FF8800]"
          />
        </div>
      )}

      {/* 4. Action Buttons Column (Tab stops 3..N) */}
      {tier === 'compact' ? (
        <button
          ref={moreBtnRef}
          type="button"
          aria-label={`Actions for ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenMobileSheet(job, variant, moreBtnRef.current);
          }}
          className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl flex items-center justify-center text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      ) : (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Favorite (wide + medium) */}
          <button
            type="button"
            onClick={() => onToggleFavorite(variant.id)}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFavorite}
            className={`min-w-[34px] min-h-[34px] [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] p-2 rounded-xl flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800] ${
              isFavorite
                ? 'text-[#FF8800] bg-[#FF8800]/10'
                : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Heart size={16} className={isFavorite ? 'fill-[#FF8800]' : ''} aria-hidden="true" />
          </button>

          {/* Hero (inline on wide) */}
          {tier === 'wide' && (
            <button
              type="button"
              onClick={() => onToggleHero(variant)}
              title={isHero ? 'Hero selected' : 'Pick as Hero'}
              aria-label={isHero ? 'Hero selected' : 'Pick as Hero'}
              aria-pressed={isHero}
              className={`min-w-[34px] min-h-[34px] [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] p-2 rounded-xl flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800] ${
                isHero
                  ? 'text-[#FFB020] bg-[#FFB020]/15'
                  : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Star size={16} className={isHero ? 'fill-[#FFB020]' : ''} aria-hidden="true" />
            </button>
          )}

          {/* Download (wide + medium) */}
          <button
            type="button"
            onClick={() => onDownload(outputUrl, downloadFilename, variant.id)}
            title="Download"
            aria-label={`Download ${title}`}
            className="min-w-[34px] min-h-[34px] [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] p-2 rounded-xl flex items-center justify-center text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
          >
            <Download size={16} aria-hidden="true" />
          </button>

          {/* Expand in Lightbox (inline on wide) */}
          {tier === 'wide' && (
            <button
              type="button"
              onClick={onExpand}
              title="Expand in Lightbox"
              aria-label={`Expand ${title} in Lightbox`}
              className="min-w-[34px] min-h-[34px] [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] p-2 rounded-xl flex items-center justify-center text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
            >
              <Maximize2 size={16} aria-hidden="true" />
            </button>
          )}

          {/* ⋯ Overflow Menu Button */}
          <button
            ref={moreBtnRef}
            type="button"
            onClick={() => {
              if (menuOpen) {
                closeMenu();
              } else {
                openDesktopMenu();
              }
            }}
            title="More actions"
            aria-label={`More actions for ${title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`min-w-[34px] min-h-[34px] [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] p-2 rounded-xl flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800] ${
              menuOpen
                ? 'bg-[#FF8800] text-white'
                : 'text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Bottom Thin Progress Line for Medium & Compact tiers */}
      {tier !== 'wide' && (tier === 'medium' || (isActive && (isPlaying || displayCurrentTime > 0))) && (
        <div
          className="absolute inset-x-0 bottom-0 h-0.5 bg-black/10 dark:bg-white/10 overflow-hidden pointer-events-none"
          aria-hidden="true"
        >
          <div
            className="h-full bg-brand-gradient transition-all duration-150"
            style={{ width: `${progressRatio}%` }}
          />
        </div>
      )}

      {/* Portalled Overflow Menu for Wide & Medium tiers */}
      {menuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuContainerRef}
            role="menu"
            aria-label={`Actions for ${title}`}
            style={{ top: menuPos.top, left: menuPos.left }}
            onKeyDown={handleMenuKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 w-52 rounded-xl overlay-panel py-1.5 flex flex-col text-xs font-medium animate-fadeIn"
          >
            {tier === 'medium' && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onToggleHero(variant);
                  }}
                  className="min-h-[38px] [@media(pointer:coarse)]:min-h-[44px] w-full flex items-center gap-2.5 px-3 py-2 text-left text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer"
                >
                  <Star
                    size={15}
                    className={isHero ? 'text-[#FFB020] fill-[#FFB020]' : 'text-[#F86A00]'}
                    aria-hidden="true"
                  />
                  <span>{isHero ? 'Hero selected' : 'Pick as Hero'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onExpand();
                  }}
                  className="min-h-[38px] [@media(pointer:coarse)]:min-h-[44px] w-full flex items-center gap-2.5 px-3 py-2 text-left text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer"
                >
                  <Maximize2 size={15} className="text-[#F86A00]" aria-hidden="true" />
                  <span>Expand in Lightbox</span>
                </button>
                <div className="h-px bg-black/5 dark:bg-white/5 my-1" />
              </>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                setMenuOpen(false);
                // Anchor project picker to the row's ⋯ button so it positions properly
                const fakeEvent = {
                  ...e,
                  currentTarget: moreBtnRef.current || e.currentTarget,
                  stopPropagation: () => e.stopPropagation(),
                } as React.MouseEvent<HTMLElement>;
                onOpenProjectPicker(fakeEvent, job, variant);
              }}
              className="min-h-[38px] [@media(pointer:coarse)]:min-h-[44px] w-full flex items-center gap-2.5 px-3 py-2 text-left text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer"
            >
              <FolderPlus size={15} className="text-[#F86A00]" aria-hidden="true" />
              <span>Add to project</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onOpenPlaylistPicker(variant, job, title, outputUrl);
              }}
              className="min-h-[38px] [@media(pointer:coarse)]:min-h-[44px] w-full flex items-center gap-2.5 px-3 py-2 text-left text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer"
            >
              <ListMusic size={15} className="text-[#F86A00]" aria-hidden="true" />
              <span>Add to playlist</span>
            </button>

            {onRemixPrompt && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  onRemixPrompt(job.prompt, 'music');
                }}
                className="min-h-[38px] [@media(pointer:coarse)]:min-h-[44px] w-full flex items-center gap-2.5 px-3 py-2 text-left text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-colors cursor-pointer"
              >
                <Sparkles size={15} className="text-[#F86A00]" aria-hidden="true" />
                <span>Remix prompt</span>
              </button>
            )}

            <div className="h-px bg-black/5 dark:bg-white/5 my-1" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onMoveToTrash(job, variant);
              }}
              className="min-h-[38px] [@media(pointer:coarse)]:min-h-[44px] w-full flex items-center gap-2.5 px-3 py-2 text-left text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>Move to trash</span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};

export const MusicTrackRow = React.memo(MusicTrackRowInner, (prev, next) => {
  return (
    prev.variant.id === next.variant.id &&
    prev.variant.status === next.variant.status &&
    prev.variant.output_url === next.variant.output_url &&
    prev.variant.thumbnail_url === next.variant.thumbnail_url &&
    prev.variant.error_message === next.variant.error_message &&
    prev.job.id === next.job.id &&
    prev.job.status === next.job.status &&
    prev.job.cover_art_url === next.job.cover_art_url &&
    prev.job.duration_seconds === next.job.duration_seconds &&
    prev.job.prompt === next.job.prompt &&
    prev.takeIndex === next.takeIndex &&
    prev.showTakeLabel === next.showTakeLabel &&
    prev.tier === next.tier &&
    prev.isFavorite === next.isFavorite &&
    prev.isHero === next.isHero
  );
});
