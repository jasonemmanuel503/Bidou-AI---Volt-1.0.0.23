// Bidou AI Featured Strip
import React, { useRef, useState, useEffect } from 'react';
import { Sparkles, ArrowRight, ChevronLeft, ChevronRight, Image as ImageIcon, Music as MusicIcon, Video as VideoIcon } from 'lucide-react';

export interface FeaturedItem {
  id: string;
  badge: string;
  badgeType: 'new' | 'hot' | 'pro';
  title: string;
  subtitle: string;
  type: 'image' | 'video' | 'music';
  imageUrl: string;
  suggestedPrompt?: string;
}

export interface FeaturedStripProps {
  onSelectFeature?: (item: FeaturedItem) => void;
  className?: string;
}

export const FeaturedStrip: React.FC<FeaturedStripProps> = ({
  onSelectFeature,
  className = '',
}) => {
  const featuredCards: FeaturedItem[] = [
    {
      id: 'feat-1',
      badge: 'NEW MODEL',
      badgeType: 'new',
      title: 'Nano Banana Pro',
      subtitle: 'Photorealistic 4K African portraiture with volumetric lighting',
      type: 'image',
      imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      suggestedPrompt: 'Regal African queen in traditional Ndop woven textile with luminous golden halo, high fashion photography, studio rim lighting, 8k resolution',
    },
    {
      id: 'feat-2',
      badge: 'FEATURED',
      badgeType: 'hot',
      title: 'Veo 3.1 Cinematic',
      subtitle: 'Drone flights over Mount Cameroon & equatorial coasts',
      type: 'video',
      imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&auto=format&fit=crop&q=80',
      suggestedPrompt: 'Cinematic aerial drone flight tracking sunset clouds over volcanic slopes in Buea, golden hour sunbeams breaking through mist, 60fps realistic motion',
    },
    {
      id: 'feat-3',
      badge: 'AFRICAN SOUND',
      badgeType: 'new',
      title: 'Mbolé & Makossa Drop',
      subtitle: 'Sonic v5 native basslines & live Cameroonian brass',
      type: 'music',
      imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80',
      suggestedPrompt: 'High energy Makossa rhythm with slap bass guitar, celebratory brass section, and festive Douala street atmosphere',
    },
    {
      id: 'feat-4',
      badge: 'PRO TOOL',
      badgeType: 'pro',
      title: 'Video Depth & Motion',
      subtitle: 'High precision dynamic zoom and parallax transitions',
      type: 'video',
      imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&auto=format&fit=crop&q=80',
      suggestedPrompt: 'Hyperlapse through futuristic high-speed rail traversing Yaoundé and Douala under neon starry night',
    },
    {
      id: 'feat-5',
      badge: 'TRENDING',
      badgeType: 'hot',
      title: 'Afrofuturism 3D',
      subtitle: 'Cyberpunk markets and luminous textile design',
      type: 'image',
      imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&auto=format&fit=crop&q=80',
      suggestedPrompt: 'Bustling night market in Douala with neon holographic geometric fabric patterns, rain reflections on asphalt',
    },
  ];

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const updateScrollState = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!el) return;
        const { scrollLeft, scrollWidth, clientWidth } = el;
        setCanScrollLeft(scrollLeft > 4);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
        const maxScroll = scrollWidth - clientWidth;
        if (maxScroll > 0) {
          const ratio = scrollLeft / maxScroll;
          const idx = Math.min(
            featuredCards.length - 1,
            Math.max(0, Math.round(ratio * (featuredCards.length - 1)))
          );
          setActiveIndex(idx);
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
  }, [featuredCards.length]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  const getBadgeStyle = (type: FeaturedItem['badgeType']) => {
    switch (type) {
      case 'new':
        return 'bg-[#2ECC71]/20 text-[#2ECC71] border-[#2ECC71]/40';
      case 'hot':
        return 'bg-[#F86A00]/20 text-[#F86A00] border-[#F86A00]/40';
      case 'pro':
        return 'bg-[#9B51E0]/20 text-[#9B51E0] border-[#9B51E0]/40';
    }
  };

  const getTypeIcon = (type: FeaturedItem['type']) => {
    switch (type) {
      case 'image':
        return <ImageIcon size={13} className="text-[#F86A00]" />;
      case 'video':
        return <VideoIcon size={13} className="text-[#FF8800]" />;
      case 'music':
        return <MusicIcon size={13} className="text-[#FFB020]" />;
    }
  };

  return (
    <div className={`w-full flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight">
          <Sparkles size={14} className="text-[#F86A00]" />
          <span>Featured & New Releases</span>
        </div>
        {/* Mobile Dot Indicators replacing "Scroll to explore →" */}
        <div className="flex sm:hidden items-center gap-1.5" aria-hidden="true">
          {featuredCards.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? 'w-4 bg-brand-gradient'
                  : 'w-1.5 bg-black/20 dark:bg-white/20'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Horizontal scrolling strip with circular navigation buttons */}
      <div className="relative w-full">
        {/* Previous Arrow Button (circular, centered over edge at sm+, hidden on mobile) */}
        <button
          type="button"
          onClick={() => handleScroll('left')}
          disabled={!canScrollLeft}
          aria-label="Previous"
          className={`hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 min-h-11 min-w-11 w-11 h-11 rounded-full overlay-panel items-center justify-center text-[#1A1A1E] dark:text-[#F5F5F7] shadow-lg transition-all duration-200 cursor-pointer ${
            !canScrollLeft
              ? 'opacity-0 pointer-events-none'
              : 'opacity-100 hover:scale-105 active:scale-95 hover:border-[#FF8800]'
          }`}
        >
          <ChevronLeft size={20} className="text-[#F86A00]" />
        </button>

        {/* Next Arrow Button (circular, centered over edge at sm+, hidden on mobile) */}
        <button
          type="button"
          onClick={() => handleScroll('right')}
          disabled={!canScrollRight}
          aria-label="Next"
          className={`hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 min-h-11 min-w-11 w-11 h-11 rounded-full overlay-panel items-center justify-center text-[#1A1A1E] dark:text-[#F5F5F7] shadow-lg transition-all duration-200 cursor-pointer ${
            !canScrollRight
              ? 'opacity-0 pointer-events-none'
              : 'opacity-100 hover:scale-105 active:scale-95 hover:border-[#FF8800]'
          }`}
        >
          <ChevronRight size={20} className="text-[#F86A00]" />
        </button>

        {/* Horizontal scrolling strip */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar select-none scroll-smooth snap-x snap-mandatory scroll-px-4"
        >
          {featuredCards.map((card) => (
            <div
              key={card.id}
              onClick={() => onSelectFeature && onSelectFeature(card)}
              className="snap-start group shrink-0 w-[220px] sm:w-[250px] p-2.5 rounded-2xl glass-panel border border-[#FF8800]/20 hover:border-[#FF8800] transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer flex flex-col gap-2"
            >
              {/* Thumbnail + Badges */}
              <div className="relative w-full h-24 rounded-xl overflow-hidden bg-black/10 dark:bg-white/5">
                <img
                  src={card.imageUrl}
                  alt={card.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

                {/* Type pill */}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md flex items-center gap-1">
                  {getTypeIcon(card.type)}
                  <span className="text-[10px] font-bold text-white capitalize">{card.type}</span>
                </div>

                {/* Status pill */}
                <div
                  className={`absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold border ${getBadgeStyle(
                    card.badgeType
                  )}`}
                >
                  {card.badge}
                </div>

                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg bg-brand-gradient text-white shadow-sm">
                  <ArrowRight size={12} />
                </div>
              </div>

              {/* Information */}
              <div className="flex flex-col">
                <h4 className="jost text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] group-hover:text-[#F86A00] transition-colors truncate">
                  {card.title}
                </h4>
                <p className="inter text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] line-clamp-1 mt-0.5">
                  {card.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
