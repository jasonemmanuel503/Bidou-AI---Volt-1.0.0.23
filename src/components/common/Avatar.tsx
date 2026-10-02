import React, { useState } from 'react';

export interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

const sizeClasses: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', { box: string; text: string; px: number }> = {
  xs: { box: 'w-6 h-6 rounded-full', text: 'text-[10px]', px: 24 },
  sm: { box: 'w-8 h-8 rounded-full', text: 'text-xs', px: 32 },
  md: { box: 'w-10 h-10 rounded-full', text: 'text-sm', px: 40 },
  lg: { box: 'w-12 h-12 rounded-full', text: 'text-base', px: 48 },
  xl: { box: 'w-20 h-20 rounded-full', text: 'text-2xl', px: 80 },
};

/**
 * Avatar component (TASK 4)
 * - Circular preview
 * - Renders user.avatar_url when present; falls back to initial.
 * - onError swaps back to the initial so a dead URL never shows a broken image.
 */
export const Avatar: React.FC<AvatarProps> = ({
  name,
  avatarUrl,
  size = 'sm',
  className = '',
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);
  const initial = (name || 'U').trim().charAt(0).toUpperCase();
  const config = sizeClasses[size] || sizeClasses.sm;

  // Apply cache-busting parameter to http/https URLs if not already versioned or a data/blob url
  const resolvedUrl = React.useMemo(() => {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('data:') || avatarUrl.startsWith('blob:')) return avatarUrl;
    // For external/stored remote avatars, ensure cache-busting if not already present
    if (!avatarUrl.includes('?v=') && !avatarUrl.includes('&v=')) {
      const separator = avatarUrl.includes('?') ? '&' : '?';
      return `${avatarUrl}${separator}v=${Date.now()}`;
    }
    return avatarUrl;
  }, [avatarUrl]);

  if (resolvedUrl && !imgError) {
    return (
      <div
        onClick={onClick}
        className={`relative overflow-hidden shrink-0 shadow-sm border border-[#FF8800]/20 bg-black/5 dark:bg-white/5 ${config.box} ${className} ${
          onClick ? 'cursor-pointer' : ''
        }`}
      >
        <img
          src={resolvedUrl}
          alt={name}
          width={config.px}
          height={config.px}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover select-none"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`shrink-0 bg-brand-gradient text-white flex items-center justify-center font-bold shadow-sm select-none ${config.box} ${config.text} ${className} ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      {initial}
    </div>
  );
};
