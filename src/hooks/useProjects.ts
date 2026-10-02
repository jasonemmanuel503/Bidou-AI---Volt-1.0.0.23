import { useState, useEffect, useCallback, useRef } from 'react';
import { Project, ProjectItem } from '../types';
import { persistence, getSupabaseClient } from '../services/persistence';
import { getAuthToken } from '../services/authToken';
import { toast } from '../services/toast';
import { newId } from '../services/ids';

export interface UseProjectsOptions {
  userId?: string;
  autoFetch?: boolean;
}

export interface UseProjectsReturn {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  isReconnecting: boolean;
  refetch: () => Promise<void>;
  createProject: (input: { name: string; description?: string; color?: string; icon?: string } | string) => Promise<Project>;
  renameProject: (id: string, name: string) => Promise<Project>;
  updateProject: (id: string, patch: { name?: string; description?: string; color?: string; position?: number }) => Promise<Project>;
  deleteProject: (id: string, cascade?: boolean) => Promise<void>;
  addItems: (projectId: string, variantIds: string[]) => Promise<ProjectItem[]>;
  removeItem: (projectId: string, variantId: string) => Promise<void>;
  reorderItems: (projectId: string, variantIds: string[]) => Promise<void>;
  moveItem: (variantId: string, fromProjectId: string, toProjectId: string, position: number) => Promise<void>;
  fetchProjectItems: (projectId: string) => Promise<ProjectItem[]>;
}

