// Bidou AI Discovery Feed
import React, { useState } from 'react';
import { Compass, Sparkles, Filter, Video, Image as ImageIcon, Music } from 'lucide-react';
import { ShowcaseCarousel, ShowcaseItem } from '../landing/ShowcaseCarousel';

export interface DiscoveryFeedProps {
  onRemixPrompt: (prompt: string, type: 'image' | 'video' | 'music') => void;
}

export const DiscoveryFeed: React.FC<DiscoveryFeedProps> = ({ onRemixPrompt }) => {
  // Video category filter (Cinematic / Nature / Portrait / Commercial / Action)
  const videoCategories = ['All', 'Cinematic', 'Nature & Drone', 'Portrait', 'Commercial & Ads', 'Futurism'];
  const [videoCategory, setVideoCategory] = useState('All');

  // Community Curated Video Items
  const videoItems: ShowcaseItem[] = [
    {
      id: 'disc_vid_1',
      type: 'video',
      title: 'Mount Cameroon Golden Sunrise',
      prompt: 'Cinematic aerial drone flight rising through morning mist over volcanic slopes in Buea, golden hour sunbeams, realistic physics 60fps',
      model: 'Google Veo 3.1',
      category: 'Nature & Drone',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4',
      author: 'Kevin T. (Buea)',
      likes: 184,
    },
    {
      id: 'disc_vid_2',
      type: 'video',
      title: 'Yaoundé Cyberpunk High-Speed Rail',
      prompt: 'Hyperlapse tracking sleek magnetic train soaring past neon-lit Ndop pattern highrises at night, reflections in rain puddles',
      model: 'Google Veo 3.1',
      category: 'Futurism',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-city-traffic-at-night-aerial-view-40992-large.mp4',
      author: 'Samuel K. (Yaoundé)',
      likes: 219,
    },
    {
      id: 'disc_vid_3',
      type: 'video',
      title: 'Kribi Ocean Sunset Surge',
      prompt: 'Slow-motion 120fps Atlantic ocean waves crashing against golden sandy shoreline of Grand Batanga, warm equatorial light',
      model: 'Google Veo 3.1',
      category: 'Cinematic',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4',
      author: 'Amina D. (Kribi)',
      likes: 156,
    },
    {
      id: 'disc_vid_4',
      type: 'video',
      title: 'Equatorial Rain Canopy',
      prompt: 'Dense emerald rainforest canopy in Dja Biosphere Reserve with gentle tropical rainfall creating realistic water droplets on leaves',
      model: 'Google Veo 3.1',
      category: 'Nature & Drone',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-tree-branches-in-the-breeze-1188-large.mp4',
      author: 'Boris M. (Douala)',
      likes: 112,
    },
    {
      id: 'disc_vid_5',
      type: 'video',
      title: 'Ndop Haute Couture Runway',
      prompt: 'High fashion runway model strutting wearing avant-garde sculptural indigo Ndop gown with floating illuminated silk ribbons',
      model: 'Google Veo 3.1',
      category: 'Portrait',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-portrait-of-a-fashion-woman-with-silver-makeup-39875-large.mp4',
      author: 'Chantal E. (Douala)',
      likes: 304,
    },
    {
      id: 'disc_vid_6',
      type: 'video',
      title: 'African Coffee Luxury Ad',
      prompt: 'Macro commercial close-up of dark roasted highland Arabica coffee beans pouring into copper filter, steaming crema rising',
      model: 'Google Veo 3.1',
      category: 'Commercial & Ads',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-coffee-beans-falling-into-a-bowl-43403-large.mp4',
      author: 'Paul B. (Bafoussam)',
      likes: 98,
    },
  ];

  // Community Curated Image Items
  const imageItems: ShowcaseItem[] = [
    {
      id: 'disc_img_1',
      type: 'image',
      title: 'Afrofuturistic Royal Queen',
      prompt: 'Regal African queen with intricate luminous gold and glowing cyan Ndop headpiece, high fashion editorial, volumetric studio lighting, 8k resolution',
      model: 'Google Nano Banana',
      mediaUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
      author: 'Amina D. (Kribi)',
      likes: 342,
    },
    {
      id: 'disc_img_2',
      type: 'image',
      title: 'Yaoundé Cyberpunk Market',
      prompt: 'Bustling night market in Yaoundé with neon holograms of African geometric patterns, wet asphalt reflections, rich cinematic depth',
      model: 'Google Nano Banana',
      mediaUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
      author: 'Samuel K. (Yaoundé)',
      likes: 215,
    },
    {
      id: 'disc_img_3',
      type: 'image',
      title: 'Sahel Golden Sand Architecture',
      prompt: 'Futuristic adobe eco-palace nestled in golden desert dunes under celestial stargazing galaxy, warm candlelight illumination',
      model: 'Google Nano Banana',
      mediaUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
      author: 'Moussa H. (Maroua)',
      likes: 198,
    },
    {
      id: 'disc_img_4',
      type: 'image',
      title: 'Equatorial Botanicals & Flora',
      prompt: 'Lush tropical rainforest flowers with bioluminescent morning dew drops, macro botanical photography, 8k hyper-detail',
      model: 'Google Nano Banana',
      mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
      author: 'Clarisse T. (Limbe)',
      likes: 177,
    },
  ];

  // Community Curated Music Items
  const musicItems: ShowcaseItem[] = [
    {
      id: 'disc_mus_1',
      type: 'music',
      title: 'Douala Sunset Groove',
      prompt: 'Makossa slap bassline combined with smooth brass horns and celebratory vocals singing about evening joy on the Wouri coast',
      model: 'Sonic v5',
      genre: 'Makossa',
      mediaUrl: '/samples/demo-track.mp3',
      author: 'Yannick N. (Douala)',
      likes: 245,
    },
    {
      id: 'disc_mus_2',
      type: 'music',
      title: 'Bikutsi Velocity Drive',
      prompt: 'Fast 6/8 balafon acoustic syncopation paired with hyper-speed polyrhythmic percussion and electric rhythm guitar',
      model: 'Sonic v5',
      genre: 'Bikutsi',
      mediaUrl: '/samples/demo-track-2.mp3',
      author: 'Jean-Paul O. (Yaoundé)',
      likes: 312,
    },
    {
      id: 'disc_mus_3',
      type: 'music',
      title: 'Yaoundé Mbolé Street Pulse',
      prompt: 'Street percussion recorded live with iron bell clangs, modern deep synth sub-bass, and call-and-response vocal chants',
      model: 'Sonic v5',
      genre: 'Mbolé',
      mediaUrl: '/samples/demo-track.mp3',
      author: 'Junior B. (Yaoundé)',
      likes: 420,
    },
    {
      id: 'disc_mus_4',
      type: 'music',
      title: 'Nollywood Orchestral Theme',
      prompt: 'African cinematic orchestral strings infused with talking drums, dramatic suspense brass, and choral harmonies',
      model: 'Sonic v5',
      genre: 'African Cinematic',
      mediaUrl: '/samples/demo-track-2.mp3',
      author: 'Emeka A. (Lagos)',
      likes: 189,
    },
  ];

  return (
    <div className="w-full flex flex-col gap-10 py-6">
      {/* Feed Intro Header */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#FF8800]/15 pb-4">
        <div>
          <h2 className="jost text-2xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-2.5">
            <Compass className="text-[#F86A00]" size={24} />
            <span>Community Discovery Canvases</span>
          </h2>
          <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
            Explore and remix prompts, video takes, and musical compositions generated across Africa.
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. VIDEO CANVAS (1-2 rows with category filter control above it per 3.6)   */}
      {/* ========================================================================= */}
      <section id="community-video-canvas" className="w-full">
        <ShowcaseCarousel
          mediaType="video"
          title="Community Video Canvas"
          subtitle="Google Veo 3.1 cinematic sequences with real-time motion and depth"
          items={videoItems}
          categories={videoCategories}
          activeCategory={videoCategory}
          onCategoryChange={setVideoCategory}
          layoutMode="grid-two-rows"
          onCardClick={(item) => onRemixPrompt(item.prompt, 'video')}
        />
      </section>

      {/* ========================================================================= */}
      {/* 2. IMAGE CANVAS (Independent section & heading per 3.6)                   */}
      {/* ========================================================================= */}
      <section id="community-image-canvas" className="w-full border-t border-[#FF8800]/10 pt-4">
        <ShowcaseCarousel
          mediaType="image"
          title="Community Visual Image Canvas"
          subtitle="Google Nano Banana 4K African portraiture, fashion, and architecture"
          items={imageItems}
          layoutMode="carousel"
          onCardClick={(item) => onRemixPrompt(item.prompt, 'image')}
        />
      </section>

      {/* ========================================================================= */}
      {/* 3. MUSIC CANVAS (Independent section & heading per 3.6)                   */}
      {/* ========================================================================= */}
      <section id="community-music-canvas" className="w-full border-t border-[#FF8800]/10 pt-4">
        <ShowcaseCarousel
          mediaType="music"
          title="Community African Sound Canvas"
          subtitle="Sonic v5 native rhythms, slap basslines, and brass arrangements"
          items={musicItems}
          layoutMode="carousel"
          onCardClick={(item) => onRemixPrompt(item.prompt, 'music')}
        />
      </section>
    </div>
  );
};
