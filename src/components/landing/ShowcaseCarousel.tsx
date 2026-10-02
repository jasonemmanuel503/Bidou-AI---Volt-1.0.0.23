import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, ArrowRight, Image as ImageIcon, Video as VideoIcon, Music as MusicIcon } from 'lucide-react';
import { Avatar } from '../common/Avatar';

export interface ShowcaseItem {
  id: string;
  type: 'video' | 'image' | 'music';
  title: string;
  prompt: string;
  model: string;
  mediaUrl: string;
  author: string;
  avatarUrl?: string;
  likes?: number;
  genre?: string;
  category?: string;
  duration?: string;
}

export interface ShowcaseCarouselProps {
  mediaType: 'video' | 'image' | 'music';
  title: string;
  subtitle?: string;
  items: ShowcaseItem[];
  onCardClick?: (item: ShowcaseItem) => void;
  categories?: string[];
  activeCategory?: string;
  onCategoryChange?: (cat: string) => void;
  layoutMode?: 'carousel' | 'grid-two-rows';
  className?: string;
}

export const ShowcaseCarousel: React.FC<ShowcaseCarouselProps> = ({
  mediaType,
  title,
  subtitle,
  items,
  onCardClick,
  categories,
  activeCategory = 'All',
  onCategoryChange,
  layoutMode = 'carousel',
  className = '',
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up audio and timers on unmount
  useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Handle pointer / touch pauses for mobile and tablet fingers
  const handlePointerDown = () => {
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    setIsPaused(true);
  };

  const handlePointerUp = () => {
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    // Smooth 2-second grace period after lifting finger before resuming scroll
    touchTimeoutRef.current = setTimeout(() => {
      setIsPaused(false);
    }, 2000);
  };

  const handleMouseEnter = () => {
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    setIsPaused(false);
  };

  const handleToggleAudio = (e: React.MouseEvent, item: ShowcaseItem) => {
    e.stopPropagation(); // Don't trigger onCardClick
    if (playingMusicId === item.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingMusicId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(item.mediaUrl);
      audio.volume = 0.7;
      audio.onended = () => setPlayingMusicId(null);
      audio.play().catch(() => setPlayingMusicId(null));
      audioRef.current = audio;
      setPlayingMusicId(item.id);
    }
  };

  const getMediaIcon = () => {
    switch (mediaType) {
      case 'video':
        return <VideoIcon size={16} className="text-[#FF8800]" />;
      case 'music':
        return <MusicIcon size={16} className="text-[#FFB020]" />;
      default:
        return <ImageIcon size={16} className="text-[#F86A00]" />;
    }
  };

  // Filter items by active category if provided
  const filteredItems =
    categories && activeCategory && activeCategory !== 'All'
      ? items.filter(
          (item) =>
            item.category?.toLowerCase() === activeCategory.toLowerCase() ||
            item.genre?.toLowerCase() === activeCategory.toLowerCase() ||
            item.prompt?.toLowerCase().includes(activeCategory.toLowerCase())
        )
      : items;

  // Build seamless loop tracks for ultra-smooth continuous marquee
  const baseItems = React.useMemo(() => {
    if (filteredItems.length === 0) return [];
    if (filteredItems.length < 5) {
      return [...filteredItems, ...filteredItems, ...filteredItems];
    }
    return filteredItems;
  }, [filteredItems]);

  const marqueeItems = React.useMemo(() => {
    return [...baseItems, ...baseItems];
  }, [baseItems]);

  // Render individual showcase card
  const renderCard = (item: ShowcaseItem, uniqueKey: string) => (
    <div
      key={uniqueKey}
      onClick={() => onCardClick && onCardClick(item)}
      className="group relative shrink-0 w-[270px] sm:w-[320px] rounded-2xl bg-white/90 dark:bg-[#18181B]/90 shadow-sm border border-[#FF8800]/20 hover:border-[#FF8800] overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 flex flex-col cursor-pointer"
    >
      {/* Media Visual Area */}
      <div className="relative w-full aspect-[4/3] bg-black/10 dark:bg-white/5 overflow-hidden">
        {item.type === 'video' ? (
          <video
            src={item.mediaUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        ) : item.type === 'image' ? (
          <img
            src={item.mediaUrl}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          /* Music Cover Art Tile */
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-tr from-[#F86A00]/25 via-[#FF8800]/15 to-[#FFB020]/25 relative">
            <div className="w-14 h-14 rounded-2xl bg-white/90 dark:bg-[#18181B]/90 shadow-md flex items-center justify-center mb-2">
              <MusicIcon size={26} className="text-[#FF8800]" />
            </div>
            <span className="text-[11px] font-bold tracking-wider text-brand-gradient uppercase">
              {item.genre || 'African Rhythm'}
            </span>
            {/* Play Affordance Button */}
            <button
              type="button"
              onClick={(e) => handleToggleAudio(e, item)}
              className="mt-2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 dark:bg-[#121214]/90 text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              {playingMusicId === item.id ? (
                <>
                  <Pause size={12} className="text-[#F86A00]" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play size={12} className="text-[#F86A00] fill-[#F86A00]" />
                  <span>Sample</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Model Badge */}
        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-[10px] font-semibold flex items-center gap-1">
          <span>{item.model}</span>
        </div>

        {/* Hover overlay hint */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity flex items-end p-3">
          <span className="text-[11px] text-white font-semibold flex items-center gap-1">
            <span>Remix in Studio</span>
            <ArrowRight size={12} />
          </span>
        </div>
      </div>

      {/* Card Content Information */}
      <div className="p-3.5 flex flex-col gap-1.5 flex-1 justify-between">
        <div>
          <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
            {item.title}
          </h4>
          <p className="inter text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] line-clamp-2 leading-relaxed mt-0.5">
            "{item.prompt}"
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#FF8800]/10 text-[10px] text-[#6B6B75] dark:text-[#A0A0AA]">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <Avatar name={item.author} avatarUrl={item.avatarUrl} size="xs" />
            <span className="truncate">By {item.author}</span>
          </div>
          <span className="text-brand-gradient font-semibold shrink-0">Bidou AI</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`w-full flex flex-col gap-3 py-4 ${className}`} id={`carousel-${mediaType}`}>
      {/* Header with Title & Icon & Optional Category Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#F86A00]/15 text-[#F86A00] border border-[#FF8800]/25">
            {getMediaIcon()}
          </div>
          <div>
            <h3 className="jost text-lg sm:text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Marquee Status Pill & Optional Category Pills Filter */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          {/* Pause / Auto-scroll tactile status badge */}
          {layoutMode === 'carousel' && (
            <button
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? "Click to resume auto-scroll" : "Click or hover to pause auto-scroll"}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isPaused
                  ? 'bg-[#FF8800]/15 text-[#F86A00] border-[#FF8800]/30'
                  : 'bg-black/5 dark:bg-white/5 text-[#6B6B75] dark:text-[#A0A0AA] border-black/10 dark:border-white/10 hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isPaused ? 'bg-[#F86A00]' : 'bg-[#2ECC71] animate-pulse'
                }`}
              />
              <span>{isPaused ? 'Paused' : 'Auto-scrolling'}</span>
            </button>
          )}

          {/* Optional Category Pills Filter */}
          {categories && categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {categories.map((cat) => {
                const isSelected = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onCategoryChange && onCategoryChange(cat)}
                    className={`min-h-9 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center ${
                      isSelected
                        ? 'bg-brand-gradient text-white shadow-sm shadow-[#F86A00]/20'
                        : 'bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7]'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RENDER MODE A: CONTINUOUS AUTO-SCROLLING MARQUEE */}
      {layoutMode === 'carousel' ? (
        <div className="relative w-full overflow-hidden group">
          {/* Subtle gradient edge masks for high-end studio fade */}
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-r from-white via-white/80 to-transparent dark:from-[#121214] dark:via-[#121214]/80 dark:to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-l from-white via-white/80 to-transparent dark:from-[#121214] dark:via-[#121214]/80 dark:to-transparent z-10" />

          {/* Marquee Track Container: Pauses on Desktop Mouse Hover and Mobile/Tablet Finger Touch */}
          <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handlePointerDown}
            onTouchEnd={handlePointerUp}
            onTouchCancel={handlePointerUp}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-full flex py-2 cursor-pointer select-none overflow-hidden"
          >
            <div
              className={`flex shrink-0 gap-4 pr-4 animate-bidou-marquee ${isPaused ? 'marquee-paused' : ''}`}
              style={{
                animationPlayState: isPaused ? 'paused' : 'running',
              }}
            >
              {marqueeItems.map((item, idx) =>
                renderCard(item, `${item.id}-m-${idx}`)
              )}
            </div>
          </div>
        </div>
      ) : (
        /* RENDER MODE B: 1-2 ROWS RESPONSIVE WRAPPED GRID */
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredItems.slice(0, 8).map((item, idx) =>
              renderCard(item, `${item.id}-grid-${idx}`)
            )}
          </div>
        </div>
      )}
    </div>
  );
};
