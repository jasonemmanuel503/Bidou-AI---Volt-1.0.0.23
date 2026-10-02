import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GenerationJob, GenerationJobVariant, GenerationType, LibraryItem } from '../types';
import { persistence, getSupabaseClient } from '../services/persistence';
import { getAuthToken } from '../services/authToken';
import { useFavorites } from './useFavorites';
import { variantsForJob } from '../lib/variants';

export interface UseLibraryOptions {
  userId?: string;
  jobs?: GenerationJob[];
}

export interface UseLibraryReturn {
  items: LibraryItem[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  removeLocal: (variantId: string) => void;
}

/**
 * Flattens in-memory generation jobs into completed LibraryItems for instant UI updates.
 */
function flattenJobToLibraryItems(
  job: GenerationJob,
  targetType: GenerationType,
  favSet: Set<string>
): LibraryItem[] {
  const jobType = (job.type || (job as any).media_type) as GenerationType;
  if (jobType !== targetType) return [];
  if (job.status !== 'completed') return [];

  const results: LibraryItem[] = [];
  const prompt = job.prompt || '';
  const model_name = job.model_name || '';
  const aspect_ratio =
    job.aspect_ratio || (targetType === 'video' ? '16:9' : targetType === 'image' ? '1:1' : undefined);

  const variants = variantsForJob(job);
  variants.forEach((v, idx) => {
    if (v.status !== 'completed' || v.deleted_at) return;
    const outUrl = v.output_url || job.output_urls?.[v.variant_index ?? idx] || '';
    if (!outUrl) return;

    results.push({
      id: v.id,
      job_id: job.id,
      user_id: job.user_id,
      variant_index: v.variant_index ?? idx,
      status: 'completed',
      output_url: outUrl,
      thumbnail_url: v.thumbnail_url || job.thumbnail_url || (targetType === 'video' ? undefined : outUrl),
      credits_unit: v.credits_unit || 70,
      created_at: v.created_at || job.created_at || new Date().toISOString(),
      updated_at: v.updated_at || v.created_at || job.created_at || new Date().toISOString(),
      completed_at: v.completed_at || job.created_at || new Date().toISOString(),
      prompt,
      model_name,
      aspect_ratio,
      resolution: job.resolution,
      duration_seconds: job.duration_seconds,
      genre: job.genre,
      tonality: job.tonality,
      cover_art_url: job.cover_art_url || v.thumbnail_url || outUrl,
      media_type: targetType,
      is_favorite: favSet.has(v.id),
      rawJob: job,
    });
  });

  return results;
}

export function useLibrary(
  type: 'video' | 'image' | 'music',
  options: UseLibraryOptions = {}
): UseLibraryReturn {
  const { userId, jobs = [] } = options;
  const { isFavorite, favoriteIds } = useFavorites();

  const [serverItems, setServerItems] = useState<LibraryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const debounceTimerRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const favSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const getHeaders = useCallback(async () => {
    const token = (await getAuthToken()) || userId;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [userId]);

  // Fetch initial page from server
  const fetchInitial = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setIsLoading(true);
      try {
        const headers = await getHeaders();
        const res = await fetch(`/api/library?type=${type}&limit=24`, { headers });
        if (!res.ok) {
          throw new Error(`Failed to fetch library: HTTP ${res.status}`);
        }
        const data = await res.json();
        if (isMountedRef.current) {
          const list: LibraryItem[] = data.items || [];
          setServerItems(list);
          setCursor(data.nextCursor || null);
          setHasMore(Boolean(data.nextCursor));
        }
      } catch (err) {
        console.warn(`[useLibrary:${type}] Error loading library:`, err);
      } finally {
        if (isMountedRef.current && !isBackground) {
          setIsLoading(false);
        }
      }
    },
    [type, getHeaders]
  );

