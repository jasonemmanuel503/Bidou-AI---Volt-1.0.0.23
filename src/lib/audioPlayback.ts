import { useState, useEffect, useCallback } from 'react';
import { getPlayableUrl } from '../services/media';

/**
 * Shared Audio Playback Singleton & Hook (Phase 1 & 2 Music Redesign)
 *
 * Ensures at most ONE audio track plays at a time across:
 * - Studio MusicTrackRow items
 * - Mobile MusicTrackSheet
 * - Sticky MusicMiniPlayer
 * - CircularAudioPlayer (Lightbox & Library)
 *
 * Reuses the single AudioContext and WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>
 * pattern from CircularAudioPlayer so Web Audio / CORS taint handling stays identical.
 */

export interface TrackPlaybackMeta {
  variantId: string;
  jobId: string;
  src: string;
  title: string;
  modelName?: string;
  genre?: string;
  tonality?: string;
  coverArtUrl?: string;
  durationSeconds?: number;
}

export interface PlaybackSnapshot {
  activeTrack: TrackPlaybackMeta | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
  miniPlayerVisible: boolean;
}

// Global WeakMap caching MediaElementAudioSourceNode per HTMLAudioElement
export const sourceNodeCache = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

// Shared AudioContext to prevent exceeding browser caps (~6 concurrent instances in Chrome)
let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
}

// Module-level reference to the currently playing HTMLAudioElement (one at a time across the whole app)
let activePlayerAudio: HTMLAudioElement | null = null;

/**
 * Claims exclusive playback for `audio`, pausing any other active HTMLAudioElement.
 */
export function claimActiveAudio(audio: HTMLAudioElement): void {
  if (activePlayerAudio && activePlayerAudio !== audio) {
    try {
      activePlayerAudio.pause();
    } catch {
      // ignore pause errors on detached elements
    }
  }
  activePlayerAudio = audio;
}

/**
 * Releases exclusive playback reference if `audio` is currently the active player.
 */
export function releaseActiveAudio(audio: HTMLAudioElement): void {
  if (activePlayerAudio === audio) {
    activePlayerAudio = null;
  }
}

export function getActivePlayerAudio(): HTMLAudioElement | null {
  return activePlayerAudio;
}

/**
 * Formats seconds into m:ss (e.g. 0:42, 2:10).
 */
export function formatAudioTime(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Singleton HTMLAudioElement used by MusicTrackRow, MusicTrackSheet, and MusicMiniPlayer
let sharedRowAudio: HTMLAudioElement | null = null;
let loadRequestId = 0;

// Per-variant discovered real duration cache (in seconds)
const discoveredDurations = new Map<string, number>();
const pendingProbes = new Set<string>();
const probeQueue: Array<() => void> = [];
let activeProbeCount = 0;
const MAX_CONCURRENT_PROBES = 2;

function runNextProbe(): void {
  while (activeProbeCount < MAX_CONCURRENT_PROBES && probeQueue.length > 0) {
    const next = probeQueue.shift();
    if (next) {
      activeProbeCount++;
      next();
    }
  }
}

function probeVariantDuration(
  variantId: string,
  fallbackUrl: string,
  onDiscovered: (dur: number) => void
): void {
  if (typeof window === 'undefined' || !variantId || !fallbackUrl) return;
  const cached = discoveredDurations.get(variantId);
  if (cached && cached > 0) {
    onDiscovered(cached);
    return;
  }
  if (pendingProbes.has(variantId)) return;
  pendingProbes.add(variantId);

  probeQueue.push(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      activeProbeCount = Math.max(0, activeProbeCount - 1);
      runNextProbe();
    };

    getPlayableUrl(variantId, { mediaType: 'audio', fallbackUrl })
      .then((resolved) => {
        const url = resolved || fallbackUrl;
        if (!url) {
          finish();
          return;
        }
        const probe = new Audio();
        probe.preload = 'metadata';
        const timeout = setTimeout(() => {
          probe.src = '';
          finish();
        }, 8000);

        probe.onloadedmetadata = () => {
          clearTimeout(timeout);
          const dur = probe.duration;
          probe.src = '';
          if (Number.isFinite(dur) && dur > 0) {
            discoveredDurations.set(variantId, dur);
            onDiscovered(dur);
          }
          finish();
        };
        probe.onerror = () => {
          clearTimeout(timeout);
          probe.src = '';
          finish();
        };
        probe.src = url;
      })
      .catch(() => {
        finish();
      });
  });

  runNextProbe();
}

let state: PlaybackSnapshot = {
  activeTrack: null,
  isPlaying: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  error: null,
  miniPlayerVisible: false,
};

type Listener = (snapshot: PlaybackSnapshot, prevVariantId: string | null) => void;
const listeners = new Set<Listener>();

