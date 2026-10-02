import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft } from 'lucide-react';

export interface AnchoredMenuProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  title?: string;
  headerBackAction?: {
    label?: string;
    onBack: () => void;
  };
  align?: 'left' | 'right';
  className?: string;
  desktopWidth?: number | string;
  children: React.ReactNode | ((helpers: { isMobile: boolean; close: () => void }) => React.ReactNode);
}

export const AnchoredMenu: React.FC<AnchoredMenuProps> = ({
  isOpen,
  onClose,
  triggerRef,
  title = 'Options',
  headerBackAction,
  align = 'right',
  className = '',
  desktopWidth,
  children,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const lastWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 0);

  // Position calculation for desktop fixed dropdown
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();

    // Close only if trigger completely leaves viewport
    if (
      triggerRect.bottom < 0 ||
      triggerRect.top > window.innerHeight ||
      triggerRect.right < 0 ||
      triggerRect.left > window.innerWidth
    ) {
      onClose();
      return;
    }

    const menuRect = menuRef.current.getBoundingClientRect();
    const margin = 12;
    const gap = 4;

    // Vertical placement: default below, flip above if no room below
    const spaceBelow = window.innerHeight - triggerRect.bottom - margin;
    const spaceAbove = triggerRect.top - margin;

    let top: number;
    if (spaceBelow >= menuRect.height || spaceBelow >= spaceAbove) {
      // Room below or more space below
      top = triggerRect.bottom + gap;
      if (top + menuRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - menuRect.height - margin);
      }
    } else {
      // Flip above
      top = triggerRect.top - menuRect.height - gap;
      if (top < margin) {
        top = margin;
      }
    }

    // Horizontal placement: align right or left with trigger
    let left: number;
    if (align === 'right') {
      left = triggerRect.right - menuRect.width;
    } else {
      left = triggerRect.left;
    }

    // Viewport clamping (12px margin)
    if (left + menuRect.width > window.innerWidth - margin) {
      left = window.innerWidth - menuRect.width - margin;
    }
    if (left < margin) {
      left = margin;
    }

    setCoords({ top, left });
  }, [align, onClose, triggerRef]);

  // Track window resize and viewport orientation
  useEffect(() => {
    if (!isOpen) return;

    lastWidthRef.current = window.innerWidth;
    setIsMobile(window.innerWidth < 640);

    const handleScroll = () => {
      if (window.innerWidth >= 640) {
        updatePosition();
      }
    };

    const handleResize = () => {
      const currentWidth = window.innerWidth;
      const widthChanged = currentWidth !== lastWidthRef.current;
      lastWidthRef.current = currentWidth;

      setIsMobile(currentWidth < 640);

      // Mobile URL-bar collapse fires resize on height change; only close if width changed
      if (widthChanged) {
        onClose();
      } else if (currentWidth >= 640) {
        updatePosition();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, onClose, updatePosition]);

  // Reposition immediately after render
  useLayoutEffect(() => {
    if (isOpen && !isMobile) {
      updatePosition();
    }
  }, [isOpen, isMobile, updatePosition]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  // Focus trap and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        triggerRef.current?.focus();
        return;
      }

      if (e.key === 'Tab' && menuRef.current) {
        const focusableEls = menuRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableEls.length === 0) {
          e.preventDefault();
          return;
        }
        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const renderedChildren =
    typeof children === 'function' ? children({ isMobile, close: onClose }) : children;

  return createPortal(
    <>
      {/* Backdrop for click outside (visible on mobile bottom sheet, transparent on desktop) */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs sm:bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Mobile Bottom Sheet (< 640px) */}
      <div
        ref={isMobile ? menuRef : undefined}
        role="menu"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-50 sm:hidden bg-[#FBFBFC] dark:bg-[#1A1A1E] rounded-t-2xl border-t border-[#FF8800]/30 shadow-2xl p-4 flex flex-col gap-1 max-h-[70dvh] overflow-y-auto animate-slide-up"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab Handle */}
        <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20 mx-auto mb-2 shrink-0" />

        {/* Sheet Header */}
        <div className="flex items-center justify-between pb-2 mb-1 border-b border-black/5 dark:border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            {headerBackAction && (
              <button
                type="button"
                onClick={headerBackAction.onBack}
                aria-label="Back"
                className="p-1 rounded-lg text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
              >
                <ChevronLeft size={16} />
                <span>{headerBackAction.label || 'Back'}</span>
              </button>
            )}
            <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-1 rounded-lg text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Sheet Content */}
        <div className="flex flex-col gap-1 overflow-y-auto">{renderedChildren}</div>
      </div>

      {/* Desktop Floating Menu (>= 640px) */}
      <div
        ref={!isMobile ? menuRef : undefined}
        role="menu"
        aria-label={title}
        style={{
          top: coords.top,
          left: coords.left,
          width: desktopWidth ? desktopWidth : undefined,
        }}
        className={`hidden sm:flex fixed z-50 rounded-xl shadow-2xl flex-col py-1.5 border border-[#FF8800]/25 bg-[#FBFBFC] dark:bg-[#1A1A1E] text-xs font-medium animate-fade-in ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {renderedChildren}
      </div>
    </>,
    document.body
  );
};
