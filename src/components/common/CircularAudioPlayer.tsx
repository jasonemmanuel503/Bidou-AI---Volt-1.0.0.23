import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, Loader2 } from 'lucide-react';
import { usePlayableUrl } from '../../services/media';
import {
  sourceNodeCache,
  getSharedAudioContext,
  claimActiveAudio,
  releaseActiveAudio,
  formatAudioTime,
} from '../../lib/audioPlayback';

export interface CircularAudioPlayerProps {
  src: string;
  variantId?: string;
  coverArtUrl?: string;
  title?: string;
  artist?: string;
  size?: number; // 280 (lightbox), 180 (studio canvas), 120 (tile), 72 (recent)
  autoPlay?: boolean;
  initialTime?: number;
  onSnapshot?: (snapshot: { currentTime: number; wasPlaying: boolean }) => void;
  className?: string;
  onEnded?: () => void;
  showControls?: boolean;
}

export const CircularAudioPlayer: React.FC<CircularAudioPlayerProps> = ({
  src,
  variantId,
  coverArtUrl,
  title,
  artist,
  size = 180,
  autoPlay = false,
  initialTime = 0,
  onSnapshot,
  className = '',
  onEnded,
  showControls = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Phase 5.2 & 5.3: Resolve source via usePlayableUrl with signed URL
  const {
    url: playableUrl,
    isLoading: isUrlLoading,
    error: urlError,
    retry,
  } = usePlayableUrl(variantId, src, { mediaType: 'audio' });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [analyserAvailable, setAnalyserAvailable] = useState(true);
  const [isTainted, setIsTainted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isTaintedRef = useRef<boolean>(false);
  const consecutiveZeroBinsRef = useRef<number>(0);
  const probeTimerRef = useRef<any>(null);
  const warnedErrorCodeRef = useRef<number | null>(null);
  const autoPlayAttemptedRef = useRef(false);
  const appliedInitialTimeRef = useRef(false);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  // Audio analysis and animation refs
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const rotationAngleRef = useRef<number>(0);
  const lastRafTimeRef = useRef<number>(performance.now());
  const smoothedBarsRef = useRef<Float32Array>(new Float32Array(64));
  const isVisibleRef = useRef<boolean>(true);

  // Determine layout details based on size
  const hasSpectrum = size >= 150;
  const isCompact = size <= 140;
  const isMini = size <= 80;

  // Track error state
  const hasError = Boolean(loadError || urlError || (!isUrlLoading && !playableUrl));

  // Formatting helper
  const formatTime = formatAudioTime;

  // Visibility & Intersection Observers
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let observer: IntersectionObserver | null = null;
    if (containerRef.current) {
      observer = new IntersectionObserver(([entry]) => {
        isVisibleRef.current = entry.isIntersecting && document.visibilityState === 'visible';
      });
      observer.observe(containerRef.current);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (observer) observer.disconnect();
    };
  }, []);

  // Web Audio connection logic (Fire-and-forget inside user gesture, Section 5.3)
  const initWebAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || isTaintedRef.current) return;

    try {
      const ctx = getSharedAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

        let source = sourceNodeCache.get(audio);
        if (!source) {
          source = ctx.createMediaElementSource(audio);
          sourceNodeCache.set(audio, source);
        }

        // Connect source -> analyser -> destination
        source.connect(analyser);
        analyser.connect(ctx.destination);
        setAnalyserAvailable(true);
      }
    } catch (err) {
      console.warn('[WebAudio] Web Audio connection fallback activated:', err);
      setAnalyserAvailable(false);
    }
  }, []);

  // Phase 5.3: Taint probe — never mute the track, use synthetic pulse on taint
  const runTaintProbe = useCallback(() => {
    if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
    probeTimerRef.current = setTimeout(() => {
      if (isTaintedRef.current) return;
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.volume <= 0 || audio.currentTime <= 1.0) return;

      const ctx = getSharedAudioContext();
      if (ctx.state !== 'running') return;

      if (analyserRef.current && dataArrayRef.current) {
        try {
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);
          let sum = 0;
          for (let i = 0; i < dataArrayRef.current.length; i++) {
            sum += dataArrayRef.current[i];
          }

          if (sum === 0) {
            consecutiveZeroBinsRef.current += 1;
            if (consecutiveZeroBinsRef.current >= 3) {
              console.warn(
                '[CORS Probe] Detected suspected tainted media element. Switching to synthetic visualizer without disconnecting audio output.'
              );
              isTaintedRef.current = true;
              setIsTainted(true);
              setAnalyserAvailable(false);
              // Leave graph connected (source -> analyser -> destination) so sound continues playing!
            } else {
              runTaintProbe();
            }
          } else {
            consecutiveZeroBinsRef.current = 0;
          }
        } catch (e) {
          console.warn('[CORS Probe] Exception checking frequency data:', e);
        }
      }
    }, 500);
  }, []);

  // Clean up probe timer and active audio on unmount
  useEffect(() => {
    return () => {
      if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
      if (audioRef.current) {
        releaseActiveAudio(audioRef.current);
      }
    };
  }, []);

  // Snapshot emission helper for state lifting across modal / dock modes
  const emitSnapshot = useCallback(() => {
    const audio = audioRef.current;
    if (audio && onSnapshotRef.current) {
      onSnapshotRef.current({
        currentTime: audio.currentTime,
        wasPlaying: !audio.paused,
      });
    }
  }, []);

  // Media event handlers: states come STRICTLY from media events
  const handlePlayEvent = () => {
    const audio = audioRef.current;
    if (audio) {
      claimActiveAudio(audio);
    }
    setIsPlaying(true);
    emitSnapshot();
    runTaintProbe();
  };

  const handlePauseEvent = () => {
    const audio = audioRef.current;
    if (audio) {
      releaseActiveAudio(audio);
    }
    if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
    setIsPlaying(false);
    emitSnapshot();
  };

  const handleAudioError = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    const mediaErr = e.currentTarget.error;
    const code = mediaErr ? mediaErr.code : -1;
    if (warnedErrorCodeRef.current !== code) {
      warnedErrorCodeRef.current = code;
      console.warn(
        `[CircularAudioPlayer] Media element error (code ${code}):`,
        mediaErr?.message || 'Media load failed'
      );
    }
    setLoadError(`Media error (${code})`);
    setIsPlaying(false);
  };

  const handleRetry = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLoadError(null);
    warnedErrorCodeRef.current = null;
    retry();
  };

  // Phase 5.3: Play inside the gesture (Safari requirement)
  const togglePlay = () => {
    if (hasError) {
      handleRetry();
      return;
    }

    const audio = audioRef.current;
    if (!audio || isUrlLoading) return;

    if (audio.paused) {
      // 1. Call play() first synchronously in the user gesture
      const playPromise = audio.play();
      // 2. Fire and forget Web Audio initialization
      initWebAudio().catch(() => {});
      // 3. Handle play failure gracefully
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          console.warn('[CircularAudioPlayer] Playback request failed:', e);
        });
      }
    } else {
      audio.pause();
    }
  };

  // Phase 5.3: AutoPlay effect with NotAllowedError handling
  useEffect(() => {
    if (!autoPlay || autoPlayAttemptedRef.current || !playableUrl) return;
    const audio = audioRef.current;
    if (!audio) return;

    autoPlayAttemptedRef.current = true;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          initWebAudio().catch(() => {});
        })
        .catch((err) => {
          if (err.name !== 'NotAllowedError') {
            console.warn('[CircularAudioPlayer] Autoplay prevented:', err);
          }
        });
    }
  }, [autoPlay, playableUrl, initWebAudio]);

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration || 0);

    if (initialTime > 0 && !appliedInitialTimeRef.current) {
      appliedInitialTimeRef.current = true;
      audio.currentTime = initialTime;
      setCurrentTime(initialTime);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio && !isDraggingSeek) {
      setCurrentTime(audio.currentTime);
      emitSnapshot();
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Canvas Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    // Layer dimensions
    const discRadius = hasSpectrum ? size * 0.28 : size * 0.4;
    const spectrumInnerR = discRadius + (hasSpectrum ? 6 : 0);
    const maxBarLen = hasSpectrum ? size / 2 - spectrumInnerR - 10 : 0;
    const progressRadius = size / 2 - 4;

    const render = (now: number) => {
      rafIdRef.current = requestAnimationFrame(render);

      if (!isVisibleRef.current) {
        lastRafTimeRef.current = now;
        return;
      }

      const delta = (now - lastRafTimeRef.current) / 1000;
      lastRafTimeRef.current = now;

      // Disc rotation: ~8 RPM when playing
      if (isPlaying) {
        const radPerSec = (8 * 2 * Math.PI) / 60; // 8 RPM in radians
        rotationAngleRef.current += radPerSec * delta;
      }

      ctx.clearRect(0, 0, size, size);

      // --- 1. Spectrum Ring (64 bars) ---
      if (hasSpectrum && maxBarLen > 0) {
        const numBars = 64;
        let freqData: Uint8Array | null = null;

        if (analyserAvailable && analyserRef.current && dataArrayRef.current && !isTainted) {
          try {
            analyserRef.current.getByteFrequencyData(dataArrayRef.current);
            freqData = dataArrayRef.current;
          } catch {
            freqData = null;
          }
        }

        const smoothed = smoothedBarsRef.current;
        for (let i = 0; i < numBars; i++) {
          let rawVal = 0;
          if (isPlaying) {
            if (freqData && freqData.length > 0) {
              const binIndex = Math.min(
                Math.floor((i / numBars) * (freqData.length * 0.7)),
                freqData.length - 1
              );
              rawVal = freqData[binIndex] / 255;
            } else {
              // Deterministic synthetic pulse based on position and bar index
              const synth = Math.sin(i * 0.4 + currentTime * 5) * 0.5 + 0.5;
              rawVal = 0.2 + synth * 0.6;
            }
          } else {
            rawVal = 0.05;
          }

          // Exponential smoothing
          smoothed[i] = smoothed[i] * 0.75 + rawVal * 0.25;
          const barHeight = Math.max(3, smoothed[i] * maxBarLen);

          const angle = (i / numBars) * Math.PI * 2;
          const x1 = center + Math.cos(angle) * spectrumInnerR;
          const y1 = center + Math.sin(angle) * spectrumInnerR;
          const x2 = center + Math.cos(angle) * (spectrumInnerR + barHeight);
          const y2 = center + Math.sin(angle) * (spectrumInnerR + barHeight);

          const grad = ctx.createLinearGradient(x1, y1, x2, y2);
          grad.addColorStop(0, '#F86A00');
          grad.addColorStop(1, '#FFB020');

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = grad;
          ctx.lineWidth = Math.max(1.5, (size / 180) * 2.2);
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }

      // --- 2. Progress Ring Arc ---
      ctx.beginPath();
      ctx.arc(center, center, progressRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 136, 0, 0.15)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      const progress = duration > 0 ? currentTime / duration : 0;
      if (progress > 0) {
        ctx.beginPath();
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + Math.PI * 2 * Math.min(1, Math.max(0, progress));
        ctx.arc(center, center, progressRadius, startAngle, endAngle);
        ctx.strokeStyle = '#FF8800';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        const thumbX = center + Math.cos(endAngle) * progressRadius;
        const thumbY = center + Math.sin(endAngle) * progressRadius;
        ctx.beginPath();
        ctx.arc(thumbX, thumbY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    rafIdRef.current = requestAnimationFrame(render);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [size, hasSpectrum, isPlaying, analyserAvailable, isTainted, currentTime, duration]);

  // Handle Seek Dragging
  const handleSeekEvent = (e: MouseEvent | React.MouseEvent) => {
    if (!duration || duration <= 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;

    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;

    const frac = angle / (Math.PI * 2);
    const targetTime = frac * duration;
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      emitSnapshot();
    }
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dist = Math.hypot(
      e.clientX - (rect.left + rect.width / 2),
      e.clientY - (rect.top + rect.height / 2)
    );
    const radius = size / 2;
    if (dist >= radius - 20) {
      setIsDraggingSeek(true);
      handleSeekEvent(e);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSeek) handleSeekEvent(e);
    };
    const handleMouseUp = () => {
      if (isDraggingSeek) setIsDraggingSeek(false);
    };
    if (isDraggingSeek) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSeek, duration]);

  const discRadius = hasSpectrum ? size * 0.28 : size * 0.4;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col items-center select-none ${className}`}
      style={{ width: size }}
    >
      {/* Hidden Audio Element — rendered ONLY when playableUrl is non-empty */}
      {playableUrl ? (
        <audio
          ref={audioRef}
          crossOrigin="anonymous"
          src={playableUrl}
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            handlePauseEvent();
            onEnded?.();
          }}
          onPlay={handlePlayEvent}
          onPause={handlePauseEvent}
          onError={handleAudioError}
        />
      ) : null}

      {/* Main Circular Visualizer Stage */}
      <div
        className="relative flex items-center justify-center cursor-pointer"
        style={{ width: size, height: size }}
        onMouseDown={onMouseDown}
      >
        {/* Canvas for Spectrum and Progress Ring */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: size, height: size }}
        />

        {/* Central Rotating Vinyl Disc */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          className={`relative rounded-full shadow-lg border-2 border-black/20 dark:border-white/20 overflow-hidden flex items-center justify-center transition-transform active:scale-95 group ${
            isUrlLoading ? 'opacity-80 cursor-wait' : 'cursor-pointer'
          }`}
          style={{
            width: discRadius * 2,
            height: discRadius * 2,
            transform: `rotate(${rotationAngleRef.current}rad)`,
          }}
        >
          {coverArtUrl ? (
            <img
              src={coverArtUrl}
              alt="Cover Art"
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-full h-full bg-brand-gradient flex items-center justify-center text-white" />
          )}

          {/* Vinyl Grooves Overlay */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, transparent 35%, rgba(0,0,0,0.15) 36%, transparent 38%, rgba(255,255,255,0.1) 50%, transparent 52%, rgba(0,0,0,0.3) 70%, transparent 72%)',
            }}
          />

          {/* Spindle Hole */}
          <div className="absolute w-3 h-3 rounded-full bg-white dark:bg-[#1A1A1E] border-2 border-[#FF8800] shadow-xs z-10" />

          {/* Play/Pause/Loading Hover Overlay */}
          <div className={`absolute inset-0 bg-black/40 ${isUrlLoading || isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity flex items-center justify-center text-white z-20`}>
            {isUrlLoading ? (
              <Loader2 size={isMini ? 14 : isCompact ? 16 : 24} className="animate-spin text-white" />
            ) : isPlaying ? (
              <Pause size={isMini ? 14 : isCompact ? 16 : 24} />
            ) : (
              <Play size={isMini ? 14 : isCompact ? 16 : 24} className="fill-white" />
            )}
          </div>
        </div>
      </div>

      {/* Track unavailable · Retry banner (Phase 5.3) */}
      {hasError && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[#A0A0AA] bg-black/40 px-2 py-0.5 rounded-full border border-white/10 z-20">
          <span>Track unavailable</span>
          <span>·</span>
          <button
            type="button"
            onClick={handleRetry}
            className="text-[#FF8800] hover:text-amber-400 font-semibold underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Track info and controls */}
      {showControls && !hasError && (
        <div className="w-full mt-3 flex flex-col items-center text-center gap-1.5">
          {title && (
            <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate max-w-[240px]">
              {title}
            </span>
          )}
          {artist && (
            <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] truncate max-w-[200px]">
              {artist}
            </span>
          )}

          {/* Time and buttons bar */}
          <div className="flex items-center justify-center gap-3 mt-1">
            <span className="font-mono text-[10px] text-[#6B6B75] dark:text-[#A0A0AA]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <button
              type="button"
              disabled={isUrlLoading}
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="p-2 rounded-full bg-brand-gradient text-white shadow hover:opacity-95 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isUrlLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={14} />
              ) : (
                <Play size={14} className="fill-white" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="p-1.5 rounded-lg text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>

            {playableUrl && (
              <a
                href={playableUrl}
                download={title ? `${title}.mp3` : 'bidou-track.mp3'}
                target="_blank"
                rel="noreferrer"
                aria-label="Download audio track"
                className="p-1.5 rounded-lg text-[#6B6B75] hover:text-[#FF8800] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Download size={14} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
