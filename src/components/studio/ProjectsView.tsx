// Bidou AI Projects View
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FolderPlus,
  Folder,
  Image,
  Video,
  Music,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertCircle,
  RefreshCw,
  Kanban,
  LayoutGrid,
  MoreVertical,
  FolderMinus,
  Maximize2,
  SlidersHorizontal,
} from 'lucide-react';
import { GenerationJob, Project, ProjectFolder, LibraryItem } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { ProjectBoard } from './ProjectBoard';
import { useTrash } from '../../hooks/useTrash';
import { useProjectAssets } from '../../hooks/useProjectAssets';
import { getAuthToken } from '../../services/authToken';
import { libraryItemToJob } from '../../lib/jobConversion';
import { MediaLightbox, LightboxItem } from '../common/MediaLightbox';
import { CircularAudioPlayer } from '../common/CircularAudioPlayer';
import { VideoPlayer } from '../common/VideoPlayer';
import { posterFor } from '../../services/media';
import { AnchoredMenu } from '../common/AnchoredMenu';

export interface ProjectsViewProps {
  jobs: GenerationJob[];
  folders: (ProjectFolder | Project)[];
  onCreateFolder: (name: string) => Promise<any>;
  onDeleteFolder?: (id: string) => Promise<void>;
  onSelectMedia: (job: GenerationJob) => void;
  isReconnecting?: boolean;
  accessToken?: string;
  userId?: string;
}

interface ProjectAssetCardMenuProps {
  item: LibraryItem;
  selectedFolderId: string | null;
  onOpenInStudio: () => void;
  onRemoveFromProject?: () => void;
  onDelete: () => void;
}

