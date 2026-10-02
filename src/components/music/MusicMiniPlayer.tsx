import React, { useState, useEffect, useMemo } from 'react';
import { Play, Pause, X, Loader2, Music as MusicIcon, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useGlobalAudioPlayback, formatAudioTime } from '../../lib/audioPlayback';
import { getDeterministicCoverGradient, formatMusicModelName, MusicContainerTier } from '../../lib/musicMeta';

export interface MusicMiniPlayerProps {
  tier: MusicContainerTier;
  onExpandVariant?: (variantId: string) => void;
}

/**
 * StickyNow-Playing Mini-Player (Phase 2)
 * Keeps playback controls and scrubbing accessible while scrolling long music lists.
 * Uses the shared audio singleton from `src/lib/audioPlayback.ts`.
 */
export const MusicMiniPlayer: React.FC<MusicMiniPlayerProps> = ({ tier, onExpandVariant }) => {
  const {
    activeTrack,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    error,
    miniPlayerVisible,
    toggleActive,
    seekActive,
    dismiss,
  } = useGlobalAudioPlayback();

  const prefersReducedMotion = useReducedMotion();
  const [coverImgError, setCoverImgError] = useState(false);

  useEffect(() => {
    setCoverImgError(false);
  }, [activeTrack?.coverArtUrl, activeTrack?.variantId]);

  const coverGradient = useMemo(
    () => getDeterministicCoverGradient(activeTrack?.variantId || activeTrack?.jobId || 'mini'),
    [activeTrack?.variantId, activeTrack?.jobId]
  );

  const effectiveDuration =
    duration > 0
      ? duration
      : activeTrack?.durationSeconds && activeTrack.durationSeconds > 15
      ? activeTrack.durationSeconds
      : 130;
  const progressRatio =
    effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;

  return (
    <AnimatePresence>
      {miniPlayerVisible && activeTrack && (
        <motion.div
          role="region"
          aria-label="Now playing mini player"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
          className="sticky bottom-3 z-30 w-full mt-2 rounded-2xl overlay-panel border border-[#FF8800]/35 shadow-xl overflow-hidden"
        >
          {/* Top thin progress bar for compact / medium */}
          {tier !== 'wide' && (
            <div className="relative w-full h-1 bg-black/10 dark:bg-white/15">
              <div
                className="h-full bg-brand-gradient transition-all duration-150"
                style={{ width: `${progressRatio}%` }}
              />
              <input
                type="range"
                min={0}
                max={effectiveDuration}
                step={0.5}
                value={currentTime}
                aria-label={`Seek ${activeTrack.title}`}
                aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(effectiveDuration)}`}
                onChange={(e) => seekActive(Number(e.target.value))}
                className="absolute -inset-y-2 inset-x-0 w-full h-5 opacity-0 cursor-pointer"
              />
            </div>
          )}

          <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 min-w-0">
            {/* Cover + Play/Pause + Track Info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-black/10 dark:border-white/10 shadow-xs"
                style={
                  !activeTrack.coverArtUrl || coverImgError
                    ? { background: coverGradient }
                    : undefined
                }
              >
                {activeTrack.coverArtUrl && !coverImgError ? (
                  <img
                    src={activeTrack.coverArtUrl}
                    alt={activeTrack.title}
                    referrerPolicy="no-referrer"
                    onError={() => setCoverImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/85" aria-hidden="true">
                    <MusicIcon size={16} />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={toggleActive}
                aria-label={isPlaying ? `Pause ${activeTrack.title}` : `Play ${activeTrack.title}`}
                aria-pressed={isPlaying}
                className="min-w-[38px] min-h-[38px] [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] w-9.5 h-9.5 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-sm hover:opacity-95 active:scale-95 transition-all shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin text-white" aria-hidden="true" />
                ) : isPlaying ? (
                  <Pause size={16} className="fill-white" aria-hidden="true" />
                ) : (
                  <Play size={16} className="fill-white ml-0.5" aria-hidden="true" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs sm:text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
                    {activeTrack.title}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] truncate">
                  <span className="truncate">
                    {activeTrack.genre || formatMusicModelName(activeTrack.modelName)}
                  </span>
                  {tier !== 'wide' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {formatAudioTime(currentTime)} / {formatAudioTime(effectiveDuration)}
                      </span>
                    </>
                  )}
                  {error && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-rose-500 font-medium shrink-0">{error}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Wide Tier Inline Scrubber */}
            {tier === 'wide' && (
              <div className="flex items-center gap-2.5 w-[260px] lg:w-[320px] shrink-0 px-2">
                <span className="font-mono tabular-nums text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] w-9 text-right shrink-0">
                  {formatAudioTime(currentTime)}
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
                    value={currentTime}
                    aria-label={`Seek ${activeTrack.title}`}
                    aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(effectiveDuration)}`}
                    onChange={(e) => seekActive(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer focus-visible:opacity-100 focus-visible:accent-[#FF8800] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
                  />
                </div>
                <span className="font-mono tabular-nums text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] w-9 shrink-0">
                  {formatAudioTime(effectiveDuration)}
                </span>
              </div>
            )}

            {/* Right Controls: Expand & Close */}
            <div className="flex items-center gap-1 shrink-0">
              {onExpandVariant && (
                <button
                  type="button"
                  onClick={() => onExpandVariant(activeTrack.variantId)}
                  title="Expand in Lightbox"
                  aria-label={`Expand ${activeTrack.title} in Lightbox`}
                  className="min-w-[36px] min-h-[36px] [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] p-2 rounded-xl flex items-center justify-center text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
                >
                  <Maximize2 size={15} aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                onClick={dismiss}
                title="Close mini player"
                aria-label="Close mini player"
                className="min-w-[36px] min-h-[36px] [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] p-2 rounded-xl flex items-center justify-center text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
