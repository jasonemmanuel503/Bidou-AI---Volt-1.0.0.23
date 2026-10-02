import React from 'react';
import { BidouLogo } from './BidouLogo';

export interface BrandedLoaderProps {
  label?: string;
  sublabel?: string;
  size?: number;
  className?: string;
}

export const BrandedLoader: React.FC<BrandedLoaderProps> = ({
  label = 'Synthesizing with Bidou AI...',
  sublabel,
  size = 48,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-6 text-center select-none ${className}`}>
      <div className="relative flex items-center justify-center mb-4">
        {/* Pulsing halo */}
        <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-[#F86A00]/30 via-[#FF8800]/20 to-[#FFB020]/30 blur-md animate-pulse" />

        {/* Floating branded mark */}
        <div className="relative animate-bounce duration-1000">
          <BidouLogo size={size} showWordmark={false} variant="auto" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="jost text-sm font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-wide animate-pulse">
          {label}
        </span>
        {sublabel && (
          <span className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};
