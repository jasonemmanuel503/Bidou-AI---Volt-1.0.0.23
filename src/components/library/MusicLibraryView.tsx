import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Music,
  ListMusic,
  Heart,
  Play,
  Pause,
  Plus,
  Search,
  ArrowUpDown,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronLeft,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  GripVertical,
  Clock,
  Radio,
  Share2,
  AlertCircle,
  FolderPlus,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { GenerationJob, GenerationType, LibraryItem, PlanTier, Playlist, PlaylistItem } from '../../types';
import { useLibrary } from '../../hooks/useLibrary';
import { usePlaylists } from '../../hooks/usePlaylists';
import { useFavorites } from '../../hooks/useFavorites';
import {
  deriveTrackTitle,
  deriveStyleChips,
  formatMusicModelName,
  resolveCoverArtUrl,
  resolveTrackDuration,
} from '../../lib/musicMeta';
import { VariantActionsMenu } from '../common/VariantActionsMenu';
import { CreatePlaylistModal } from '../music/CreatePlaylistModal';
import { AddToPlaylistPopover } from '../music/AddToPlaylistPopover';
import { EmptyState } from '../common/EmptyState';
import { toast } from '../../services/toast';

export interface MusicLibraryViewProps {
  jobs: GenerationJob[];
  userId?: string;
  accessToken?: string | null;
  planTier?: PlanTier;
  onRemixPrompt?: (prompt: string, type: GenerationType) => void;
  onSelectMedia?: (job: GenerationJob) => void;
  onNavigateToStudio?: () => void;
}

interface AudioTrack {
  id: string;
  variantId: string;
  url: string;
  title: string;
  genre?: string;
  tonality?: string;
  duration?: number;
  coverUrl?: string;
  item?: LibraryItem;
}

