import { useState, useEffect, useCallback } from 'react';
import { persistence } from './persistence';
import { getAuthToken } from './authToken';

/**
 * Media Service (Section F & Phase 5 — CORS & Signed Same-Origin Media Delivery)
 *
 * Web Audio is the strictest media consumer in the browser:
 * AudioContext.createMediaElementSource(el) reads raw audio samples.
 * If the response lacks Access-Control-Allow-Origin, the element is tainted,
 * routing pure silence to ctx.destination.
 *
 * Serving audio same-origin via signed /api/media/:variantId guarantees:
 * 1. Never tainted in any browser (Chrome, Safari, iOS Safari, Firefox).
 * 2. Full HTTP Range support (206 Partial Content) for seeking & audio buffering.
 * 3. Consistent, reliable spectrum ring visualizer animations.
 * 4. No JWT Bearer required by <audio> and <video> tags.
 */

export interface MediaUrlOptions {
  mediaType?: 'audio' | 'video' | 'image' | 'voice';
  scale?: '1080p' | '1k' | '2k' | '4k' | string | null;
  token?: string;
  direct?: boolean;
  fallbackUrl?: string;
}

export interface PlayableUrlOptions {
  scale?: string | null;
  mediaType?: 'audio' | 'video' | 'image' | 'voice';
  token?: string;
  fallbackUrl?: string;
}

/**
 * Returns a valid video poster image URL, or undefined if the thumbnail
 * equals the media URL or points to a video stream (.mp4/.webm/.mov).
 */
export function posterFor(
  thumbnailUrl?: string | null,
  mediaUrl?: string | null
): string | undefined {
  if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return undefined;
  const trimmedThumb = thumbnailUrl.trim();
  if (!trimmedThumb) return undefined;
  if (mediaUrl && trimmedThumb === mediaUrl.trim()) return undefined;
  const cleanUrl = trimmedThumb.split('?')[0].split('#')[0].toLowerCase();
  if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov')) {
    return undefined;
  }
  return trimmedThumb;
}

// In-memory cache for signed media URLs
const mediaUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Clears the module-level media URL cache across session resets / sign-outs.
 */
export function clearMediaUrlCache(): void {
  mediaUrlCache.clear();
}

/**
 * Resolves a signed same-origin playable URL for a given variantId.
 * Caches URLs in memory and refreshes 60s before expiry.
 */
export async function getPlayableUrl(
  variantId?: string | null,
  options: PlayableUrlOptions = {}
): Promise<string> {
  const fallbackUrl = options.fallbackUrl || '';

  // Rule 1: variantId starting with 'syn_' or missing means use fallbackUrl directly
  // (only if same-origin or an absolute public URL)
  if (!variantId || variantId.startsWith('syn_')) {
    if (fallbackUrl && (fallbackUrl.startsWith('/') || /^https?:\/\//i.test(fallbackUrl))) {
      return fallbackUrl;
    }
    return fallbackUrl;
  }

  const cacheKey = `${variantId}:${options.scale || ''}`;
  const cached = mediaUrlCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt - now > 60_000) {
    return cached.url;
  }

  try {
    const token = options.token || (await getAuthToken());
    const resp = await fetch(`/api/media/${encodeURIComponent(variantId)}/url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ scale: options.scale || null }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.url && typeof data.expiresAt === 'number') {
        mediaUrlCache.set(cacheKey, { url: data.url, expiresAt: data.expiresAt });
        return data.url;
      }
    }
  } catch (err) {
    console.warn('[MediaService] Failed to sign media URL for variant:', variantId, err);
  }

  // Rule 2: If signing fails but fallbackUrl is a same-origin path (/samples/..., /generations/...) use it.
  if (fallbackUrl && (fallbackUrl.startsWith('/') || /^https?:\/\//i.test(fallbackUrl))) {
    return fallbackUrl;
  }

  return fallbackUrl || '';
}

/**
 * React hook to resolve a signed media URL with loading, error, and retry states.
 */
export function usePlayableUrl(
  variantId?: string | null,
  fallbackUrl?: string | null,
  options?: { scale?: string | null; mediaType?: 'audio' | 'video' | 'image' | 'voice' }
): { url: string; isLoading: boolean; error: Error | null; retry: () => void } {
  const initialCacheKey = variantId ? `${variantId}:${options?.scale || ''}` : null;
  const initialCached = initialCacheKey ? mediaUrlCache.get(initialCacheKey) : null;
  const hasValidCached = Boolean(initialCached && initialCached.expiresAt - Date.now() > 60_000);

  const [url, setUrl] = useState<string>(() => {
    if (!variantId || variantId.startsWith('syn_')) {
      return fallbackUrl || '';
    }
    if (hasValidCached && initialCached) {
      return initialCached.url;
    }
    // If fallback is already a sample/generation path, use it immediately while resolving
    if (fallbackUrl && fallbackUrl.startsWith('/samples/')) {
      return fallbackUrl;
    }
    return '';
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!variantId || variantId.startsWith('syn_')) return false;
    return !hasValidCached;
  });

  const [error, setError] = useState<Error | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const retry = useCallback(() => {
    if (variantId) {
      const cacheKey = `${variantId}:${options?.scale || ''}`;
      mediaUrlCache.delete(cacheKey);
    }
    setRetryNonce((n) => n + 1);
  }, [variantId, options?.scale]);

  useEffect(() => {
    let isCancelled = false;

    if (!variantId || variantId.startsWith('syn_')) {
      setUrl(fallbackUrl || '');
      setIsLoading(false);
      setError(null);
      return;
    }

    const cacheKey = `${variantId}:${options?.scale || ''}`;
    const cached = mediaUrlCache.get(cacheKey);
    if (cached && cached.expiresAt - Date.now() > 60_000) {
      setUrl(cached.url);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    getPlayableUrl(variantId, {
      scale: options?.scale,
      mediaType: options?.mediaType,
      fallbackUrl: fallbackUrl || '',
    })
      .then((resolvedUrl) => {
        if (!isCancelled) {
          if (!resolvedUrl) {
            setError(new Error('Media URL could not be resolved'));
          }
          setUrl(resolvedUrl);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setUrl(fallbackUrl || '');
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [variantId, fallbackUrl, options?.scale, options?.mediaType, retryNonce]);

  return { url, isLoading, error, retry };
}

/**
 * Resolves the optimal URL for media consumption based on type and origin rules.
 * Kept for backwards compatibility.
 */
export function mediaUrlFor(
  variantIdOrUrl: string,
  scale?: string | null,
  options?: MediaUrlOptions
): string {
  if (!variantIdOrUrl) return '';

  // If already a local path in public/ (e.g. /samples/demo-track.mp3 or /generations/...)
  if (variantIdOrUrl.startsWith('/') && !variantIdOrUrl.startsWith('/api/media')) {
    return variantIdOrUrl;
  }

  // Check if string is a variant ID (UUID or var_ prefix)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variantIdOrUrl);
  const isVarPrefix = variantIdOrUrl.startsWith('var_');
  const isVariantId = isUuid || isVarPrefix;

  if (isVariantId) {
    const params = new URLSearchParams();
    if (scale) params.set('scale', scale);
    if (options?.token) params.set('token', options.token);
    const query = params.toString();
    return `/api/media/${variantIdOrUrl}${query ? `?${query}` : ''}`;
  }

  return variantIdOrUrl;
}

/**
 * Checks if a given media URL is same-origin with the running app.
 */
export function isSameOriginMedia(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return true;
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin;
    } catch {
      return false;
    }
  }
  return false;
}
