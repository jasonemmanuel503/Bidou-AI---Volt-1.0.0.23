import { useState, useEffect, useCallback, useRef } from 'react';
import { Playlist, PlaylistItem } from '../types';
import { toast } from '../services/toast';
import { getApiErrorMessage } from '../lib/errorMapping';
import { getAuthHeaders } from '../services/authToken';

export interface UsePlaylistsReturn {
  playlists: Playlist[];
  isLoading: boolean;
  error: string | null;
  fetchPlaylists: () => Promise<Playlist[]>;
  createPlaylist: (input: { name: string; tags?: string[]; variantId?: string }) => Promise<Playlist>;
  updatePlaylist: (id: string, patch: { name?: string; tags?: string[] }) => Promise<Playlist>;
  deletePlaylist: (id: string) => Promise<void>;
  fetchPlaylistItems: (id: string) => Promise<PlaylistItem[]>;
  addItemsToPlaylist: (id: string, variantIds: string[]) => Promise<PlaylistItem[]>;
  removeItemFromPlaylist: (id: string, variantId: string) => Promise<void>;
  reorderPlaylistItems: (id: string, variantIds: string[]) => Promise<void>;
}

export function usePlaylists(autoFetch: boolean = true): UsePlaylistsReturn {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  const notifyChange = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bidou_playlists_updated'));
    }
  };

  const fetchPlaylists = useCallback(async (): Promise<Playlist[]> => {
    if (isFetchingRef.current) return playlists;
    isFetchingRef.current = true;
    try {
      setError(null);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/playlists', { headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err: any = new Error(data.detail || data.error || 'Failed to load playlists');
        err.code = data.error;
        err.status = res.status;
        err.detail = data.detail;
        throw err;
      }
      const data = await res.json();
      const list: Playlist[] = Array.isArray(data) ? data : data.playlists || [];
      setPlaylists(list);
      return list;
    } catch (err: any) {
      console.error('[usePlaylists] Error loading playlists:', err);
      setError(getApiErrorMessage(err));
      return [];
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [playlists]);

  useEffect(() => {
    if (autoFetch) {
      fetchPlaylists();
    }

    const handleSync = () => {
      fetchPlaylists();
    };

    window.addEventListener('bidou_playlists_updated', handleSync);
    return () => {
      window.removeEventListener('bidou_playlists_updated', handleSync);
    };
  }, [autoFetch, fetchPlaylists]);

  const createPlaylist = useCallback(
    async (input: { name: string; tags?: string[]; variantId?: string }): Promise<Playlist> => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err: any = new Error(errData.detail || errData.error || 'Failed to create playlist');
        err.code = errData.error;
        err.status = res.status;
        throw err;
      }

      const created: Playlist = await res.json();
      setPlaylists((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      notifyChange();
      return created;
    },
    []
  );

  const updatePlaylist = useCallback(
    async (id: string, patch: { name?: string; tags?: string[] }): Promise<Playlist> => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/playlists/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err: any = new Error(errData.detail || errData.error || 'Failed to update playlist');
        err.code = errData.error;
        err.status = res.status;
        throw err;
      }

      const updated: Playlist = await res.json();
      setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      notifyChange();
      return updated;
    },
    []
  );

  const deletePlaylist = useCallback(async (id: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/playlists/${id}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err: any = new Error(errData.detail || errData.error || 'Failed to delete playlist');
      err.code = errData.error;
      err.status = res.status;
      err.detail = errData.detail;
      throw err;
    }

    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    notifyChange();
  }, []);

  const fetchPlaylistItems = useCallback(async (id: string): Promise<PlaylistItem[]> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/playlists/${id}/items`, { headers });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err: any = new Error(errData.detail || errData.error || 'Failed to fetch playlist items');
      err.code = errData.error;
      err.status = res.status;
      err.detail = errData.detail;
      throw err;
    }
    const data = await res.json();
    return data.items || [];
  }, []);

  const addItemsToPlaylist = useCallback(
    async (id: string, variantIds: string[]): Promise<PlaylistItem[]> => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/playlists/${id}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ variantIds }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err: any = new Error(errData.detail || errData.error || 'Failed to add items to playlist');
        err.code = errData.error;
        err.status = res.status;
        err.detail = errData.detail;
        throw err;
      }

      const data = await res.json();
      notifyChange();
      return data.items || [];
    },
    []
  );

  const removeItemFromPlaylist = useCallback(
    async (id: string, variantId: string): Promise<void> => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/playlists/${id}/items/${variantId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err: any = new Error(errData.detail || errData.error || 'Failed to remove track from playlist');
        err.code = errData.error;
        err.status = res.status;
        err.detail = errData.detail;
        throw err;
      }

      notifyChange();
    },
    []
  );

  const reorderPlaylistItems = useCallback(
    async (id: string, variantIds: string[]): Promise<void> => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/playlists/${id}/reorder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ variantIds }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err: any = new Error(errData.detail || errData.error || 'Failed to reorder playlist');
        err.code = errData.error;
        err.status = res.status;
        err.detail = errData.detail;
        throw err;
      }

      notifyChange();
    },
    []
  );

  return {
    playlists,
    isLoading,
    error,
    fetchPlaylists,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    fetchPlaylistItems,
    addItemsToPlaylist,
    removeItemFromPlaylist,
    reorderPlaylistItems,
  };
}
