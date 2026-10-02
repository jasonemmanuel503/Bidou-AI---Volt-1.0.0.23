import { useState, useEffect, useCallback } from 'react';
import { toast } from '../services/toast';
import { getApiErrorMessage } from '../lib/errorMapping';
import { getAuthHeaders } from '../services/authToken';

// Module-level favorites store (Set of variant IDs)
let favoritesStore = new Set<string>();
let isInitialized = false;
let isHydrating = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('bidou_favorites_updated', {
        detail: { favoriteIds: Array.from(favoritesStore) },
      })
    );
  }
}

/**
 * Resets module-level favorites store and notifies subscribers.
 * Invoked on session sign-out or account switch.
 */
export function resetFavorites(): void {
  favoritesStore = new Set<string>();
  isInitialized = false;
  isHydrating = false;
  notifyListeners();
}

/**
 * Checks if an ID is synthetic/ephemeral and cannot be persisted
 */
export function isSyntheticVariantId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return true;
  const trimmed = id.trim();
  if (!trimmed) return true;
  return (
    trimmed.startsWith('syn_') ||
    trimmed.startsWith('temp_') ||
    trimmed.startsWith('mock_') ||
    trimmed.startsWith('preview_')
  );
}

async function hydrateFavorites(): Promise<void> {
  if (isHydrating) return;
  isHydrating = true;
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/favorites', { headers });
    if (res.ok) {
      const data = await res.json();
      const ids: string[] = Array.isArray(data.ids)
        ? data.ids
        : Array.isArray(data)
        ? data
        : [];
      favoritesStore = new Set(ids);
      isInitialized = true;
      notifyListeners();
    }
  } catch (err) {
    console.warn('[useFavorites] Error hydrating favorites:', err);
  } finally {
    isHydrating = false;
  }
}

export interface UseFavoritesReturn {
  favoriteIds: Set<string>;
  isFavorite: (variantId?: string | null) => boolean;
  toggleFavorite: (variantId: string) => Promise<boolean>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useFavorites(): UseFavoritesReturn {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);

    // Initial hydration if not done yet
    if (!isInitialized) {
      hydrateFavorites();
    }

    // Sync across tabs / custom events
    const handleSyncEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ favoriteIds: string[] }>;
      if (customEvent.detail?.favoriteIds) {
        favoritesStore = new Set(customEvent.detail.favoriteIds);
        setTick((t) => t + 1);
      }
    };

    window.addEventListener('bidou_favorites_updated', handleSyncEvent);

    return () => {
      listeners.delete(listener);
      window.removeEventListener('bidou_favorites_updated', handleSyncEvent);
    };
  }, []);

  const isFavorite = useCallback((variantId?: string | null): boolean => {
    if (!variantId || isSyntheticVariantId(variantId)) return false;
    return favoritesStore.has(variantId);
  }, []);

  const toggleFavorite = useCallback(async (variantId: string): Promise<boolean> => {
    if (isSyntheticVariantId(variantId)) {
      toast.info('This is a preview generation and cannot be favorited.');
      return false;
    }

    const wasFavorited = favoritesStore.has(variantId);
    const nextFavorited = !wasFavorited;

    // Optimistic update
    if (nextFavorited) {
      favoritesStore.add(variantId);
    } else {
      favoritesStore.delete(variantId);
    }
    notifyListeners();

    try {
      const headers = await getAuthHeaders();
      const method = nextFavorited ? 'PUT' : 'DELETE';
      const res = await fetch(`/api/favorites/${variantId}`, {
        method,
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const err: any = new Error(errorData.error || errorData.detail || 'Failed to update favorite');
        err.code = errorData.error;
        err.status = res.status;
        err.detail = errorData.detail;
        throw err;
      }

      toast.success(nextFavorited ? 'Added to favorites' : 'Removed from favorites');
      return nextFavorited;
    } catch (err: any) {
      // Rollback on failure
      if (wasFavorited) {
        favoritesStore.add(variantId);
      } else {
        favoritesStore.delete(variantId);
      }
      notifyListeners();

      const msg = getApiErrorMessage(err);
      toast.error(msg);
      return wasFavorited;
    }
  }, []);

  const refetch = useCallback(async () => {
    await hydrateFavorites();
  }, []);

  return {
    favoriteIds: favoritesStore,
    isFavorite,
    toggleFavorite,
    isLoading: !isInitialized && isHydrating,
    refetch,
  };
}
