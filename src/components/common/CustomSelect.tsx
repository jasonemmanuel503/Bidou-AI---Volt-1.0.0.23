import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

export interface CustomSelectProps {
  id?: string;
  options: SelectOption[];
  value: string;
  onChange: (val: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  variant?: 'glass' | 'subtle' | 'pill';
  forcePlacement?: 'top' | 'bottom' | 'auto';
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  options,
  value,
  onChange,
  label,
  placeholder = 'Select option...',
  className = '',
  disabled = false,
  variant = 'glass',
  forcePlacement = 'auto',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>(
    forcePlacement === 'top' ? 'top' : 'bottom'
  );
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640;
    }
    return false;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Responsive mobile detector
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Measured placement calculation (flip to 'top' if space below is insufficient, unless forcePlacement is set)
  const updatePlacement = useCallback(() => {
    if (forcePlacement === 'top') {
      setPlacement('top');
      return;
    }
    if (forcePlacement === 'bottom') {
      setPlacement('bottom');
      return;
    }
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = dropdownRef.current?.offsetHeight || 250;

    // Flip to top if space below is less than required and top has more room
    if (spaceBelow < estimatedHeight + 10 && spaceAbove > spaceBelow) {
      setPlacement('top');
    } else {
      setPlacement('bottom');
    }
  }, [forcePlacement]);

  useLayoutEffect(() => {
    if (isOpen && !isMobile) {
      updatePlacement();
      window.addEventListener('resize', updatePlacement);
      window.addEventListener('scroll', updatePlacement, true);
      return () => {
        window.removeEventListener('resize', updatePlacement);
        window.removeEventListener('scroll', updatePlacement, true);
      };
    }
  }, [isOpen, isMobile, updatePlacement]);

  // Close on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        (!dropdownRef.current || !dropdownRef.current.contains(event.target as Node))
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Lock body scroll when mobile bottom sheet is open
  useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, isMobile]);

  return (
    <div className={`relative flex flex-col gap-1 ${className}`} ref={containerRef}>
      {label && (
        <span className="text-xs font-medium text-[#6B6B75] dark:text-[#A0A0AA] px-0.5">
          {label}
        </span>
      )}
      <button
        type="button"
        id={id}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={
          variant === 'pill' || variant === 'subtle'
            ? `h-9 min-h-[36px] flex items-center justify-between gap-2 px-3 py-1.5 text-xs rounded-full border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] transition-all duration-200 ${
                disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:border-[#FF8800]/50 active:scale-[0.99] cursor-pointer'
              } ${isOpen ? 'ring-2 ring-[#FF8800]/30 border-[#FF8800]' : ''}`
            : `min-h-11 flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-xl transition-all duration-200 glass-panel ${
                disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:border-[#FF8800]/50 active:scale-[0.99] cursor-pointer'
              } ${isOpen ? 'ring-2 ring-[#FF8800]/40 border-[#FF8800]' : ''}`
        }
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.icon}
          <span className="font-medium text-[#1A1A1E] dark:text-[#F5F5F7] truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#FF8800]/15 text-[#F86A00] dark:text-[#FFB020]">
              {selectedOption.badge}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`shrink-0 text-[#6B6B75] dark:text-[#A0A0AA] transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#F86A00]' : ''
          }`}
        />
      </button>

      {/* DESKTOP POPOVER (FLIPPED MEASURED PLACEMENT) */}
      {!isMobile && (
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              initial={{
                opacity: 0,
                y: placement === 'bottom' ? -6 : 6,
                scale: 0.98,
              }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: placement === 'bottom' ? -6 : 6,
                scale: 0.98,
              }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className={`absolute left-0 right-0 z-50 max-h-60 overflow-y-auto app-scroll rounded-xl overlay-panel p-1.5 focus:outline-none shadow-xl ${
                placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
              }`}
              role="listbox"
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                const isOptDisabled = !!option.disabled;
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={isOptDisabled ? option.disabledReason || 'Not supported by this model' : undefined}
                    disabled={isOptDisabled}
                    onClick={() => {
                      if (isOptDisabled) return;
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 text-xs rounded-lg transition-colors text-left ${
                      isOptDisabled
                        ? 'opacity-40 cursor-not-allowed text-[#6B6B75] dark:text-[#A0A0AA]'
                        : isSelected
                        ? 'bg-[#FF8800]/15 text-[#F86A00] font-semibold dark:text-[#FFB020] cursor-pointer'
                        : 'text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer'
                    }`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isOptDisabled}
                  >
                    <div className="flex flex-col truncate">
                      <div className="flex items-center gap-1.5">
                        {option.icon}
                        <span className="truncate">{option.label}</span>
                        {option.badge && (
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-bold">
                            {option.badge}
                          </span>
                        )}
                      </div>
                      {option.sublabel && (
                        <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA] truncate mt-0.5">
                          {option.sublabel}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="text-[#F86A00] shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* MOBILE BOTTOM SHEET WITH BACKDROP AND SWIPE-TO-DISMISS */}
      {isMobile && (
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Dim backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50"
              />

              {/* Bottom Sheet modal */}
              <motion.div
                ref={dropdownRef}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                drag="y"
                dragConstraints={{ top: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 80 || info.velocity.y > 300) {
                    setIsOpen(false);
                  }
                }}
                className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white dark:bg-[#18181B] border-t border-[#FF8800]/25 shadow-2xl flex flex-col max-h-[80vh] p-4 pb-8 touch-pan-y"
                role="listbox"
              >
                {/* Drag pill handle */}
                <div className="w-12 h-1.5 rounded-full bg-black/20 dark:bg-white/20 mx-auto mb-3 shrink-0 cursor-grab active:cursor-grabbing" />

                {/* Header with Title and Close Button */}
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-black/10 dark:border-white/10 shrink-0">
                  <h3 className="text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    {label || placeholder || 'Select Option'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#6B6B75] dark:text-[#A0A0AA] cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Options List */}
                <div className="flex flex-col gap-1 overflow-y-auto no-scrollbar flex-1">
                  {options.map((option) => {
                    const isSelected = option.value === value;
                    const isOptDisabled = !!option.disabled;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        title={isOptDisabled ? option.disabledReason || 'Not supported by this model' : undefined}
                        disabled={isOptDisabled}
                        onClick={() => {
                          if (isOptDisabled) return;
                          onChange(option.value);
                          setIsOpen(false);
                        }}
                        className={`w-full min-h-11 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                          isOptDisabled
                            ? 'opacity-40 cursor-not-allowed text-[#6B6B75] dark:text-[#A0A0AA]'
                            : isSelected
                            ? 'bg-[#FF8800]/15 text-[#F86A00] font-semibold dark:text-[#FFB020] cursor-pointer active:scale-98'
                            : 'text-[#1A1A1E] dark:text-[#F5F5F7] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer active:scale-98'
                        }`}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={isOptDisabled}
                      >
                        <div className="flex flex-col truncate">
                          <div className="flex items-center gap-2">
                            {option.icon}
                            <span className="text-sm truncate font-medium">{option.label}</span>
                            {option.badge && (
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-bold">
                                {option.badge}
                              </span>
                            )}
                          </div>
                          {option.sublabel && (
                            <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] truncate mt-0.5">
                              {option.sublabel}
                            </span>
                          )}
                        </div>
                        {isSelected && <Check size={18} className="text-[#F86A00] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