const ProjectAssetCardMenu: React.FC<ProjectAssetCardMenuProps> = ({
  item,
  selectedFolderId,
  onOpenInStudio,
  onRemoveFromProject,
  onDelete,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-colors cursor-pointer"
        title="Item Actions"
        aria-label="Item Actions"
      >
        <MoreVertical size={14} />
      </button>

      <AnchoredMenu
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
        title="Asset Options"
        align="right"
        desktopWidth="12rem"
      >
        {({ close }) => (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                close();
                onOpenInStudio();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer font-medium text-xs transition-colors"
            >
              <SlidersHorizontal size={14} className="text-[#6B6B75] dark:text-[#A0A0AA]" />
              <span>Open in studio</span>
            </button>

            {selectedFolderId && onRemoveFromProject && (
              <>
                <div className="my-0.5 border-t border-black/5 dark:border-white/5" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                    onRemoveFromProject();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer font-medium text-xs transition-colors"
                >
                  <FolderMinus size={14} className="text-[#6B6B75] dark:text-[#A0A0AA]" />
                  <span>Remove from project</span>
                </button>
              </>
            )}

            <div className="my-0.5 border-t border-black/5 dark:border-white/5" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                close();
                onDelete();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer font-medium text-xs transition-colors"
            >
              <Trash2 size={14} className="text-rose-500" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </AnchoredMenu>
    </>
  );
};

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  jobs,
  folders,
  onCreateFolder,
  onDeleteFolder,
  onSelectMedia,
  isReconnecting = false,
  accessToken,
  userId,
}) => {
  // Grid by default per requirement T6
  const [viewMode, setViewMode] = useState<'board' | 'grid'>('grid');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);

  // Lightbox state
  const [lightboxItems, setLightboxItems] = useState<LightboxItem[] | null>(null);
  const [lightboxInitialIndex, setLightboxInitialIndex] = useState<number>(0);

  const { trashVariants } = useTrash({ userId, autoFetch: false });

  // Scalable, server-paginated assets hook with infinite scroll trigger
  const {
    items: projectItems,
    isLoading: isAssetsLoading,
    isFetchingMore,
    hasMore,
    loadMore,
    totalCount,
    sentinelRef,
    removeItemLocal,
  } = useProjectAssets({
    projectId: selectedFolderId,
    userId,
    limit: 24,
  });

  const handleRemoveFromProject = async (projectId: string, variantId: string) => {
    try {
      const token = accessToken || (await getAuthToken()) || userId;
      await fetch(`/api/projects/${projectId}/items/${variantId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      removeItemLocal(variantId);
      window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
    } catch (err) {
      console.error('Error removing item from project:', err);
    }
  };

  const handleTrashFromProject = async (variantId: string) => {
    try {
      await trashVariants([variantId]);
      removeItemLocal(variantId);
      window.dispatchEvent(new CustomEvent('bidou_trash_updated'));
    } catch (err) {
      console.error('Error trashing item:', err);
    }
  };

  // Chevron horizontal scroll tracking
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [folders.length]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.6;
    el.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await onCreateFolder(trimmed);
      const createdId =
        typeof result === 'string'
          ? result
          : result?.id || null;

      if (createdId) {
        // §B.4: Auto-select new project immediately
        setSelectedFolderId(createdId);
        setPulseId(createdId);

        // Clear pulse after animation
        setTimeout(() => {
          setPulseId((prev) => (prev === createdId ? null : prev));
        }, 2200);

        // §B.4: Scroll newly created chip into view smoothly
        setTimeout(() => {
          const chipEl = chipRefs.current[createdId];
          if (chipEl) {
            chipEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
        }, 60);
      }

      setNewFolderName('');
      setShowNewFolderModal(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to open lightbox from a LibraryItem in ProjectsView
  const openLightboxForItem = (item: LibraryItem) => {
    const items: LightboxItem[] = projectItems.map((pi) => ({
      id: pi.id,
      type: pi.media_type,
      url: pi.output_url,
      thumbnailUrl: pi.thumbnail_url,
      coverArtUrl: pi.cover_art_url,
      prompt: pi.prompt,
      modelId: (pi as any).model_id,
      modelName: pi.model_name,
      creditCost: pi.credits_unit,
      resolution: pi.resolution,
      durationSeconds: pi.duration_seconds,
      aspectRatio: pi.aspect_ratio,
      jobId: pi.job_id,
      variantId: pi.id,
      rawItem: libraryItemToJob(pi, userId),
    }));
    const foundIdx = projectItems.findIndex((pi) => pi.id === item.id);
    setLightboxItems(items);
    setLightboxInitialIndex(foundIdx >= 0 ? foundIdx : 0);
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 py-6 px-4 sm:px-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#FF8800]/15 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="jost text-2xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              Creative Projects & Assets
            </h2>
            {isReconnecting && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FFB020]/15 text-[#FFB020] border border-[#FFB020]/30 animate-pulse">
                <RefreshCw size={10} className="animate-spin" />
                Reconnecting...
              </span>
            )}
          </div>
          <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
            Organize and manage your synthesized visuals, cinematic videos, and studio tracks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle: Kanban Board vs Folder Grid */}
          <div className="flex items-center p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-brand-gradient text-white shadow-xs'
                  : 'text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
              title="Folder Grid View"
            >
              <LayoutGrid size={13} />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'board'
                  ? 'bg-brand-gradient text-white shadow-xs'
                  : 'text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
              title="Kanban Board View"
            >
              <Kanban size={13} />
              <span>Board</span>
            </button>
          </div>

          {selectedFolder && onDeleteFolder && viewMode === 'grid' && (
            <button
              type="button"
              onClick={async () => {
                if (window.confirm(`Delete project "${selectedFolder.name}"? Assets inside will remain in All Assets.`)) {
                  await onDeleteFolder(selectedFolder.id);
                  setSelectedFolderId(null);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#E23636] hover:bg-[#E23636]/10 border border-[#E23636]/20 transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Delete Project</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setNewFolderName('');
              setShowNewFolderModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel text-[#1A1A1E] dark:text-[#F5F5F7] hover:border-[#FF8800] transition-colors cursor-pointer shadow-sm"
          >
            <FolderPlus size={15} className="text-[#FF8800]" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Board (Kanban) vs Grid */}
      {viewMode === 'board' ? (
        <ProjectBoard
          jobs={jobs}
          projects={folders as Project[]}
          accessToken={accessToken}
          userId={userId}
          onSelectMedia={onSelectMedia}
          onCreateProject={onCreateFolder}
          onDeleteProject={onDeleteFolder}
        />
      ) : (
        <>
          {/* Folders Row with Chevron Controls (§B.4) */}
          <div className="relative group/chips flex items-center">
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => handleScroll('left')}
                className="absolute left-0 z-10 p-1.5 rounded-full bg-white/90 dark:bg-[#18181B]/90 shadow-md border border-black/10 dark:border-white/15 text-[#1A1A1E] dark:text-[#F5F5F7] hover:scale-105 transition-all cursor-pointer -ml-2"
                aria-label="Scroll left"
              >
                <ChevronLeft size={16} />
              </button>
            )}

            <div
              ref={scrollContainerRef}
              className="flex items-center gap-2.5 overflow-x-auto py-2 px-1 w-full scroll-smooth"
            >
              {/* All Assets Tab */}
              <button
                type="button"
                onClick={() => setSelectedFolderId(null)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                  selectedFolderId === null
                    ? 'bg-brand-gradient text-white shadow-sm ring-1 ring-[#FF8800]/50'
                    : 'glass-panel text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                }`}
              >
                <Folder size={14} />
                <span>All Assets ({totalCount !== undefined ? totalCount : projectItems.length})</span>
              </button>

              {/* Project Folders */}
              {folders.map((folder) => {
                const isSelected = selectedFolderId === folder.id;
                const isPulsing = pulseId === folder.id;
                const count =
                  (folder as any).item_count !== undefined
                    ? (folder as any).item_count
                    : (folder as any).item_ids?.length || 0;
                const color = (folder as any).color || '#F86A00';

                return (
                  <motion.button
                    key={folder.id}
                    ref={(el) => {
                      chipRefs.current[folder.id] = el;
                    }}
                    type="button"
                    onClick={() => setSelectedFolderId(folder.id)}
                    animate={
                      isPulsing
                        ? {
                            scale: [1, 1.06, 1],
                            boxShadow: [
                              '0 0 0 0 rgba(255, 136, 0, 0)',
                              '0 0 0 4px rgba(255, 136, 0, 0.4)',
                              '0 0 0 0 rgba(255, 136, 0, 0)',
                            ],
                          }
                        : {}
                    }
                    transition={{ duration: 0.6, repeat: isPulsing ? 2 : 0 }}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand-gradient text-white shadow-md ring-1 ring-[#FF8800]'
                        : 'bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <Folder size={14} className={isSelected ? 'text-white' : 'text-[#FF8800]'} />
                    <span className="truncate max-w-[140px]">{folder.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isSelected ? 'bg-white/25 text-white' : 'bg-black/10 dark:bg-white/10 text-[#6B6B75]'
                      }`}
                    >
                      {count}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {canScrollRight && (
              <button
                type="button"
                onClick={() => handleScroll('right')}
                className="absolute right-0 z-10 p-1.5 rounded-full bg-white/90 dark:bg-[#18181B]/90 shadow-md border border-black/10 dark:border-white/15 text-[#1A1A1E] dark:text-[#F5F5F7] hover:scale-105 transition-all cursor-pointer -mr-2"
                aria-label="Scroll right"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </div>

          {/* Assets Grid with Skeletons and Empty State */}
          {isAssetsLoading && projectItems.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={`skeleton-${idx}`}
                  className="rounded-2xl bg-white/60 dark:bg-[#18181B]/60 border border-[#FF8800]/10 overflow-hidden flex flex-col animate-pulse"
                >
                  <div className="aspect-video sm:aspect-square w-full bg-black/5 dark:bg-white/5" />
                  <div className="p-3 flex flex-col gap-2">
                    <div className="h-3.5 bg-black/10 dark:bg-white/10 rounded-md w-3/4" />
                    <div className="h-3 bg-black/5 dark:bg-white/5 rounded-md w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : projectItems.length === 0 ? (
            <EmptyState
              variant="empty_project"
              actionLabel="Create Visuals Now"
              onAction={() => {}}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {projectItems.map((item) => {
                const isVideo = item.media_type === 'video';
                const isMusic = item.media_type === 'music';
                const mediaUrl = item.output_url;
                const posterSrc = item.thumbnail_url ?? (mediaUrl ? `${mediaUrl}#t=0.1` : undefined);

                return (
                  <div
                    key={item.id}
                    onClick={() => openLightboxForItem(item)}
                    className="group relative rounded-2xl bg-white/90 dark:bg-[#18181B]/90 shadow-sm border border-[#FF8800]/20 overflow-hidden hover:border-[#FF8800] hover:shadow-xl transition-all cursor-pointer flex flex-col"
                  >
                    {/* Media Preview Box */}
                    <div className="relative aspect-video sm:aspect-square w-full bg-black/5 dark:bg-white/5 overflow-hidden flex items-center justify-center">
                      {isVideo ? (
                        <div className="relative w-full h-full flex items-center justify-center">
                          <VideoPlayer
                            src={mediaUrl}
                            variantId={item.id}
                            poster={posterFor(posterSrc, mediaUrl)}
                            compact
                            onExpand={() => openLightboxForItem(item)}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : isMusic ? (
                        <div className="flex flex-col items-center justify-center p-3 text-center w-full h-full">
                          <CircularAudioPlayer
                            src={mediaUrl || ''}
                            variantId={item.id}
                            coverArtUrl={item.cover_art_url}
                            title={item.prompt?.split('"')[1] || item.genre || 'Audio Track'}
                            size={120}
                            showControls={false}
                          />
                          <span className="text-xs font-bold truncate max-w-[160px] text-[#1A1A1E] dark:text-[#F5F5F7] mt-1">
                            {item.prompt?.split('"')[1] || item.genre || 'Audio Track'}
                          </span>
                        </div>
                      ) : (
                        <img
                          src={mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400'}
                          alt={item.prompt}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      )}

                      {/* Type Badge */}
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-[10px] uppercase font-bold flex items-center gap-1 pointer-events-none">
                        {isVideo ? <Video size={11} /> : isMusic ? <Music size={11} /> : <Image size={11} />}
                        <span>{item.media_type}</span>
                      </div>

                      {/* Hover Preview Button (Maximize2) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openLightboxForItem(item);
                        }}
                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-[#FF8800] text-white backdrop-blur-sm transition-all sm:opacity-0 sm:group-hover:opacity-100 z-10 cursor-pointer shadow-md"
                        title="Preview in lightbox"
                        aria-label="Preview in lightbox"
                      >
                        <Maximize2 size={13} />
                      </button>

                      {/* Actions Menu Trigger using AnchoredMenu */}
                      <div className="absolute top-2 right-2 z-10">
                        <ProjectAssetCardMenu
                          item={item}
                          selectedFolderId={selectedFolderId}
                          onOpenInStudio={() => onSelectMedia(libraryItemToJob(item, userId))}
                          onRemoveFromProject={
                            selectedFolderId
                              ? () => handleRemoveFromProject(selectedFolderId, item.id)
                              : undefined
                          }
                          onDelete={() => handleTrashFromProject(item.id)}
                        />
                      </div>
                    </div>

                    {/* Footer Info */}
                    <div className="p-3 flex flex-col gap-1">
                      <span className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
                        {item.prompt}
                      </span>
                      <div className="flex items-center justify-between text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
                        <span className="capitalize">{item.model_name || item.media_type}</span>
                        {item.created_at && (
                          <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} className="h-6 w-full pointer-events-none" />

          {/* Fallback Load More Button */}
          {hasMore && !isAssetsLoading && (
            <div className="flex justify-center pt-2 pb-6">
              <button
                type="button"
                onClick={loadMore}
                disabled={isFetchingMore}
                className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-black/5 dark:bg-white/5 hover:bg-[#FF8800]/10 text-[#FF8800] border border-[#FF8800]/30 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-xs"
              >
                {isFetchingMore ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Loading more assets...</span>
                  </>
                ) : (
                  <span>Load more</span>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* Lightbox for Selected Job / Asset */}
      {lightboxItems && (
        <MediaLightbox
          items={lightboxItems}
          initialIndex={lightboxInitialIndex}
          onClose={() => setLightboxItems(null)}
          onReusePrompt={(job) => {
            if (job) onSelectMedia(job);
          }}
          onDelete={async (item) => {
            if (item.variantId) {
              const previousItems = lightboxItems ? [...lightboxItems] : [];
              const deletedIndex = previousItems.findIndex((it) => it.variantId === item.variantId);
              const remainingItems = previousItems.filter((it) => it.variantId !== item.variantId);

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

              try {
                await handleTrashFromProject(item.variantId);
              } catch (err) {
                setLightboxItems(previousItems);
                throw err;
              }
            }
          }}
        />
      )}

      {/* New Project Modal */}
      <AnimatePresence>
        {showNewFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1A1A1E] p-6 shadow-2xl border border-black/10 dark:border-white/10"
            >
              <h3 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7] mb-2">
                Create New Project
              </h3>
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mb-4">
                Enter a project name to start organizing your generations.
              </p>

              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
                  <input
                    type="text"
                    required
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g., Cyberpunk Promo"
                    maxLength={60}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-hidden focus:border-[#FF8800] transition-colors"
                  />
                  {errorMessage && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-[#E23636]">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewFolderModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newFolderName.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-gradient text-white shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