function emitChange(prevVariantId: string | null = state.activeTrack?.variantId ?? null): void {
  for (const listener of listeners) {
    listener(state, prevVariantId);
  }
}

function updateState(partial: Partial<PlaybackSnapshot>): void {
  const prevVariantId = state.activeTrack?.variantId ?? null;
  state = { ...state, ...partial };
  emitChange(prevVariantId);
}

function ensureSharedRowAudio(): HTMLAudioElement {
  if (sharedRowAudio) return sharedRowAudio;

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';

  audio.addEventListener('play', () => {
    claimActiveAudio(audio);
    updateState({ isPlaying: true, isLoading: false, error: null, miniPlayerVisible: true });
  });

  audio.addEventListener('pause', () => {
    releaseActiveAudio(audio);
    updateState({ isPlaying: false });
  });

  audio.addEventListener('loadedmetadata', () => {
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : state.duration;
    if (dur > 0 && state.activeTrack?.variantId) {
      discoveredDurations.set(state.activeTrack.variantId, dur);
    }
    updateState({ duration: dur, isLoading: false });
  });

  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      if (state.activeTrack?.variantId) {
        discoveredDurations.set(state.activeTrack.variantId, audio.duration);
      }
      updateState({ duration: audio.duration });
    }
  });

  audio.addEventListener('timeupdate', () => {
    updateState({ currentTime: audio.currentTime });
  });

  audio.addEventListener('ended', () => {
    releaseActiveAudio(audio);
    updateState({ isPlaying: false, currentTime: 0 });
  });

  audio.addEventListener('error', () => {
    // If crossOrigin="anonymous" caused a CORS media error on an external URL, retry without crossOrigin
    if (audio.crossOrigin === 'anonymous' && state.activeTrack?.src) {
      audio.crossOrigin = null;
      const currentSrc = audio.src;
      audio.src = currentSrc;
      audio.load();
      audio.play().catch(() => {
        updateState({
          isPlaying: false,
          isLoading: false,
          error: 'Track unavailable',
        });
      });
      return;
    }

    releaseActiveAudio(audio);
    updateState({
      isPlaying: false,
      isLoading: false,
      error: 'Track unavailable',
    });
  });

  sharedRowAudio = audio;
  return audio;
}

/**
 * Starts or resumes playback for the given track metadata.
 */
export async function playTrack(meta: TrackPlaybackMeta): Promise<void> {
  if (typeof window === 'undefined') return;
  const audio = ensureSharedRowAudio();
  const isSameTrack = state.activeTrack?.variantId === meta.variantId;

  if (isSameTrack && audio.src && !state.error) {
    claimActiveAudio(audio);
    try {
      await audio.play();
    } catch (err) {
      console.warn('[audioPlayback] Play failed:', err);
    }
    return;
  }

  const reqId = ++loadRequestId;
  // Pause any currently playing element immediately
  if (activePlayerAudio && activePlayerAudio !== audio) {
    try {
      activePlayerAudio.pause();
    } catch {
      // ignore
    }
  }
  audio.pause();

  updateState({
    activeTrack: meta,
    isPlaying: false,
    isLoading: true,
    currentTime: 0,
    duration: meta.durationSeconds || 0,
    error: null,
    miniPlayerVisible: true,
  });

  try {
    const resolvedUrl = await getPlayableUrl(meta.variantId, {
      mediaType: 'audio',
      fallbackUrl: meta.src,
    });

    if (reqId !== loadRequestId) return;

    const finalUrl = resolvedUrl || meta.src;
    if (!finalUrl) {
      updateState({ isLoading: false, error: 'Track unavailable' });
      return;
    }

    audio.crossOrigin = 'anonymous';
    audio.src = finalUrl;
    audio.currentTime = 0;
    claimActiveAudio(audio);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
  } catch (err) {
    if (reqId !== loadRequestId) return;
    console.warn('[audioPlayback] Failed to start track playback:', err);
    updateState({
      isPlaying: false,
      isLoading: false,
      error: 'Track unavailable',
    });
  }
}

/**
 * Pauses the shared row audio player if playing.
 */
export function pauseTrack(): void {
  if (sharedRowAudio && !sharedRowAudio.paused) {
    sharedRowAudio.pause();
  }
}

/**
 * Toggles play/pause for a given track.
 */
export function toggleTrack(meta: TrackPlaybackMeta): void {
  const isSameTrack = state.activeTrack?.variantId === meta.variantId;
  if (isSameTrack && state.isPlaying) {
    pauseTrack();
  } else {
    void playTrack(meta);
  }
}

/**
 * Seeks to a specific time (in seconds). If a different track is passed, loads it at that time.
 */
