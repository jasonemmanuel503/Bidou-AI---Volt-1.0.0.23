import React, { useState } from 'react';

export interface BidouLogoProps {
  variant?: 'auto' | 'light' | 'dark' | 'light-transparent' | 'dark-transparent' | 'light-bg' | 'dark-bg';
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

/**
 * BidouLogo
 * Renders the official brand icon marks:
 * - Light Mode: /brand/Light Mode.png & /brand/Light Mode.jpeg
 * - Dark Mode:  /brand/Dark Mode.png & /brand/Dark Mode.jpeg
 * 
 * Preserves ultra-high 2048x2048 asset fidelity with zero truncation or pixelation across all devices.
 */
export const BidouLogo: React.FC<BidouLogoProps> = ({
  variant = 'auto',
  size = 36,
  showWordmark = false,
  className = '',
}) => {
  // Official uploaded asset paths
  const lightModeSrc = '/brand/light-mode.png';
  const darkModeSrc = '/brand/dark-mode.png';

  const renderMark = () => {
    // 1. Explicit Dark Mode variant
    if (variant === 'dark' || variant === 'dark-transparent' || variant === 'dark-bg') {
      return (
        <img
          src={darkModeSrc}
          alt="Bidou AI"
          width={size}
          height={size}
          className="object-contain select-none pointer-events-none transition-opacity duration-150"
          style={{
            width: size,
            height: size,
            aspectRatio: '1 / 1',
          }}
          loading="eager"
          decoding="async"
        />
      );
    }

    // 2. Explicit Light Mode variant
    if (variant === 'light' || variant === 'light-transparent' || variant === 'light-bg') {
      return (
        <img
          src={lightModeSrc}
          alt="Bidou AI"
          width={size}
          height={size}
          className="object-contain select-none pointer-events-none transition-opacity duration-150"
          style={{
            width: size,
            height: size,
            aspectRatio: '1 / 1',
          }}
          loading="eager"
          decoding="async"
        />
      );
    }

    // 3. Default 'auto': Responsive swap between light and dark modes via Tailwind classes
    return (
      <>
        {/* Light theme logo: Light Mode asset */}
        <img
          src={lightModeSrc}
          alt="Bidou AI"
          width={size}
          height={size}
          className="dark:hidden object-contain select-none pointer-events-none transition-opacity duration-150"
          style={{
            width: size,
            height: size,
            aspectRatio: '1 / 1',
          }}
          loading="eager"
          decoding="async"
        />

        {/* Dark theme logo: Dark Mode asset */}
        <img
          src={darkModeSrc}
          alt="Bidou AI"
          width={size}
          height={size}
          className="hidden dark:block object-contain select-none pointer-events-none transition-opacity duration-150"
          style={{
            width: size,
            height: size,
            aspectRatio: '1 / 1',
          }}
          loading="eager"
          decoding="async"
        />
      </>
    );
  };

  return (
    <div className={`inline-flex items-center select-none ${className}`}>
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        {renderMark()}
      </div>
      {showWordmark && null}
    </div>
  );
};


