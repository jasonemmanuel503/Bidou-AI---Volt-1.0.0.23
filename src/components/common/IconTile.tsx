import React from 'react';

export type IconTileTone = 'primary' | 'secondary' | 'amber' | 'green' | 'purple' | 'neutral';
export type IconTileSize = 'sm' | 'md' | 'lg';

export interface IconTileProps {
  icon: React.ReactNode;
  tone?: IconTileTone;
  size?: IconTileSize;
  className?: string;
  ariaHidden?: boolean;
}

const toneStyles: Record<IconTileTone, string> = {
  primary: 'bg-[#F86A00]/15 text-[#F86A00]',
  secondary: 'bg-[#FF8800]/15 text-[#FF8800]',
  amber: 'bg-[#FFB020]/15 text-[#FFB020]',
  green: 'bg-[#2ECC71]/15 text-[#2ECC71]',
  purple: 'bg-[#9B51E0]/15 text-[#9B51E0]',
  neutral: 'bg-black/5 dark:bg-white/5 text-[#6B6B75] dark:text-[#A0A0AA]',
};

const sizeStyles: Record<IconTileSize, string> = {
  sm: 'w-8 h-8 rounded-xl text-sm',
  md: 'w-10 h-10 rounded-xl text-base',
  lg: 'w-12 h-12 rounded-2xl text-lg',
};

export const IconTile: React.FC<IconTileProps> = ({
  icon,
  tone = 'primary',
  size = 'lg',
  className = '',
  ariaHidden = true,
}) => {
  return (
    <div
      aria-hidden={ariaHidden}
      className={`shrink-0 flex items-center justify-center font-bold shadow-xs transition-colors ${sizeStyles[size]} ${toneStyles[tone]} ${className}`}
    >
      {icon}
    </div>
  );
};
