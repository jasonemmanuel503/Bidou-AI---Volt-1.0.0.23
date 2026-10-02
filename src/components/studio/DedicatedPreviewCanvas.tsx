// Bidou AI Dedicated Preview Canvas
// Implements Phase 3.5: Aspect-ratio-accurate dynamic rendering grid
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Download,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Disc,
  Clock,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Star,
  Check,
  MoreVertical,
  RotateCcw,
  Trash2,
  Loader2,
  Maximize2,
  Layers,
  X,
  FolderPlus,
  Folder,
  Search,
  Plus,
  Heart,
  ListMusic,
  ListPlus,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GenerationJob, GenerationJobVariant, GenerationType, AiModelConfig, Project } from '../../types';
import { BrandedLoader } from '../common/BrandedLoader';
import { ProgressRing } from '../common/ProgressRing';
import { downloadAsset } from '../../lib/downloadAsset';
import { formatApiError } from '../../lib/errorMapping';
import { MediaLightbox, LightboxItem } from '../common/MediaLightbox';
import { CircularAudioPlayer } from '../common/CircularAudioPlayer';
import { computeTileSize, Ratio } from '../../lib/tileLayout';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useFavorites } from '../../hooks/useFavorites';
import { AddToPlaylistPopover } from '../music/AddToPlaylistPopover';
import { MusicJobGroup } from '../music/MusicJobGroup';
import { MusicFailedGroup } from '../music/MusicFailedGroup';
import { MusicTrackSheet } from '../music/MusicTrackSheet';
import { MusicMiniPlayer } from '../music/MusicMiniPlayer';
import { getMusicContainerTier, groupMusicBatches } from '../../lib/musicMeta';
import { VariantActionBar } from './VariantActionBar';
import { variantsForJob } from '../../lib/variants';
import { toast } from '../../services/toast';
import { persistence } from '../../services/persistence';
import { getAuthToken } from '../../services/authToken';
import { VideoPlayer } from '../common/VideoPlayer';
import { posterFor } from '../../services/media';

export interface DedicatedPreviewCanvasProps {
  activeTab: GenerationType;
  currentJob: GenerationJob | null;
  variants?: GenerationJobVariant[];
  historyJobs: GenerationJob[];
  onSelectHistoryJob?: (job: GenerationJob) => void;
  onRemixPrompt?: (prompt: string, type: GenerationType) => void;
  onPickHeroVariant?: (variant: GenerationJobVariant, index: number) => void;
  onReusePrompt?: (job: GenerationJob) => void;
  onDeleteJobVariant?: (jobId: string, variantId: string) => Promise<void>;
  onDeleteFailedJobs?: (jobIds: string[]) => Promise<void>;
  models?: AiModelConfig[];
  accessToken?: string;
  userId?: string;
  onRefreshWallet?: () => void;
  onRefreshProjects?: () => Promise<void>;
  onOpenMusicLibrary?: () => void;
}