export function seekTrack(seconds: number, meta?: TrackPlaybackMeta): void {
  if (typeof window === 'undefined') return;
  const audio = ensureSharedRowAudio();

  if (meta && state.activeTrack?.variantId !== meta.variantId) {
    updateState({
      activeTrack: meta,
      currentTime: seconds,
      duration: meta.durationSeconds || 0,
      miniPlayerVisible: true,
    });
    return;
  }

  const clamped = Math.max(0, Math.min(seconds, state.duration || audio.duration || seconds));
  try {
    if (audio.readyState >= 1) {
      audio.currentTime = clamped;
    }
  } catch {
    // ignore seek before metadata
  }
  updateState({ currentTime: clamped });
}

/**
 * Closes the sticky mini player and pauses shared audio.
 */
export function dismissMiniPlayer(): void {
  pauseTrack();
  updateState({ miniPlayerVisible: false, isPlaying: false });
}

export function getPlaybackSnapshot(): PlaybackSnapshot {
  return state;
}

/**
 * Subscribes a specific track row (by variantId) to playback changes.
 * Non-active rows do NOT re-render on `timeupdate` ticks of another track.
 */
export interface TrackRowPlaybackState {
  isActive: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
  toggle: () => void;
  seek: (seconds: number) => void;
}

export function useTrackPlayback(meta: TrackPlaybackMeta): TrackRowPlaybackState {
  const { variantId, durationSeconds } = meta;

  const [rowState, setRowState] = useState<{
    isActive: boolean;
    isPlaying: boolean;
    isLoading: boolean;
    currentTime: number;
    duration: number;
    error: string | null;
  }>(() => {
    const isActive = state.activeTrack?.variantId === variantId;
    const cachedDur = discoveredDurations.get(variantId) || durationSeconds || 0;
    return {
      isActive,
      isPlaying: isActive ? state.isPlaying : false,
      isLoading: isActive ? state.isLoading : false,
      currentTime: isActive ? state.currentTime : 0,
      duration: isActive && state.duration > 0 ? state.duration : cachedDur,
      error: isActive ? state.error : null,
    };
  });

  // Pre-warm signed URL and probe real MP3 duration per variant
  useEffect(() => {
    if (variantId && !variantId.startsWith('syn_') && meta.src) {
      probeVariantDuration(variantId, meta.src, (dur) => {
        setRowState((prev) => (prev.duration === dur ? prev : { ...prev, duration: dur }));
      });
    }
  }, [variantId, meta.src]);

  useEffect(() => {
    const handleUpdate: Listener = (snap, prevVariantId) => {
      const isNowActive = snap.activeTrack?.variantId === variantId;
      const wasActive = prevVariantId === variantId;

      // Ignore updates that neither involve nor previously involved this row's variantId
      if (!isNowActive && !wasActive) return;

      const fallbackDur = discoveredDurations.get(variantId) || durationSeconds || 0;

      if (!isNowActive) {
        setRowState((prev) => {
          if (!prev.isActive && !prev.isPlaying && !prev.isLoading && prev.currentTime === 0 && !prev.error) {
            return prev;
          }
          return {
            isActive: false,
            isPlaying: false,
            isLoading: false,
            currentTime: 0,
            duration: fallbackDur,
            error: null,
          };
        });
        return;
      }

      setRowState({
        isActive: true,
        isPlaying: snap.isPlaying,
        isLoading: snap.isLoading,
        currentTime: snap.currentTime,
        duration: snap.duration > 0 ? snap.duration : fallbackDur,
        error: snap.error,
      });
    };

    // Sync immediately on mount/variantId change
    handleUpdate(state, state.activeTrack?.variantId ?? null);

    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, [variantId, durationSeconds]);

  const toggle = useCallback(() => {
    toggleTrack(meta);
  }, [meta]);

  const seek = useCallback(
    (seconds: number) => {
      seekTrack(seconds, meta);
    },
    [meta]
  );

  return {
    ...rowState,
    toggle,
    seek,
  };
}

/**
 * Hook for global consumers like MusicMiniPlayer and MusicTrackSheet.
 */
export function useGlobalAudioPlayback(): PlaybackSnapshot & {
  toggleActive: () => void;
  seekActive: (seconds: number) => void;
  dismiss: () => void;
} {
  const [snap, setSnap] = useState<PlaybackSnapshot>(() => state);

  useEffect(() => {
    const listener: Listener = (next) => {
      setSnap(next);
    };
    setSnap(state);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const toggleActive = useCallback(() => {
    if (state.activeTrack) {
      toggleTrack(state.activeTrack);
    }
  }, []);

  const seekActive = useCallback((seconds: number) => {
    seekTrack(seconds);
  }, []);

  const dismiss = useCallback(() => {
    dismissMiniPlayer();
  }, []);

  return {
    ...snap,
    toggleActive,
    seekActive,
    dismiss,
  };
}
