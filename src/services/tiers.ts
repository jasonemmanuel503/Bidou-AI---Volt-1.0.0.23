import { PlanTier } from '../types';
import { LucideIcon, Image as ImageIcon, Video as VideoIcon, Music as MusicIcon } from 'lucide-react';

export const TIER_RANK: Record<PlanTier, number> = {
  free: 0,
  starter: 1,
  creator: 2,
  pro: 3,
  studio: 4,
};

export const TIER_VARIANT_CAP: Record<PlanTier, number> = {
  free: 1,
  starter: 2,
  creator: 3,
  pro: 4,
  studio: 4,
};

export const TIER_LABEL: Record<PlanTier, string> = {
  free: 'Free',
  starter: 'Starter',
  creator: 'Creator',
  pro: 'Pro',
  studio: 'Studio',
};

// Each tier gets its own gradient so the badge reads at a glance.
export const TIER_GRADIENT: Record<PlanTier, string> = {
  free:    'from-[#6B6B75] to-[#A0A0AA]',
  starter: 'from-[#FFB020] to-[#FF8800]',
  creator: 'from-[#FF8800] to-[#F86A00]',
  pro:     'from-[#F86A00] to-[#C2410C]',
  studio:  'from-[#F86A00] via-[#FFB020] to-[#F86A00]',
};

export const TIER_THRESHOLDS_FCFA: Array<[PlanTier, number]> = [
  ['studio', 42000],
  ['pro', 16000],
  ['creator', 5400],
  ['starter', 2000],
  ['free', 0],
];

export function tierForLifetimeSpend(totalFcfa: number): PlanTier {
  for (const [tier, threshold] of TIER_THRESHOLDS_FCFA) {
    if (totalFcfa >= threshold) {
      return tier;
    }
  }
  return 'free';
}

/** Never demote: used everywhere a tier is written. */
export function promoteOnly(current: PlanTier, computed: PlanTier): PlanTier {
  return TIER_RANK[computed] > TIER_RANK[current] ? computed : current;
}

export type MediaTabType = 'image' | 'video' | 'music';

export interface MediaBadgeMeta {
  media: MediaTabType;
  label: string;
  icon: LucideIcon;
  gradient: string;
}

export const MEDIA_BADGE: Record<MediaTabType, MediaBadgeMeta> = {
  image: {
    media: 'image',
    label: 'Image',
    icon: ImageIcon,
    gradient: 'from-[#FF8800] to-[#FFB020]',
  },
  video: {
    media: 'video',
    label: 'Video',
    icon: VideoIcon,
    gradient: 'from-[#F86A00] to-[#E05600]',
  },
  music: {
    media: 'music',
    label: 'Music',
    icon: MusicIcon,
    gradient: 'from-[#FFB020] to-[#F86A00]',
  },
};
