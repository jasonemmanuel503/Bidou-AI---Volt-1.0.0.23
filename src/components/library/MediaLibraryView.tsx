import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  Heart,
  Sparkles,
  Play,
  RotateCcw,
  Video,
  Image as ImageIcon,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { GenerationJob, GenerationType, LibraryItem, PlanTier } from '../../types';
import { useLibrary } from '../../hooks/useLibrary';
import { useFavorites } from '../../hooks/useFavorites';
import { VariantActionsMenu } from '../common/VariantActionsMenu';
import { MediaLightbox, LightboxItem } from '../common/MediaLightbox';
import { EmptyState } from '../common/EmptyState';
import { getCurrentUserId } from '../../services/authToken';
import { VideoPlayer } from '../common/VideoPlayer';
import { posterFor } from '../../services/media';
import { libraryItemToJob } from '../../lib/jobConversion';

export interface MediaLibraryViewProps {
  type: 'video' | 'image';
  jobs: GenerationJob[];
  userId?: string;
  accessToken?: string | null;
  planTier?: PlanTier;
  onRemixPrompt?: (prompt: string, type: GenerationType) => void;
  onSelectMedia?: (job: GenerationJob) => void;
  onNavigateToStudio?: () => void;
}

export const MediaLibraryView: React.FC<MediaLibraryViewProps> = ({
  type,
  jobs,
  userId,
  accessToken,
  planTier,
  onRemixPrompt,
  onSelectMedia,
  onNavigateToStudio,
}) => {
  const { items, isLoading, hasMore, loadMore, refetch, removeLocal } = useLibrary(type, {
    userId,
    jobs,
  });
  const { isFavorite, toggleFavorite } = useFavorites();

  // Filters & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'favorites'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedRatio, setSelectedRatio] = useState<string>('all');

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Filter & sort the items
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.prompt.toLowerCase().includes(q) ||
          item.model_name.toLowerCase().includes(q)
      );
    }

    // Favorites filter
    if (filterMode === 'favorites') {
      result = result.filter((item) => isFavorite(item.id) || item.is_favorite);
    }

    // Aspect ratio filter
    if (selectedRatio !== 'all') {
      result = result.filter((item) => {
        const r = item.aspect_ratio || (type === 'video' ? '16:9' : '1:1');
        return r === selectedRatio;
      });
    }

    // Sort
    result.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [items, searchQuery, filterMode, selectedRatio, sortOrder, isFavorite, type]);

  // Lightbox items mapping
  const lightboxItems: LightboxItem[] = useMemo(() => {
    return filteredItems.map((item) => ({
      id: item.id,
      type: item.media_type,
      url: item.output_url,
      thumbnailUrl: item.thumbnail_url,
      coverArtUrl: item.cover_art_url,
      prompt: item.prompt,
      modelId: (item as any).model_id,
      modelName: item.model_name,
      aspectRatio: item.aspect_ratio,
      resolution: item.resolution,
      durationSeconds: item.duration_seconds,
      creditCost: item.credits_unit,
      variantId: item.id,
      jobId: item.job_id,
      rawItem: item,
    }));
  }, [filteredItems]);

  const handleOpenLightbox = (index: number) => {
    setLightboxIndex(index);
  };

  const handleOpenStudioForVariant = (item: LibraryItem) => {
    if (onSelectMedia) {
      onSelectMedia(libraryItemToJob(item, userId));
    } else if (onNavigateToStudio) {
      onNavigateToStudio();
    }
  };

  // Convert aspect ratio "9:16" to CSS "9 / 16"
  const getAspectRatioStyle = (ratio?: string) => {
    if (!ratio) {
      return type === 'video' ? '16 / 9' : '1 / 1';
    }
    return ratio.replace(':', ' / ');
  };

  return (
    <div id={`${type}-library-view`} className="w-full max-w-7xl mx-auto py-6 px-4 sm:px-6">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-[#FF8800]/15">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 capitalize">
              {type === 'video' ? 'Video Library' : 'Image Library'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FF8800]/10 text-[#FF8800] border border-[#FF8800]/20">
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {type === 'video'
              ? 'All cinematic clips generated across your studio sessions.'
              : 'Visual masterpieces and image generations preserved in your vault.'}
          </p>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64 min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              id={`${type}-library-search`}
              placeholder="Search prompts..."
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

          {/* Filter Chips: All / Favorites */}
          <div className="inline-flex rounded-lg bg-zinc-100 dark:bg-[#1c1c1f] p-0.5 border border-zinc-200 dark:border-white/10 text-xs">
            <button
              type="button"
              id={`${type}-filter-all`}
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                filterMode === 'all'
                  ? 'bg-white dark:bg-[#28282b] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              All
            </button>
            <button
              type="button"
              id={`${type}-filter-favorites`}
              onClick={() => setFilterMode('favorites')}
              className={`px-3 py-1 rounded-md font-medium flex items-center gap-1.5 transition-all ${
                filterMode === 'favorites'
                  ? 'bg-white dark:bg-[#28282b] text-[#FF8800] shadow-xs'
                  : 'text-zinc-500 hover:text-[#FF8800]'
              }`}
            >
              <Heart size={12} className={filterMode === 'favorites' ? 'fill-[#FF8800]' : ''} />
              <span>Favorites</span>
            </button>
          </div>

          {/* Sort Order */}
          <button
            type="button"
            id={`${type}-sort-order`}
            onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-white/10 text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 hover:border-[#FF8800]/40 transition-colors"
            title={`Sorting: ${sortOrder}`}
          >
            <ArrowUpDown size={13} className="text-zinc-400" />
            <span className="capitalize">{sortOrder}</span>
          </button>
        </div>
      </div>

      {/* 2. Aspect Ratio Filter Bar */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 text-xs">
        <span className="text-zinc-400 text-[11px] font-medium uppercase tracking-wider mr-1">
          Ratio:
        </span>
        {['all', '16:9', '9:16', '1:1', '4:3'].map((ratio) => (
          <button
            key={ratio}
            type="button"
            onClick={() => setSelectedRatio(ratio)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              selectedRatio === ratio
                ? 'bg-[#FF8800]/15 text-[#FF8800] border-[#FF8800]/40'
                : 'bg-zinc-100/80 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10 hover:border-zinc-400'
            }`}
          >
            {ratio === 'all' ? 'All Ratios' : ratio}
          </button>
        ))}
      </div>

      {/* 3. Loading Skeletons */}
      {isLoading && items.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-zinc-200 dark:bg-zinc-800/50 animate-pulse"
              style={{ aspectRatio: type === 'video' ? '16 / 9' : '1 / 1' }}
            />
          ))}
        </div>
      )}

      {/* 4. Empty State */}
      {!isLoading && filteredItems.length === 0 && (
        <div className="py-12">
          <EmptyState
            variant={type === 'video' ? 'no_generations_video' : 'no_generations_image'}
            title={
              searchQuery || filterMode === 'favorites' || selectedRatio !== 'all'
                ? 'No matching generations found'
                : undefined
            }
            description={
              searchQuery || filterMode === 'favorites' || selectedRatio !== 'all'
                ? 'Try adjusting your search terms or filters to find what you are looking for.'
                : undefined
            }
            actionLabel="Generate in Studio"
            onAction={onNavigateToStudio}
          />
        </div>
      )}

      {/* 5. Responsive Grid (Natural Aspect Ratios) */}
      {filteredItems.length > 0 && (
        <div
          className="grid gap-3 sm:gap-4"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          }}
        >
          {filteredItems.map((item, index) => {
            const favorited = isFavorite(item.id) || item.is_favorite;
            const aspectStyle = getAspectRatioStyle(item.aspect_ratio);

            return (
              <div
                key={item.id}
                id={`library-item-${item.id}`}
                className="group relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-sm hover:shadow-xl hover:border-[#FF8800]/50 transition-all duration-200 flex flex-col justify-between cursor-pointer"
                style={{ aspectRatio: aspectStyle }}
                onClick={() => handleOpenLightbox(index)}
              >
                {/* Media Element */}
                {type === 'video' ? (
                  <div className="w-full h-full relative">
                    <VideoPlayer
                      variantId={item.id}
                      src={item.output_url}
                      poster={posterFor(item.thumbnail_url, item.output_url)}
                      compact
                      onExpand={() => handleOpenLightbox(index)}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <img
                    src={item.thumbnail_url || item.output_url}
                    alt={item.prompt || 'Generated image'}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
                  />
                )}

                {/* Top Overlay Badges */}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                  {/* Take / Model Badge */}
                  <div className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-medium text-white/90 border border-white/10 truncate max-w-[120px]">
                    Take #{item.variant_index + 1}
                  </div>

                  {/* Actions & Badges */}
                  <div className="flex items-center gap-1.5 pointer-events-auto">
                    {/* Favorite Heart Badge */}
                    <button
                      type="button"
                      aria-label="Toggle favorite"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.id);
                      }}
                      className={`p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg backdrop-blur-md transition-all cursor-pointer ${
                        favorited
                          ? 'bg-[#FF8800] text-black shadow-md'
                          : 'bg-black/50 text-white/80 hover:text-white hover:bg-black/70'
                      }`}
                    >
                      <Heart
                        size={13}
                        className={favorited ? 'fill-black text-black' : ''}
                      />
                    </button>

                    {/* Three-Dot Actions Menu */}
                    <VariantActionsMenu
                      item={item}
                      onOpenPreview={() => handleOpenLightbox(index)}
                      onRemixPrompt={onRemixPrompt}
                      onDeleted={removeLocal}
                      triggerButtonClass="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg bg-black/50 hover:bg-black/75 text-white/80 hover:text-white backdrop-blur-md transition-colors cursor-pointer"
                    />
                  </div>
                </div>

                {/* Bottom Overlay: Prompt & Aspect Ratio */}
                <div className="absolute bottom-0 inset-x-0 p-2.5 bg-gradient-to-t from-black/85 via-black/50 to-transparent pointer-events-none">
                  <div className="flex items-center justify-between gap-1.5 text-[10px] text-white/75 font-mono mb-0.5">
                    <span className="uppercase">{item.aspect_ratio || (type === 'video' ? '16:9' : '1:1')}</span>
                    {item.model_name && <span className="truncate max-w-[80px]">{item.model_name}</span>}
                  </div>
                  <p className="text-[11px] leading-tight text-white line-clamp-2 font-normal">
                    {item.prompt || 'Untitled generation'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Load More Button */}
      {hasMore && (
        <div className="flex justify-center mt-8 pt-4 border-t border-zinc-200 dark:border-white/10">
          <button
            type="button"
            id={`${type}-load-more-btn`}
            onClick={() => loadMore()}
            className="px-6 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-[#1c1c1f] dark:hover:bg-[#28282b] text-zinc-800 dark:text-zinc-200 font-medium text-xs border border-zinc-300 dark:border-white/10 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Load more generations</span>
          </button>
        </div>
      )}

      {/* 7. Lightbox Modal */}
      {lightboxIndex !== null && (
        <MediaLightbox
          items={lightboxItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onRemix={(prompt, remixType) => {
            setLightboxIndex(null);
            onRemixPrompt?.(prompt, remixType);
          }}
          onDelete={(item) => {
            if (item.variantId) {
              if (lightboxItems.length <= 1) {
                setLightboxIndex(null);
              } else if (lightboxIndex !== null && lightboxIndex >= lightboxItems.length - 1) {
                setLightboxIndex(lightboxItems.length - 2);
              }
              removeLocal(item.variantId);
            }
          }}
        />
      )}
    </div>
  );
};
