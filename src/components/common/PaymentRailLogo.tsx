// Bidou AI - MTN MoMo & Orange Money Vector Logos
import React from 'react';
import { PaymentRail } from '../../types';

export interface PaymentRailLogoProps {
  rail: PaymentRail;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const PaymentRailLogo: React.FC<PaymentRailLogoProps> = ({
  rail,
  className = '',
  size = 'md',
  showLabel = false,
}) => {
  const dimensions = {
    xs: { h: 16, w: 26, text: 'text-[9px]' },
    sm: { h: 22, w: 34, text: 'text-[10px]' },
    md: { h: 28, w: 44, text: 'text-xs' },
    lg: { h: 36, w: 58, text: 'text-sm' },
  }[size];

  if (rail === 'mtn_momo') {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        {/* Crisp MTN MoMo SVG */}
        <div
          style={{ width: dimensions.w, height: dimensions.h }}
          className="rounded-lg bg-[#FFCC00] flex items-center justify-center p-0.5 shadow-sm shrink-0 border border-[#E6B800]"
          title="MTN Mobile Money"
        >
          <svg viewBox="0 0 100 60" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Dark navy pill oval */}
            <rect x="6" y="8" width="88" height="44" rx="22" stroke="#002B49" strokeWidth="5" fill="#FFCC00" />
            {/* MTN Bold Text */}
            <text
              x="50"
              y="38"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="24"
              fontWeight="900"
              fontStyle="italic"
              fill="#002B49"
              textAnchor="middle"
              letterSpacing="-0.5"
            >
              MTN
            </text>
          </svg>
        </div>
        {showLabel && (
          <span className={`font-bold text-[#1A1A1E] dark:text-[#F5F5F7] ${dimensions.text}`}>
            MTN MoMo
          </span>
        )}
      </div>
    );
  }

  // Orange Money
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Crisp Orange Money SVG */}
      <div
        style={{ width: dimensions.w, height: dimensions.h }}
        className="rounded-lg bg-[#000000] flex items-center justify-center p-1 shadow-sm shrink-0 border border-[#2A2A2E]"
        title="Orange Money"
      >
        <svg viewBox="0 0 100 60" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Orange Brand Square */}
          <rect x="12" y="10" width="40" height="40" rx="6" fill="#FF7900" />
          {/* Accent White Lines in Orange Square */}
          <rect x="20" y="26" width="24" height="8" rx="2" fill="#FFFFFF" />
          {/* 'OM' or 'Money' representation in text */}
          <text
            x="74"
            y="39"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="26"
            fontWeight="900"
            fill="#FF7900"
            textAnchor="middle"
          >
            M
          </text>
        </svg>
      </div>
      {showLabel && (
        <span className={`font-bold text-[#1A1A1E] dark:text-[#F5F5F7] ${dimensions.text}`}>
          Orange Money
        </span>
      )}
    </div>
  );
};
