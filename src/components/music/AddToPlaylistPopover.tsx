import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ListMusic,
  Plus,
  X,
  Search,
  Check,
  Music,
  Loader2,
  FolderPlus,
} from 'lucide-react';
import { Playlist } from '../../types';
import { usePlaylists } from '../../hooks/usePlaylists';
import { CreatePlaylistModal } from './CreatePlaylistModal';
import { toast } from '../../services/toast';
import { getApiErrorMessage } from '../../lib/errorMapping';

export interface AddToPlaylistPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  variantId: string;
  trackPreview?: {
    title?: string;
    prompt?: string;
    duration?: number;
    genre?: string;
    coverUrl?: string;
  };
}

export const AddToPlaylistPopover: React.FC<AddToPlaylistPopoverProps> = ({
  isOpen,
  onClose,
  variantId,
  trackPreview,
}) => {
  const {
    playlists,
    isLoading,
    fetchPlaylists,
    addItemsToPlaylist,
    removeItemFromPlaylist,
    fetchPlaylistItems,
  } = usePlaylists(isOpen);

  const [searchQuery, setSearchQuery] = useState('');
  const [membershipMap, setMembershipMap] = useState<Record<string, boolean>>({});
  const [loadingMemberships, setLoadingMemberships] = useState(true);
  const [togglingPlaylistId, setTogglingPlaylistId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // When opened, load membership status for this variant across playlists
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setSearchQuery('');
    setLoadingMemberships(true);

    const checkMemberships = async () => {
      try {
        const list = await fetchPlaylists();
        if (!isMounted) return;

        // Check which playlists contain this variant
        const statusMap: Record<string, boolean> = {};
        await Promise.all(
          list.map(async (pl) => {
            try {
              const items = await fetchPlaylistItems(pl.id);
              if (items.some((it) => it.variant_id === variantId)) {
                statusMap[pl.id] = true;
              }
            } catch {
              // ignore single playlist error
            }
          })
        );

        if (isMounted) {
          setMembershipMap(statusMap);
          setLoadingMemberships(false);

          // If no playlists exist, prompt to create one
          if (list.length === 0) {
            setShowCreateModal(true);
          }
        }
      } catch (err) {
        console.warn('Failed to load playlist memberships:', err);
        if (isMounted) setLoadingMemberships(false);
      }
    };

    checkMemberships();

    return () => {
      isMounted = false;
    };
  }, [isOpen, variantId]);

  const filteredPlaylists = useMemo(() => {
    if (!searchQuery.trim()) return playlists;
    const q = searchQuery.toLowerCase();
    return playlists.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [playlists, searchQuery]);

  const handleToggle = async (playlist: Playlist) => {
    if (togglingPlaylistId) return;
    const isCurrentlyIn = Boolean(membershipMap[playlist.id]);
    setTogglingPlaylistId(playlist.id);

    // Optimistic update
    setMembershipMap((prev) => ({
      ...prev,
      [playlist.id]: !isCurrentlyIn,
    }));

    try {
      if (isCurrentlyIn) {
        await removeItemFromPlaylist(playlist.id, variantId);
        toast.info(`Removed from "${playlist.name}"`);
      } else {
        await addItemsToPlaylist(playlist.id, [variantId]);
        toast.success(`Added to "${playlist.name}"`);
      }
    } catch (err: any) {
      // Revert on failure
      setMembershipMap((prev) => ({
        ...prev,
        [playlist.id]: isCurrentlyIn,
      }));
      toast.error(getApiErrorMessage(err));
    } finally {
      setTogglingPlaylistId(null);
    }
  };

  if (!isOpen && !showCreateModal) return null;

  return (
    <>
      {isOpen && (
        <AnimatePresence>
          <div
            id="add-to-playlist-popover-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onClose();
              }
            }}
          >
            <motion.div
              id="add-to-playlist-popover"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="w-full max-w-sm rounded-2xl overlay-panel p-4 flex flex-col gap-3 shadow-2xl border border-[#FF8800]/25 bg-white dark:bg-[#18181B] max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-b-none max-h-[85vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#FF8800]/10 flex items-center justify-center text-[#FF8800]">
                    <ListMusic size={16} />
                  </div>
                  <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Add to Playlist
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Search & Create New Row */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B75] dark:text-[#A0A0AA]"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search playlists..."
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#1A1A1E] dark:text-[#F5F5F7] placeholder-[#6B6B75] dark:placeholder-[#A0A0AA] focus:outline-none focus:ring-2 focus:ring-[#FF8800] transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-sm hover:brightness-110 flex items-center gap-1 shrink-0"
                  title="Create new playlist"
                >
                  <Plus size={14} />
                  <span className="max-xs:hidden">New</span>
                </button>
              </div>

              {/* Playlist List */}
              <div className="flex flex-col gap-1 overflow-y-auto max-h-60 pr-0.5 custom-scrollbar min-h-[140px]">
                {isLoading || loadingMemberships ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-[#6B6B75] dark:text-[#A0A0AA] gap-2">
                    <Loader2 size={20} className="animate-spin text-[#FF8800]" />
                    <span className="text-xs">Loading playlists...</span>
                  </div>
                ) : playlists.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FF8800]/10 flex items-center justify-center text-[#FF8800]">
                      <FolderPlus size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                        No playlists yet
                      </p>
                      <p className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                        Create your first playlist to save this track.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-sm hover:brightness-110 flex items-center gap-1.5"
                    >
                      <Plus size={14} />
                      <span>Create Playlist</span>
                    </button>
                  </div>
                ) : filteredPlaylists.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                    No playlists match "{searchQuery}"
                  </div>
                ) : (
                  filteredPlaylists.map((playlist) => {
                    const isSelected = Boolean(membershipMap[playlist.id]);
                    const isToggling = togglingPlaylistId === playlist.id;

                    return (
                      <button
                        key={playlist.id}
                        type="button"
                        onClick={() => handleToggle(playlist)}
                        disabled={isToggling}
                        className={`flex items-center justify-between p-2.5 rounded-xl text-left transition-all border ${
                          isSelected
                            ? 'bg-[#FF8800]/10 border-[#FF8800]/30 text-[#1A1A1E] dark:text-[#F5F5F7]'
                            : 'bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5 text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Mini 4-Cover Grid or Icon */}
                          <div className="w-9 h-9 rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 shrink-0 flex items-center justify-center relative">
                            {playlist.cover_urls && playlist.cover_urls.length > 0 ? (
                              playlist.cover_urls.length === 1 ? (
                                <img
                                  src={playlist.cover_urls[0]}
                                  alt={playlist.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5">
                                  {playlist.cover_urls.slice(0, 4).map((url, i) => (
                                    <img
                                      key={i}
                                      src={url}
                                      alt=""
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                  ))}
                                </div>
                              )
                            ) : (
                              <Music size={14} className="text-[#FF8800]" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <h5 className="text-xs font-semibold truncate text-[#1A1A1E] dark:text-[#F5F5F7]">
                              {playlist.name}
                            </h5>
                            <div className="flex items-center gap-1.5 text-[10px] text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                              <span>
                                {playlist.item_count ?? 0}{' '}
                                {playlist.item_count === 1 ? 'track' : 'tracks'}
                              </span>
                              {playlist.tags && playlist.tags.length > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">
                                    {playlist.tags.map((t) => `#${t}`).join(' ')}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Checkbox / Indicator */}
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center ml-2 shrink-0 border transition-all ${
                            isSelected
                              ? 'bg-[#FF8800] border-[#FF8800] text-white shadow-sm'
                              : 'border-black/20 dark:border-white/20 bg-transparent'
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 size={12} className="animate-spin text-white" />
                          ) : isSelected ? (
                            <Check size={13} strokeWidth={3} />
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Done Button */}
              <div className="pt-2 border-t border-black/5 dark:border-white/5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>
      )}

      {/* Modal for Creating Playlist */}
      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        variantId={variantId}
        trackPreview={trackPreview}
        onSuccess={(created) => {
          setMembershipMap((prev) => ({
            ...prev,
            [created.id]: true,
          }));
          setShowCreateModal(false);
        }}
      />
    </>
  );
};
