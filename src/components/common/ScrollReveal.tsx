import React, { useRef, useEffect } from 'react';
import { gsap, ScrollTrigger } from '../../lib/gsap';

export interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  y?: number;          // default 40
  duration?: number;   // default 0.6
  delay?: number;      // default 0
  start?: string;       // default 'top 80%'
  as?: keyof React.JSX.IntrinsicElements; // default 'div'
}

export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  className = '',
  y = 40,
  duration = 0.6,
  delay = 0,
  start = 'top 80%',
  as = 'div',
}) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      gsap.set(el, { opacity: 1, y: 0 });
      return;
    }
    const ctx = gsap.context(() => {
      gsap.from(el, {
        opacity: 0,
        y,
        duration,
        delay,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start, once: true },
      });
    }, el);
    return () => ctx.revert();
  }, [y, duration, delay, start]);

  const Tag = as as any;
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
};
