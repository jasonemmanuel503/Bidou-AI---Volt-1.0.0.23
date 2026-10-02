import React, { useState, useRef, useEffect } from 'react';
import {
  MoreVertical,
  Maximize2,
  Heart,
  FolderPlus,
  ListMusic,
  Download,
  Sparkles,
  Trash2,
  ChevronRight,
  Plus,
  Loader2,
} from 'lucide-react';
import { LibraryItem, GenerationType } from '../../types';
import { useFavorites } from '../../hooks/useFavorites';
import { useProjects } from '../../hooks/useProjects';
import { useTrash } from '../../hooks/useTrash';
import { toast } from '../../services/toast';
import { AnchoredMenu } from './AnchoredMenu';
import { downloadAsset, getAssetFilename } from '../../lib/downloadAsset';

export interface VariantActionsMenuProps {
  item: LibraryItem;
  onOpenPreview?: (item: LibraryItem) => void;
  onRemixPrompt?: (prompt: string, type: GenerationType) => void;
  onDeleted?: (variantId: string) => void;
  onAddToPlaylist?: (item: LibraryItem) => void;
  triggerButtonClass?: string;
  align?: 'left' | 'right';
  className?: string;
}

export const VariantActionsMenu: React.FC<VariantActionsMenuProps> = ({
  item,
  onOpenPreview,
  onRemixPrompt,
  onDeleted,
  onAddToPlaylist,
  triggerButtonClass,
  align = 'right',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showProjectsSubmenu, setShowProjectsSubmenu] = useState(false);
  const [mobileDrilldown, setMobileDrilldown] = useState(false);
  const [flyoutLeft, setFlyoutLeft] = useState(false);
  const [isAddingToProject, setIsAddingToProject] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const projectItemBtnRef = useRef<HTMLDivElement>(null);

  const { isFavorite, toggleFavorite } = useFavorites();
  const { projects, addItems, createProject } = useProjects({ autoFetch: isOpen });
  const { trashVariants } = useTrash({ autoFetch: false });

  const favorited = isFavorite(item.id);

  // Reset drilldown/submenu when closed
  const handleClose = () => {
    setIsOpen(false);
    setShowProjectsSubmenu(false);
    setMobileDrilldown(false);
  };

  // Determine desktop flyout direction based on available horizontal viewport space
  useEffect(() => {
    if (showProjectsSubmenu && projectItemBtnRef.current) {
      const rect = projectItemBtnRef.current.getBoundingClientRect();
      const submenuWidth = 208; // w-52
      if (rect.right + submenuWidth + 12 > window.innerWidth) {
        setFlyoutLeft(true);
      } else {
        setFlyoutLeft(false);
      }
    }
  }, [showProjectsSubmenu]);

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleFavorite(item.id);
    } catch {
      // handled in hook
    }
    handleClose();
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.output_url) return;
    setIsDownloading(true);
    try {
      const filename = getAssetFilename(item.media_type, item.id);
      await downloadAsset(item.output_url, filename, { showToast: true });
    } finally {
      setIsDownloading(false);
      handleClose();
    }
  };

  const handleAddToProject = async (projectId: string, projectName: string) => {
    try {
      setIsAddingToProject(true);
      await addItems(projectId, [item.id]);
      toast.success(`Added to ${projectName}`);
      window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
      handleClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add to project');
    } finally {
      setIsAddingToProject(false);
    }
  };

  const handleCreateAndAddToProject = async () => {
    const name = window.prompt('Enter new project name:');
    if (!name || !name.trim()) return;
    try {
      setIsAddingToProject(true);
      const newProj = await createProject({ name: name.trim() });
      if (newProj && newProj.id) {
        await addItems(newProj.id, [item.id]);
        toast.success(`Created project and added item`);
        window.dispatchEvent(new CustomEvent('bidou_projects_updated'));
      }
      handleClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create project');
    } finally {
      setIsAddingToProject(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await trashVariants([item.id]);
      toast.success('Moved to Trash');
      onDeleted?.(item.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to move to Trash');
    } finally {
      setIsDeleting(false);
      handleClose();
    }
  };

  // Render project list for mobile drilldown or desktop flyout
  const renderProjectsList = () => (
    <div className="flex flex-col gap-1 py-1">
      <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
        Select Project
      </div>
      {projects.length === 0 ? (
        <div className="px-3 py-2 text-[11px] text-zinc-500 italic">No projects yet</div>
      ) : (
        projects.map((proj) => (
          <button
            key={proj.id}
            type="button"
            disabled={isAddingToProject}
            onClick={(e) => {
              e.stopPropagation();
              handleAddToProject(proj.id, proj.name);
            }}
            className="w-full min-h-[38px] px-3 py-2 text-left flex items-center gap-2.5 text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg truncate transition-colors cursor-pointer"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: proj.color || '#FF8800' }}
            />
            <span className="truncate flex-1">{proj.name}</span>
          </button>
        ))
      )}
      <div className="border-t border-white/10 my-1" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleCreateAndAddToProject();
        }}
        className="w-full min-h-[38px] px-3 py-2 text-left flex items-center gap-2 text-[#FF8800] hover:bg-[#FF8800]/10 rounded-lg transition-colors cursor-pointer font-medium"
      >
        <Plus size={14} />
        <span>New project...</span>
      </button>
    </div>
  );

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={`variant-menu-btn-${item.id}`}
        aria-label="Item actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) {
            handleClose();
          } else {
            setIsOpen(true);
            setShowProjectsSubmenu(false);
            setMobileDrilldown(false);
          }
        }}
        className={
          triggerButtonClass ||
          'p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-black/60 hover:bg-black/80 text-white/90 hover:text-white backdrop-blur-md transition-colors cursor-pointer'
        }
      >
        <MoreVertical size={16} />
      </button>

      <AnchoredMenu
        isOpen={isOpen}
        onClose={handleClose}
        triggerRef={triggerRef}
        title={mobileDrilldown ? 'Add to Project' : 'Item Actions'}
        headerBackAction={
          mobileDrilldown
            ? {
                label: 'Back',
                onBack: () => setMobileDrilldown(false),
              }
            : undefined
        }
        align={align}
        desktopWidth="14rem"
        className="bg-[#161618] border border-white/10 text-white"
      >
        {({ isMobile }) => {
          // If mobile and in drilldown mode, show project list directly in bottom sheet
          if (isMobile && mobileDrilldown) {
            return renderProjectsList();
          }

          return (
            <div className="flex flex-col gap-0.5">
              {/* Open Preview */}
              {onOpenPreview && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                    onOpenPreview(item);
                  }}
                  className="w-full min-h-[38px] px-3 py-2 text-left flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                >
                  <Maximize2 size={14} className="text-zinc-400" />
                  <span>Open preview</span>
                </button>
              )}

              {/* Favorite Toggle */}
              <button
                type="button"
                role="menuitem"
                onClick={handleToggleFavorite}
                className="w-full min-h-[38px] px-3 py-2 text-left flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
              >
                <Heart
                  size={14}
                  className={favorited ? 'text-[#FF8800] fill-[#FF8800]' : 'text-zinc-400'}
                />
                <span>{favorited ? 'Remove from favorites' : 'Favorite'}</span>
              </button>

              {/* Add to Playlist (Music only) */}
              {item.media_type === 'music' && onAddToPlaylist && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                    onAddToPlaylist(item);
                  }}
                  className="w-full min-h-[38px] px-3 py-2 text-left flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                >
                  <ListMusic size={14} className="text-amber-400" />
                  <span>Add to playlist...</span>
                </button>
              )}

              {/* Add to Project (Flyout on desktop, drilldown on mobile) */}
              <div ref={projectItemBtnRef} className="relative">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMobile) {
                      setMobileDrilldown(true);
                    } else {
                      setShowProjectsSubmenu((prev) => !prev);
                    }
                  }}
                  className="w-full min-h-[38px] px-3 py-2 text-left flex items-center justify-between text-zinc-200 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderPlus size={14} className="text-zinc-400" />
                    <span>Add to project</span>
                  </div>
                  <ChevronRight size={13} className="text-zinc-500" />
                </button>

                {/* Desktop flyout (anchored and flips to left if off-screen) */}
                {!isMobile && showProjectsSubmenu && (
                  <div
                    className={`absolute top-0 ${
                      flyoutLeft ? 'right-full mr-1.5' : 'left-full ml-1.5'
                    } w-52 bg-[#1c1c1f] border border-white/10 rounded-xl shadow-2xl p-1.5 backdrop-blur-xl z-50 max-h-60 overflow-y-auto`}
                  >
                    {renderProjectsList()}
                  </div>
                )}
              </div>

              {/* Remix Prompt */}
              {item.prompt && onRemixPrompt && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                    onRemixPrompt(item.prompt, item.media_type);
                  }}
                  className="w-full min-h-[38px] px-3 py-2 text-left flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                >
                  <Sparkles size={14} className="text-[#FF8800]" />
                  <span>Remix prompt</span>
                </button>
              )}

              {/* Download */}
              <button
                type="button"
                role="menuitem"
                disabled={isDownloading}
                onClick={handleDownload}
                className="w-full min-h-[38px] px-3 py-2 text-left flex items-center gap-2.5 text-zinc-200 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDownloading ? (
                  <Loader2 size={14} className="animate-spin text-zinc-400" />
                ) : (
                  <Download size={14} className="text-zinc-400" />
                )}
                <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
              </button>

              <div className="border-t border-white/10 my-1" />

              {/* Delete */}
              <button
                type="button"
                role="menuitem"
                disabled={isDeleting}
                onClick={handleDelete}
                className="w-full min-h-[38px] px-3 py-2 text-left flex items-center gap-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={14} />
                <span>{isDeleting ? 'Moving to Trash...' : 'Delete'}</span>
              </button>
            </div>
          );
        }}
      </AnchoredMenu>
    </div>
  );
};
