import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LucideIcon, MoreHorizontal, X } from 'lucide-react';

export type VariantAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: (e: React.MouseEvent<any>) => void;
  active?: boolean;
  danger?: boolean;
  hidden?: boolean;
};

export interface VariantActionBarProps {
  width: number; /* tile width in px */
  actions: VariantAction[];
}

export const VariantActionBar: React.FC<VariantActionBarProps> = ({ width, actions }) => {
  const [isCoarse, setIsCoarse] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(pointer: coarse)');
    setIsCoarse(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsCoarse(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  // Button size rules (Section 4.1)
  const btnSize = isCoarse ? 40 : width < 220 ? 30 : 36;
  const iconSize = btnSize >= 40 ? 18 : btnSize <= 30 ? 13 : 15;

  const visibleActions = actions.filter((a) => !a.hidden);
  // fit = Math.max(1, Math.floor((width - 16 + 4) / (btn + 4)))
  const fit = Math.max(1, Math.floor((width - 16 + 4) / (btnSize + 4)));
  const showAll = visibleActions.length <= fit;
  const inlineCount = showAll ? visibleActions.length : Math.max(0, fit - 1);
  const inlineActions = visibleActions.slice(0, inlineCount);
  const overflowActions = showAll ? [] : visibleActions.slice(inlineCount);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 192; // 12rem = w-48
    const menuHeight = overflowActions.length * 40 + 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right - menuWidth;
    if (left < 12) left = 12;
    if (left + menuWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - menuWidth - 12);
    }

    const flipUpward = rect.bottom + menuHeight > viewportHeight - 16;
    let top = flipUpward ? rect.top - menuHeight - 6 : rect.bottom + 6;
    if (top < 12) top = 12;
    if (top + menuHeight > viewportHeight - 12) {
      top = Math.max(12, viewportHeight - menuHeight - 12);
    }

    setMenuPos({ top, left });
  }, [overflowActions.length]);

  const handleCloseMenu = useCallback(() => {
    setIsMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    updateMenuPosition();

    const handleScrollOrResize = () => {
      setIsMenuOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseMenu();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsMenuOpen(false);
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen, updateMenuPosition, handleCloseMenu]);

  return (
    <>
      <div
        className={`absolute inset-x-0 bottom-0 min-w-0 flex items-center justify-between gap-1 p-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20 pointer-events-auto transition-opacity ${
          isCoarse || isMenuOpen
            ? 'opacity-100'
            : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 min-w-0">
          {inlineActions.map((action) => {
            const isFav = action.id === 'favorite';
            const isHero = action.id === 'hero';
            const Icon = action.icon;

            let btnStyle = 'bg-white/20 hover:bg-white/30 text-white';
            if (action.danger) {
              btnStyle = 'bg-white/20 hover:bg-rose-500/80 text-white';
            } else if (action.active) {
              if (isFav) {
                btnStyle = 'bg-[#FF8800] text-white shadow-sm';
              } else if (isHero) {
                btnStyle = 'bg-amber-500 text-white shadow-sm';
              } else {
                btnStyle = 'bg-[#FF8800] text-white shadow-sm';
              }
            }

            return (
              <button
                key={action.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick(e);
                }}
                title={action.label}
                aria-label={action.label}
                style={{ width: btnSize, height: btnSize }}
                className={`shrink-0 flex items-center justify-center rounded-lg backdrop-blur-md transition-colors cursor-pointer ${btnStyle}`}
              >
                <Icon
                  size={iconSize}
                  className={action.active ? 'fill-white' : ''}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {overflowActions.length > 0 && (
          <button
            ref={triggerRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen((prev) => !prev);
            }}
            title="More actions"
            aria-label="More actions"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            style={{ width: btnSize, height: btnSize }}
            className={`shrink-0 flex items-center justify-center rounded-lg backdrop-blur-md transition-colors cursor-pointer ${
              isMenuOpen ? 'bg-[#FF8800] text-white' : 'bg-white/20 hover:bg-white/30 text-white'
            }`}
          >
            <MoreHorizontal size={iconSize} aria-hidden="true" />
          </button>
        )}
      </div>

      {isMenuOpen &&
        overflowActions.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* Backdrop for outside click */}
            <div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs sm:bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                handleCloseMenu();
              }}
            />

            {/* Mobile Bottom Sheet (< 640px) with safe-area-inset-bottom */}
            <div
              ref={menuRef}
              role="menu"
              aria-label="More variant actions"
              className="fixed inset-x-0 bottom-0 z-50 sm:hidden bg-[#FBFBFC] dark:bg-[#1A1A1E] rounded-t-2xl border-t border-[#FF8800]/30 shadow-2xl p-4 animate-slide-up flex flex-col gap-1 max-h-[70vh] overflow-y-auto"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  handleCloseMenu();
                }
              }}
            >
              <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20 mx-auto mb-2" />
              <div className="flex items-center justify-between pb-2 mb-1 border-b border-black/5 dark:border-white/5">
                <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">More Actions</span>
                <button
                  type="button"
                  onClick={handleCloseMenu}
                  aria-label="Close menu"
                  className="p-1 rounded-lg text-[#8E8E98] hover:text-[#1A1A1E] dark:hover:text-[#F5F5F7] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
              {overflowActions.map((action) => {
                const isFav = action.id === 'favorite';
                const isHero = action.id === 'hero';
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseMenu();
                      action.onClick(e);
                    }}
                    className={`min-h-[44px] w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                      action.danger
                        ? 'text-rose-500 hover:bg-rose-500/10'
                        : action.active
                        ? isFav
                          ? 'text-[#FF8800] bg-[#FF8800]/10'
                          : 'text-amber-500 bg-amber-500/10'
                        : 'text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-[#FF8800]/10'
                    }`}
                  >
                    <Icon
                      size={18}
                      className={
                        action.danger
                          ? 'text-rose-500 shrink-0'
                          : action.active
                          ? isFav
                            ? 'text-[#FF8800] fill-current shrink-0'
                            : 'text-amber-500 fill-current shrink-0'
                          : 'text-[#8E8E98] dark:text-[#A0A0AA] shrink-0'
                      }
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">{action.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Desktop Floating Menu (>= 640px) */}
            <div
              ref={menuRef}
              role="menu"
              aria-label="More variant actions"
              style={{ top: menuPos.top, left: menuPos.left }}
              className="hidden sm:flex fixed z-50 w-48 rounded-xl shadow-2xl flex-col py-1.5 border border-[#FF8800]/25 bg-[#FBFBFC] dark:bg-[#1A1A1E] text-xs font-medium animate-fade-in"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  handleCloseMenu();
                }
              }}
            >
              {overflowActions.map((action) => {
                const isFav = action.id === 'favorite';
                const isHero = action.id === 'hero';
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseMenu();
                      action.onClick(e);
                    }}
                    className={`min-h-[38px] w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#FF8800]/10 transition-colors cursor-pointer text-left ${
                      action.danger
                        ? 'text-rose-500 hover:bg-rose-500/10'
                        : action.active
                        ? isFav
                          ? 'text-[#FF8800] font-semibold'
                          : 'text-amber-500 font-semibold'
                        : 'text-[#1A1A1E] dark:text-[#F5F5F7]'
                    }`}
                  >
                    <Icon
                      size={15}
                      className={
                        action.danger
                          ? 'text-rose-500 shrink-0'
                          : action.active
                          ? isFav
                            ? 'text-[#FF8800] fill-current shrink-0'
                            : 'text-amber-500 fill-current shrink-0'
                          : 'text-[#8E8E98] dark:text-[#A0A0AA] shrink-0'
                      }
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}
    </>
  );
};