export function useProjects(options: UseProjectsOptions = {}): UseProjectsReturn {
  const { userId, autoFetch = true } = options;
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  // Set of client-generated op_ids and recent project IDs to ignore echoes
  const recentOpsRef = useRef<Set<string>>(new Set());
  const pollingTimerRef = useRef<any>(null);

  const getHeaders = async () => {
    const token = (await getAuthToken()) || userId;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const trackOp = (opId: string) => {
    recentOpsRef.current.add(opId);
    setTimeout(() => {
      recentOpsRef.current.delete(opId);
    }, 10000);
  };

  // Fetch all projects for caller
  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const headers = await getHeaders();
      const res = await fetch('/api/projects', { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Failed to load projects: HTTP ${res.status}`);
      }
      const data = await res.json();
      const list: Project[] = Array.isArray(data) ? data : data.projects || [];
      // Synchronize with existing client-side folders compatibility property
      const mapped = list.map((p) => ({
        ...p,
        item_ids: p.item_ids || [],
      }));
      // Only replace projects state when content actually changed (shallow compare by id + updated_at/item_count)
      setProjects((prev) => {
        if (prev.length !== mapped.length) return mapped;
        const isSame = prev.every((p, idx) => {
          const m = mapped[idx];
          return (
            p.id === m.id &&
            p.name === m.name &&
            p.updated_at === m.updated_at &&
            p.item_count === m.item_count &&
            p.color === m.color &&
            p.position === m.position &&
            (p.item_ids?.length ?? 0) === (m.item_ids?.length ?? 0)
          );
        });
        return isSame ? prev : mapped;
      });
    } catch (err: any) {
      console.error('Error fetching projects:', err);
      setError(err?.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (autoFetch) {
      fetchProjects();
    }
  }, [autoFetch, fetchProjects]);

  // Section B.4 / T0 — Debounced listener for cross-component project and asset updates (~300ms)
  useEffect(() => {
    let debounceTimer: any = null;
    const handleUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchProjects();
      }, 300);
    };

    window.addEventListener('bidou_projects_updated', handleUpdate);
    window.addEventListener('bidou_assets_changed', handleUpdate);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('bidou_projects_updated', handleUpdate);
      window.removeEventListener('bidou_assets_changed', handleUpdate);
    };
  }, [fetchProjects]);

  // Section B.5 — Real-time subscription via Supabase Realtime
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) {
      // Supabase is not available; maintain 30s polling fallback
      pollingTimerRef.current = setInterval(() => {
        fetchProjects();
      }, 30000);
      return () => {
        if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      };
    }

    const channel = supabase
      .channel(`projects:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${userId}` },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          const targetId = newRow?.id || oldRow?.id;

          // Ignore echoes of our own optimistic writes
          if (targetId && recentOpsRef.current.has(targetId)) {
            return;
          }

          if (payload.eventType === 'INSERT' && newRow && !newRow.deleted_at) {
            setProjects((prev) => {
              if (prev.some((p) => p.id === newRow.id)) return prev;
              return [...prev, { ...newRow, item_ids: [] }].sort(
                (a, b) => (a.position ?? 0) - (b.position ?? 0)
              );
            });
          } else if (payload.eventType === 'UPDATE' && newRow) {
            setProjects((prev) => {
              if (newRow.deleted_at) {
                return prev.filter((p) => p.id !== newRow.id);
              }
              return prev.map((p) => (p.id === newRow.id ? { ...p, ...newRow } : p));
            });
          } else if (payload.eventType === 'DELETE' && oldRow) {
            setProjects((prev) => prev.filter((p) => p.id !== oldRow.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_items', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          if (row?.project_id && recentOpsRef.current.has(row.project_id)) {
            return;
          }
          // Refresh projects to update item_count honestly
          fetchProjects();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsReconnecting(true);
          if (!pollingTimerRef.current) {
            pollingTimerRef.current = setInterval(fetchProjects, 30000);
          }
        } else if (status === 'SUBSCRIBED') {
          setIsReconnecting(false);
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
            pollingTimerRef.current = null;
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [userId, fetchProjects]);

  // Create Project (Optimistic with Rollback)
  const createProject = async (
    input: { name: string; description?: string; color?: string; icon?: string } | string
  ): Promise<Project> => {
    const rawName = typeof input === 'string' ? input : input.name;
    const name = rawName.trim();
    const description = typeof input === 'object' ? input.description?.trim() : undefined;
    const color = typeof input === 'object' ? input.color : '#F86A00';
    const icon = typeof input === 'object' ? input.icon : 'folder';

    if (!name || name.length > 60) {
      const err = new Error('Project name must be between 1 and 60 characters');
      toast.error(err.message);
      throw err;
    }

    // Check duplicate client-side first
    const existing = projects.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      const err = new Error('A project with this name already exists');
      toast.error(err.message);
      throw err;
    }

    const tempId = newId('tmp_');
    const optimisticProject: Project = {
      id: tempId,
      user_id: userId || 'current_user',
      name,
      description,
      color: color || '#F86A00',
      icon: icon || 'folder',
      position: projects.length,
      item_count: 0,
      item_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const prevProjects = [...projects];
    setProjects((prev) => [...prev, optimisticProject]);
    trackOp(tempId);

    try {
      const headers = await getHeaders();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, description, color, icon }),
      });

      if (res.status === 409) {
        // Rollback
        setProjects(prevProjects);
        const err = new Error('A project with this name already exists');
        toast.error(err.message);
        throw err;
      }

      if (!res.ok) {
        setProjects(prevProjects);
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.detail || errData.error || 'Failed to create project');
        toast.error(err.message);
        throw err;
      }

      const data = await res.json();
      const realProject: Project = data.project || data;
      trackOp(realProject.id);

      // Replace optimistic item with server item
      setProjects((prev) =>
        prev.map((p) => (p.id === tempId ? { ...realProject, item_ids: [] } : p))
      );
      toast.success(`Project "${realProject.name}" created`);
      return realProject;
    } catch (err: any) {
      setProjects(prevProjects);
      throw err;
    }
  };

  // Rename Project (Optimistic with Rollback)
  const renameProject = async (id: string, name: string): Promise<Project> => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) {
      const err = new Error('Project name must be between 1 and 60 characters');
      toast.error(err.message);
      throw err;
    }

    const prevProjects = [...projects];
    const target = prevProjects.find((p) => p.id === id);
    if (!target) {
      throw new Error('Project not found');
    }

    trackOp(id);
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: trimmed, updated_at: new Date().toISOString() } : p))
    );

    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: trimmed }),
      });

      if (res.status === 409) {
        setProjects(prevProjects);
        const err = new Error('A project with this name already exists');
        toast.error(err.message);
        throw err;
      }

      if (!res.ok) {
        setProjects(prevProjects);
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.detail || errData.error || 'Failed to rename project');
        toast.error(err.message);
        throw err;
      }

      const data = await res.json();
      const updated: Project = data.project || data;
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      toast.success(`Renamed to "${updated.name}"`);
      return updated;
    } catch (err: any) {
      setProjects(prevProjects);
      throw err;
    }
  };

  // Update Project (Optimistic with Rollback)
  const updateProject = async (
    id: string,
    patch: { name?: string; description?: string; color?: string; position?: number }
  ): Promise<Project> => {
    const prevProjects = [...projects];
    trackOp(id);
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString() } : p))
    );

    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });

      if (res.status === 409) {
        setProjects(prevProjects);
        const err = new Error('A project with this name already exists');
        toast.error(err.message);
        throw err;
      }

      if (!res.ok) {
        setProjects(prevProjects);
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.detail || errData.error || 'Failed to update project');
        toast.error(err.message);
        throw err;
      }

      const data = await res.json();
      const updated: Project = data.project || data;
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      return updated;
    } catch (err: any) {
      setProjects(prevProjects);
      throw err;
    }
  };

  // Delete Project (Soft-delete, with Rollback)
  const deleteProject = async (id: string, cascade = false): Promise<void> => {
    const prevProjects = [...projects];
    trackOp(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));

    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/projects/${id}?cascade=${cascade}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        setProjects(prevProjects);
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.detail || errData.error || 'Failed to delete project');
        toast.error(err.message);
        throw err;
      }

      toast.success('Project deleted');
    } catch (err: any) {
      setProjects(prevProjects);
      throw err;
    }
  };

  // Add Items to Project (Optimistic with Rollback)
  const addItems = async (projectId: string, variantIds: string[]): Promise<ProjectItem[]> => {
    if (!variantIds || variantIds.length === 0) return [];
    const prevProjects = [...projects];

    trackOp(projectId);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              item_count: (p.item_count || 0) + variantIds.length,
              item_ids: Array.from(new Set([...(p.item_ids || []), ...variantIds])),
            }
          : p
      )
    );

    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ variantIds }),
      });

      if (!res.ok) {
        setProjects(prevProjects);
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.detail || errData.error || 'Failed to add items to project');
        toast.error(err.message);
        throw err;
      }

      const data = await res.json();
      const items: ProjectItem[] = data.items || [];
      // Synchronize item_count accurately
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                item_count: items.length,
                item_ids: items.map((i) => i.variant_id || i.job_id),
              }
            : p
        )
      );
      toast.success(`Added ${variantIds.length} item${variantIds.length > 1 ? 's' : ''} to project`);
      return items;
    } catch (err: any) {
      setProjects(prevProjects);
      throw err;
    }
  };

  // Remove Item from Project (Optimistic with Rollback)
  const removeItem = async (projectId: string, variantId: string): Promise<void> => {
    const prevProjects = [...projects];

    trackOp(projectId);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              item_count: Math.max(0, (p.item_count || 0) - 1),
              item_ids: (p.item_ids || []).filter((id) => id !== variantId),
            }
          : p
      )
    );

    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/projects/${projectId}/items/${variantId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        setProjects(prevProjects);
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.detail || errData.error || 'Failed to remove item');
        toast.error(err.message);
        throw err;
      }
    } catch (err: any) {
      setProjects(prevProjects);
      throw err;
    }
  };

  // Reorder Items within Project
  const reorderItems = async (projectId: string, variantIds: string[]): Promise<void> => {
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/projects/${projectId}/reorder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ variantIds }),
      });
      if (!res.ok) {
        throw new Error('Failed to reorder items');
      }
    } catch (err: any) {
      console.error('Error reordering items:', err);
      toast.error('Failed to update project item order');
      throw err;
    }
  };

  // Move Item between projects (Optimistic with Rollback)
  const moveItem = async (
    variantId: string,
    fromProjectId: string,
    toProjectId: string,
    position: number
  ): Promise<void> => {
    const prevProjects = [...projects];

    trackOp(fromProjectId);
    trackOp(toProjectId);
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === fromProjectId) {
          return {
            ...p,
            item_count: Math.max(0, (p.item_count || 0) - 1),
            item_ids: (p.item_ids || []).filter((id) => id !== variantId),
          };
        }
        if (p.id === toProjectId) {
          return {
            ...p,
            item_count: (p.item_count || 0) + 1,
            item_ids: Array.from(new Set([...(p.item_ids || []), variantId])),
          };
        }
        return p;
      })
    );

    try {
      const headers = await getHeaders();
      const res = await fetch('/api/projects/items/move', {
        method: 'POST',
        headers,
        body: JSON.stringify({ variantId, fromProjectId, toProjectId, position }),
      });

      if (!res.ok) {
        setProjects(prevProjects);
        throw new Error('Failed to move item');
      }
    } catch (err: any) {
      setProjects(prevProjects);
      toast.error('Failed to move item between projects');
      throw err;
    }
  };

  // Fetch Items for a single project
  const fetchProjectItems = async (projectId: string): Promise<ProjectItem[]> => {
    const headers = await getHeaders();
    const res = await fetch(`/api/projects/${projectId}/items`, { headers });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || errData.error || `Failed to load project items: HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.items || [];
  };

  return {
    projects,
    isLoading,
    error,
    isReconnecting,
    refetch: fetchProjects,
    createProject,
    renameProject,
    updateProject,
    deleteProject,
    addItems,
    removeItem,
    reorderItems,
    moveItem,
    fetchProjectItems,
  };
}
