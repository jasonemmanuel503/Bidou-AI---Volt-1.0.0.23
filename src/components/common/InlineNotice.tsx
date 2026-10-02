import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LucideIcon, AlertCircle, AlertTriangle, Info, Wand2, X, RefreshCw } from 'lucide-react';

export type InlineNoticeVariant = 'warning' | 'error' | 'info';

export interface InlineNoticeProps {
  variant?: InlineNoticeVariant;
  title: string;
  message: string;
  icon?: LucideIcon;
  devHint?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}

export const InlineNotice: React.FC<InlineNoticeProps> = ({
  variant = 'warning',
  title,
  message,
  icon: CustomIcon,
  devHint,
  onRetry,
  retryLabel = 'Try again',
  onDismiss,
  dismissLabel = 'Dismiss',
  className = '',
}) => {
  // Determine variant styling
  let containerStyles = 'bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-200';
  let iconColor = 'text-[#FF8800] dark:text-[#FFB020]';
  let DefaultIcon = AlertTriangle;

  if (variant === 'error') {
    containerStyles = 'bg-rose-500/10 border-rose-500/25 text-rose-900 dark:text-rose-200';
    iconColor = 'text-rose-500 dark:text-rose-400';
    DefaultIcon = AlertCircle;
  } else if (variant === 'info') {
    containerStyles = 'bg-blue-500/10 border-blue-500/25 text-blue-900 dark:text-blue-200';
    iconColor = 'text-blue-500 dark:text-blue-400';
    DefaultIcon = Info;
  }

  const IconComponent = CustomIcon || DefaultIcon;

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`rounded-2xl border p-3 sm:p-3.5 flex flex-col gap-1.5 shadow-sm text-xs backdrop-blur-sm ${containerStyles} ${className}`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className={`mt-0.5 shrink-0 ${iconColor}`}>
            <IconComponent size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
              <span className="font-bold tracking-tight text-neutral-900 dark:text-white">
                {title}
              </span>
              <span className="text-[11.5px] opacity-90 leading-snug">
                {message}
              </span>
            </div>
            {devHint && (
              <div className="mt-1 font-mono text-[10px] opacity-75 text-neutral-600 dark:text-neutral-400">
                {devHint}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-1">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <RefreshCw size={11} className="shrink-0" />
              <span>{retryLabel}</span>
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={dismissLabel}
              className="p-1 rounded-lg opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
