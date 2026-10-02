import React, { useEffect, useRef } from 'react';
import { gsap } from '../../lib/gsap';
import { BidouLogo } from './BidouLogo';

export interface ProgressRingProps {
  targetPercent: number; // 0-100, the live `modelled`/`progressPct` value from the parent
  size?: number;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({ targetPercent, size = 96 }) => {
  const displayRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef({ val: 0 });

  useEffect(() => {
    const tween = gsap.to(counterRef.current, {
      val: targetPercent,
      duration: 0.8,
      ease: 'power2.inOut',
      onUpdate: () => {
        const v = Math.round(counterRef.current.val);
        if (displayRef.current) displayRef.current.textContent = `${v}%`;
        if (barRef.current) barRef.current.style.width = `${counterRef.current.val}%`;
      },
    });
    return () => {
      tween.kill();
    };
  }, [targetPercent]);

  const circumference = 2 * Math.PI * ((size - 8) / 2);

  return (
    <div
      className="relative flex flex-col items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90 absolute inset-0 pointer-events-none">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - 8) / 2}
          fill="none"
          strokeWidth={6}
          className="stroke-black/10 dark:stroke-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - 8) / 2}
          fill="none"
          strokeWidth={6}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * targetPercent) / 100}
          strokeLinecap="round"
          className="stroke-[#F86A00] transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <BidouLogo size={size * 0.4} showWordmark={false} variant="auto" />
      <span
        ref={displayRef}
        className="jost text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7] absolute bottom-1 tabular-nums"
      >
        0%
      </span>
      {/* Hidden ref target kept for parity with linear-bar consumers if reused elsewhere */}
      <div ref={barRef} className="hidden" />
    </div>
  );
};