// Sortable Track Row inside Playlist Detail
const SortablePlaylistItemRow: React.FC<{
  item: PlaylistItem;
  index: number;
  isPlaying: boolean;
  isCurrent: boolean;
  onPlayToggle: () => void;
  onRemove: () => void;
  onFavoriteToggle: () => void;
  isFavorite: boolean;
  onRemixPrompt?: (prompt: string, type: GenerationType) => void;
}> = ({
  item,
  index,
  isPlaying,
  isCurrent,
  onPlayToggle,
  onRemove,
  onFavoriteToggle,
  isFavorite,
  onRemixPrompt,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const track = item.variant;
  const job = item.job || (track as any)?.generation_jobs;
  const title = job ? deriveTrackTitle(job as GenerationJob) : 'African Studio Take';
  const chips = job ? deriveStyleChips(job as GenerationJob) : { visible: [] };
  const genre = chips.visible[0] || job?.genre;
  const duration = resolveTrackDuration(job as GenerationJob);
  const coverUrl = resolveCoverArtUrl(job as GenerationJob, track);

  const formatDuration = (sec?: number) => {
    if (!sec || sec <= 0) return '2:10';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between p-3 rounded-xl border transition-all ${
        isCurrent
          ? 'bg-[#FF8800]/10 border-[#FF8800]/40'
          : 'bg-white dark:bg-[#161618] border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/15'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="p-1 text-zinc-400 hover:text-zinc-200 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical size={16} />
        </button>

        <span className="text-xs font-mono text-zinc-400 w-5 text-center">{index + 1}</span>

        {/* Cover Art + Play button overlay */}
        <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
          {coverUrl ? (
            <img src={coverUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-600 to-orange-700 text-white">
              <Music size={18} />
            </div>
          )}
          <button
            type="button"
            aria-label={isPlaying && isCurrent ? 'Pause track' : 'Play track'}
            onClick={onPlayToggle}
            className="absolute inset-0 bg-black/50 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
          >
            {isPlaying && isCurrent ? (
              <Pause size={16} className="fill-white" />
            ) : (
              <Play size={16} className="ml-0.5 fill-white" />
            )}
          </button>
        </div>

        {/* Track Title & Badges */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4
              className={`text-xs sm:text-sm font-medium truncate ${
                isCurrent ? 'text-[#FF8800]' : 'text-zinc-900 dark:text-zinc-100'
              }`}
            >
              {title}
            </h4>
            {genre && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FF8800]/15 text-[#FF8800] border border-[#FF8800]/25 hidden sm:inline-block">
                {genre}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            <span className="flex items-center gap-1 font-mono">
              <Clock size={11} /> {formatDuration(duration)}
            </span>
          </div>
        </div>
      </div>

      {/* Row Actions */}
      <div className="flex items-center gap-2 ml-3">
        {/* Favorite */}
        <button
          type="button"
          onClick={onFavoriteToggle}
          className={`p-1.5 rounded-lg transition-colors ${
            isFavorite
              ? 'text-[#FF8800]'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5'
          }`}
          title={isFavorite ? 'Remove favorite' : 'Add to favorites'}
        >
          <Heart size={15} className={isFavorite ? 'fill-[#FF8800]' : ''} />
        </button>

        {/* Remove from playlist */}
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remove from playlist"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};

export const MusicLibraryView: React.FC<MusicLibraryViewProps> = ({
  jobs,
  userId,
  accessToken,
  planTier,
  onRemixPrompt,
  onSelectMedia,
  onNavigateToStudio,
}) => {
  // Library items (type: music)
  const { items, isLoading, hasMore, loadMore, refetch, removeLocal } = useLibrary('music', {
    userId,
    jobs,
  });

  // Playlists hook
  const {
    playlists,
    isLoading: playlistsLoading,
    fetchPlaylists,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    fetchPlaylistItems,
    removeItemFromPlaylist,
    reorderPlaylistItems,
  } = usePlaylists(true);

  // Favorites hook
  const { isFavorite, toggleFavorite, favoriteIds } = useFavorites();

  // Active view tab: 'tracks' | 'playlists' | 'favorites'
  const [activeTab, setActiveTab] = useState<'tracks' | 'playlists' | 'favorites'>('tracks');

  // Search & sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Playlist detail state (if selected)
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
  const [loadingPlaylistItems, setLoadingPlaylistItems] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [playlistTitleInput, setPlaylistTitleInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [showDeletePlaylistModal, setShowDeletePlaylistModal] = useState(false);

  // Modals / Popovers
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [playlistPopoverVariant, setPlaylistPopoverVariant] = useState<LibraryItem | null>(null);

  // Global Audio Controller (single track playing at any time)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackQueue, setPlaybackQueue] = useState<AudioTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(-1);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Setup sensors for Dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    let list = [...items];
    if (activeTab === 'favorites') {
      list = list.filter((i) => isFavorite(i.id) || i.is_favorite);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.prompt.toLowerCase().includes(q) ||
          (i.genre && i.genre.toLowerCase().includes(q)) ||
          (i.model_name && i.model_name.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? tB - tA : tA - tB;
    });
    return list;
  }, [items, activeTab, searchQuery, sortOrder, isFavorite]);

  // Load playlist items when a playlist is clicked
  const handleOpenPlaylist = async (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setPlaylistTitleInput(playlist.name);
    setLoadingPlaylistItems(true);
    try {
      const list = await fetchPlaylistItems(playlist.id);
      setPlaylistItems(list);
    } catch {
      setPlaylistItems([]);
    } finally {
      setLoadingPlaylistItems(false);
    }
  };

  // Audio Playback Controls
  const handlePlayToggle = (track: AudioTrack, queueList?: AudioTrack[], indexInQueue?: number) => {
    if (!audioRef.current) return;

    if (currentTrack?.variantId === track.variantId) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
      return;
    }

    // New track selected
    if (queueList && queueList.length > 0) {
      setPlaybackQueue(queueList);
      setQueueIndex(indexInQueue !== undefined ? indexInQueue : 0);
    } else {
      setPlaybackQueue([track]);
      setQueueIndex(0);
    }

    setCurrentTrack(track);
    audioRef.current.src = track.url;
    audioRef.current.load();
    audioRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch((err) => {
        console.warn('Playback error:', err);
        setIsPlaying(false);
      });
  };

  // Play All in playlist
  const handlePlayAll = () => {
    if (playlistItems.length === 0) return;
    const queue: AudioTrack[] = playlistItems.map((item) => {
      const v = item.variant;
      const j = (item.job || (v as any)?.generation_jobs) as GenerationJob | undefined;
      const chips = j ? deriveStyleChips(j) : { visible: [] };
      return {
        id: item.id,
        variantId: item.variant_id,
        url: v?.output_url || '',
        title: j ? deriveTrackTitle(j) : 'African Studio Take',
        genre: chips.visible[0] || j?.genre,
        duration: resolveTrackDuration(j),
        coverUrl: resolveCoverArtUrl(j, v),
      };
    });
    handlePlayToggle(queue[0], queue, 0);
  };

  // Advance queue on end
  const handleAudioEnded = () => {
    if (playbackQueue.length > 0 && queueIndex + 1 < playbackQueue.length) {
      const nextIndex = queueIndex + 1;
      const nextTrack = playbackQueue[nextIndex];
      setQueueIndex(nextIndex);
      setCurrentTrack(nextTrack);
      if (audioRef.current) {
        audioRef.current.src = nextTrack.url;
        audioRef.current.load();
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    } else {
      setIsPlaying(false);
    }
  };

  // Time scrubber handler
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  // Reorder items via Dnd-kit
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!selectedPlaylist || !over || active.id === over.id) return;

    const oldIndex = playlistItems.findIndex((i) => i.id === active.id);
    const newIndex = playlistItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(playlistItems, oldIndex, newIndex);
    setPlaylistItems(reordered);

    try {
      const variantIds = reordered.map((i) => i.variant_id);
      await reorderPlaylistItems(selectedPlaylist.id, variantIds);
      toast.success('Playlist order updated');
    } catch {
      // rollback
      setPlaylistItems(playlistItems);
      toast.error('Failed to save reordered list');
    }
  };

  // Remove track from current playlist
  const handleRemoveTrackFromPlaylist = async (variantId: string) => {
    if (!selectedPlaylist) return;
    try {
      await removeItemFromPlaylist(selectedPlaylist.id, variantId);
      setPlaylistItems((prev) => prev.filter((i) => i.variant_id !== variantId));
      setSelectedPlaylist((prev) =>
        prev ? { ...prev, item_count: Math.max(0, prev.item_count - 1) } : null
      );
      toast.success('Track removed from playlist');
    } catch {
      toast.error('Failed to remove track');
    }
  };

  // Save renamed playlist title
  const handleSaveTitle = async () => {
    if (!selectedPlaylist) return;
    const clean = playlistTitleInput.trim();
    if (!clean) return;
    try {
      const updated = await updatePlaylist(selectedPlaylist.id, { name: clean });
      setSelectedPlaylist((prev) => (prev ? { ...prev, name: updated.name } : null));
      setIsEditingTitle(false);
      toast.success('Playlist renamed');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to rename playlist');
    }
  };

  // Add tag to playlist
  const handleAddTag = async () => {
    if (!selectedPlaylist || !newTagInput.trim()) return;
    const clean = newTagInput.trim().replace(/^#/, '').slice(0, 20);
    const currentTags = selectedPlaylist.tags || [];
    if (currentTags.length >= 3) {
      toast.error('Maximum 3 tags per playlist');
      return;
    }
    if (currentTags.includes(clean)) {
      setNewTagInput('');
      setIsAddingTag(false);
      return;
    }
    const newTags = [...currentTags, clean];
    try {
      const updated = await updatePlaylist(selectedPlaylist.id, { tags: newTags });
      setSelectedPlaylist((prev) => (prev ? { ...prev, tags: updated.tags } : null));
      setNewTagInput('');
      setIsAddingTag(false);
      toast.success('Tag added');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update tags');
    }
  };

  // Remove tag from playlist
  const handleRemoveTag = async (tagToRemove: string) => {
    if (!selectedPlaylist) return;
    const newTags = (selectedPlaylist.tags || []).filter((t) => t !== tagToRemove);
    try {
      const updated = await updatePlaylist(selectedPlaylist.id, { tags: newTags });
      setSelectedPlaylist((prev) => (prev ? { ...prev, tags: updated.tags } : null));
      toast.success('Tag removed');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove tag');
    }
  };

  // Confirm delete playlist
  const handleConfirmDeletePlaylist = async () => {
    if (!selectedPlaylist) return;
    try {
      await deletePlaylist(selectedPlaylist.id);
      setSelectedPlaylist(null);
      setShowDeletePlaylistModal(false);
      toast.success('Playlist deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete playlist');
    }
  };

  const formatDuration = (sec?: number) => {
    if (!sec) return '0:30';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div id="music-library-view" className="w-full max-w-7xl mx-auto py-6 px-4 sm:px-6 pb-28">
      {/* Hidden Global Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onDurationChange={() => {
          if (audioRef.current) setDuration(audioRef.current.duration || 0);
        }}
        onEnded={handleAudioEnded}
      />

      {/* 1. Header & Primary Segmented Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-[#FF8800]/15">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Music Library
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
              {activeTab === 'playlists' ? `${playlists.length} playlists` : `${filteredTracks.length} tracks`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Studio-quality music generations, curated playlists, and favorite African beats.
          </p>
        </div>

        {/* Segmented Control */}
        <div className="inline-flex rounded-xl bg-zinc-100 dark:bg-[#1c1c1f] p-1 border border-zinc-200 dark:border-white/10 text-xs self-start md:self-auto">
          <button
            type="button"
            id="music-tab-tracks"
            onClick={() => {
              setActiveTab('tracks');
              setSelectedPlaylist(null);
            }}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
              activeTab === 'tracks' && !selectedPlaylist
                ? 'bg-white dark:bg-[#28282b] text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Music size={14} />
            <span>Tracks</span>
          </button>

          <button
            type="button"
            id="music-tab-playlists"
            onClick={() => {
              setActiveTab('playlists');
              setSelectedPlaylist(null);
            }}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
              activeTab === 'playlists'
                ? 'bg-white dark:bg-[#28282b] text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <ListMusic size={14} />
            <span>Playlists</span>
          </button>

          <button
            type="button"
            id="music-tab-favorites"
            onClick={() => {
              setActiveTab('favorites');
              setSelectedPlaylist(null);
            }}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
              activeTab === 'favorites' && !selectedPlaylist
                ? 'bg-white dark:bg-[#28282b] text-[#FF8800] shadow-xs'
                : 'text-zinc-500 hover:text-[#FF8800]'
            }`}
          >
            <Heart size={14} className={activeTab === 'favorites' ? 'fill-[#FF8800]' : ''} />
            <span>Favorites</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TAB: PLAYLIST DETAIL VIEW (if a playlist is selected)                   */}
      {/* ========================================================================= */}
      {selectedPlaylist ? (
        <div id="playlist-detail-view" className="space-y-6">
          {/* Back button */}
          <button
            type="button"
            onClick={() => setSelectedPlaylist(null)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
            <span>Back to all playlists</span>
          </button>

          {/* Playlist Detail Header */}
          <div className="p-5 sm:p-6 rounded-2xl bg-zinc-100 dark:bg-[#161618] border border-zinc-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              {/* Mosaic cover preview */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 grid grid-cols-2 grid-rows-2 gap-0.5 border border-white/10">
                {selectedPlaylist.cover_urls && selectedPlaylist.cover_urls.length > 0 ? (
                  selectedPlaylist.cover_urls.slice(0, 4).map((url, i) => (
                    <img key={i} src={url} alt="Cover" className="w-full h-full object-cover" />
                  ))
                ) : (
                  <div className="col-span-2 row-span-2 flex items-center justify-center bg-gradient-to-br from-amber-600 to-orange-700 text-white">
                    <ListMusic size={28} />
                  </div>
                )}
              </div>

              {/* Title & Tags */}
              <div className="space-y-2">
                {/* Title */}
                <div className="flex items-center gap-2">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={playlistTitleInput}
                        onChange={(e) => setPlaylistTitleInput(e.target.value)}
                        className="px-2 py-1 text-base font-semibold rounded bg-white dark:bg-black/40 border border-[#FF8800] text-zinc-900 dark:text-zinc-100 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSaveTitle}
                        className="p-1 rounded bg-[#FF8800] text-black hover:bg-[#FF8800]/90"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingTitle(false);
                          setPlaylistTitleInput(selectedPlaylist.name);
                        }}
                        className="p-1 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {selectedPlaylist.name}
                      </h2>
                      <button
                        type="button"
                        onClick={() => setIsEditingTitle(true)}
                        className="p-1 text-zinc-400 hover:text-zinc-200"
                        title="Rename playlist"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Track count */}
                <div className="text-xs text-zinc-500">
                  {playlistItems.length} {playlistItems.length === 1 ? 'track' : 'tracks'}
                </div>

                {/* Tags chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {(selectedPlaylist.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#FF8800]/15 text-[#FF8800] border border-[#FF8800]/25 flex items-center gap-1"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="text-[#FF8800] hover:text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  {/* Add Tag */}
                  {isAddingTag ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Tag name"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                        className="w-20 px-1.5 py-0.5 text-xs rounded bg-white dark:bg-black/40 border border-zinc-300 dark:border-white/20 text-zinc-900 dark:text-zinc-100 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        className="p-1 rounded text-[#FF8800]"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingTag(false)}
                        className="p-1 text-zinc-400"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    (selectedPlaylist.tags || []).length < 3 && (
                      <button
                        type="button"
                        onClick={() => setIsAddingTag(true)}
                        className="px-2 py-0.5 rounded-md text-[11px] text-zinc-500 border border-dashed border-zinc-300 dark:border-white/20 hover:text-zinc-800 dark:hover:text-zinc-200"
                      >
                        + Tag
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Header Actions: Play All & Delete Playlist */}
            <div className="flex items-center gap-2.5 self-start sm:self-center">
              <button
                type="button"
                id="playlist-play-all-btn"
                disabled={playlistItems.length === 0}
                onClick={handlePlayAll}
                className="px-4 py-2 rounded-xl bg-[#FF8800] hover:bg-[#FF8800]/90 text-black font-semibold text-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <Play size={14} className="fill-black" />
                <span>Play all</span>
              </button>

              <button
                type="button"
                id="playlist-delete-btn"
                onClick={() => setShowDeletePlaylistModal(true)}
                className="p-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Delete playlist"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Track list with drag-to-reorder */}
          {loadingPlaylistItems ? (
            <div className="space-y-3 py-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800/40 animate-pulse" />
              ))}
            </div>
          ) : playlistItems.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-zinc-300 dark:border-white/10 rounded-2xl p-6">
              <ListMusic size={36} className="mx-auto text-zinc-400 mb-2" />
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                This playlist is empty
              </h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Add tracks from the Tracks tab by opening any track's three-dot menu and selecting "Add to playlist".
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={playlistItems.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {playlistItems.map((pItem, idx) => {
                    const pJob = pItem.job as GenerationJob | undefined;
                    const pChips = pJob ? deriveStyleChips(pJob) : { visible: [] };
                    const trackObj: AudioTrack = {
                      id: pItem.id,
                      variantId: pItem.variant_id,
                      url: pItem.variant?.output_url || '',
                      title: pJob ? deriveTrackTitle(pJob) : 'African Studio Take',
                      genre: pChips.visible[0] || pItem.job?.genre,
                      duration: resolveTrackDuration(pJob),
                      coverUrl: resolveCoverArtUrl(pJob, pItem.variant),
                    };
                    const isCurrent = currentTrack?.variantId === pItem.variant_id;

                    return (
                      <SortablePlaylistItemRow
                        key={pItem.id}
                        item={pItem}
                        index={idx}
                        isPlaying={isPlaying}
                        isCurrent={isCurrent}
                        isFavorite={isFavorite(pItem.variant_id)}
                        onPlayToggle={() => {
                          const allTracks: AudioTrack[] = playlistItems.map((pi) => {
                            const piJob = pi.job as GenerationJob | undefined;
                            const piChips = piJob ? deriveStyleChips(piJob) : { visible: [] };
                            return {
                              id: pi.id,
                              variantId: pi.variant_id,
                              url: pi.variant?.output_url || '',
                              title: piJob ? deriveTrackTitle(piJob) : 'African Studio Take',
                              genre: piChips.visible[0] || pi.job?.genre,
                              duration: resolveTrackDuration(piJob),
                              coverUrl: resolveCoverArtUrl(piJob, pi.variant),
                            };
                          });
                          handlePlayToggle(trackObj, allTracks, idx);
                        }}
                        onRemove={() => handleRemoveTrackFromPlaylist(pItem.variant_id)}
                        onFavoriteToggle={() => toggleFavorite(pItem.variant_id)}
                        onRemixPrompt={onRemixPrompt}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      ) : activeTab === 'playlists' ? (
        /* ========================================================================= */
        /* 3. TAB: PLAYLISTS GRID                                                    */
        /* ========================================================================= */
        <div id="playlists-grid-view">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* New Playlist Card */}
            <div
              id="create-new-playlist-card"
              onClick={() => setShowCreateModal(true)}
              className="p-5 rounded-2xl border-2 border-dashed border-[#FF8800]/30 hover:border-[#FF8800] bg-zinc-50 dark:bg-[#161618]/50 hover:bg-[#FF8800]/5 transition-all flex flex-col items-center justify-center min-h-[190px] cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-full bg-[#FF8800]/10 group-hover:bg-[#FF8800] text-[#FF8800] group-hover:text-black flex items-center justify-center transition-all mb-3">
                <Plus size={22} />
              </div>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                New playlist
              </span>
              <span className="text-[11px] text-zinc-500 mt-1">Create an organized soundtrack</span>
            </div>

            {/* Playlist Cards */}
            {playlists.map((playlist) => {
              const coverUrls = playlist.cover_urls || [];
              return (
                <div
                  key={playlist.id}
                  id={`playlist-card-${playlist.id}`}
                  onClick={() => handleOpenPlaylist(playlist)}
                  className="group rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161618] hover:border-[#FF8800]/50 hover:shadow-lg transition-all p-4 flex flex-col justify-between cursor-pointer"
                >
                  {/* 2x2 Cover Mosaic */}
                  <div className="w-full aspect-square rounded-xl overflow-hidden bg-zinc-800 grid grid-cols-2 grid-rows-2 gap-0.5 mb-3 border border-zinc-200 dark:border-white/5">
                    {coverUrls.length > 0 ? (
                      coverUrls.slice(0, 4).map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt="Playlist track"
                          className="w-full h-full object-cover"
                        />
                      ))
                    ) : (
                      <div className="col-span-2 row-span-2 flex items-center justify-center bg-gradient-to-br from-amber-600 to-orange-700 text-white">
                        <ListMusic size={36} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-[#FF8800] transition-colors">
                      {playlist.name}
                    </h3>
                    <div className="flex items-center justify-between mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{playlist.item_count || 0} tracks</span>
                    </div>

                    {/* Tags */}
                    {playlist.tags && playlist.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {playlist.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 4. TAB: TRACKS & FAVORITES LIST ROWS                                      */
        /* ========================================================================= */
        <div id="tracks-list-view" className="space-y-4">
          {/* Search and Sort Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                id="music-search-input"
                placeholder="Search tracks, genres, prompts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-[#FF8800]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  ×
                </button>
              )}
            </div>

            <button
              type="button"
              id="music-sort-order"
              onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-white/10 text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 hover:border-[#FF8800]/40 transition-colors"
            >
              <ArrowUpDown size={13} className="text-zinc-400" />
              <span className="capitalize">{sortOrder}</span>
            </button>
          </div>

          {/* Loading Skeletons */}
          {isLoading && items.length === 0 && (
            <div className="space-y-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800/40 animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredTracks.length === 0 && (
            <div className="py-12">
              <EmptyState
                variant="no_generations_music"
                title={
                  activeTab === 'favorites'
                    ? 'No favorited tracks yet'
                    : searchQuery
                    ? 'No matching tracks found'
                    : undefined
                }
                description={
                  activeTab === 'favorites'
                    ? 'Click the heart icon on any music generation to pin it here.'
                    : searchQuery
                    ? 'Try searching for different genres or prompt keywords.'
                    : undefined
                }
                actionLabel="Compose in Studio"
                onAction={onNavigateToStudio}
              />
            </div>
          )}

          {/* Track Rows */}
          {filteredTracks.length > 0 && (
            <div className="space-y-2">
              {filteredTracks.map((item, index) => {
                const pseudoJob = item as unknown as GenerationJob;
                const itemChips = deriveStyleChips(pseudoJob);
                const trackObj: AudioTrack = {
                  id: item.id,
                  variantId: item.id,
                  url: item.output_url,
                  title: deriveTrackTitle(pseudoJob),
                  genre: itemChips.visible[0] || item.genre,
                  duration: resolveTrackDuration(pseudoJob),
                  coverUrl: resolveCoverArtUrl(pseudoJob, item as any),
                  item,
                };
                const isCurrent = currentTrack?.variantId === item.id;
                const favorited = isFavorite(item.id) || item.is_favorite;

                return (
                  <div
                    key={item.id}
                    id={`track-row-${item.id}`}
                    className={`group flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isCurrent
                        ? 'bg-[#FF8800]/10 border-[#FF8800]/40 shadow-sm'
                        : 'bg-white dark:bg-[#161618] border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-mono text-zinc-400 w-5 text-center hidden sm:block">
                        {index + 1}
                      </span>

                      {/* Cover Art + Play Overlay */}
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                        {trackObj.coverUrl ? (
                          <img
                            src={trackObj.coverUrl}
                            alt={trackObj.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-600 to-orange-700 text-white">
                            <Music size={20} />
                          </div>
                        )}
                        <button
                          type="button"
                          aria-label={isPlaying && isCurrent ? 'Pause track' : 'Play track'}
                          onClick={() => {
                            const allAudioTracks: AudioTrack[] = filteredTracks.map((ft) => {
                              const ftJob = ft as unknown as GenerationJob;
                              const ftChips = deriveStyleChips(ftJob);
                              return {
                                id: ft.id,
                                variantId: ft.id,
                                url: ft.output_url,
                                title: deriveTrackTitle(ftJob),
                                genre: ftChips.visible[0] || ft.genre,
                                duration: resolveTrackDuration(ftJob),
                                coverUrl: resolveCoverArtUrl(ftJob, ft as any),
                                item: ft,
                              };
                            });
                            handlePlayToggle(trackObj, allAudioTracks, index);
                          }}
                          className="absolute inset-0 bg-black/45 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                        >
                          {isPlaying && isCurrent ? (
                            <Pause size={16} className="fill-white" />
                          ) : (
                            <Play size={16} className="ml-0.5 fill-white" />
                          )}
                        </button>
                      </div>

                      {/* Track Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4
                            className={`text-xs sm:text-sm font-medium truncate ${
                              isCurrent ? 'text-[#FF8800]' : 'text-zinc-900 dark:text-zinc-100'
                            }`}
                          >
                            {trackObj.title}
                          </h4>
                          {trackObj.genre && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-500 border border-amber-500/25 hidden md:inline-block">
                              {trackObj.genre}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock size={11} /> {formatDuration(trackObj.duration)}
                          </span>
                          <span>•</span>
                          <span className="truncate max-w-[160px]">{formatMusicModelName(item.model_name)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="flex items-center gap-2 ml-3">
                      {/* Favorite Button */}
                      <button
                        type="button"
                        aria-label="Toggle favorite"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(item.id);
                        }}
                        className={`p-2 rounded-lg transition-colors cursor-pointer ${
                          favorited
                            ? 'text-[#FF8800]'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5'
                        }`}
                        title={favorited ? 'Remove favorite' : 'Add to favorites'}
                      >
                        <Heart size={16} className={favorited ? 'fill-[#FF8800]' : ''} />
                      </button>

                      {/* Three-Dot Actions Menu */}
                      <VariantActionsMenu
                        item={item}
                        onAddToPlaylist={() => setPlaylistPopoverVariant(item)}
                        onRemixPrompt={onRemixPrompt}
                        onDeleted={removeLocal}
                        triggerButtonClass="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. STICKY BOTTOM AUDIO PLAYER BAR (Only 1 track active across whole view) */}
      {/* ========================================================================= */}
      {currentTrack && (
        <div
          id="sticky-music-player-bar"
          className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#121214]/95 border-t border-[#FF8800]/20 backdrop-blur-xl px-4 py-2.5 sm:py-3 shadow-2xl flex items-center justify-between gap-4"
        >
          {/* Left: Track Info */}
          <div className="flex items-center gap-3 min-w-0 max-w-[220px] sm:max-w-xs">
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
              {currentTrack.coverUrl ? (
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#FF8800] text-black">
                  <Music size={18} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {currentTrack.title}
              </h4>
              <p className="text-[10px] text-zinc-500 truncate">
                {currentTrack.genre || 'African Music Studio'}
              </p>
            </div>
          </div>

          {/* Center: Playback Controls & Progress Scrubber */}
          <div className="flex-1 max-w-lg flex flex-col items-center gap-1">
            <div className="flex items-center gap-3">
              {/* Skip Back */}
              <button
                type="button"
                aria-label="Previous track"
                disabled={queueIndex <= 0}
                onClick={() => {
                  if (queueIndex > 0) {
                    const prevIndex = queueIndex - 1;
                    const prevTrack = playbackQueue[prevIndex];
                    setQueueIndex(prevIndex);
                    setCurrentTrack(prevTrack);
                    if (audioRef.current) {
                      audioRef.current.src = prevTrack.url;
                      audioRef.current.load();
                      audioRef.current.play().then(() => setIsPlaying(true));
                    }
                  }
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 cursor-pointer"
              >
                <SkipBack size={16} />
              </button>

              {/* Play / Pause Main Button */}
              <button
                type="button"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                onClick={() => handlePlayToggle(currentTrack)}
                className="w-8 h-8 rounded-full bg-[#FF8800] text-black flex items-center justify-center hover:scale-105 transition-all cursor-pointer shadow-md"
              >
                {isPlaying ? <Pause size={16} className="fill-black" /> : <Play size={16} className="ml-0.5 fill-black" />}
              </button>

              {/* Skip Forward */}
              <button
                type="button"
                aria-label="Next track"
                disabled={queueIndex >= playbackQueue.length - 1}
                onClick={() => {
                  if (queueIndex < playbackQueue.length - 1) {
                    const nextIndex = queueIndex + 1;
                    const nextTrack = playbackQueue[nextIndex];
                    setQueueIndex(nextIndex);
                    setCurrentTrack(nextTrack);
                    if (audioRef.current) {
                      audioRef.current.src = nextTrack.url;
                      audioRef.current.load();
                      audioRef.current.play().then(() => setIsPlaying(true));
                    }
                  }
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 cursor-pointer"
              >
                <SkipForward size={16} />
              </button>
            </div>

            {/* Scrubber Bar */}
            <div className="w-full flex items-center gap-2 text-[10px] font-mono text-zinc-500">
              <span>{formatDuration(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 30}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-lg accent-[#FF8800] cursor-pointer"
              />
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Right: Mute & Close */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.muted = !isMuted;
                  setIsMuted(!isMuted);
                }
              }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              type="button"
              aria-label="Close player"
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                }
                setIsPlaying(false);
                setCurrentTrack(null);
              }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODALS & POPOVERS                                                      */}
      {/* ========================================================================= */}

      {/* Create Playlist Modal */}
      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(newPlaylist) => {
          setShowCreateModal(false);
          fetchPlaylists();
          handleOpenPlaylist(newPlaylist);
        }}
      />

      {/* Add to Playlist Popover */}
      {playlistPopoverVariant && (
        <AddToPlaylistPopover
          isOpen={Boolean(playlistPopoverVariant)}
          variantId={playlistPopoverVariant.id}
          trackPreview={{
            title: playlistPopoverVariant.prompt,
            prompt: playlistPopoverVariant.prompt,
            genre: playlistPopoverVariant.genre,
            duration: playlistPopoverVariant.duration_seconds,
            coverUrl: playlistPopoverVariant.cover_art_url || playlistPopoverVariant.thumbnail_url,
          }}
          onClose={() => setPlaylistPopoverVariant(null)}
        />
      )}

      {/* Delete Playlist Confirmation Modal */}
      {showDeletePlaylistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-[#1c1c1f] border border-white/10 p-5 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/15 text-red-400 mx-auto flex items-center justify-center mb-3">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-base font-bold text-white">Delete this playlist?</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Tracks inside this playlist will <strong>not</strong> be deleted and will remain intact in your Music Library. Only this playlist collection will be removed.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowDeletePlaylistModal(false)}
                className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePlaylist}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-xs transition-colors cursor-pointer"
              >
                Delete playlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
