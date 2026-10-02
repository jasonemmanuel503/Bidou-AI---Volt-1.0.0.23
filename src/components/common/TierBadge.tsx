import React from 'react';
import { Crown } from 'lucide-react';
import { PlanTier } from '../../types';
import { TIER_GRADIENT, TIER_LABEL, MEDIA_BADGE, MediaTabType } from '../../services/tiers';

export interface TierBadgeProps {
  tier: PlanTier;
  mediaBadges?: ('image' | 'video' | 'music')[];
  size?: 'sm' | 'md';
  className?: string;
  showMediaBadges?: boolean;
}

export const TierBadge: React.FC<TierBadgeProps> = ({
  tier,
  mediaBadges = [],
  size = 'sm',
  className = '',
  showMediaBadges = true,
}) => {
  const isCrownTier = tier === 'pro' || tier === 'studio';
  const label = TIER_LABEL[tier] || tier;

  const sizeClasses =
    size === 'md'
      ? 'px-2.5 py-0.5 text-[11px]'
      : 'px-2 py-0.5 text-[10px]';

  const iconSize = size === 'md' ? 12 : 10;
  const mediaIconSize = size === 'md' ? 11 : 9;

  const validMedia = (mediaBadges || []).slice(0, 3).filter((m) => Boolean(MEDIA_BADGE[m as MediaTabType]));

  const tierPill = tier === 'free' ? (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-extrabold uppercase tracking-wider bg-black/10 dark:bg-white/10 text-[#6B6B75] dark:text-[#A0A0AA] border border-black/5 dark:border-white/5 ${sizeClasses}`}
    >
      <span>{label}</span>
    </span>
  ) : (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-extrabold uppercase tracking-wider text-white shadow-xs bg-gradient-to-r ${
        TIER_GRADIENT[tier] || 'from-[#FF8800] to-[#F86A00]'
      } ${sizeClasses}`}
    >
      {isCrownTier && <Crown size={iconSize} className="shrink-0 text-white/90" />}
      <span>{label}</span>
    </span>
  );

  if (!showMediaBadges || validMedia.length === 0) {
    return <span className={`inline-flex items-center ${className}`}>{tierPill}</span>;
  }

  return (
    <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {tierPill}
      {validMedia.map((m) => {
        const meta = MEDIA_BADGE[m as MediaTabType];
        const Icon = meta.icon;
        return (
          <span
            key={m}
            title={`${meta.label} Studio Milestone (5+ Completed)`}
            className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider text-white bg-gradient-to-r ${meta.gradient} shadow-xs ${
              size === 'md' ? 'px-2 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[9px]'
            }`}
          >
            <Icon size={mediaIconSize} className="shrink-0" />
            <span>{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
};

