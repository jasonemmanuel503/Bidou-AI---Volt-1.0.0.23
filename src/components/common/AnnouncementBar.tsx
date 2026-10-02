import React, { useState } from 'react';
import { Sparkles, ArrowRight, X, Megaphone } from 'lucide-react';

export interface AnnouncementBarProps {
  message?: React.ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const AnnouncementBar: React.FC<AnnouncementBarProps> = ({
  message = 'Special Launch Offer: Enjoy +25% bonus credits on all MTN & Orange Mobile Money top-ups this week!',
  ctaLabel = 'Top Up Now',
  onCta,
  onDismiss,
  className = '',
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  return (
    <div
      id="announcement-bar"
      className={`w-full bg-[#FFF9E6] dark:bg-[#2C2106] border-b border-[#F5BE38]/40 dark:border-[#916B00]/40 text-[#5C4100] dark:text-[#FFDF78] px-3 sm:px-4 py-2 flex items-center justify-between text-xs transition-all z-20 ${className}`}
    >
      <div className="flex items-center gap-2 overflow-hidden flex-1 mr-3 min-w-0">
        <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-md bg-[#F5BE38]/30 dark:bg-[#F5BE38]/20 text-[#855D00] dark:text-[#FFDF78]">
          <Megaphone size={12} />
        </span>
        <span className="font-medium truncate leading-tight text-[11px] sm:text-xs min-w-0">
          {message}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {ctaLabel && onCta && (
          <button
            type="button"
            onClick={onCta}
            className="inline-flex items-center gap-1 font-bold text-[11px] sm:text-xs underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer py-1 px-1.5 shrink-0 whitespace-nowrap"
          >
            <span>{ctaLabel}</span>
            <ArrowRight size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded-md text-[#855D00] dark:text-[#FFDF78] hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer shrink-0"
          aria-label="Dismiss Announcement"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};
