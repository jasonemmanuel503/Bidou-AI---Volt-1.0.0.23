import { useState, useEffect, RefObject } from 'react';

/**
 * ResizeObserver hook that returns the content-box width of a referenced element.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentBoxSize && entry.contentBoxSize.length > 0) {
          setWidth(entry.contentBoxSize[0].inlineSize);
        } else if (entry.contentRect) {
          setWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(element);
    // Initial sync measurement
    if (element.clientWidth > 0) {
      setWidth(element.clientWidth);
    }

    // First-frame fallback in case ResizeObserver never fires
    const rafId = requestAnimationFrame(() => {
      setWidth((prev) => {
        if (prev > 0) return prev;
        const measured =
          element.clientWidth ||
          Math.floor(element.getBoundingClientRect().width) ||
          (typeof window !== 'undefined' ? window.innerWidth : 1024);
        return measured > 0 ? measured : 1024;
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [ref]);

  return width;
}