  // Load more pages
  const loadMore = useCallback(async () => {
    if (!cursor || isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(
        `/api/library?type=${type}&limit=24&cursor=${encodeURIComponent(cursor)}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          const newItems: LibraryItem[] = data.items || [];
          setServerItems((prev) => {
            const existingIds = new Set(prev.map((i) => i.id));
            const fresh = newItems.filter((i) => !existingIds.has(i.id));
            return [...prev, ...fresh];
          });
          setCursor(data.nextCursor || null);
          setHasMore(Boolean(data.nextCursor));
        }
      }
    } catch (err) {
      console.warn(`[useLibrary:${type}] Error loading more items:`, err);
    } finally {
      if (isMountedRef.current) {
        setIsFetchingMore(false);
      }
    }
  }, [cursor, isFetchingMore, hasMore, type, getHeaders]);

  // Debounced refetch helper
  const debouncedRefetch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchInitial(true);
    }, 300);
  }, [fetchInitial]);

  // Remove variant locally (optimistic trashing/deletion)
  const removeLocal = useCallback((variantId: string) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.add(variantId);
      return next;
    });
    setServerItems((prev) => prev.filter((i) => i.id !== variantId));
  }, []);

  // Mount effect & listeners
  useEffect(() => {
    isMountedRef.current = true;
    fetchInitial(false);

    // Dynamic events listeners
    const handleGenerationCompleted = () => debouncedRefetch();
    const handleAssetsChanged = () => debouncedRefetch();
    const handleTrashUpdated = (e: any) => {
      if (e?.detail?.variantIds && Array.isArray(e.detail.variantIds)) {
        e.detail.variantIds.forEach((id: string) => removeLocal(id));
      }
      debouncedRefetch();
    };
    const handlePlaylistsUpdated = () => debouncedRefetch();

    window.addEventListener('bidou_generation_completed', handleGenerationCompleted);
    window.addEventListener('bidou_assets_changed', handleAssetsChanged);
    window.addEventListener('bidou_trash_updated', handleTrashUpdated);
    window.addEventListener('bidou_playlists_updated', handlePlaylistsUpdated);

    // 30s background polling while mounted
    const pollInterval = setInterval(() => {
      fetchInitial(true);
    }, 30000);

    // Supabase Realtime subscription if available
    let realtimeChannel: any = null;
    try {
      const supabase = getSupabaseClient();
      if (supabase && userId) {
        realtimeChannel = supabase
          .channel(`lib_${type}_${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'generation_job_variants',
            },
            () => {
              debouncedRefetch();
            }
          )
          .subscribe();
      }
    } catch {
      // Supabase realtime optional
    }

    return () => {
      isMountedRef.current = false;
      clearInterval(pollInterval);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      window.removeEventListener('bidou_generation_completed', handleGenerationCompleted);
      window.removeEventListener('bidou_assets_changed', handleAssetsChanged);
      window.removeEventListener('bidou_trash_updated', handleTrashUpdated);
      window.removeEventListener('bidou_playlists_updated', handlePlaylistsUpdated);
      if (realtimeChannel) {
        try {
          const supabase = getSupabaseClient();
          supabase?.removeChannel(realtimeChannel);
        } catch {
          // ignore
        }
      }
    };
  }, [type, fetchInitial, debouncedRefetch, removeLocal, userId]);

  // Merge in-memory completed jobs with persistent server items
  const mergedItems = useMemo(() => {
    // 1. Instant in-memory variants from App state
    const inMemoryItems: LibraryItem[] = [];
    for (const job of jobs) {
      const flattened = flattenJobToLibraryItems(job, type, favSet);
      inMemoryItems.push(...flattened);
    }

    // 2. Combine: start with inMemoryItems that aren't yet in serverItems, then serverItems
    const combined: LibraryItem[] = [];
    const seenIds = new Set<string>();

    // Process inMemory items first (newest creations)
    for (const item of inMemoryItems) {
      if (deletedIds.has(item.id)) continue;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        combined.push({
          ...item,
          is_favorite: favSet.has(item.id) || isFavorite(item.id),
        });
      }
    }

    // Process server items
    for (const item of serverItems) {
      if (deletedIds.has(item.id)) continue;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        combined.push({
          ...item,
          is_favorite: favSet.has(item.id) || isFavorite(item.id),
        });
      }
    }

    return combined;
  }, [jobs, type, serverItems, deletedIds, favSet, isFavorite]);

  return {
    items: mergedItems,
    isLoading,
    hasMore,
    loadMore,
    refetch: () => fetchInitial(false),
    removeLocal,
  };
}