export const DedicatedPreviewCanvas: React.FC<DedicatedPreviewCanvasProps> = ({
  activeTab,
  currentJob,
  variants = [],
  historyJobs,
  onSelectHistoryJob,
  onRemixPrompt,
  onPickHeroVariant,
  onReusePrompt,
  onDeleteJobVariant,
  onDeleteFailedJobs,
  models = [],
  accessToken,
  userId,
  onRefreshWallet,
  onRefreshProjects,
  onOpenMusicLibrary,
}) => {
  const renderType = currentJob?.type ?? activeTab;

  // Local synced history jobs for optimistic deletion & upscaling (Section 5)
  const [localHistoryJobs, setLocalHistoryJobs] = useState<GenerationJob[]>(historyJobs);
  useEffect(() => {
    setLocalHistoryJobs(historyJobs);
  }, [historyJobs]);

  // Derive historyTiles with useMemo from localHistoryJobs (newest job first, then variant_index)
  // A failed job stays one "Failed" tile; otherwise one tile per completed variant of variantsForJob(job) with a URL
  const historyTiles = useMemo<
    Array<{
      id: string;
      isFailed: boolean;
      job: GenerationJob;
      variant?: GenerationJobVariant;
      url?: string;
      hasMultipleVariants?: boolean;
      takeIndex?: number;
    }>
  >(() => {
    const tiles: Array<{
      id: string;
      isFailed: boolean;
      job: GenerationJob;
      variant?: GenerationJobVariant;
      url?: string;
      hasMultipleVariants?: boolean;
      takeIndex?: number;
    }> = [];

    for (const job of localHistoryJobs) {
      const isFailed =
        job.status === 'failed' ||
        (!job.output_urls?.length && job.status !== 'queued' && job.status !== 'processing');

      if (isFailed) {
        tiles.push({
          id: `failed-${job.id}`,
          isFailed: true,
          job,
        });
        continue;
      }

      const variants = variantsForJob(job);
      const completedVariantsWithUrl: { variant: GenerationJobVariant; url: string; variantIndex: number }[] = [];

      variants.forEach((v, idx) => {
        const vIndex = v.variant_index ?? idx;
        const url = v.output_url || job.output_urls?.[vIndex];
        if (url) {
          completedVariantsWithUrl.push({ variant: v, url, variantIndex: vIndex });
        }
      });

      // If variants didn't have output_urls but job has output_urls
      if (completedVariantsWithUrl.length === 0 && job.output_urls?.length > 0) {
        job.output_urls.forEach((url, uIdx) => {
          if (url) {
            const fallbackVariant: GenerationJobVariant = {
              id: `${job.id}-var-${uIdx}`,
              job_id: job.id,
              user_id: job.user_id,
              variant_index: uIdx,
              status: 'completed',
              output_url: url,
              credits_unit: 70,
              created_at: job.created_at,
              updated_at: job.created_at,
            };
            completedVariantsWithUrl.push({ variant: fallbackVariant, url, variantIndex: uIdx });
          }
        });
      }

      completedVariantsWithUrl.sort((a, b) => a.variantIndex - b.variantIndex);
      const hasMultipleVariants = completedVariantsWithUrl.length > 1;

      for (const item of completedVariantsWithUrl) {
        tiles.push({
          id: item.variant.id,
          isFailed: false,
          job,
          variant: item.variant,
          url: item.url,
          hasMultipleVariants,
          takeIndex: item.variantIndex + 1,
        });
      }
    }

    return tiles;
  }, [localHistoryJobs]);

  // Asset engine interaction states (Section 5)
  const [activeMenuJob, setActiveMenuJob] = useState<GenerationJob | null>(null);
  const [activeMenuVariant, setActiveMenuVariant] = useState<GenerationJobVariant | null>(null);
  const [menuTriggerRect, setMenuTriggerRect] = useState<DOMRect | null>(null);
  const [isUpscalingScale, setIsUpscalingScale] = useState<string | null>(null);
  const [upscaleSuccessScale, setUpscaleSuccessScale] = useState<string | null>(null);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [showUpscaleSubmenu, setShowUpscaleSubmenu] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{ job: GenerationJob; variantId: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [, setIsDownloading] = useState(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>('');

  // Section C: "Add to project" Submenu & Multi-select states
  const [showProjectSubmenu, setShowProjectSubmenu] = useState(false);
  const [liveProjects, setLiveProjects] = useState<Project[]>([]);
  const [isLoadingLiveProjects, setIsLoadingLiveProjects] = useState(false);
  const [projectSearchFilter, setProjectSearchFilter] = useState('');
  const [showInlineCreateProject, setShowInlineCreateProject] = useState(false);
  const [inlineProjectName, setInlineProjectName] = useState('');
  const [isSubmittingInlineProject, setIsSubmittingInlineProject] = useState(false);
  const [togglingProjectId, setTogglingProjectId] = useState<string | null>(null);

  // Multi-select on recent strip
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [showMultiSelectPicker, setShowMultiSelectPicker] = useState(false);

  // Section E: Universal Media Lightbox state
  const [lightboxItems, setLightboxItems] = useState<LightboxItem[] | null>(null);
  const [lightboxInitialIndex, setLightboxInitialIndex] = useState<number>(0);
  const [lightboxMode, setLightboxMode] = useState<'full' | 'half' | 'minimized'>('full');

  // Favorites & Music Playlists (Phase 5 & 6)
  const { isFavorite, toggleFavorite } = useFavorites();
  const [playlistTarget, setPlaylistTarget] = useState<{
    variantId: string;
    trackPreview?: {
      title?: string;
      prompt?: string;
      duration?: number;
      genre?: string;
      coverUrl?: string;
    };
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);

  // Live fetch from GET /api/projects on open (Section C.2)
  const fetchLiveProjects = useCallback(async () => {
    try {
      setIsLoadingLiveProjects(true);
      const token = accessToken || (await getAuthToken()) || userId;
      const res = await fetch('/api/projects', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        const list: Project[] = Array.isArray(data) ? data : data.projects || [];
        setLiveProjects(list);
      }
    } catch (err) {
      console.error('Error fetching live projects:', err);
    } finally {
      setIsLoadingLiveProjects(false);
    }
  }, [accessToken, userId]);

  // Close floating menu and return focus to trigger
  const handleCloseMenu = () => {
    setActiveMenuJob(null);
    setMenuTriggerRect(null);
    setShowUpscaleSubmenu(false);
    setShowProjectSubmenu(false);
    setProjectSearchFilter('');
    setShowInlineCreateProject(false);
    setUpscaleError(null);
    // Return focus to the trigger button that opened the menu
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  };

  // Toggle variant item in project (toggle semantics per Section C.2)
  const handleToggleProjectItem = async (project: Project, variantId: string) => {
    const isAlreadyAdded = (project.item_ids || []).includes(variantId);
    const prevProjects = [...liveProjects];
    const token = accessToken || (await getAuthToken()) || userId;

    setTogglingProjectId(project.id);

    // Optimistic toggle
    setLiveProjects((prev) =>
      prev.map((p) => {
        if (p.id !== project.id) return p;
        const ids = p.item_ids || [];
        const nextIds = isAlreadyAdded ? ids.filter((id) => id !== variantId) : [...ids, variantId];
        return {
          ...p,
          item_count: nextIds.length,
          item_ids: nextIds,
        };
      })
    );

    try {
      if (isAlreadyAdded) {
        const res = await fetch(`/api/projects/${project.id}/items/${variantId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) throw new Error('Failed to remove from project');
        setStatusAnnouncement(`Removed from ${project.name}`);
      } else {
        const res = await fetch(`/api/projects/${project.id}/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ variantIds: [variantId] }),
        });
        if (!res.ok) throw new Error('Failed to add to project');
        setStatusAnnouncement(`Added to ${project.name}`);
      }
      onRefreshProjects?.();
      window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
    } catch (err: any) {
      setLiveProjects(prevProjects);
      setStatusAnnouncement(`Operation failed: ${err?.message || 'Error'}`);
    } finally {
      setTogglingProjectId(null);
    }
  };

  // Inline project creation with auto-add (Section C.2)
  const handleCreateInlineProject = async (variantId: string) => {
    const trimmed = inlineProjectName.trim();
    if (!trimmed || isSubmittingInlineProject) return;

    setIsSubmittingInlineProject(true);
    const token = accessToken || (await getAuthToken()) || userId;

    try {
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!createRes.ok) throw new Error('Failed to create project');
      const createData = await createRes.json();
      const newProj = createData.project || createData;

      const addRes = await fetch(`/api/projects/${newProj.id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ variantIds: [variantId] }),
      });
      if (!addRes.ok) throw new Error('Failed to add variant to new project');

      setStatusAnnouncement(`Created "${newProj.name}" and added asset`);
      setInlineProjectName('');
      setShowInlineCreateProject(false);
      await fetchLiveProjects();
      onRefreshProjects?.();
      window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
    } catch (err: any) {
      setStatusAnnouncement(`Error: ${err?.message || 'Failed'}`);
    } finally {
      setIsSubmittingInlineProject(false);
    }
  };

  // Multi-select bulk add (Section C Multi-select)
  const handleBulkAddToProject = async (projectId: string) => {
    if (selectedVariantIds.length === 0) return;
    const token = accessToken || (await getAuthToken()) || userId;
    try {
      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ variantIds: selectedVariantIds }),
      });
      if (!res.ok) throw new Error('Failed to add selected items');
      const count = selectedVariantIds.length;
      setStatusAnnouncement(`Added ${count} items to project`);
      setSelectedVariantIds([]);
      setShowMultiSelectPicker(false);
      onRefreshProjects?.();
      window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
    } catch (err: any) {
      setStatusAnnouncement(`Bulk add failed: ${err?.message || 'Error'}`);
    }
  };

  // Keyboard navigation for accessible three-dot menu (Section 7)
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!menuRef.current) return;
    const items = Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prevIndex]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCloseMenu();
    } else if (e.key === 'Tab') {
      handleCloseMenu();
    }
  };

  // Focus the first interactive item when menu opens
  useEffect(() => {
    if (activeMenuJob && menuRef.current) {
      const firstItem = menuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
      firstItem?.focus();
    }
  }, [activeMenuJob]);

  // Close floating menu on scroll, window resize, or Escape key
  useEffect(() => {
    if (!activeMenuJob) return;
    const handleScrollOrResize = () => {
      handleCloseMenu();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseMenu();
      }
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenuJob]);

  // Video player muted states
  const [videoMuted, setVideoMuted] = useState(true);
  const [statusMsgIndex, setStatusMsgIndex] = useState(0);

  // Audio player states
  const [activeAudioVariantId, setActiveAudioVariantId] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // History strip scroll states
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollHistoryLeft, setCanScrollHistoryLeft] = useState(false);
  const [canScrollHistoryRight, setCanScrollHistoryRight] = useState(false);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(0);

  // Hero variant selection state (user-curated only)
  const [heroVariantId, setHeroVariantId] = useState<string | null>(null);

  // Open project picker for an individual variant tile
  const handleOpenProjectPickerForVariant = (
    e: React.MouseEvent<HTMLElement>,
    job: GenerationJob,
    variant: GenerationJobVariant
  ) => {
    e.stopPropagation();
    triggerRef.current = e.currentTarget as any;
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveMenuJob(job);
    setActiveMenuVariant(variant);
    setMenuTriggerRect(rect);
    setShowProjectSubmenu(true);
    setShowUpscaleSubmenu(false);
    setProjectSearchFilter('');
    setShowInlineCreateProject(false);
    fetchLiveProjects();
  };

  // Trash an individual variant tile (or permanently delete a failed variant) with immediate UI update and toast
  const handleTrashSingleVariant = async (job: GenerationJob, variant: GenerationJobVariant) => {
    const variantId = variant.id;
    const takeNumber = (variant.variant_index ?? 0) + 1;
    const effectiveStatus = variant.status || job.status;
    const isFailed =
      effectiveStatus === 'failed' || (!variant.output_url && effectiveStatus !== 'completed');

    // Optimistically update localHistoryJobs
    setLocalHistoryJobs((prev) =>
      prev
        .map((j) => {
          if (j.id !== job.id) return j;
          const currentVars = variantsForJob(j);
          const nextVars = currentVars.filter((v) => v.id !== variantId);
          const nextUrls = (j.output_urls || []).filter((_, idx) => idx !== variant.variant_index);
          return {
            ...j,
            variants: nextVars,
            output_urls: nextUrls,
          };
        })
        .filter((j) => (j.variants ? j.variants.length > 0 : (j.output_urls?.length ?? 0) > 0))
    );

    try {
      if (onDeleteJobVariant) {
        await onDeleteJobVariant(job.id, variantId);
      } else {
        const token = accessToken || (await getAuthToken());
        const res = await fetch(
          `/api/ai/variant/${encodeURIComponent(variantId)}${isFailed ? '?permanent=true' : ''}`,
          {
            method: 'DELETE',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(formatApiError(data.error, data.detail));
        }
      }
      if (isFailed) {
        toast.success('Failed generation permanently deleted');
        setStatusAnnouncement('Failed generation permanently deleted.');
      } else {
        toast.success(`Take ${takeNumber} moved to trash`);
        setStatusAnnouncement(`Take ${takeNumber} moved to trash.`);
      }
    } catch (err: any) {
      console.error('Failed to delete variant:', err);
      toast.error(
        isFailed
          ? `Failed to delete generation: ${err?.message || 'Error'}`
          : `Failed to move Take ${takeNumber} to trash: ${err?.message || 'Error'}`
      );
    }
  };

  // Permanently delete one or more failed jobs (and all their variants)
  const handlePermanentlyDeleteFailedJobs = async (jobsToDelete: GenerationJob[]) => {
    const jobIds = jobsToDelete.map((j) => j.id).filter(Boolean);
    if (jobIds.length === 0) return;
    const idSet = new Set(jobIds);

    setLocalHistoryJobs((prev) => prev.filter((j) => !idSet.has(j.id)));

    try {
      if (onDeleteFailedJobs) {
        await onDeleteFailedJobs(jobIds);
      } else {
        const token = accessToken || (await getAuthToken());
        const res = await fetch('/api/ai/jobs/delete-failed', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ jobIds }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(formatApiError(data.error, data.detail));
        }
      }
      const msg =
        jobIds.length > 1
          ? `${jobIds.length} failed generations permanently deleted`
          : 'Failed generation permanently deleted';
      toast.success(msg);
      setStatusAnnouncement(msg);
    } catch (err: any) {
      console.error('Failed to permanently delete failed jobs:', err);
      toast.error(`Failed to delete failed generation: ${err?.message || 'Error'}`);
    }
  };

  // Three-dot menu trigger handler
  const handleOpenMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    job: GenerationJob,
    variantOverride?: GenerationJobVariant
  ) => {
    e.stopPropagation();
    triggerRef.current = e.currentTarget;
    const rect = e.currentTarget.getBoundingClientRect();
    const variant =
      variantOverride ||
      variantsForJob(job)[0] || {
        id: `syn_${job.id}_0`,
        job_id: job.id,
        user_id: job.user_id,
        variant_index: 0,
        status: job.status,
        output_url: job.output_urls[0],
        credits_unit: 70,
        created_at: job.created_at,
        updated_at: job.created_at,
      };
    setActiveMenuJob(job);
    setActiveMenuVariant(variant);
    setMenuTriggerRect(rect);
    setShowUpscaleSubmenu(false);
    setShowProjectSubmenu(false);
    setProjectSearchFilter('');
    setShowInlineCreateProject(false);
    setUpscaleError(null);
    setUpscaleSuccessScale(null);
    fetchLiveProjects();
  };

  // Section 5.3.6: Blob-based download handler to bypass cross-origin restrictions
  const handleDownload = async (url: string, filename: string, variantId?: string) => {
    try {
      setIsDownloading(true);
      setStatusAnnouncement('Downloading asset...');
      await downloadAsset(url, filename, { showToast: true });
      setStatusAnnouncement('Download completed.');
    } finally {
      setIsDownloading(false);
      if (accessToken && variantId) {
        fetch('/api/ai/download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ variantId, resolution: 'original' }),
        }).catch(() => {});
      }
    }
  };

  // Section 5.3.5: Model-capped upscale handler with idempotency and structured errors
  const handleUpscale = async (targetScale: string) => {
    if (!activeMenuVariant || !activeMenuJob) return;
    setIsUpscalingScale(targetScale);
    setUpscaleError(null);
    setStatusAnnouncement(`Starting upscale to ${targetScale}...`);
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await fetch(`/api/ai/variant/${activeMenuVariant.id}/upscale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ targetScale, idempotencyKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorText = formatApiError(data.error, data.detail);
        setStatusAnnouncement(`Upscale failed: ${errorText}`);
        throw new Error(errorText);
      }

      const outputUrl = data.outputUrl || data.upscale?.output_url;
      setLocalHistoryJobs((prev) =>
        prev.map((j) => {
          if (j.id !== activeMenuJob.id) return j;
          const nextVariants = (j.variants || []).map((v) => {
            if (v.id !== activeMenuVariant.id) return v;
            return {
              ...v,
              upscaled_urls: {
                ...(v.upscaled_urls || {}),
                [targetScale]: outputUrl,
              },
            };
          });
          return {
            ...j,
            variants: nextVariants,
            upscaled_urls: {
              ...((j as any).upscaled_urls || {}),
              [targetScale]: outputUrl,
            },
          };
        })
      );

      setUpscaleSuccessScale(targetScale);
      setStatusAnnouncement(`Upscale to ${targetScale} completed. Starting download...`);
      onRefreshWallet?.();

      // Auto-trigger download of the upscaled asset
      if (outputUrl) {
        const ext = activeMenuJob.type === 'video' ? 'mp4' : 'png';
        const filename = `bidou-${activeMenuJob.type}-${activeMenuJob.id.slice(0, 8)}-${targetScale}.${ext}`;
        downloadAsset(outputUrl, filename, { showToast: true }).catch((err) => {
          console.warn('[DedicatedPreviewCanvas] Auto-download after upscale failed:', err);
        });
      }

      setTimeout(() => {
        handleCloseMenu();
      }, 1500);
    } catch (err: any) {
      setUpscaleError(err.message || 'Upscale failed. Please try again.');
    } finally {
      setIsUpscalingScale(null);
    }
  };

  // Section 5.3.7: Delete generation handler with optimistic removal
  const handleConfirmDelete = async () => {
    if (!confirmDeleteTarget) return;
    const { job, variantId } = confirmDeleteTarget;
    setIsDeleting(true);
    setStatusAnnouncement('Deleting generation...');
    try {
      setLocalHistoryJobs((prev) => prev.filter((j) => j.id !== job.id));

      if (onDeleteJobVariant) {
        await onDeleteJobVariant(job.id, variantId);
      } else {
        const res = await fetch(`/api/ai/variant/${variantId}`, {
          method: 'DELETE',
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(formatApiError(data.error, data.detail));
        }
      }
      setStatusAnnouncement('Generation deleted.');
    } catch (err: any) {
      console.error('Failed to delete generation:', err);
      setStatusAnnouncement(`Failed to delete generation: ${err?.message || 'Error'}`);
    } finally {
      setIsDeleting(false);
      setConfirmDeleteTarget(null);
    }
  };

  // Determine available scales based on producing model max_upscale
  const getAvailableScales = (job: GenerationJob | null) => {
    if (!job || job.type === 'music') return [];
    const model = models.find((m) => m.id === job.model_id || m.model_name === job.model_name);
    const maxScale = model?.max_upscale || (job.type === 'video' ? '1080p' : '1k');

    const SCALE_ORDER: Record<string, number> = { '720p': 1, '1080p': 2, '1k': 2, '2k': 3, '4k': 4 };
    const maxRank = SCALE_ORDER[maxScale] || 2;

    if (job.type === 'video') {
      const list = [
        { scale: '1080p', label: '1080p Full HD', cost: 70, rank: 2 },
        { scale: '4k', label: '4K Ultra HD', cost: 140, rank: 4 },
      ];
      return list.filter((item) => item.rank <= maxRank);
    }

    const list = [
      { scale: '1k', label: '1K Standard', cost: 35, rank: 2 },
      { scale: '2k', label: '2K Quad HD', cost: 70, rank: 3 },
      { scale: '4k', label: '4K Ultra HD', cost: 140, rank: 4 },
    ];
    return list.filter((item) => item.rank <= maxRank);
  };

  // Compute fixed dropdown position with upward flipping near screen bottom
  const computeMenuPosition = (rect: DOMRect) => {
    const menuWidth = 208;
    const menuHeight = 220;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right - menuWidth;
    if (left < 12) left = 12;
    if (left + menuWidth > viewportWidth - 12) left = viewportWidth - menuWidth - 12;

    const flipUpward = rect.bottom + menuHeight > viewportHeight - 20;
    let top = flipUpward ? rect.top - menuHeight - 6 : rect.bottom + 6;
    if (top < 12) top = 12;

    return { top, left, flipUpward };
  };

  // Compute fixed project submenu position adjacent to main menu and flipping upward near viewport bottom
  const computeProjectSubmenuPosition = (rect: DOMRect) => {
    const subWidth = 260;
    const subHeight = 330;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const menuPos = computeMenuPosition(rect);

    // Try placing to the right of the main menu (208px wide)
    let left = menuPos.left + 208 + 4;
    if (left + subWidth > viewportWidth - 12) {
      // Flip to left side
      left = menuPos.left - subWidth - 4;
      if (left < 12) left = 12;
    }

    let top = menuPos.top;
    if (top + subHeight > viewportHeight - 20) {
      top = Math.max(12, viewportHeight - subHeight - 20);
    }

    return { top, left };
  };

  // Batch stacking and active jobs management (Section 3.4)
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const outerWidth = useElementWidth(canvasContainerRef);
  const innerBatchesRef = useRef<HTMLDivElement>(null);
  const innerWidth = useElementWidth(innerBatchesRef);

  // Modelled progress timer (scoped to non-music active jobs; MusicTrackRow has its own isolated ticker)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (
      renderType !== 'music' &&
      currentJob &&
      (currentJob.status === 'processing' || currentJob.status === 'queued')
    ) {
      const interval = setInterval(() => setNow(Date.now()), 500);
      return () => clearInterval(interval);
    }
  }, [currentJob?.status, renderType]);

  const getVariantProgress = (variant: GenerationJobVariant, job?: GenerationJob) => {
    if (variant.status === 'completed') return 100;
    if (variant.status === 'failed' || variant.status === 'cancelled') return 0;
    const j = job || currentJob;
    const jobStartedAt = j?.started_at
      ? new Date(j.started_at).getTime()
      : j?.created_at
      ? new Date(j.created_at).getTime()
      : now;
    const elapsed = Math.max(0, (now - jobStartedAt) / 1000);
    const estimated = j?.type === 'video' ? 180 : j?.type === 'music' ? 90 : 20;
    const modelled = Math.min(92, (elapsed / estimated) * 100);
    return modelled;
  };

  // Rotating video status messages
  const rotatingVideoMessages = [
    'Initializing Google Veo 3.1 neural pipeline...',
    'Synthesizing cinematic 3D motion vectors & depth...',
    'Rendering camera stabilization and realistic physics...',
    'Mastering output with African lighting profile...',
    'Finalizing encoding in high-bitrate MP4...',
  ];

  useEffect(() => {
    if (currentJob?.status === 'processing' && renderType === 'video') {
      const interval = setInterval(() => {
        setStatusMsgIndex((prev) => (prev + 1) % rotatingVideoMessages.length);
      }, 4500);
      return () => clearInterval(interval);
    }
  }, [currentJob?.status, renderType]);

  // Audio cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  const handleTogglePlayAudio = (audioUrl: string, variantId: string) => {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(audioUrl);
      audioPlayerRef.current.onended = () => {
        setIsPlayingAudio(false);
        setActiveAudioVariantId(null);
      };
    } else if (audioPlayerRef.current.src !== audioUrl) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = new Audio(audioUrl);
      audioPlayerRef.current.onended = () => {
        setIsPlayingAudio(false);
        setActiveAudioVariantId(null);
      };
    }

    if (isPlayingAudio && activeAudioVariantId === variantId) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
      setActiveAudioVariantId(null);
    } else {
      audioPlayerRef.current.play().catch(() => {
        setIsPlayingAudio(false);
        setActiveAudioVariantId(null);
      });
      setIsPlayingAudio(true);
      setActiveAudioVariantId(variantId);
    }
  };

  // History strip scroll sync
  useEffect(() => {
    const el = historyScrollRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const updateScrollState = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!el) return;
        const { scrollLeft, scrollWidth, clientWidth } = el;
        setCanScrollHistoryLeft(scrollLeft > 4);
        setCanScrollHistoryRight(scrollLeft < scrollWidth - clientWidth - 4);
        const maxScroll = scrollWidth - clientWidth;
        if (maxScroll > 0) {
          const ratio = scrollLeft / maxScroll;
          const idx = Math.min(
            historyTiles.length - 1,
            Math.max(0, Math.round(ratio * (historyTiles.length - 1)))
          );
          setActiveHistoryIndex(idx);
        }
      });
    };

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [historyTiles.length]);

  const handleHistoryScroll = (direction: 'left' | 'right') => {
    const el = historyScrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  // Aspect-ratio and slot-based geometry model (Section 3.4 & Phase 2)
  const isMusic = renderType === 'music';

  // Music pagination state (Section 4.5: initial 12 job groups, +12 per "Load older tracks")
  const [visibleMusicBatchCount, setVisibleMusicBatchCount] = useState<number>(12);
  useEffect(() => {
    setVisibleMusicBatchCount(12);
  }, [activeTab]);

  // Mobile track sheet state for compact music rows (Section 4.2 & 4.7)
  const [mobileSheetTarget, setMobileSheetTarget] = useState<{
    job: GenerationJob;
    variant: GenerationJobVariant;
    triggerEl: HTMLElement | null;
  } | null>(null);

  // Derive all matching batches for the active tab (untruncated for music pagination)
  const allTabBatches = useMemo(() => {
    const batchList: Array<{
      job: GenerationJob;
      variants: GenerationJobVariant[];
    }> = [];
    const seenJobIds = new Set<string>();

    // 1. Current active or selected job (if matching active media type)
    if (currentJob && (currentJob.type === activeTab || (currentJob as any).media_type === activeTab)) {
      seenJobIds.add(currentJob.id);
      const curVars =
        variants && variants.length > 0 && variants[0]?.job_id === currentJob.id
          ? variants
          : variantsForJob(currentJob);
      batchList.push({
        job: currentJob,
        variants: curVars,
      });
    }

    // 2. Derive recent jobs for this tab from localHistoryJobs (canonical single source of truth)
    for (const job of localHistoryJobs) {
      if (!isMusic && batchList.length >= 8) break;
      if (job.type !== activeTab && (job as any).media_type !== activeTab) continue;
      if (seenJobIds.has(job.id)) continue;
      seenJobIds.add(job.id);

      batchList.push({
        job,
        variants: variantsForJob(job),
      });
    }

    return batchList;
  }, [currentJob, variants, localHistoryJobs, activeTab, isMusic]);

  const batches = useMemo(() => {
    if (isMusic) {
      return allTabBatches.slice(0, visibleMusicBatchCount);
    }
    return allTabBatches;
  }, [allTabBatches, isMusic, visibleMusicBatchCount]);

  const remainingMusicBatchCount = isMusic
    ? Math.max(0, allTabBatches.length - visibleMusicBatchCount)
    : 0;

  const musicDisplayGroups = useMemo(
    () => (isMusic ? groupMusicBatches(batches) : []),
    [isMusic, batches]
  );

  // Announce newly arrived failed music jobs once via status live region (Section 4.4)
  const announcedFailedJobIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isMusic || !currentJob) return;
    if (currentJob.status === 'failed' && !announcedFailedJobIdsRef.current.has(currentJob.id)) {
      announcedFailedJobIdsRef.current.add(currentJob.id);
      const msg = formatApiError(currentJob.error_message) || 'Generation failed';
      setStatusAnnouncement(`Music generation failed: ${msg}. Credits refunded.`);
    }
  }, [isMusic, currentJob?.id, currentJob?.status, currentJob?.error_message]);

  // Derive displayed items (variants + parent job) across stacked batches (Section 3.4)
  const displayItems = useMemo(() => {
    const items: Array<{
      variant: GenerationJobVariant;
      job: GenerationJob;
      globalIndex: number;
    }> = [];

    let gIdx = 0;
    for (const batch of batches) {
      for (const v of batch.variants) {
        items.push({
          variant: v,
          job: batch.job,
          globalIndex: gIdx++,
        });
      }
    }
    return items;
  }, [batches]);

  const totalTilesInCanvas = displayItems.length;

  const isAnyJobActive = useMemo(() => {
    if (currentJob && (currentJob.status === 'queued' || currentJob.status === 'processing')) {
      return true;
    }
    return batches.some((b) => b.job.status === 'queued' || b.job.status === 'processing');
  }, [currentJob, batches]);

  const hasItems = batches.some((b) => b.variants.length > 0);

  const handleSelectHistory = (job: GenerationJob) => {
    if (onSelectHistoryJob) {
      onSelectHistoryJob(job);
    }
  };

  // Section E: Lightbox Openers
  const openLightboxFromDisplayItems = (index: number) => {
    const items: LightboxItem[] = displayItems
      .filter(({ variant, job: j }) => (variant.status || j.status) === 'completed')
      .map(({ variant, job: j, globalIndex: gIdx }) => {
        const outUrl = variant.output_url || j.output_urls?.[variant.variant_index ?? gIdx] || '';
        return {
          id: variant.id || `${j.id}_${gIdx}`,
          type: j.type,
          url: outUrl,
          thumbnailUrl: variant.thumbnail_url || j.thumbnail_url,
          coverArtUrl: j.cover_art_url,
          prompt: j.prompt,
          modelId: j.model_id,
          modelName: j.model_name,
          creditCost: variant.credits_unit || j.credit_cost,
          resolution: j.resolution,
          durationSeconds: j.duration_seconds,
          aspectRatio: j.aspect_ratio,
          jobId: j.id,
          variantId: variant.id,
          rawItem: { job: j, variant },
        };
      });

    if (items.length === 0) return;
    setLightboxItems(items);
    setLightboxInitialIndex(Math.min(index, items.length - 1));
    setLightboxMode('full');
  };

  const openLightboxFromHistoryTile = (tileId: string) => {
    const eligibleTiles = historyTiles.filter((t) => !t.isFailed && t.url && t.variant);
    const items: LightboxItem[] = eligibleTiles.map((t) => {
      const v = t.variant!;
      const j = t.job;
      return {
        id: v.id,
        type: j.type,
        url: t.url!,
        thumbnailUrl: v.thumbnail_url || j.thumbnail_url,
        coverArtUrl: j.cover_art_url,
        prompt: j.prompt,
        modelId: j.model_id,
        modelName: j.model_name,
        creditCost: v.credits_unit || j.credit_cost,
        resolution: j.resolution,
        durationSeconds: j.duration_seconds,
        aspectRatio: j.aspect_ratio,
        jobId: j.id,
        variantId: v.id,
        rawItem: { job: j, variant: v },
      };
    });

    if (items.length === 0) return;
    const foundIdx = items.findIndex((i) => i.variantId === tileId);
    setLightboxItems(items);
    setLightboxInitialIndex(foundIdx >= 0 ? foundIdx : 0);
    setLightboxMode('full');
  };

  const openLightboxFromHistoryJob = (job: GenerationJob) => {
    const match = historyTiles.find((t) => t.job.id === job.id && !t.isFailed);
    if (match) {
      openLightboxFromHistoryTile(match.id);
    }
  };

  const openLightboxForVariant = useCallback(
    (variant: GenerationJobVariant, fallbackIndex = 0) => {
      const completedList = displayItems.filter(
        ({ variant: v, job: j }) => (v.status || j.status) === 'completed'
      );
      const completedIdx = completedList.findIndex((item) => item.variant.id === variant.id);
      openLightboxFromDisplayItems(completedIdx >= 0 ? completedIdx : fallbackIndex);
    },
    [displayItems]
  );

  const effectiveMusicWidth =
    innerWidth > 0
      ? innerWidth
      : outerWidth > 0
      ? outerWidth
      : typeof window !== 'undefined'
      ? window.innerWidth
      : 900;
  const musicTier = getMusicContainerTier(effectiveMusicWidth);

  if (!isMusic && outerWidth === 0) {
    return (
      <div
        className="w-full min-w-0 max-w-full flex flex-col gap-6"
        id="dedicated-preview-canvas"
        ref={canvasContainerRef}
      />
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full flex flex-col gap-6" id="dedicated-preview-canvas" ref={canvasContainerRef}>
      {/* Canvas Area Container - no outer border, no outer background, no glass-panel, no scrollbars, sits directly on page */}
      <div
        className={`relative w-full min-w-0 max-w-full min-h-[320px] flex flex-col ${
          isMusic && hasItems ? 'items-stretch justify-start py-2' : 'items-center justify-center p-2 sm:p-4'
        }`}
      >
        {/* Fallback Notification (Section 0.9) */}
        {currentJob?.fallback_triggered && (
          <div className="w-full max-w-xl mx-auto mb-3 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2 z-20">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-500 shrink-0" />
              <span>
                Rendered on <strong>{currentJob.model_name}</strong> — {currentJob.fallback_reason || 'primary provider was unavailable'}
              </span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STATE 1 & 2: MUSIC TRACK LIST OR DYNAMIC VARIANT GRID (VIDEO / IMAGE)     */}
        {/* ========================================================================= */}
        {hasItems ? (
          isMusic ? (
            <div
              ref={innerBatchesRef}
              role="list"
              aria-label="Generated music tracks"
              className="w-full min-w-0 max-w-full flex flex-col gap-3.5 z-10"
            >
              {musicDisplayGroups.map((group) => {
                if (group.kind === 'collapsed_failures') {
                  return (
                    <MusicFailedGroup
                      key={group.id}
                      id={group.id}
                      shortReason={group.shortReason}
                      mappedError={group.mappedError}
                      batches={group.batches}
                      tier={musicTier}
                      isFavorite={isFavorite}
                      heroVariantId={heroVariantId}
                      onToggleFavorite={toggleFavorite}
                      onToggleHero={(variant, idx) => {
                        const next = heroVariantId === variant.id ? null : variant.id;
                        setHeroVariantId(next);
                        onPickHeroVariant?.(variant, idx);
                      }}
                      onDownload={handleDownload}
                      onExpandVariant={openLightboxForVariant}
                      onOpenProjectPicker={handleOpenProjectPickerForVariant}
                      onOpenPlaylistPicker={(variant, job, title, outputUrl) => {
                        setPlaylistTarget({
                          variantId: variant.id,
                          trackPreview: {
                            title,
                            prompt: job.prompt,
                            genre: job.genre,
                            duration: job.duration_seconds,
                            coverUrl: job.cover_art_url || outputUrl,
                          },
                        });
                      }}
                      onRemixPrompt={onRemixPrompt}
                      onReusePrompt={onReusePrompt}
                      onMoveToTrash={handleTrashSingleVariant}
                      onDeleteFailedJobs={handlePermanentlyDeleteFailedJobs}
                      onOpenMobileSheet={(job, variant, triggerEl) =>
                        setMobileSheetTarget({ job, variant, triggerEl })
                      }
                    />
                  );
                }

                return (
                  <MusicJobGroup
                    key={group.batch.job.id}
                    job={group.batch.job}
                    variants={group.batch.variants}
                    tier={musicTier}
                    containerWidth={effectiveMusicWidth}
                    isFavorite={isFavorite}
                    heroVariantId={heroVariantId}
                    onToggleFavorite={toggleFavorite}
                    onToggleHero={(variant, idx) => {
                      const next = heroVariantId === variant.id ? null : variant.id;
                      setHeroVariantId(next);
                      onPickHeroVariant?.(variant, idx);
                    }}
                    onDownload={handleDownload}
                    onExpandVariant={openLightboxForVariant}
                    onOpenProjectPicker={handleOpenProjectPickerForVariant}
                    onOpenPlaylistPicker={(variant, job, title, outputUrl) => {
                      setPlaylistTarget({
                        variantId: variant.id,
                        trackPreview: {
                          title,
                          prompt: job.prompt,
                          genre: job.genre,
                          duration: job.duration_seconds,
                          coverUrl: job.cover_art_url || outputUrl,
                        },
                      });
                    }}
                    onRemixPrompt={onRemixPrompt}
                    onReusePrompt={onReusePrompt}
                    onMoveToTrash={handleTrashSingleVariant}
                    onDeleteFailedJob={(job) => handlePermanentlyDeleteFailedJobs([job])}
                    onOpenMobileSheet={(job, variant, triggerEl) =>
                      setMobileSheetTarget({ job, variant, triggerEl })
                    }
                  />
                );
              })}

              {/* Pagination & Music Library Footer (Section 4.5) */}
              {(remainingMusicBatchCount > 0 || onOpenMusicLibrary) && (
                <div className="w-full pt-2 flex flex-wrap items-center justify-center gap-3">
                  {remainingMusicBatchCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setVisibleMusicBatchCount((prev) => prev + 12)}
                      className="min-h-[40px] [@media(pointer:coarse)]:min-h-[44px] px-4 py-2 rounded-xl glass-panel border border-[#FF8800]/25 hover:border-[#FF8800] text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
                    >
                      Load older tracks ({remainingMusicBatchCount} more)
                    </button>
                  )}

                  {onOpenMusicLibrary && (
                    <button
                      type="button"
                      onClick={onOpenMusicLibrary}
                      className="min-h-[40px] [@media(pointer:coarse)]:min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-[#F86A00] hover:text-[#FF8800] hover:bg-[#FF8800]/10 transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8800]"
                    >
                      <span>Open in Music Library</span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}

              {/* Phase 2 Sticky Now-Playing Mini-Player */}
              <MusicMiniPlayer
                tier={musicTier}
                onExpandVariant={(variantId) => {
                  const found = displayItems.find((it) => it.variant.id === variantId);
                  if (found) {
                    openLightboxForVariant(found.variant, found.globalIndex);
                  }
                }}
              />
            </div>
          ) : (
          <div ref={innerBatchesRef} className="w-full min-w-0 max-w-full flex flex-col items-center justify-center gap-8 z-10">
            {batches.map((batch) => {
              const batchRatio: Ratio =
                batch.job.aspect_ratio === '9:16' ||
                batch.job.aspect_ratio === '1:1' ||
                batch.job.aspect_ratio === '16:9'
                  ? (batch.job.aspect_ratio as Ratio)
                  : '16:9';
              const { width: tileW, height: tileH, cols } = computeTileSize({
                ratio: batchRatio,
                count: batch.variants.length,
                containerWidth: innerWidth > 0 ? innerWidth : outerWidth,
                gap: 16,
                totalTilesInCanvas,
              });

              return (
                <div key={batch.job.id} className="w-full flex flex-col items-center gap-3">
                  {/* Header info badge if multi-variant */}
                  {batch.variants.length > 1 && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-[11px] font-mono text-[#6B6B75] dark:text-[#A0A0AA]">
                      <span className="font-bold text-[#F86A00]">{batch.variants.length} Takes</span>
                      <span>•</span>
                      <span>{batch.job.model_name}</span>
                      <span>•</span>
                      <span className="capitalize">{batchRatio}</span>
                    </div>
                  )}

                  <div
                    className="grid justify-center gap-4"
                    style={{ gridTemplateColumns: `repeat(${cols}, ${tileW}px)` }}
                  >
                    {batch.variants.map((variant, vIdx) => {
                      const globalIndex = displayItems.findIndex(
                        (item) => item.variant.id === variant.id || (item.job.id === batch.job.id && item.variant.variant_index === vIdx)
                      );
                      const effectiveIndex = globalIndex >= 0 ? globalIndex : vIdx;
                      const effectiveStatus = variant.status || batch.job.status;
                      const progressPct = getVariantProgress(variant, batch.job);
                      const outputUrl =
                        variant.output_url ||
                        batch.job.output_urls?.[variant.variant_index ?? vIdx];
                      const isHero = Boolean(heroVariantId === variant.id || (variant as any).is_hero || (variant as any).is_favorited);
                      const tileKey = variant.id || `${batch.job.id}_${variant.variant_index ?? vIdx}`;

                      return (
                        <div
                          key={tileKey}
                          style={{ width: tileW, height: tileH }}
                          className={`relative overflow-hidden rounded-2xl glass-panel border border-[#FF8800]/20 shadow-md flex flex-col items-center justify-center group ${
                            effectiveStatus === 'queued'
                              ? 'bg-black/5 dark:bg-white/5 animate-pulse'
                              : effectiveStatus === 'processing'
                              ? 'bg-black/10 dark:bg-white/5'
                              : effectiveStatus === 'failed'
                              ? 'bg-rose-500/10 border-rose-500/30'
                              : 'bg-black/5 dark:bg-white/5'
                          }`}
                        >
                          {/* Index Pill Tag */}
                          <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white font-mono text-[10px] font-bold">
                            <span>Take {(variant.variant_index ?? vIdx) + 1}</span>
                            {isHero && effectiveStatus === 'completed' && (
                              <span className="flex items-center gap-0.5 text-[#FFB020]">
                                <Star size={10} className="fill-[#FFB020]" />
                                <span>Hero</span>
                              </span>
                            )}
                          </div>

                          {/* STATE A: QUEUED */}
                          {effectiveStatus === 'queued' && (
                            <div className="flex flex-col items-center justify-center text-center p-4 z-10">
                              <div className="w-10 h-10 rounded-xl bg-brand-gradient/10 border border-[#FF8800]/20 flex items-center justify-center text-[#F86A00] mb-2">
                                <Clock size={20} className="animate-spin" />
                              </div>
                              <span className="text-xs font-mono font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                                Queued
                              </span>
                              <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                                Waiting for inference slot...
                              </span>
                            </div>
                          )}

                          {/* STATE B: PROCESSING */}
                          {effectiveStatus === 'processing' && (
                            <div className="flex flex-col items-center justify-center text-center p-4 w-full max-w-[260px] z-10">
                              <ProgressRing targetPercent={progressPct} size={Math.min(72, tileW * 0.4)} />
                              <span className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] mt-3 truncate max-w-full px-2">
                                {renderType === 'video'
                                  ? rotatingVideoMessages[statusMsgIndex]
                                  : `Rendering with ${batch.job.model_name}...`}
                              </span>
                              <span className="text-[10px] font-mono text-[#6B6B75] dark:text-[#A0A0AA] mt-1 truncate max-w-full px-2">
                                {Math.round(progressPct)}% • {renderType === 'video' ? 'Veo 3.1 60fps' : 'HQ Synthesis'}
                              </span>

                              {/* Per-tile progress bar pinned to bottom edge */}
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20 dark:bg-white/10 overflow-hidden">
                                <div
                                  className="h-full bg-brand-gradient transition-all duration-300"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* STATE C: COMPLETED */}
                          {effectiveStatus === 'completed' && outputUrl && (
                            <>
                              {renderType === 'video' ? (
                                <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                                  <VideoPlayer
                                    variantId={variant.id}
                                    src={outputUrl}
                                    poster={posterFor(variant.thumbnail_url || batch.job.thumbnail_url, outputUrl)}
                                    className="w-full h-full object-cover"
                                    onExpand={() => openLightboxFromDisplayItems(effectiveIndex)}
                                  />
                                </div>
                              ) : (
                                <div
                                  className="absolute inset-0 w-full h-full cursor-pointer"
                                  onClick={() => openLightboxFromDisplayItems(effectiveIndex)}
                                >
                                  <img
                                    src={outputUrl}
                                    alt={`${batch.job.prompt} - Take ${(variant.variant_index ?? vIdx) + 1}`}
                                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openLightboxFromDisplayItems(effectiveIndex);
                                    }}
                                    className="absolute top-3 right-3 z-20 p-2 rounded-xl bg-black/60 hover:bg-[#FF8800] text-white backdrop-blur-md transition-all sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer shadow-md"
                                    title="Open image lightbox"
                                    aria-label="Open image lightbox"
                                  >
                                    <Maximize2 size={15} />
                                  </button>
                                </div>
                              )}

                              {/* Per-Variant Manual Curation Action Bar (Section 4.1 & Phase 4) */}
                              <VariantActionBar
                                width={tileW}
                                actions={[
                                  {
                                    id: 'favorite',
                                    label: isFavorite(variant.id) ? 'Remove from favorites' : 'Add to favorites',
                                    icon: Heart,
                                    active: isFavorite(variant.id),
                                    onClick: () => toggleFavorite(variant.id),
                                  },
                                  {
                                    id: 'hero',
                                    label: isHero ? 'Hero selected' : 'Pick as Hero',
                                    icon: Star,
                                    active: isHero,
                                    onClick: () => {
                                      const next = heroVariantId === variant.id ? null : variant.id;
                                      setHeroVariantId(next);
                                      if (onPickHeroVariant) {
                                        onPickHeroVariant(variant, effectiveIndex);
                                      }
                                    },
                                  },
                                  {
                                    id: 'download',
                                    label: 'Download',
                                    icon: Download,
                                    onClick: () => {
                                      handleDownload(
                                        outputUrl,
                                        `bidou-${batch.job.type}-take-${(variant.variant_index ?? vIdx) + 1}.${batch.job.type === 'video' ? 'mp4' : batch.job.type === 'music' ? 'mp3' : 'jpg'}`,
                                        variant.id
                                      );
                                    },
                                  },
                                  {
                                    id: 'project',
                                    label: 'Add to project',
                                    icon: FolderPlus,
                                    onClick: (e) => handleOpenProjectPickerForVariant(e as React.MouseEvent<HTMLElement>, batch.job, variant),
                                  },
                                  {
                                    id: 'playlist',
                                    label: 'Add to playlist',
                                    icon: ListMusic,
                                    hidden: batch.job.type !== 'music',
                                    onClick: () => {
                                      setPlaylistTarget({
                                        variantId: variant.id,
                                        trackPreview: {
                                          title: batch.job.prompt,
                                          prompt: batch.job.prompt,
                                          genre: batch.job.genre,
                                          duration: batch.job.duration_seconds,
                                          coverUrl: outputUrl,
                                        },
                                      });
                                    },
                                  },
                                  {
                                    id: 'remix',
                                    label: 'Remix prompt',
                                    icon: Sparkles,
                                    hidden: !onRemixPrompt,
                                    onClick: () => {
                                      if (onRemixPrompt) {
                                        onRemixPrompt(batch.job.prompt, batch.job.type);
                                      }
                                    },
                                  },
                                  {
                                    id: 'trash',
                                    label: 'Move to trash',
                                    icon: Trash2,
                                    danger: true,
                                    onClick: () => handleTrashSingleVariant(batch.job, variant),
                                  },
                                ]}
                              />
                            </>
                          )}

                          {/* STATE D: FAILED */}
                          {effectiveStatus === 'failed' && (
                            <div className="flex flex-col items-center justify-center text-center p-4 z-10" role="alert">
                              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center mb-2" aria-hidden="true">
                                <AlertCircle size={20} />
                              </div>
                              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                                <AlertCircle size={14} className="text-rose-500 shrink-0" aria-hidden="true" />
                                <span>{formatApiError(variant.error_message || batch.job.error_message) || 'Generation failed'}</span>
                              </span>
                              <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA] mt-1 max-w-[220px]">
                                Credits for this variant were refunded
                              </span>
                              <div className="flex items-center gap-2 mt-3">
                                {onReusePrompt && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onReusePrompt(batch.job);
                                    }}
                                    className="min-h-[32px] px-3 py-1.5 rounded-xl bg-brand-gradient text-white text-xs font-semibold shadow-xs hover:opacity-95 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <RotateCcw size={12} aria-hidden="true" />
                                    <span>Retry</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTrashSingleVariant(batch.job, variant);
                                  }}
                                  title="Delete failed generation permanently"
                                  aria-label="Delete failed generation permanently"
                                  className="min-h-[32px] px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Trash2 size={12} aria-hidden="true" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          )
        ) : (
          /* ========================================================================= */
          /* STATE 3: CLEAN EMPTY STATE WHEN IDLE                                      */
          /* ========================================================================= */
          <div className="flex flex-col items-center justify-center text-center p-8 max-w-md z-10">
            <div className="w-16 h-16 rounded-3xl glass-panel border border-[#FF8800]/25 flex items-center justify-center text-[#F86A00] mb-4 shadow-xl">
              {activeTab === 'image' ? (
                <ImageIcon size={30} />
              ) : activeTab === 'video' ? (
                <VideoIcon size={30} />
              ) : (
                <MusicIcon size={30} />
              )}
            </div>
            <h3 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              {activeTab === 'image'
                ? 'Ready for Image Creation'
                : activeTab === 'video'
                ? 'Ready for Video Directing'
                : 'Ready for Music Production'}
            </h3>
            <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1 leading-relaxed">
              {activeTab === 'image'
                ? 'Enter your prompt above with Google Nano Banana to render photorealistic 4K visual art in seconds.'
                : activeTab === 'video'
                ? 'Direct realistic African cinematic scenes with Google Veo 3.1 at full 1080p 60fps.'
                : 'Compose multi-track African rhythms with Sonic v4.5 and Sonic v5, complete with authentic arrangements and custom lyrics.'}
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* RECENT GENERATIONS HISTORY GALLERY FOR ACTIVE MEDIA TYPE (VIDEO / IMAGE)  */}
      {/* ========================================================================= */}
      {!isMusic && historyTiles.length > 0 && (
        <div className="w-full flex flex-col gap-3 p-4 rounded-2xl glass-panel border border-[#FF8800]/15">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              <Clock size={14} className="text-[#F86A00]" />
              <span className="capitalize">Recent {activeTab} Generations</span>
              <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] font-normal">
                ({historyTiles.length} items)
              </span>
            </div>

            {/* Mobile Dot Indicators */}
            <div className="flex sm:hidden items-center gap-1.5" aria-hidden="true">
              {historyTiles.slice(0, 5).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === (activeHistoryIndex % Math.min(5, historyTiles.length))
                      ? 'w-4 bg-brand-gradient'
                      : 'w-1.5 bg-black/20 dark:bg-white/20'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="relative w-full">
            {/* Previous Arrow Button */}
            <button
              type="button"
              onClick={() => handleHistoryScroll('left')}
              disabled={!canScrollHistoryLeft}
              aria-label="Previous"
              className={`hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 min-h-11 min-w-11 w-11 h-11 rounded-full overlay-panel items-center justify-center text-[#1A1A1E] dark:text-[#F5F5F7] shadow-lg transition-all duration-200 cursor-pointer ${
                !canScrollHistoryLeft
                  ? 'opacity-0 pointer-events-none'
                  : 'opacity-100 hover:scale-105 active:scale-95 hover:border-[#FF8800]'
              }`}
            >
              <ChevronLeft size={20} className="text-[#F86A00]" />
            </button>

            {/* Next Arrow Button */}
            <button
              type="button"
              onClick={() => handleHistoryScroll('right')}
              disabled={!canScrollHistoryRight}
              aria-label="Next"
              className={`hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 min-h-11 min-w-11 w-11 h-11 rounded-full overlay-panel items-center justify-center text-[#1A1A1E] dark:text-[#F5F5F7] shadow-lg transition-all duration-200 cursor-pointer ${
                !canScrollHistoryRight
                  ? 'opacity-0 pointer-events-none'
                  : 'opacity-100 hover:scale-105 active:scale-95 hover:border-[#FF8800]'
              }`}
            >
              <ChevronRight size={20} className="text-[#F86A00]" />
            </button>

            <div
              ref={historyScrollRef}
              className="flex gap-3 overflow-x-auto no-scrollbar pb-1 select-none scroll-smooth snap-x snap-mandatory scroll-px-4"
            >
              <AnimatePresence mode="popLayout">
                {historyTiles.map((tile) => {
                  // Section 5.3.3: Distinct Failed State Card
                  if (tile.isFailed) {
                    const job = tile.job;
                    return (
                      <motion.div
                        layout={historyTiles.length <= 24}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        key={tile.id}
                        id={`job-tile-${tile.id}`}
                        className="snap-start group relative shrink-0 w-36 sm:w-44 aspect-square rounded-xl p-2.5 sm:p-3 flex flex-col justify-between bg-rose-500/10 border border-rose-500/30 text-left transition-all hover:border-rose-500/60 shadow-sm"
                      >
                        {/* Top Badge & Delete Button */}
                        <div className="flex items-center justify-between gap-1">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold">
                            <AlertCircle size={11} className="shrink-0" />
                            <span>Failed</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-[#8E8E98] dark:text-[#71717A] uppercase font-bold">
                              {job.type}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePermanentlyDeleteFailedJobs([job]);
                              }}
                              title="Permanently delete failed generation"
                              aria-label="Permanently delete failed generation"
                              className="p-1 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                            >
                              <Trash2 size={12} aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {/* Prompt & Error Info */}
                        <div className="my-1">
                          <p className="text-[10px] sm:text-[11px] font-medium text-[#1A1A1E] dark:text-[#F5F5F7] line-clamp-2 leading-tight">
                            {job.prompt}
                          </p>
                          {job.error_message && (
                            <p className="text-[9px] text-rose-500 truncate mt-0.5">
                              {formatApiError(job.error_message)}
                            </p>
                          )}
                          <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                            {job.credits_refunded || job.credit_cost || 0} credits refunded
                          </p>
                        </div>

                        {/* Bottom: Reuse Prompt & Delete Buttons (Section 5.3.4) */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            id={`reuse-btn-${job.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onReusePrompt?.(job);
                            }}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-brand-gradient text-white text-[10px] font-bold shadow hover:opacity-95 flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                          >
                            <RotateCcw size={11} />
                            <span>Retry</span>
                          </button>
                          <button
                            type="button"
                            id={`delete-failed-btn-${job.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePermanentlyDeleteFailedJobs([job]);
                            }}
                            title="Delete failed generation permanently"
                            aria-label="Delete failed generation permanently"
                            className="py-1.5 px-2 rounded-lg border border-rose-500/30 bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                          >
                            <Trash2 size={11} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </motion.div>
                    );
                  }

                  // Successful Entry Card (Per Variant)
                  const job = tile.job;
                  const variant = tile.variant!;
                  const isSelected = selectedVariantIds.includes(tile.id);
                  const isFav = isFavorite(tile.id);

                  return (
                    <motion.div
                      layout={historyTiles.length <= 24}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      key={tile.id}
                      id={`job-tile-${tile.id}`}
                      onClick={() => openLightboxFromHistoryTile(tile.id)}
                      className="snap-start group relative shrink-0 w-28 sm:w-36 aspect-square rounded-xl overflow-hidden glass-panel border border-[#FF8800]/20 hover:border-[#FF8800] transition-all cursor-pointer shadow-sm hover:shadow-md"
                    >
                      {job.type === 'video' ? (
                        <VideoPlayer
                          src={tile.url || ''}
                          variantId={variant.id}
                          poster={posterFor(variant.thumbnail_url || job.thumbnail_url, tile.url)}
                          compact
                          onExpand={() => openLightboxFromHistoryTile(tile.id)}
                          className="w-full h-full object-cover"
                        />
                      ) : job.type === 'image' ? (
                        <img
                          src={tile.url}
                          alt={job.prompt}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-gradient-to-tr from-[#F86A00]/20 to-[#FFB020]/20 text-center relative overflow-hidden">
                          <CircularAudioPlayer
                            src={tile.url || ''}
                            variantId={variant.id}
                            coverArtUrl={job.cover_art_url}
                            title={job.prompt}
                            size={72}
                            showControls={false}
                          />
                          <span className="text-[10px] font-bold text-brand-gradient mt-1 truncate max-w-full">
                            {job.genre || 'Track'}
                          </span>
                        </div>
                      )}

                      {/* Multi-variant Take Badge */}
                      {tile.hasMultipleVariants && (
                        <div className="absolute bottom-1.5 left-10 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-bold text-white/90 pointer-events-none z-20 shadow-sm border border-white/10">
                          Take {tile.takeIndex}
                        </div>
                      )}

                      {/* Multi-select Selection Checkbox (Section C) */}
                      <button
                        type="button"
                        id={`select-btn-${tile.id}`}
                        aria-label={isSelected ? 'Deselect item' : 'Select item'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVariantIds((prev) =>
                            prev.includes(tile.id)
                              ? prev.filter((id) => id !== tile.id)
                              : [...prev, tile.id]
                          );
                        }}
                        className={`absolute top-1.5 left-1.5 min-w-[34px] min-h-[34px] rounded-lg flex items-center justify-center transition-all z-20 cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF8800] text-white opacity-100 shadow-md ring-2 ring-white/50'
                            : 'bg-black/50 text-white/80 opacity-0 group-hover:opacity-100 focus:opacity-100'
                        }`}
                      >
                        {isSelected ? (
                          <Check size={16} strokeWidth={3} />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-xs border-2 border-white/80" />
                        )}
                      </button>

                      {/* Maximize / Preview Button */}
                      <button
                        type="button"
                        id={`preview-btn-${tile.id}`}
                        aria-label="Preview in lightbox"
                        onClick={(e) => {
                          e.stopPropagation();
                          openLightboxFromHistoryTile(tile.id);
                        }}
                        className="absolute bottom-1.5 left-1.5 min-w-[32px] min-h-[32px] p-1.5 rounded-lg bg-black/60 hover:bg-[#FF8800] backdrop-blur-md text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-all z-20 cursor-pointer shadow-sm"
                        title="Expand in Lightbox"
                      >
                        <Maximize2 size={13} aria-hidden="true" />
                      </button>

                      {/* Favorite Heart Button & Indicator */}
                      <button
                        type="button"
                        id={`fav-btn-${tile.id}`}
                        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(tile.id);
                        }}
                        className={`absolute bottom-1.5 right-1.5 min-w-[32px] min-h-[32px] p-1.5 rounded-lg backdrop-blur-md flex items-center justify-center transition-all z-20 cursor-pointer shadow-sm ${
                          isFav
                            ? 'bg-black/70 text-[#FF8800] opacity-100 ring-1 ring-[#FF8800]/40'
                            : 'bg-black/60 text-white hover:text-[#FF8800] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
                        }`}
                      >
                        <Heart
                          size={14}
                          className={isFav ? 'fill-current text-[#FF8800]' : ''}
                          aria-hidden="true"
                        />
                      </button>

                      {/* Three-Dot Menu Button */}
                      <button
                        type="button"
                        id={`more-btn-${tile.id}`}
                        aria-label="Generation options"
                        aria-haspopup="menu"
                        aria-expanded={activeMenuJob?.id === job.id && activeMenuVariant?.id === variant.id}
                        aria-controls={`generation-menu-${tile.id}`}
                        onClick={(e) => handleOpenMenu(e, job, variant)}
                        className="absolute top-1.5 right-1.5 min-w-[44px] min-h-[44px] rounded-lg bg-black/60 hover:bg-black/85 focus:ring-2 focus:ring-[#FF8800] backdrop-blur-md text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity z-20 cursor-pointer shadow-sm active:scale-95"
                      >
                        <MoreVertical size={16} aria-hidden="true" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Floating Multi-Select Action Bar (Section C) */}
      {selectedVariantIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-2xl bg-[#1A1A1E] text-white border border-[#FF8800]/40 shadow-2xl flex items-center gap-3 animate-slide-up">
          <span className="text-xs font-semibold">
            {selectedVariantIds.length} item{selectedVariantIds.length > 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            onClick={() => {
              fetchLiveProjects();
              setShowMultiSelectPicker(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-brand-gradient text-white text-xs font-bold hover:opacity-95 cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <FolderPlus size={14} />
            <span>Add to project</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedVariantIds([])}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 cursor-pointer"
            title="Clear selection"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Accessible screen reader status announcements (Section 7) */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5 PORTALS: THREE-DOT MENU & CONFIRMATION MODALS                   */}
      {/* ========================================================================= */}
      {activeMenuJob && activeMenuVariant && menuTriggerRect && typeof document !== 'undefined' && createPortal(
        <>
          {/* Dismissal Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs sm:bg-transparent"
            onClick={handleCloseMenu}
          />

          {/* Mobile Bottom Sheet (< 640px) with safe-area-inset-bottom (Section 7) */}
          <div
            ref={menuRef}
            role="menu"
            id={`generation-menu-mobile-${activeMenuJob.id}`}
            aria-label="Generation options"
            className="fixed inset-x-0 bottom-0 z-50 sm:hidden bg-[#FBFBFC] dark:bg-[#1A1A1E] rounded-t-2xl border-t border-[#FF8800]/30 shadow-2xl p-4 animate-slide-up flex flex-col gap-2 max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            onKeyDown={handleMenuKeyDown}
          >
            <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20 mx-auto mb-2" />

            {/* Header info */}
            <div className="flex items-center gap-3 pb-2 border-b border-black/5 dark:border-white/5">
              <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-black/10">
                {activeMenuJob.type === 'video' ? (
                  <video src={activeMenuJob.output_urls[0]} className="w-full h-full object-cover" muted />
                ) : activeMenuJob.type === 'image' ? (
                  <img src={activeMenuJob.output_urls[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-brand-gradient/20">
                    <MusicIcon size={18} className="text-[#F86A00]" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
                  {activeMenuJob.prompt}
                </p>
                <span className="text-[10px] text-[#8E8E98] dark:text-[#71717A] uppercase font-bold">
                  {activeMenuJob.type}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close options menu"
                onClick={handleCloseMenu}
                className="min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-[#6B6B75] flex items-center justify-center cursor-pointer"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Actions List */}
            <div className="flex flex-col gap-1 py-1">
              {/* Upscale Options */}
              {activeMenuJob.type !== 'music' && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-[#8E8E98] dark:text-[#71717A] uppercase px-1 mt-1">
                    Upscale Resolution
                  </span>
                  {getAvailableScales(activeMenuJob).map((scaleItem) => {
                    const alreadyUpscaled = !!activeMenuVariant.upscaled_urls?.[scaleItem.scale];
                    const isCurrent = isUpscalingScale === scaleItem.scale;
                    const isSuccess = upscaleSuccessScale === scaleItem.scale;
                    return (
                      <button
                        key={scaleItem.scale}
                        type="button"
                        role="menuitem"
                        disabled={alreadyUpscaled || isCurrent || !!isUpscalingScale}
                        onClick={() => handleUpscale(scaleItem.scale)}
                        className={`min-h-[44px] w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          alreadyUpscaled
                            ? 'bg-black/5 dark:bg-white/5 opacity-50 cursor-not-allowed text-[#6B6B75]'
                            : 'hover:bg-[#FF8800]/10 text-[#1A1A1E] dark:text-[#F5F5F7]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Maximize2 size={15} className="text-[#F86A00]" aria-hidden="true" />
                          <span>{scaleItem.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {alreadyUpscaled ? (
                            <span className="text-[10px] text-[#8E8E98]">Already upscaled</span>
                          ) : isSuccess ? (
                            <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                              <Check size={12} /> Ready
                            </span>
                          ) : isCurrent ? (
                            <Loader2 size={14} className="animate-spin text-[#F86A00]" />
                          ) : (
                            <span className="text-[10px] font-bold text-[#F86A00]">
                              {scaleItem.cost} credits
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Add to project (Section C.2) */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowProjectSubmenu(true);
                  fetchLiveProjects();
                }}
                className="min-h-[44px] w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FolderPlus size={15} className="text-[#F86A00]" aria-hidden="true" />
                  <span>Add to project</span>
                </div>
                <ChevronRight size={14} className="text-[#8E8E98]" aria-hidden="true" />
              </button>

              {/* Add to playlist (Section 5: Music only) */}
              {activeMenuJob.type === 'music' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPlaylistTarget({
                      variantId: activeMenuVariant.id,
                      trackPreview: {
                        title: activeMenuJob.prompt,
                        prompt: activeMenuJob.prompt,
                        genre: activeMenuJob.genre,
                        duration: activeMenuJob.duration_seconds,
                        coverUrl: activeMenuJob.output_urls?.[0],
                      },
                    });
                    handleCloseMenu();
                  }}
                  className="min-h-[44px] w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ListMusic size={15} className="text-[#F86A00]" aria-hidden="true" />
                    <span>Add to playlist</span>
                  </div>
                  <ChevronRight size={14} className="text-[#8E8E98]" aria-hidden="true" />
                </button>
              )}

              {/* Favorite / Remove from favorites */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  toggleFavorite(activeMenuVariant.id);
                  handleCloseMenu();
                }}
                className="min-h-[44px] w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Heart
                    size={15}
                    className={isFavorite(activeMenuVariant.id) ? 'text-[#FF8800] fill-current' : 'text-[#F86A00]'}
                    aria-hidden="true"
                  />
                  <span>
                    {isFavorite(activeMenuVariant.id) ? 'Remove from favorites' : 'Favorite'}
                  </span>
                </div>
              </button>

              <div className="h-px bg-black/5 dark:bg-white/5 my-1" />

              {/* Download */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const ext =
                    activeMenuJob.type === 'video' ? 'mp4' : activeMenuJob.type === 'music' ? 'mp3' : 'jpg';
                  handleDownload(
                    activeMenuJob.output_urls[0],
                    `bidou-${activeMenuJob.type}-${activeMenuJob.id.slice(0, 8)}.${ext}`,
                    activeMenuVariant.id
                  );
                  handleCloseMenu();
                }}
                className="min-h-[44px] w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Download size={15} className="text-[#F86A00]" aria-hidden="true" />
                  <span>Download Original</span>
                </div>
                <span className="text-[10px] text-[#8E8E98]">Direct blob</span>
              </button>

              {/* Open in Lightbox */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openLightboxFromHistoryJob(activeMenuJob);
                  handleCloseMenu();
                }}
                className="min-h-[44px] w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
              >
                <Maximize2 size={15} className="text-[#F86A00]" aria-hidden="true" />
                <span>Full Lightbox View</span>
              </button>

              {/* Reuse Prompt Shortcut */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onReusePrompt?.(activeMenuJob);
                  handleCloseMenu();
                }}
                className="min-h-[44px] w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
              >
                <RotateCcw size={15} className="text-[#F86A00]" aria-hidden="true" />
                <span>Reuse prompt & settings</span>
              </button>

              <div className="h-px bg-black/5 dark:bg-white/5 my-1" />

              {/* Delete */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setConfirmDeleteTarget({ job: activeMenuJob, variantId: activeMenuVariant.id });
                  handleCloseMenu();
                }}
                className="min-h-[44px] w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
              >
                <Trash2 size={15} aria-hidden="true" />
                <span>Delete Generation</span>
              </button>
            </div>
          </div>

          {/* Mobile "Add to project" Bottom Sheet (Section C.2) */}
          {showProjectSubmenu && (
            <div
              role="dialog"
              aria-label="Add to project"
              className="fixed inset-x-0 bottom-0 z-50 sm:hidden bg-[#FBFBFC] dark:bg-[#1A1A1E] rounded-t-3xl border-t border-[#FF8800]/30 shadow-2xl p-4 animate-slide-up flex flex-col gap-2 max-h-[70vh] overflow-y-auto"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag Handle */}
              <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20 mx-auto mb-1" />

              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setShowProjectSubmenu(false)}
                  className="flex items-center gap-1 text-xs font-semibold text-[#8E8E98] hover:text-[#FF8800] p-1 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                  <span>Back</span>
                </button>
                <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Add to project
                </span>
                <button
                  type="button"
                  onClick={handleCloseMenu}
                  className="p-1 text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Search input if > 6 projects */}
              {liveProjects.length > 6 && (
                <div className="px-1 py-1">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-xs text-[#1A1A1E] dark:text-[#F5F5F7] border border-black/10 dark:border-white/10">
                    <Search size={14} className="text-[#8E8E98] shrink-0" />
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={projectSearchFilter}
                      onChange={(e) => setProjectSearchFilter(e.target.value)}
                      className="w-full bg-transparent border-none outline-hidden text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Projects List */}
              <div className="flex-1 overflow-y-auto py-1 flex flex-col gap-1">
                {isLoadingLiveProjects ? (
                  <div className="py-8 flex items-center justify-center gap-2 text-xs text-[#8E8E98]">
                    <Loader2 size={16} className="animate-spin text-[#FF8800]" />
                    <span>Loading projects...</span>
                  </div>
                ) : liveProjects.length === 0 ? (
                  <div className="py-6 px-3 text-center flex flex-col items-center gap-3 text-[#8E8E98]">
                    <p className="text-xs font-medium">No projects yet — create one to organise your work</p>
                    <button
                      type="button"
                      onClick={() => setShowInlineCreateProject(true)}
                      className="px-4 py-2 rounded-xl bg-brand-gradient text-white text-xs font-bold cursor-pointer shadow-sm"
                    >
                      Create Project
                    </button>
                  </div>
                ) : (
                  liveProjects
                    .filter((p) => p.name.toLowerCase().includes(projectSearchFilter.toLowerCase()))
                    .map((project) => {
                      const isAdded = (project.item_ids || []).includes(activeMenuVariant.id);
                      const isToggling = togglingProjectId === project.id;
                      return (
                        <button
                          key={project.id}
                          type="button"
                          disabled={isToggling}
                          onClick={() => handleToggleProjectItem(project, activeMenuVariant.id)}
                          className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isAdded
                              ? 'bg-[#FF8800]/15 text-[#FF8800]'
                              : 'hover:bg-black/5 dark:hover:bg-white/5 text-[#1A1A1E] dark:text-[#F5F5F7]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div
                              className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                              style={{ backgroundColor: project.color || '#F86A00' }}
                            />
                            <span className="truncate font-medium">{project.name}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isAdded ? (
                              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                <Check size={14} />
                                <span>Already added</span>
                              </span>
                            ) : (
                              <span className="text-[11px] font-mono text-[#8E8E98]">
                                {project.item_count || 0} items
                              </span>
                            )}
                            {isToggling && <Loader2 size={13} className="animate-spin text-[#FF8800]" />}
                          </div>
                        </button>
                      );
                    })
                )}
              </div>

              {/* Inline Create Form or Button */}
              <div className="pt-2 border-t border-black/5 dark:border-white/5">
                {showInlineCreateProject ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleCreateInlineProject(activeMenuVariant.id);
                    }}
                    className="flex flex-col gap-2 p-1"
                  >
                    <input
                      type="text"
                      placeholder="Project name"
                      value={inlineProjectName}
                      onChange={(e) => setInlineProjectName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/15 text-[#1A1A1E] dark:text-[#F5F5F7] outline-hidden focus:border-[#FF8800]"
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowInlineCreateProject(false)}
                        className="px-3 py-1.5 text-xs text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!inlineProjectName.trim() || isSubmittingInlineProject}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FF8800] text-white disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {isSubmittingInlineProject ? 'Adding...' : 'Create & Add'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowInlineCreateProject(true)}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[#FF8800] hover:bg-[#FF8800]/10 transition-colors cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>New project</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Desktop Floating Menu (>= 640px) with accessibility (Section 7) */}
          {(() => {
            const pos = computeMenuPosition(menuTriggerRect);
            const scales = getAvailableScales(activeMenuJob);
            return (
              <div
                ref={menuRef}
                role="menu"
                id={`generation-menu-${activeMenuJob.id}`}
                aria-label="Generation options"
                style={{ top: pos.top, left: pos.left }}
                className="hidden sm:flex fixed z-50 w-56 rounded-xl overlay-panel shadow-2xl flex-col py-1.5 border border-[#FF8800]/25 bg-[#FBFBFC] dark:bg-[#1A1A1E] text-xs font-medium animate-fade-in"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleMenuKeyDown}
              >
                {/* Upscale Option & Submenu */}
                {activeMenuJob.type !== 'music' && scales.length > 0 && (
                  <div className="relative group/upscale">
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup="true"
                      aria-expanded={showUpscaleSubmenu}
                      onClick={() => setShowUpscaleSubmenu(!showUpscaleSubmenu)}
                      className="min-h-[44px] w-full flex items-center justify-between px-3 py-2 hover:bg-[#FF8800]/10 text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Maximize2 size={15} className="text-[#F86A00]" aria-hidden="true" />
                        <span>Upscale</span>
                      </div>
                      <ChevronRight
                        size={14}
                        className={`text-[#8E8E98] transition-transform ${
                          showUpscaleSubmenu ? 'rotate-90 text-[#F86A00]' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>

                    {/* Submenu */}
                    {showUpscaleSubmenu && (
                      <div
                        role="menu"
                        aria-label="Upscale resolutions"
                        className="px-1 py-1 bg-black/[0.03] dark:bg-white/[0.03] border-y border-black/5 dark:border-white/5 flex flex-col gap-0.5"
                      >
                        {scales.map((s) => {
                          const alreadyUpscaled = !!activeMenuVariant.upscaled_urls?.[s.scale];
                          const isCurrent = isUpscalingScale === s.scale;
                          const isSuccess = upscaleSuccessScale === s.scale;
                          return (
                            <button
                              key={s.scale}
                              type="button"
                              role="menuitem"
                              disabled={alreadyUpscaled || isCurrent || !!isUpscalingScale}
                              onClick={() => handleUpscale(s.scale)}
                              className={`min-h-[44px] w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                alreadyUpscaled
                                  ? 'opacity-50 cursor-not-allowed text-[#8E8E98]'
                                  : 'hover:bg-[#FF8800]/15 text-[#1A1A1E] dark:text-[#F5F5F7]'
                              }`}
                            >
                              <span className="font-semibold">{s.label}</span>
                              {alreadyUpscaled ? (
                                <span className="text-[10px] text-[#8E8E98]">Done</span>
                              ) : isSuccess ? (
                                <Check size={14} className="text-emerald-500" aria-hidden="true" />
                              ) : isCurrent ? (
                                <Loader2 size={14} className="animate-spin text-[#F86A00]" aria-hidden="true" />
                              ) : (
                                <span className="text-xs text-[#F86A00] font-bold">{s.cost}c</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Upscale Error display if any */}
                {upscaleError && (
                  <div className="px-3 py-1.5 text-xs text-rose-500 bg-rose-500/10 flex items-center gap-1" role="alert">
                    <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
                    <span>{upscaleError}</span>
                  </div>
                )}

                {/* Add to project Option (Section C.2) */}
                <div className="relative group/project">
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="true"
                    aria-expanded={showProjectSubmenu}
                    onClick={() => {
                      const next = !showProjectSubmenu;
                      setShowProjectSubmenu(next);
                      if (next) fetchLiveProjects();
                    }}
                    onMouseEnter={() => {
                      setShowProjectSubmenu(true);
                      fetchLiveProjects();
                    }}
                    className="min-h-[44px] w-full flex items-center justify-between px-3 py-2 hover:bg-[#FF8800]/10 text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <FolderPlus size={15} className="text-[#F86A00]" aria-hidden="true" />
                      <span>Add to project</span>
                    </div>
                    <ChevronRight
                      size={14}
                      className={`text-[#8E8E98] transition-transform ${
                        showProjectSubmenu ? 'rotate-90 text-[#F86A00]' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                {/* Add to playlist (Section 5: Music only) */}
                {activeMenuJob.type === 'music' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPlaylistTarget({
                        variantId: activeMenuVariant.id,
                        trackPreview: {
                          title: activeMenuJob.prompt,
                          prompt: activeMenuJob.prompt,
                          genre: activeMenuJob.genre,
                          duration: activeMenuJob.duration_seconds,
                          coverUrl: activeMenuJob.output_urls?.[0],
                        },
                      });
                      handleCloseMenu();
                    }}
                    className="min-h-[44px] w-full flex items-center gap-2 px-3 py-2 hover:bg-[#FF8800]/10 text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors cursor-pointer"
                  >
                    <ListMusic size={15} className="text-[#F86A00]" aria-hidden="true" />
                    <span>Add to playlist</span>
                  </button>
                )}

                {/* Favorite / Remove from favorites */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    toggleFavorite(activeMenuVariant.id);
                    handleCloseMenu();
                  }}
                  className="min-h-[44px] w-full flex items-center gap-2 px-3 py-2 hover:bg-[#FF8800]/10 text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors cursor-pointer"
                >
                  <Heart
                    size={15}
                    className={isFavorite(activeMenuVariant.id) ? 'text-[#FF8800] fill-current' : 'text-[#F86A00]'}
                    aria-hidden="true"
                  />
                  <span>
                    {isFavorite(activeMenuVariant.id) ? 'Remove from favorites' : 'Favorite'}
                  </span>
                </button>

                <div className="h-px bg-black/5 dark:bg-white/5 my-1" />

                {/* Download */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const ext =
                      activeMenuJob.type === 'video' ? 'mp4' : activeMenuJob.type === 'music' ? 'mp3' : 'jpg';
                    handleDownload(
                      activeMenuJob.output_urls[0],
                      `bidou-${activeMenuJob.type}-${activeMenuJob.id.slice(0, 8)}.${ext}`,
                      activeMenuVariant.id
                    );
                    handleCloseMenu();
                  }}
                  className="min-h-[44px] w-full flex items-center gap-2 px-3 py-2 hover:bg-[#FF8800]/10 text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors cursor-pointer"
                >
                  <Download size={15} className="text-[#F86A00]" aria-hidden="true" />
                  <span>Download</span>
                </button>

                {/* Open in Lightbox */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    openLightboxFromHistoryJob(activeMenuJob);
                    handleCloseMenu();
                  }}
                  className="min-h-[44px] w-full flex items-center gap-2 px-3 py-2 hover:bg-[#FF8800]/10 text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors cursor-pointer"
                >
                  <Maximize2 size={15} className="text-[#F86A00]" aria-hidden="true" />
                  <span>Full Lightbox View</span>
                </button>

                {/* Reuse Prompt Shortcut */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onReusePrompt?.(activeMenuJob);
                    handleCloseMenu();
                  }}
                  className="min-h-[44px] w-full flex items-center gap-2 px-3 py-2 hover:bg-[#FF8800]/10 text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors cursor-pointer"
                >
                  <RotateCcw size={15} className="text-[#F86A00]" aria-hidden="true" />
                  <span>Reuse prompt</span>
                </button>

                <div className="h-px bg-black/5 dark:bg-white/5 my-1" />

                {/* Delete */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setConfirmDeleteTarget({ job: activeMenuJob, variantId: activeMenuVariant.id });
                    handleCloseMenu();
                  }}
                  className="min-h-[44px] w-full flex items-center gap-2 px-3 py-2 hover:bg-rose-500/10 text-rose-500 transition-colors cursor-pointer"
                >
                  <Trash2 size={15} aria-hidden="true" />
                  <span>Delete</span>
                </button>
              </div>
            );
          })()}

          {/* Desktop Project Submenu Portal (>= 640px) (Section C.2) */}
          {showProjectSubmenu && menuTriggerRect && activeMenuVariant && (() => {
            const subPos = computeProjectSubmenuPosition(menuTriggerRect);
            const filteredProjects = liveProjects.filter((p) =>
              p.name.toLowerCase().includes(projectSearchFilter.toLowerCase())
            );

            return (
              <div
                ref={submenuRef}
                role="menu"
                aria-label="Select Project"
                style={{ top: subPos.top, left: subPos.left }}
                className="hidden sm:flex fixed z-50 w-64 rounded-xl overlay-panel shadow-2xl flex-col py-1 border border-[#FF8800]/25 bg-[#FBFBFC] dark:bg-[#1A1A1E] text-xs font-medium animate-fade-in"
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setShowProjectSubmenu(true)}
              >
                {/* Search if > 6 projects */}
                {liveProjects.length > 6 && (
                  <div className="p-2 border-b border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-xs text-[#1A1A1E] dark:text-[#F5F5F7]">
                      <Search size={13} className="text-[#8E8E98]" />
                      <input
                        type="text"
                        placeholder="Search projects..."
                        value={projectSearchFilter}
                        onChange={(e) => setProjectSearchFilter(e.target.value)}
                        className="w-full bg-transparent border-none outline-hidden text-xs placeholder-[#8E8E98]"
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {/* Projects list */}
                <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1 max-h-56">
                  {isLoadingLiveProjects ? (
                    <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#8E8E98]">
                      <Loader2 size={15} className="animate-spin text-[#FF8800]" />
                      <span>Loading projects...</span>
                    </div>
                  ) : filteredProjects.length === 0 && liveProjects.length === 0 ? (
                    <div className="py-5 px-3 text-center flex flex-col items-center gap-2 text-[#8E8E98]">
                      <p className="text-xs font-medium">No projects yet — create one to organise your work</p>
                      <button
                        type="button"
                        onClick={() => setShowInlineCreateProject(true)}
                        className="px-3 py-1.5 rounded-lg bg-[#FF8800]/15 text-[#FF8800] text-xs font-semibold hover:bg-[#FF8800]/25 transition-colors cursor-pointer"
                      >
                        Create Project
                      </button>
                    </div>
                  ) : filteredProjects.length === 0 ? (
                    <div className="py-4 text-center text-xs text-[#8E8E98]">
                      No matching projects
                    </div>
                  ) : (
                    filteredProjects.map((project) => {
                      const isAdded = (project.item_ids || []).includes(activeMenuVariant.id);
                      const isToggling = togglingProjectId === project.id;
                      return (
                        <button
                          key={project.id}
                          type="button"
                          role="menuitem"
                          disabled={isToggling}
                          onClick={() => handleToggleProjectItem(project, activeMenuVariant.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left ${
                            isAdded
                              ? 'bg-[#FF8800]/10 text-[#FF8800]'
                              : 'hover:bg-black/5 dark:hover:bg-white/5 text-[#1A1A1E] dark:text-[#F5F5F7]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                              style={{ backgroundColor: project.color || '#F86A00' }}
                            />
                            <span className="truncate font-medium">{project.name}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isAdded ? (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <Check size={12} />
                                <span>Already added</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-[#8E8E98]">
                                {project.item_count || 0}
                              </span>
                            )}
                            {isToggling && <Loader2 size={12} className="animate-spin text-[#FF8800]" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Last Row: + New project */}
                <div className="p-1.5 border-t border-black/5 dark:border-white/5">
                  {showInlineCreateProject ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleCreateInlineProject(activeMenuVariant.id);
                      }}
                      className="flex flex-col gap-2 p-1"
                    >
                      <input
                        type="text"
                        placeholder="Project name"
                        value={inlineProjectName}
                        onChange={(e) => setInlineProjectName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/15 text-[#1A1A1E] dark:text-[#F5F5F7] outline-hidden focus:border-[#FF8800]"
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowInlineCreateProject(false)}
                          className="px-2 py-1 text-[11px] text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!inlineProjectName.trim() || isSubmittingInlineProject}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#FF8800] text-white disabled:opacity-50 cursor-pointer"
                        >
                          {isSubmittingInlineProject ? 'Adding...' : 'Create & Add'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setShowInlineCreateProject(true)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#FF8800] hover:bg-[#FF8800]/10 transition-colors cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>New project</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </>,
        document.body
      )}

      {/* Multi-Select Project Picker Modal (Section C Multi-Select) */}
      {showMultiSelectPicker && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBFBFC] dark:bg-[#1A1A1E] border border-black/10 dark:border-white/10 rounded-2xl p-5 max-w-sm w-full shadow-2xl animate-scale-in flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Add {selectedVariantIds.length} item{selectedVariantIds.length > 1 ? 's' : ''} to Project
              </h4>
              <button
                type="button"
                onClick={() => setShowMultiSelectPicker(false)}
                className="p-1 rounded-lg text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto flex flex-col gap-1 py-1">
              {liveProjects.length === 0 ? (
                <div className="text-center py-4 flex flex-col items-center gap-2">
                  <p className="text-xs text-[#8E8E98]">No projects yet.</p>
                </div>
              ) : (
                liveProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleBulkAddToProject(p.id)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: p.color || '#F86A00' }}
                      />
                      <span className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                        {p.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-[#8E8E98]">
                      {p.item_count || 0} items
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteTarget && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBFBFC] dark:bg-[#1A1A1E] border border-black/10 dark:border-white/10 rounded-2xl p-5 max-w-sm w-full shadow-2xl animate-scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Delete this generation?
                </h4>
                <span className="text-[11px] text-[#8E8E98] dark:text-[#71717A]">
                  Cannot be undone
                </span>
              </div>
            </div>
            <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed mb-5">
              This will remove the generation from your studio history. Your underlying credit transaction ledger records will remain preserved.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-4 py-2 rounded-xl glass-panel text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] hover:border-[#FF8800]/40 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-md shadow-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Generation</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Universal Media Lightbox (Section E) */}
      {lightboxItems && lightboxItems.length > 0 && (
        <MediaLightbox
          items={lightboxItems}
          initialIndex={lightboxInitialIndex}
          mode={lightboxMode}
          onModeChange={setLightboxMode}
          models={models}
          onRefreshWallet={onRefreshWallet}
          onClose={() => setLightboxItems(null)}
          onRemix={(prompt, type) => {
            onRemixPrompt?.(prompt, type);
            setLightboxItems(null);
          }}
          onReusePrompt={(job) => {
            onReusePrompt?.(job);
            setLightboxItems(null);
          }}
          onDelete={async (item) => {
            const variantId = item.variantId || item.id;
            if (!variantId) return;

            const previousItems = lightboxItems ? [...lightboxItems] : [];
            const previousIndex = lightboxInitialIndex;
            const previousLocalJobs = [...localHistoryJobs];

            const deletedIndex = previousItems.findIndex(
              (it) => (it.variantId ? it.variantId === variantId : it.id === variantId)
            );
            const remainingItems = previousItems.filter(
              (it) => (it.variantId ? it.variantId !== variantId : it.id !== variantId)
            );

            // 1 & 2. Optimistically remove from lightboxItems, close if empty, or advance index
            if (remainingItems.length === 0) {
              setLightboxItems(null);
            } else {
              const nextIndex = Math.min(
                deletedIndex >= 0 ? deletedIndex : 0,
                remainingItems.length - 1
              );
              setLightboxInitialIndex(nextIndex);
              setLightboxItems(remainingItems);
            }

            // Also optimistically update localHistoryJobs
            if (item.jobId) {
              setLocalHistoryJobs((prev) =>
                prev
                  .map((j) => {
                    if (j.id !== item.jobId) return j;
                    const nextVars = (j.variants || []).filter((v) => v.id !== variantId);
                    return { ...j, variants: nextVars };
                  })
                  .filter((j) => (j.variants ? j.variants.length > 0 : (j.output_urls?.length ?? 0) > 0))
              );
            }

            // Derive take number
            const matchingTile = historyTiles.find((t) => t.variant?.id === variantId);
            const takeNumber =
              (item.rawItem?.variant?.variant_index != null
                ? item.rawItem.variant.variant_index
                : matchingTile?.variant?.variant_index ?? (deletedIndex >= 0 ? deletedIndex : 0)) + 1;

            try {
              // 3. Call onDeleteJobVariant and await it
              if (onDeleteJobVariant && item.jobId) {
                await onDeleteJobVariant(item.jobId, variantId);
              } else {
                const token = accessToken || (await getAuthToken());
                const res = await fetch(`/api/ai/variant/${variantId}`, {
                  method: 'DELETE',
                  headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  throw new Error(formatApiError(data.error, data.detail));
                }
              }

              // 4. On success, show toast
              toast.success(`Take ${takeNumber} moved to trash`);
              setStatusAnnouncement(`Take ${takeNumber} moved to trash.`);
            } catch (err: any) {
              // 5. On failure, roll back optimistic removal from lightboxItems
              console.error('Failed to trash variant from lightbox:', err);
              setLightboxItems(previousItems);
              setLightboxInitialIndex(previousIndex);
              setLocalHistoryJobs(previousLocalJobs);
              toast.error(`Failed to move Take ${takeNumber} to trash: ${err?.message || 'Error'}`);
              throw err;
            }
          }}
        />
      )}

      {/* Add To Playlist Popover (Phase 6) */}
      {playlistTarget && (
        <AddToPlaylistPopover
          isOpen={Boolean(playlistTarget)}
          onClose={() => setPlaylistTarget(null)}
          variantId={playlistTarget.variantId}
          trackPreview={playlistTarget.trackPreview}
        />
      )}

      {/* Mobile Bottom Sheet for Compact Music Rows (Section 4.2 & 4.7) */}
      {isMusic && (
        <MusicTrackSheet
          isOpen={Boolean(mobileSheetTarget)}
          job={mobileSheetTarget?.job ?? null}
          variant={mobileSheetTarget?.variant ?? null}
          originElement={mobileSheetTarget?.triggerEl ?? null}
          isFavorite={mobileSheetTarget ? isFavorite(mobileSheetTarget.variant.id) : false}
          isHero={
            mobileSheetTarget
              ? Boolean(
                  heroVariantId === mobileSheetTarget.variant.id ||
                    (mobileSheetTarget.variant as GenerationJobVariant & { is_hero?: boolean }).is_hero
                )
              : false
          }
          onClose={() => setMobileSheetTarget(null)}
          onToggleFavorite={toggleFavorite}
          onToggleHero={(variant) => {
            const next = heroVariantId === variant.id ? null : variant.id;
            setHeroVariantId(next);
            const foundIdx = displayItems.findIndex((it) => it.variant.id === variant.id);
            onPickHeroVariant?.(variant, foundIdx >= 0 ? foundIdx : 0);
          }}
          onDownload={handleDownload}
          onExpand={() => {
            if (mobileSheetTarget) {
              openLightboxForVariant(mobileSheetTarget.variant, 0);
            }
          }}
          onOpenProjectPicker={handleOpenProjectPickerForVariant}
          onOpenPlaylistPicker={(variant, job, title, outputUrl) => {
            setPlaylistTarget({
              variantId: variant.id,
              trackPreview: {
                title,
                prompt: job.prompt,
                genre: job.genre,
                duration: job.duration_seconds,
                coverUrl: job.cover_art_url || outputUrl,
              },
            });
          }}
          onRemixPrompt={onRemixPrompt}
          onMoveToTrash={handleTrashSingleVariant}
        />
      )}
    </div>
  );
};
