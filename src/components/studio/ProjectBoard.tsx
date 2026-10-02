import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Folder,
  Inbox,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  Plus,
  GripVertical,
  MoreVertical,
  Trash2,
  ExternalLink,
  Sparkles,
  FolderMinus,
  Play,
} from 'lucide-react';
import { motion } from 'motion/react';
import { GenerationJob, GenerationJobVariant, GenerationType, Project, ProjectItem } from '../../types';
import { toast } from '../../services/toast';
import { getAuthToken } from '../../services/authToken';
import { useTrash } from '../../hooks/useTrash';
import { variantsForJob } from '../../lib/variants';
import { AnchoredMenu } from '../common/AnchoredMenu';

export interface BoardCardItem {
  id: string; // unique identifier (variantId)
  variantId: string;
  jobId: string;
  columnId: string; // 'unfiled' or projectId
  title: string;
  type: GenerationType;
  outputUrl?: string;
  variantIndex: number;
  modelName: string;
  creditCost?: number;
  createdAt: string;
  job?: GenerationJob;
  variant?: GenerationJobVariant;
}

export interface ProjectBoardProps {
  jobs: GenerationJob[];
  projects: Project[];
  accessToken?: string;
  userId?: string;
  onSelectMedia?: (job: GenerationJob) => void;
  onCreateProject?: (name: string) => Promise<any>;
  onDeleteProject?: (id: string) => Promise<void>;
  onRefreshProjects?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Sortable Card Component
// ---------------------------------------------------------------------------
interface SortableCardProps {
  item: BoardCardItem;
  onSelectMedia?: (job: GenerationJob) => void;
  onRemoveItem?: (colId: string, variantId: string) => void;
  onTrashItem?: (variantId: string) => void;
}

const SortableCard: React.FC<SortableCardProps> = ({
  item,
  onSelectMedia,
  onRemoveItem,
  onTrashItem,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: {
      type: 'card',
      item,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const isVideo = item.type === 'video';
  const isMusic = item.type === 'music';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      tabIndex={0}
      role="button"
      aria-label={`${item.title}, Take ${item.variantIndex + 1}. Press Space to lift and move.`}
      onClick={(e) => {
        if (item.job && onSelectMedia) {
          onSelectMedia(item.job);
        }
      }}
      className={`group relative rounded-xl bg-white dark:bg-[#1C1C20] border border-black/10 dark:border-white/10 p-2.5 shadow-xs hover:shadow-md hover:border-[#FF8800]/50 transition-all cursor-grab active:cursor-grabbing select-none focus:outline-hidden focus:ring-2 focus:ring-[#FF8800] ${
        isDragging ? 'ring-2 ring-[#FF8800]' : ''
      }`}
    >
      <div className="flex gap-2.5 items-start">
        {/* Thumbnail Preview */}
        <div className="relative w-16 h-16 rounded-lg bg-black/5 dark:bg-white/5 overflow-hidden shrink-0 flex items-center justify-center border border-black/5 dark:border-white/5">
          {isVideo ? (
            item.outputUrl ? (
              <div className="relative w-full h-full">
                <video
                  src={item.outputUrl.includes('#') ? item.outputUrl : `${item.outputUrl}#t=0.001`}
                  preload="metadata"
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                  <div className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white">
                    <Play size={9} className="ml-0.5 fill-white" />
                  </div>
                </div>
              </div>
            ) : (
              <VideoIcon size={20} className="text-[#8E8E98]" />
            )
          ) : isMusic ? (
            <div className="flex items-center justify-center w-full h-full bg-[#FF8800]/10 text-[#FF8800]">
              <MusicIcon size={22} />
            </div>
          ) : item.outputUrl ? (
            <img
              src={item.outputUrl}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageIcon size={20} className="text-[#8E8E98]" />
          )}

          {/* Type Badge */}
          <div className="absolute bottom-1 right-1 p-0.5 rounded-sm bg-black/70 text-white text-[9px]">
            {isVideo ? <VideoIcon size={9} /> : isMusic ? <MusicIcon size={9} /> : <ImageIcon size={9} />}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 justify-between h-16 py-0.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-[#FF8800] tracking-wide uppercase">
              Take {item.variantIndex + 1}
            </span>
            <span className="text-[10px] text-[#8E8E98] dark:text-[#71717A] truncate font-mono">
              {item.modelName}
            </span>
          </div>

          <p className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] line-clamp-2 leading-tight">
            {item.title}
          </p>

          <div className="flex items-center justify-between text-[10px] text-[#8E8E98] dark:text-[#71717A]">
            <span>{item.type}</span>
            {item.creditCost !== undefined && (
              <span className="font-mono text-[#F86A00] font-medium">{item.creditCost} cr</span>
            )}
          </div>
        </div>

        {/* Actions & Grip */}
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          <div className="text-[#8E8E98] opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical size={14} />
          </div>

          {(onRemoveItem || onTrashItem) && (
            <div className="relative">
              <button
                ref={menuTriggerRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1 rounded-md text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                title="Options"
                aria-label="Options"
              >
                <MoreVertical size={13} />
              </button>

              <AnchoredMenu
                isOpen={showMenu}
                onClose={() => setShowMenu(false)}
                triggerRef={menuTriggerRef}
                title="Card Options"
                align="right"
                desktopWidth="11rem"
              >
                {({ close }) => (
                  <div className="flex flex-col gap-0.5">
                    {item.columnId !== 'unfiled' && onRemoveItem && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            close();
                            onRemoveItem(item.columnId, item.variantId);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer font-medium text-xs transition-colors"
                        >
                          <FolderMinus size={13} className="text-[#6B6B75] dark:text-[#A0A0AA]" />
                          <span>Remove from project</span>
                        </button>
                        <div className="my-0.5 border-t border-black/5 dark:border-white/5" />
                      </>
                    )}

                    {onTrashItem && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          close();
                          onTrashItem(item.variantId);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer font-medium text-xs transition-colors"
                      >
                        <Trash2 size={13} className="text-rose-500" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                )}
              </AnchoredMenu>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Kanban Column Component
// ---------------------------------------------------------------------------
interface KanbanColumnProps {
  columnId: string;
  title: string;
  color?: string;
  isUnfiled?: boolean;
  items: BoardCardItem[];
  isHovered: boolean;
  onSelectMedia?: (job: GenerationJob) => void;
  onDeleteProject?: (id: string) => void;
  onRemoveItem?: (colId: string, variantId: string) => void;
  onTrashItem?: (variantId: string) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  columnId,
  title,
  color = '#F86A00',
  isUnfiled = false,
  items,
  isHovered,
  onSelectMedia,
  onDeleteProject,
  onRemoveItem,
  onTrashItem,
}) => {
  return (
    <div
      id={`board-column-${columnId}`}
      className={`w-72 sm:w-80 shrink-0 flex flex-col max-h-[calc(100vh-230px)] min-h-[460px] rounded-2xl transition-all duration-200 ${
        isHovered
          ? 'rounded-2xl border-2 border-dashed border-[#FF8800]/40 bg-[#FF8800]/5 shadow-lg'
          : 'bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 shadow-xs'
      }`}
    >
      {/* Column Header */}
      <div className="p-3.5 border-b border-black/5 dark:border-white/5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isUnfiled ? (
            <div className="w-6 h-6 rounded-lg bg-[#8E8E98]/15 text-[#8E8E98] flex items-center justify-center shrink-0">
              <Inbox size={14} />
            </div>
          ) : (
            <div
              className="w-3 h-3 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: color }}
            />
          )}

          <h3 className="text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
            {title}
          </h3>

          <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold bg-black/10 dark:bg-white/10 text-[#6B6B75] dark:text-[#A0A0AA] shrink-0">
            {items.length}
          </span>
        </div>

        {!isUnfiled && onDeleteProject && (
          <button
            type="button"
            title={`Delete project "${title}"`}
            aria-label={`Delete project "${title}"`}
            onClick={() => onDeleteProject(columnId)}
            className="p-1.5 rounded-lg text-[#8E8E98] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Sortable Cards Container */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5 min-h-[140px] focus:outline-hidden">
        <SortableContext
          id={columnId}
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.length === 0 ? (
            <div className="flex-1 min-h-[120px] rounded-xl border border-dashed border-black/10 dark:border-white/10 flex flex-col items-center justify-center p-4 text-center text-[#8E8E98]">
              <span className="text-xs font-medium">
                {isUnfiled ? 'All variants are organized' : 'Drop variants here'}
              </span>
              <span className="text-[10px] opacity-70 mt-0.5">Drag cards to file</span>
            </div>
          ) : (
            items.map((item) => (
              <SortableCard
                key={item.id}
                item={item}
                onSelectMedia={onSelectMedia}
                onRemoveItem={onRemoveItem}
                onTrashItem={onTrashItem}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main ProjectBoard Component
// ---------------------------------------------------------------------------
export const ProjectBoard: React.FC<ProjectBoardProps> = ({
  jobs,
  projects,
  accessToken,
  userId,
  onSelectMedia,
  onCreateProject,
  onDeleteProject,
  onRefreshProjects,
}) => {
  // Check prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Screen reader live region announcement
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  // Project items by projectId
  const [projectItemsMap, setProjectItemsMap] = useState<Record<string, ProjectItem[]>>({});
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  // Active dragged card
  const [activeItem, setActiveItem] = useState<BoardCardItem | null>(null);
  const [activeSourceColumnId, setActiveSourceColumnId] = useState<string | null>(null);
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);

  // Board columns state: Record<columnId, BoardCardItem[]>
  const [columnsState, setColumnsState] = useState<Record<string, BoardCardItem[]>>({});

  const { trashVariants } = useTrash({ userId, autoFetch: false });

  const handleRemoveItem = async (colId: string, variantId: string) => {
    try {
      const headers = await getHeaders();
      await fetch(`/api/projects/${colId}/items/${variantId}`, {
        method: 'DELETE',
        headers,
      });
      setColumnsState((prev) => {
        const sourceList = prev[colId] || [];
        const item = sourceList.find((i) => i.variantId === variantId);
        if (!item) return prev;
        const newSource = sourceList.filter((i) => i.variantId !== variantId);
        const unfiledList = prev['unfiled'] || [];
        return {
          ...prev,
          [colId]: newSource,
          unfiled: [{ ...item, columnId: 'unfiled' }, ...unfiledList],
        };
      });
      toast.success('Removed from project');
      window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
    } catch (err) {
      toast.error('Failed to remove item');
    }
  };

  const handleTrashItem = async (variantId: string) => {
    try {
      await trashVariants([variantId]);
      setColumnsState((prev) => {
        const next: Record<string, BoardCardItem[]> = {};
        Object.keys(prev).forEach((k) => {
          next[k] = prev[k].filter((i) => i.variantId !== variantId);
        });
        return next;
      });
      toast.success('Moved to trash');
    } catch (err) {
      toast.error('Failed to move to trash');
    }
  };

  // Headers helper
  const getHeaders = useCallback(async () => {
    const token = accessToken || (await getAuthToken()) || userId;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [accessToken, userId]);

  // Track initial fetch to avoid flashing loading spinner on 30s background polls
  const isInitialFetchRef = useRef(true);

  // Fetch project items for all projects
  const fetchAllProjectItems = useCallback(async () => {
    try {
      if (isInitialFetchRef.current) {
        setIsLoadingItems(true);
      }
      const headers = await getHeaders();
      const results: Record<string, ProjectItem[]> = {};

      await Promise.all(
        projects.map(async (project) => {
          try {
            const res = await fetch(`/api/projects/${project.id}/items`, { headers });
            if (res.ok) {
              const data = await res.json();
              results[project.id] = data.items || [];
            } else {
              results[project.id] = [];
            }
          } catch {
            results[project.id] = [];
          }
        })
      );

      setProjectItemsMap(results);
    } catch (err) {
      console.error('Failed to fetch project items:', err);
    } finally {
      if (isInitialFetchRef.current) {
        setIsLoadingItems(false);
        isInitialFetchRef.current = false;
      }
    }
  }, [projects, getHeaders]);

  useEffect(() => {
    fetchAllProjectItems();
  }, [fetchAllProjectItems]);

  // Helper to derive variants from jobs
  const allJobVariants = useMemo(() => {
    const list: { variant: GenerationJobVariant; job: GenerationJob }[] = [];
    for (const job of jobs) {
      if (job.deleted_at) continue;
      const jobVars = variantsForJob(job);
      for (const v of jobVars) {
        if (!v.deleted_at) {
          list.push({ variant: v, job });
        }
      }
    }
    return list;
  }, [jobs]);

  // Synchronize board columns whenever jobs, projects, or projectItemsMap change
  useEffect(() => {
    // 1. Collect set of all variant IDs assigned to any project
    const assignedVariantIds = new Set<string>();
    const assignedJobsMap = new Map<string, { item: ProjectItem; project: Project }>();

    for (const [projectId, items] of Object.entries(projectItemsMap)) {
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) continue;
      for (const item of items) {
        if (item.variant_id) {
          assignedVariantIds.add(item.variant_id);
          assignedJobsMap.set(item.variant_id, { item, project: proj });
        }
      }
    }

    // 2. Build Column 0: Unfiled (every non-trashed variant with no project_items row)
    const unfiledCards: BoardCardItem[] = [];
    for (const { variant, job } of allJobVariants) {
      if (!assignedVariantIds.has(variant.id)) {
        unfiledCards.push({
          id: variant.id,
          variantId: variant.id,
          jobId: job.id,
          columnId: 'unfiled',
          title: job.prompt || 'Generated Asset',
          type: job.type,
          outputUrl: variant.output_url || job.output_urls?.[0],
          variantIndex: variant.variant_index,
          modelName: job.model_name || 'Standard',
          creditCost: variant.credits_unit || Math.round((job.credit_cost || 70) / (job.output_urls?.length || 1)),
          createdAt: variant.created_at || job.created_at,
          job,
          variant,
        });
      }
    }

    // 3. Build Columns 1..n: one per project, ordered by projects.position
    const sortedProjects = [...projects].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const nextColumns: Record<string, BoardCardItem[]> = {
      unfiled: unfiledCards,
    };

    for (const proj of sortedProjects) {
      const pItems = projectItemsMap[proj.id] || [];
      const cards: BoardCardItem[] = [];

      for (const pItem of pItems) {
        // Resolve variant & job
        let job = pItem.job || jobs.find((j) => j.id === pItem.job_id);
        let variant =
          pItem.variant ||
          job?.variants?.find((v) => v.id === pItem.variant_id) ||
          allJobVariants.find((jv) => jv.variant.id === pItem.variant_id)?.variant;

        if (!job && variant) {
          job = jobs.find((j) => j.id === variant?.job_id);
        }

        cards.push({
          id: pItem.variant_id,
          variantId: pItem.variant_id,
          jobId: pItem.job_id || job?.id || '',
          columnId: proj.id,
          title: job?.prompt || 'Project Asset',
          type: job?.type || 'image',
          outputUrl: variant?.output_url || job?.output_urls?.[0],
          variantIndex: variant?.variant_index || 0,
          modelName: job?.model_name || 'Standard',
          creditCost: variant?.credits_unit,
          createdAt: pItem.added_at || job?.created_at || '',
          job,
          variant,
        });
      }

      nextColumns[proj.id] = cards;
    }

    setColumnsState(nextColumns);
  }, [allJobVariants, projects, projectItemsMap, jobs]);

  // Sensors configuration per Section C.1
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Prevents a tap-to-preview from being swallowed as a drag start.
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      // Long-press to drag on touch, so vertical page scroll still works.
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Helper to find which column holds an item or column id
  const findColumnId = (id: string): string | null => {
    if (columnsState[id]) return id;
    for (const [colId, items] of Object.entries(columnsState)) {
      if (items.some((item) => item.id === id)) {
        return colId;
      }
    }
    return null;
  };

  // Drag event handlers for DndContext & accessibility announcements
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeData = active.data.current;
    const card = activeData?.item as BoardCardItem | undefined;
    const colId = findColumnId(String(active.id));
    if (card) {
      setActiveItem(card);
      setActiveSourceColumnId(colId);
      const colName = colId === 'unfiled' ? 'Unfiled' : projects.find((p) => p.id === colId)?.name || 'Project';
      setLiveAnnouncement(`Picked up Take ${card.variantIndex + 1} from ${colName}. Use arrow keys to navigate, Space to drop.`);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setHoveredColumnId(null);
      return;
    }
    const overColId = findColumnId(String(over.id));
    setHoveredColumnId(overColId);
  };

  const handleDragCancel = () => {
    setActiveItem(null);
    setActiveSourceColumnId(null);
    setHoveredColumnId(null);
    setLiveAnnouncement('Drag cancelled. Asset returned to original position.');
  };

  // Handle Drag End with optimistic update & rollback
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    setActiveSourceColumnId(null);
    setHoveredColumnId(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceColId = findColumnId(activeId);
    const destColId = findColumnId(overId);

    if (!sourceColId || !destColId) return;

    const sourceItems = columnsState[sourceColId] || [];
    const destItems = columnsState[destColId] || [];

    const activeIndex = sourceItems.findIndex((i) => i.id === activeId);
    if (activeIndex === -1) return;

    const activeCard = sourceItems[activeIndex];

    // Calculate over index
    let overIndex = destItems.findIndex((i) => i.id === overId);
    if (overIndex === -1) {
      // Over the column container itself
      overIndex = destItems.length;
    }

    // Capture previous state for rollback
    const previousColumns = { ...columnsState };

    // Get column names for aria-live announcement
    const destName =
      destColId === 'unfiled'
        ? 'Unfiled'
        : projects.find((p) => p.id === destColId)?.name || 'Project';

    // -------------------------------------------------------------------------
    // Case 1: Same Column Reorder
    // -------------------------------------------------------------------------
    if (sourceColId === destColId) {
      if (activeIndex === overIndex) return;

      const newItems = arrayMove(sourceItems, activeIndex, overIndex);
      setColumnsState((prev) => ({
        ...prev,
        [sourceColId]: newItems,
      }));

      setLiveAnnouncement(
        `Take ${activeCard.variantIndex + 1} moved to ${destName}, position ${overIndex + 1}.`
      );

      // Reorder on backend if inside a project
      if (sourceColId !== 'unfiled') {
        try {
          const headers = await getHeaders();
          const variantIds = newItems.map((i) => i.variantId);
          const res = await fetch(`/api/projects/${sourceColId}/reorder`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ variantIds }),
          });
          if (!res.ok) {
            throw new Error('Failed to update item order in project');
          }
          window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
        } catch (err: any) {
          // Rollback
          setColumnsState(previousColumns);
          toast.error(err?.message || 'Failed to reorder items');
        }
      }
      return;
    }

    // -------------------------------------------------------------------------
    // Cross-Column Move: Optimistic update
    // -------------------------------------------------------------------------
    const newSourceItems = [...sourceItems];
    newSourceItems.splice(activeIndex, 1);

    const movedCard: BoardCardItem = {
      ...activeCard,
      columnId: destColId,
    };

    const newDestItems = [...destItems];
    newDestItems.splice(overIndex, 0, movedCard);

    setColumnsState((prev) => ({
      ...prev,
      [sourceColId]: newSourceItems,
      [destColId]: newDestItems,
    }));

    setLiveAnnouncement(
      `Take ${activeCard.variantIndex + 1} moved to ${destName}, position ${overIndex + 1}.`
    );

    // -------------------------------------------------------------------------
    // Backend Dispatch per Section C.1
    // -------------------------------------------------------------------------
    try {
      const headers = await getHeaders();

      if (sourceColId === 'unfiled' && destColId !== 'unfiled') {
        // From Unfiled → POST /api/projects/:id/items
        const res = await fetch(`/api/projects/${destColId}/items`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ variantIds: [activeCard.variantId] }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || data.error || 'Failed to add item to project');
        }
        toast.success(`Filed Take ${activeCard.variantIndex + 1} into ${destName}`);
      } else if (sourceColId !== 'unfiled' && destColId === 'unfiled') {
        // Onto Unfiled → DELETE /api/projects/:id/items/:variantId
        const res = await fetch(`/api/projects/${sourceColId}/items/${activeCard.variantId}`, {
          method: 'DELETE',
          headers,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || data.error || 'Failed to unfile item');
        }
        toast.success(`Removed Take ${activeCard.variantIndex + 1} from project`);
      } else if (sourceColId !== 'unfiled' && destColId !== 'unfiled') {
        // Different column → POST /api/projects/items/move
        const res = await fetch('/api/projects/items/move', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            variantId: activeCard.variantId,
            fromProjectId: sourceColId,
            toProjectId: destColId,
            position: overIndex,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || data.error || 'Failed to move item between projects');
        }
        toast.success(`Moved Take ${activeCard.variantIndex + 1} to ${destName}`);
      }

      // Refresh projects to synchronize counters
      onRefreshProjects?.();
      window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
    } catch (err: any) {
      // Roll back on failure
      setColumnsState(previousColumns);
      toast.error(err?.message || 'Move failed. Restoring original position.');
      setLiveAnnouncement('Move failed. Card restored to original position.');
    }
  };

  // State for inline New Project creation from board
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed || isCreatingProject) return;

    setIsCreatingProject(true);
    try {
      if (onCreateProject) {
        await onCreateProject(trimmed);
        toast.success(`Project "${trimmed}" created`);
      }
      setNewProjectName('');
      setShowNewProjectModal(false);
      onRefreshProjects?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create project');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [projects]
  );

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Accessible Aria-Live Status Announcement Region */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveAnnouncement}
      </div>

      {/* Top Board Action & Indicator */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
            Drag cards between columns to file or organize. Long-press on touch or use Space/Arrows on keyboard.
          </span>
        </div>

        {onCreateProject && (
          <button
            type="button"
            onClick={() => setShowNewProjectModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#FF8800]/10 hover:bg-[#FF8800]/20 text-[#FF8800] transition-colors cursor-pointer shrink-0"
          >
            <Plus size={14} />
            <span>New Column</span>
          </button>
        )}
      </div>

      {/* DndContext Surface */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        autoScroll={{ threshold: { x: 0.15, y: 0.2 } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Horizontal Scrolling Kanban Surface */}
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1 px-1 items-start w-full min-h-[520px] scroll-smooth">
          {/* Column 0 — Unfiled */}
          <KanbanColumn
            columnId="unfiled"
            title="Unfiled"
            isUnfiled
            items={columnsState['unfiled'] || []}
            isHovered={hoveredColumnId === 'unfiled'}
            onSelectMedia={onSelectMedia}
            onRemoveItem={handleRemoveItem}
            onTrashItem={handleTrashItem}
          />

          {/* Columns 1..n — One per project */}
          {sortedProjects.map((project) => (
            <KanbanColumn
              key={project.id}
              columnId={project.id}
              title={project.name}
              color={project.color}
              items={columnsState[project.id] || []}
              isHovered={hoveredColumnId === project.id}
              onSelectMedia={onSelectMedia}
              onDeleteProject={onDeleteProject}
              onRemoveItem={handleRemoveItem}
              onTrashItem={handleTrashItem}
            />
          ))}

          {/* Add Project Quick Card at the end */}
          {onCreateProject && (
            <button
              type="button"
              onClick={() => setShowNewProjectModal(true)}
              className="w-72 sm:w-80 shrink-0 h-44 rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 hover:border-[#FF8800] hover:bg-[#FF8800]/5 flex flex-col items-center justify-center gap-2 text-[#6B6B75] hover:text-[#FF8800] transition-all cursor-pointer group"
            >
              <div className="p-2.5 rounded-full bg-black/5 dark:bg-white/5 group-hover:bg-[#FF8800]/15 transition-colors">
                <Plus size={20} />
              </div>
              <span className="text-xs font-semibold">Create New Project</span>
            </button>
          )}
        </div>

        {/* DragOverlay with scale(1.03), shadow, and honouring prefers-reduced-motion */}
        <DragOverlay dropAnimation={prefersReducedMotion ? null : undefined}>
          {activeItem ? (
            <div className="scale-[1.03] shadow-2xl rotate-1 pointer-events-none cursor-grabbing w-72 sm:w-80">
              <SortableCard item={activeItem} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-[#18181B] rounded-2xl p-5 border border-[#FF8800]/25 shadow-2xl flex flex-col gap-4">
            <h4 className="text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              New Project Column
            </h4>
            <form onSubmit={handleCreateProjectSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                autoFocus
                placeholder="e.g. Album Artwork, Cinematic Cuts"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                maxLength={60}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/15 text-[#1A1A1E] dark:text-[#F5F5F7] placeholder-[#8E8E98] focus:outline-hidden focus:border-[#FF8800] focus:ring-1 focus:ring-[#FF8800]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#6B6B75] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newProjectName.trim() || isCreatingProject}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-gradient text-white shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingProject ? 'Creating...' : 'Create Column'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
