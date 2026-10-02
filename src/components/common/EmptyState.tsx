import React from 'react';
import { Sparkles, FolderPlus, Compass, Music, Video, Image as ImageIcon } from 'lucide-react';

export type EmptyStateVariant =
  | 'no_generations_image'
  | 'no_generations_video'
  | 'no_generations_music'
  | 'empty_project'
  | 'empty_showcase'
  | 'empty_transactions';

export interface EmptyStateProps {
  variant: EmptyStateVariant;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const getVariantData = () => {
    switch (variant) {
      case 'no_generations_image':
        return {
          icon: <ImageIcon size={28} className="text-[#F86A00]" />,
          defaultTitle: 'Ready to create your first visual masterwork',
          defaultDesc: 'Enter a prompt or upload an inspiration image to synthesize cinematic visuals with Google Nano Banana.',
        };
      case 'no_generations_video':
        return {
          icon: <Video size={28} className="text-[#FF8800]" />,
          defaultTitle: 'Direct your first cinematic scene',
          defaultDesc: 'Compose fluid 720p or 1080p single-shot clips powered by Google Veo 3.1 with realistic atmospheric lighting.',
        };
      case 'no_generations_music':
        return {
          icon: <Music size={28} className="text-[#FFB020]" />,
          defaultTitle: 'Compose studio tracks with authentic African rhythms',
          defaultDesc: 'Choose Makossa, Bikutsi, Amapiano or Afrobeats, craft custom lyrics or use AI assistance, and get 2 full takes.',
        };
      case 'empty_project':
        return {
          icon: <FolderPlus size={28} className="text-[#F86A00]" />,
          defaultTitle: 'Your creative vault is empty',
          defaultDesc: 'Group your generated media, soundtrack takes, and visual references into organized project folders.',
        };
      case 'empty_showcase':
        return {
          icon: <Compass size={28} className="text-[#FF8800]" />,
          defaultTitle: 'Curated creative feed',
          defaultDesc: 'Freshly synthesized community generations will appear here once approved by our moderation queue.',
        };
      case 'empty_transactions':
        return {
          icon: <Sparkles size={28} className="text-[#FFB020]" />,
          defaultTitle: 'No credit ledger activity yet',
          defaultDesc: 'Your top-ups via MTN Mobile Money or Orange Money and generation holds will be recorded immutably here.',
        };
    }
  };

  const { icon, defaultTitle, defaultDesc } = getVariantData();

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-auto select-none">
      {/* Branded Studio Mascot Canvas Illustration */}
      <div className="relative mb-5 flex items-center justify-center">
        {/* Ambient radial glow */}
        <div className="absolute -inset-4 bg-gradient-to-tr from-[#F86A00]/20 via-[#FF8800]/15 to-[#FFB020]/20 rounded-full blur-xl pointer-events-none" />

        {/* Mascot Silhouette Disc */}
        <div className="relative w-24 h-24 rounded-3xl glass-panel flex items-center justify-center border border-[#FF8800]/30 shadow-lg shadow-[#F86A00]/10">
          <svg viewBox="0 0 100 100" className="w-16 h-16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="mascotGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F86A00" />
                <stop offset="50%" stopColor="#FF8800" />
                <stop offset="100%" stopColor="#FFB020" />
              </linearGradient>
            </defs>
            {/* Playful Stylized Mascot Eye & Spark */}
            <circle cx="50" cy="50" r="38" stroke="url(#mascotGrad)" strokeWidth="4" strokeDasharray="6 4" opacity="0.8" />
            <path d="M42 34L64 50L42 66V34Z" fill="url(#mascotGrad)" />
            <path d="M30 74C40 70 60 78 70 74" stroke="url(#mascotGrad)" strokeWidth="3" strokeLinecap="round" />
            <path d="M26 80C38 76 62 84 74 80" stroke="url(#mascotGrad)" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
          </svg>
          <div className="absolute -bottom-1 -right-1 p-1.5 rounded-xl bg-white dark:bg-[#18181B] border border-[#FF8800]/40 shadow-sm">
            {icon}
          </div>
        </div>
      </div>

      <h3 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7] mb-2">
        {title || defaultTitle}
      </h3>
      <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed mb-5">
        {description || defaultDesc}
      </p>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-brand-gradient shadow-md shadow-[#F86A00]/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
        >
          <Sparkles size={14} />
          {actionLabel}
        </button>
      )}
    </div>
  );
};
