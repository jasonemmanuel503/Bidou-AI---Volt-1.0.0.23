import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export interface CountUpStatProps {
  value: number;
  duration?: number;
  formatter?: (n: number) => string;
  className?: string;
}

export const CountUpStat: React.FC<CountUpStatProps> = ({
  value,
  duration = 1.8,
  formatter = (n: number) => Math.round(n).toLocaleString(),
  className = '',
}) => {
  const elementRef = useRef<HTMLSpanElement>(null);
  const currentValRef = useRef<{ val: number }>({ val: 0 });

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.to(currentValRef.current, {
        val: value,
        duration,
        ease: 'power2.out',
        onUpdate: () => {
          if (el) {
            el.textContent = formatter(currentValRef.current.val);
          }
        },
      });
    }, elementRef);

    return () => ctx.revert();
  }, [value, duration, formatter]);

  return (
    <span ref={elementRef} className={className}>
      {formatter(value)}
    </span>
  );
};
