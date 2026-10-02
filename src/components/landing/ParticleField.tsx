import React, { useEffect, useRef } from 'react';
import { gsap } from '../../lib/gsap';

export const ParticleField: React.FC<{ count?: number }> = ({ count = 28 }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const particles: HTMLDivElement[] = [];
    const ctx = gsap.context(() => {
      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className =
          'absolute rounded-full bg-gradient-to-br from-[#F86A00]/40 to-[#FFB020]/30 pointer-events-none';
        const size = gsap.utils.random(3, 8);
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.left = `${gsap.utils.random(0, 100)}%`;
        p.style.top = `${gsap.utils.random(0, 100)}%`;
        p.style.opacity = '0.6';
        container.appendChild(p);
        particles.push(p);

        // Design note: Using onComplete to reset via gsap.set and re-randomize each cycle
        // creates an organic, continuously drifting embers effect without instant snap-back.
        const animate = () => {
          gsap.set(p, { x: 0, y: 0, opacity: 0.6 });
          gsap.to(p, {
            y: gsap.utils.random(-150, -50),
            x: gsap.utils.random(-30, 30),
            opacity: 0,
            duration: gsap.utils.random(3, 6),
            ease: 'power1.out',
            onComplete: animate, // reset & loop with fresh random values each cycle
          });
        };
        animate();
      }
    }, container);

    return () => {
      ctx.revert();
      particles.forEach((p) => p.remove());
    };
  }, [count]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none z-0"
      aria-hidden="true"
    />
  );
};
