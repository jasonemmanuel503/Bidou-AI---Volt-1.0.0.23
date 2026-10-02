import React from 'react';
import { Sparkles, ArrowRight, Layers, Smartphone, ShieldCheck, Zap, Image, Video, Music } from 'lucide-react';
import { IconTile } from '../common/IconTile';

export interface LandingHeroProps {
  onEnterStudio: () => void;
  onExplorePricing: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onEnterStudio,
  onExplorePricing,
}) => {
  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col items-center gap-8 sm:gap-12 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      {/* Top Banner: Platform Announcement */}
      <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full glass-panel border border-[#FF8800]/30 text-[11px] sm:text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] shadow-sm text-center max-w-full">
        <span className="w-2 h-2 rounded-full bg-[#2ECC71] animate-ping shrink-0" />
        <span className="text-brand-gradient shrink-0">The all-in-one platform</span>
        <span className="text-[#6B6B75] hidden xs:inline">•</span>
        <span className="truncate">That empowers Digital Creativity</span>
      </div>

      {/* Main Hero Header */}
      <div className="flex flex-col items-center text-center max-w-4xl gap-4">
        <h1 className="jost text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight leading-[1.15] sm:leading-[1.1]">
          The African AI Creative Studio for{' '}
          <span className="text-brand-gradient">Visuals, Cinema & Sound</span>
        </h1>
        <p className="inter text-sm sm:text-base text-[#6B6B75] dark:text-[#A0A0AA] max-w-2xl leading-relaxed px-1">
          Synthesize high-fidelity images with Google Nano Banana, direct single-shot cinematic scenes with Google Veo 3.1, and arrange authentic African music with Sonic v5. All with fair, transparent local pricing.
        </p>

        {/* Action CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onEnterStudio}
            className="w-full sm:w-auto min-h-11 flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold text-white bg-brand-gradient shadow-xl shadow-[#F86A00]/25 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles size={18} />
            <span>Open Studio — 500 Free Welcome Credits for Fast Image Models</span>
            <ArrowRight size={16} />
          </button>

          <button
            type="button"
            onClick={onExplorePricing}
            className="w-full sm:w-auto min-h-11 flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-semibold glass-panel text-[#1A1A1E] dark:text-[#F5F5F7] hover:border-[#FF8800] transition-colors cursor-pointer"
          >
            <span>View Pricing in FCFA</span>
          </button>
        </div>
      </div>

      {/* Feature Pillar Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-4">
        <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/25 flex flex-col gap-3">
          <IconTile icon={<Image size={24} />} tone="primary" size="lg" />
          <h3 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
            Google Nano Banana & FLUX
          </h3>
          <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
            Ultra-detailed visuals with volumetric atmospheric lighting, portrait & landscape ratios, and prompt enhancement.
          </p>
          <span className="text-xs font-mono font-bold text-brand-gradient mt-auto">
            From 10 credits for images
          </span>
        </div>

        <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/25 flex flex-col gap-3">
          <IconTile icon={<Video size={24} />} tone="primary" size="lg" />
          <h3 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
            Google Veo 3.1 Cinema
          </h3>
          <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
            Direct 720p & 1080p single-shot fluid scenes with dynamic camera movement and synchronized audio.
          </p>
          <span className="text-xs font-mono font-bold text-brand-gradient mt-auto">
            From 310 credits for video
          </span>
        </div>

        <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/25 flex flex-col gap-3">
          <IconTile icon={<Music size={24} />} tone="amber" size="lg" />
          <h3 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
            Sonic v5 African Music
          </h3>
          <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
            Authentic Makossa, Bikutsi, Amapiano, Afrobeats, and Mbolé rhythms. Always returns 2 full studio takes with export kit.
          </p>
          <span className="text-xs font-mono font-bold text-brand-gradient mt-auto">
            From 150 credits (2 Takes)
          </span>
        </div>
      </div>
    </div>
  );
};
