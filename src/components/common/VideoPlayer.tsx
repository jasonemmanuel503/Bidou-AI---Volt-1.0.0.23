import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { usePlayableUrl, posterFor } from '../../services/media';

export interface VideoPlayerProps {
  variantId?: string;
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  compact?: boolean;
  onExpand?: () => void;
}

// Module-level tracker: guarantees only ONE video can play at any given moment
let currentlyPlayingVideo: HTMLVideoElement | null = null;

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  variantId,
  src,
  poster,
  className = '',
  autoPlay = false,
  muted = false,
  loop = false,
  compact = false,
  onExpand,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Playable URL via signed/same-origin proxy resolution
  const {
    url: playableUrl,
    isLoading: isUrlLoading,
    error: urlError,
    retry,
  } = usePlayableUrl(variantId, src, { mediaType: 'video' });
  const isUrlError = Boolean(urlError);

  const effectivePoster = posterFor(poster, playableUrl || src);

  // Viewport detection (within ~600px) to avoid loading metadata eagerly for distant off-screen tiles
  const [isInViewport, setIsInViewport] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsInViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsInViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const [isMuted, setIsMuted] = useState(autoPlay ? true : muted);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const hideControlsTimerRef = useRef<any>(null);

  // Determine preload and effective source
  // preload="none" when a poster exists; otherwise preload="metadata" with #t=0.001
  // once within ~600px of viewport
  const preloadMode = effectivePoster ? 'none' : isInViewport ? 'metadata' : 'none';
  const effectiveSrc = React.useMemo(() => {
    if (!playableUrl) return '';
    if (effectivePoster) return playableUrl;
    if (!isInViewport) return playableUrl;
    return playableUrl.includes('#') ? playableUrl : `${playableUrl}#t=0.001`;
  }, [playableUrl, effectivePoster, isInViewport]);

  // Pause previous playing video when this one plays
  const handlePlayStateChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
    if (playing && videoRef.current) {
      if (currentlyPlayingVideo && currentlyPlayingVideo !== videoRef.current) {
        try {
          currentlyPlayingVideo.pause();
        } catch {}
      }
      currentlyPlayingVideo = videoRef.current;
    }
  }, []);

  // Controls visibility timer (for non-compact)
  const triggerControlsVisibility = () => {
    if (compact) return;
    setShowControls(true);
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    hideControlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, 2800);
  };

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch((err) => {
        console.warn('[VideoPlayer] Play interrupted or denied:', err);
      });
    } else {
      vid.pause();
    }
  };

  const handleStop = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;
    vid.pause();
    vid.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const toggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;
    const nextMuted = !vid.muted;
    vid.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;
    const val = parseFloat(e.target.value);
    vid.currentTime = val;
    setCurrentTime(val);
  };

  const toggleFullscreen = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const container = containerRef.current;
    const vid = videoRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => {});
    } else if ((vid as any)?.webkitEnterFullscreen) {
      // iOS Safari fallback
      (vid as any).webkitEnterFullscreen();
    }
  };

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard controls: Space/K play-pause, M mute
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') {
      return;
    }
    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleMute();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    const vid = videoRef.current;
    return () => {
      if (currentlyPlayingVideo === vid) {
        currentlyPlayingVideo = null;
      }
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, []);

  // Error retry
  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasPlaybackError(false);
    retry();
    if (videoRef.current) {
      videoRef.current.load();
    }
  };

  const isErrorState = isUrlError || hasPlaybackError;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={triggerControlsVisibility}
      onMouseMove={triggerControlsVisibility}
      onMouseLeave={() => {
        if (!compact && isPlaying) setShowControls(false);
      }}
      onClick={(e) => {
        if (compact) {
          onExpand?.();
        } else {
          triggerControlsVisibility();
        }
      }}
      className={`relative select-none overflow-hidden bg-black flex items-center justify-center outline-hidden group focus-visible:ring-2 focus-visible:ring-[#FF8800] ${className}`}
    >
      {/* Underlying HTML5 Video element — NEVER with crossOrigin */}
      {effectiveSrc && (
        <video
          ref={videoRef}
          src={effectiveSrc}
          poster={effectivePoster}
          preload={preloadMode}
          playsInline
          autoPlay={autoPlay && isMuted}
          muted={isMuted}
          loop={loop}
          className="w-full h-full object-cover"
          onPlay={() => handlePlayStateChange(true)}
          onPause={() => handlePlayStateChange(false)}
          onEnded={() => {
            handlePlayStateChange(false);
            if (!loop) handleStop();
          }}
          onWaiting={() => setIsWaiting(true)}
          onPlaying={() => setIsWaiting(false)}
          onCanPlay={() => setIsWaiting(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0);
            setIsWaiting(false);
            setHasPlaybackError(false);
          }}
          onError={() => {
            setIsWaiting(false);
            setHasPlaybackError(true);
          }}
        />
      )}

      {/* Loading Spinner */}
      {(isUrlLoading || isWaiting) && !isErrorState && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs pointer-events-none z-10">
          <Loader2 className="w-8 h-8 text-[#FF8800] animate-spin" />
        </div>
      )}

      {/* Error state: "Video unavailable" with Retry and "Open in new tab" */}
      {isErrorState && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 bg-black/85 text-center text-white z-20 gap-2">
          <p className="text-xs font-semibold text-rose-400">Video unavailable</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Retry</span>
            </button>
            {(playableUrl || src) && (
              <a
                href={playableUrl || src}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink size={13} />
                <span>Open in new tab</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* COMPACT MODE CONTROLS: Only Play/Pause + Stop */}
      {compact && !isErrorState && (
        <>
          {/* Subtle play badge overlay when paused */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none transition-colors group-hover:bg-black/15">
              <div className="w-9 h-9 rounded-full bg-black/70 backdrop-blur-md flex items-center justify-center text-white shadow-md">
                <Play size={15} className="ml-0.5 fill-white" />
              </div>
            </div>
          )}

          {/* Interactive controls bar on hover or while playing */}
          <div
            className={`absolute bottom-2 inset-x-2 flex items-center justify-center gap-2 z-20 transition-opacity duration-200 ${
              isPlaying
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
            }`}
          >
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-full bg-black/80 hover:bg-[#FF8800] backdrop-blur-md text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg"
            >
              {isPlaying ? (
                <Pause size={18} className="fill-white" />
              ) : (
                <Play size={18} className="ml-0.5 fill-white" />
              )}
            </button>

            {isPlaying && (
              <button
                type="button"
                onClick={handleStop}
                aria-label="Stop"
                className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-full bg-black/80 hover:bg-rose-500 backdrop-blur-md text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg"
              >
                <Square size={16} className="fill-white" />
              </button>
            )}
          </div>
        </>
      )}

      {/* FULL MODE CONTROLS (Center Play/Pause, Stop, seek bar, time, mute, fullscreen) */}
      {!compact && !isErrorState && (
        <div
          className={`absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-200 z-20 ${
            !isPlaying || showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Top spacer or badges */}
          <div className="p-3 flex justify-end items-center pointer-events-auto">
            {/* Can host extra badges if needed */}
          </div>

          {/* Center Play/Pause & Stop Button */}
          <div className="flex items-center justify-center gap-3 pointer-events-auto">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="min-h-[44px] min-w-[44px] w-12 h-12 rounded-full bg-black/75 hover:bg-[#FF8800] backdrop-blur-md text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xl ring-1 ring-white/20"
            >
              {isPlaying ? (
                <Pause size={20} className="fill-white" />
              ) : (
                <Play size={20} className="ml-0.5 fill-white" />
              )}
            </button>
            {isPlaying && (
              <button
                type="button"
                onClick={handleStop}
                aria-label="Stop"
                className="min-h-[44px] min-w-[44px] w-12 h-12 rounded-full bg-black/75 hover:bg-rose-600 backdrop-blur-md text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xl ring-1 ring-white/20"
              >
                <Square size={17} className="fill-white" />
              </button>
            )}
          </div>

          {/* Bottom Bar: Seek slider, time, mute, fullscreen */}
          <div className="p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 pointer-events-auto">
            {/* Seek Bar */}
            <div className="w-full flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step="any"
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek video"
                className="w-full h-1.5 bg-white/30 rounded-lg appearance-none cursor-pointer accent-[#FF8800] focus:outline-hidden"
              />
            </div>

            {/* Bottom Row controls */}
            <div className="flex items-center justify-between text-white text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>

                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="Stop"
                  className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Square size={14} />
                </button>

                <span className="font-mono text-[11px] tabular-nums text-white/90">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
                >
                  {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
                >
                  {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
