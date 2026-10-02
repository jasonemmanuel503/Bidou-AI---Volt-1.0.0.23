import { useState, useEffect, useCallback, useRef } from 'react';
import { LibraryItem } from '../types';
import { getAuthToken } from '../services/authToken';

export interface UseProjectAssetsOptions {
  projectId?: string | null;
  userId?: string;
  limit?: number;
}

export interface UseProjectAssetsReturn {
  items: LibraryItem[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  totalCount?: number;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  removeItemLocal: (variantId: string) => void;
}

export function useProjectAssets({
  projectId,
  userId,
  limit = 24,
}: UseProjectAssetsOptions = {}): UseProjectAssetsReturn {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  const getHeaders = useCallback(async () => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, []);

  // Initial fetch for current project or all assets
  const fetchInitial = useCallback(
    async (isBackground = false) => {
      if (!isBackground) {
        setIsLoading(true);
      }
      try {
        const headers = await getHeaders();
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        if (projectId) {
          params.set('projectId', projectId);
        }

        const res = await fetch(`/api/library?${params.toString()}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMountedRef.current) {
            setItems(data.items || []);
            setCursor(data.nextCursor || null);
            setHasMore(Boolean(data.nextCursor));
            if (typeof data.totalCount === 'number') {
              setTotalCount(data.totalCount);
            } else {
              setTotalCount(undefined);
            }
          }
        } else if (res.status === 404) {
          // Project might have been deleted
          if (isMountedRef.current) {
            setItems([]);
            setCursor(null);
            setHasMore(false);
            setTotalCount(0);
          }
        }
      } catch (err) {
        console.warn('[useProjectAssets] Error fetching initial items:', err);
      } finally {
        if (isMountedRef.current && !isBackground) {
          setIsLoading(false);
        }
      }
    },
    [projectId, limit, getHeaders]
  );

  // Load next page
  const loadMore = useCallback(async () => {
    if (!cursor || isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);

    try {
      const headers = await getHeaders();
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('cursor', cursor);
      if (projectId) {
        params.set('projectId', projectId);
      }

      const res = await fetch(`/api/library?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          const newItems: LibraryItem[] = data.items || [];
          setItems((prev) => {
            const existingIds = new Set(prev.map((i) => i.id));
            const fresh = newItems.filter((i) => !existingIds.has(i.id));
            return [...prev, ...fresh];
          });
          setCursor(data.nextCursor || null);
          setHasMore(Boolean(data.nextCursor));
          if (typeof data.totalCount === 'number') {
            setTotalCount(data.totalCount);
          }
        }
      }
    } catch (err) {
      console.warn('[useProjectAssets] Error loading more items:', err);
    } finally {
      if (isMountedRef.current) {
        setIsFetchingMore(false);
      }
    }
  }, [cursor, isFetchingMore, hasMore, projectId, limit, getHeaders]);

  // Refetch when projectId changes
  useEffect(() => {
    setCursor(null);
    setHasMore(false);
    fetchInitial(false);
  }, [projectId, fetchInitial]);

  // Set up IntersectionObserver on sentinel element (triggers 200px before bottom)
  useEffect(() => {
    if (!sentinelRef.current) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isLoading && !isFetchingMore) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0,
      }
    );

    observer.observe(sentinelRef.current);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoading, isFetchingMore, loadMore]);

  // Listen to external updates
  useEffect(() => {
    const handleUpdate = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        fetchInitial(true);
      }, 300);
    };

    window.addEventListener('bidou_projects_updated', handleUpdate);
    window.addEventListener('bidou_assets_changed', handleUpdate);
    window.addEventListener('bidou_generation_completed', handleUpdate);
    window.addEventListener('bidou_trash_updated', handleUpdate);

    return () => {
      window.removeEventListener('bidou_projects_updated', handleUpdate);
      window.removeEventListener('bidou_assets_changed', handleUpdate);
      window.removeEventListener('bidou_generation_completed', handleUpdate);
      window.removeEventListener('bidou_trash_updated', handleUpdate);
    };
  }, [fetchInitial]);

  // Optimistic local item removal
  const removeItemLocal = useCallback((variantId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== variantId));
    setTotalCount((prev) => (typeof prev === 'number' ? Math.max(0, prev - 1) : undefined));
  }, []);

  return {
    items,
    isLoading,
    isFetchingMore,
    hasMore,
    loadMore,
    refetch: () => fetchInitial(true),
    totalCount,
    sentinelRef,
    removeItemLocal,
  };
}
