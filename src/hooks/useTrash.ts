import { useState, useEffect, useCallback } from 'react';
import { GenerationJobVariant, PlanTier } from '../types';
import { persistence } from '../services/persistence';
import { getAuthToken } from '../services/authToken';
import { toast } from '../services/toast';

export interface TrashItem extends GenerationJobVariant {
  variantId?: string;
  prompt?: string;
  media_type?: string;
  aspect_ratio?: string;
  resolution?: string;
  duration_seconds?: number;
  model_name?: string;
}

export interface UseTrashOptions {
  userId?: string;
  autoFetch?: boolean;
}

export interface UseTrashReturn {
  trashItems: TrashItem[];
  trashCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  trashVariants: (variantIds: string[]) => Promise<Array<{ variant_id: string; purge_after: string }>>;
  restoreVariants: (variantIds: string[]) => Promise<string[]>;
  purgeVariants: (variantIds: string[]) => Promise<string[]>;
  emptyTrash: () => Promise<string[]>;
}

export function useTrash(options: UseTrashOptions = {}): UseTrashReturn {
  const { userId, autoFetch = true } = options;
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const getHeaders = async () => {
    const token = (await getAuthToken()) || userId;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchTrash = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const headers = await getHeaders();
      const res = await fetch('/api/trash', { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Failed to load trash: HTTP ${res.status}`);
      }
      const data = await res.json();
      const items: TrashItem[] = data.items || [];
      setTrashItems(items);
    } catch (err: any) {
      console.error('[useTrash] fetchTrash error:', err);
      setError(err?.message || 'Failed to load trash');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (autoFetch) {
      fetchTrash();
    }
  }, [autoFetch, fetchTrash]);

  // Listen for global trash update events across components
  useEffect(() => {
    const handleTrashUpdated = () => {
      fetchTrash();
    };
    window.addEventListener('bidou_trash_updated', handleTrashUpdated);
    return () => {
      window.removeEventListener('bidou_trash_updated', handleTrashUpdated);
    };
  }, [fetchTrash]);

  /**
   * Moves variants into trash (calls POST /api/trash)
   * Returns stamped purge_after for each variant.
   */
  const trashVariants = useCallback(
    async (variantIds: string[]): Promise<Array<{ variant_id: string; purge_after: string }>> => {
      if (!variantIds.length) return [];
      try {
        const headers = await getHeaders();
        const res = await fetch('/api/trash', {
          method: 'POST',
          headers,
          body: JSON.stringify({ variantIds }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || errData.error || 'Failed to move to trash');
        }

        const data = await res.json();
        const trashedList = data.trashed || [];

        // Broadcast changes so Projects grid, recent assets, and trash count update immediately
        window.dispatchEvent(new CustomEvent('bidou_trash_updated'));
        window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
        window.dispatchEvent(new CustomEvent('bidou_assets_changed'));

        return trashedList;
      } catch (err: any) {
        console.error('[useTrash] trashVariants error:', err);
        toast.error(err?.message || 'Failed to move item to trash');
        throw err;
      }
    },
    [userId]
  );

  /**
   * Restores variants from trash (calls POST /api/trash/restore)
   */
  const restoreVariants = useCallback(
    async (variantIds: string[]): Promise<string[]> => {
      if (!variantIds.length) return [];
      try {
        const headers = await getHeaders();
        const res = await fetch('/api/trash/restore', {
          method: 'POST',
          headers,
          body: JSON.stringify({ variantIds }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || errData.error || 'Failed to restore items');
        }

        const data = await res.json();
        const restoredIds: string[] = data.restored || [];

        // Optimistically remove from local state
        setTrashItems((prev) => prev.filter((item) => !variantIds.includes(item.id)));

        // Broadcast update
        window.dispatchEvent(new CustomEvent('bidou_trash_updated'));
        window.dispatchEvent(new CustomEvent('bidou_assets_changed'));

        toast.success(
          restoredIds.length === 1
            ? 'Asset restored to All Assets'
            : `${restoredIds.length} assets restored to All Assets`
        );
        return restoredIds;
      } catch (err: any) {
        console.error('[useTrash] restoreVariants error:', err);
        toast.error(err?.message || 'Failed to restore items');
        throw err;
      }
    },
    [userId]
  );

  /**
   * Permanently deletes variants immediately (calls DELETE /api/trash)
   */
  const purgeVariants = useCallback(
    async (variantIds: string[]): Promise<string[]> => {
      if (!variantIds.length) return [];
      try {
        const headers = await getHeaders();
        const res = await fetch('/api/trash', {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ variantIds }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || errData.error || 'Failed to permanently delete items');
        }

        const data = await res.json();
        const purgedIds: string[] = data.purged || [];

        // Optimistically remove from local state
        setTrashItems((prev) => prev.filter((item) => !variantIds.includes(item.id)));

        window.dispatchEvent(new CustomEvent('bidou_trash_updated'));
        window.dispatchEvent(new CustomEvent('bidou_assets_changed'));

        toast.success(
          purgedIds.length === 1
            ? 'Item permanently deleted'
            : `${purgedIds.length} items permanently deleted`
        );
        return purgedIds;
      } catch (err: any) {
        console.error('[useTrash] purgeVariants error:', err);
        toast.error(err?.message || 'Failed to permanently delete');
        throw err;
      }
    },
    [userId]
  );

  /**
   * Empties all items from trash (calls DELETE /api/trash/all)
   */
  const emptyTrash = useCallback(async (): Promise<string[]> => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/trash/all', {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || 'Failed to empty trash');
      }

      const data = await res.json();
      const purgedIds: string[] = data.purged || [];

      setTrashItems([]);

      window.dispatchEvent(new CustomEvent('bidou_trash_updated'));
      window.dispatchEvent(new CustomEvent('bidou_assets_changed'));

      toast.success('Trash emptied successfully');
      return purgedIds;
    } catch (err: any) {
      console.error('[useTrash] emptyTrash error:', err);
      toast.error(err?.message || 'Failed to empty trash');
      throw err;
    }
  }, [userId]);

  return {
    trashItems,
    trashCount: trashItems.length,
    isLoading,
    error,
    refetch: fetchTrash,
    trashVariants,
    restoreVariants,
    purgeVariants,
    emptyTrash,
  };
}
