// Bidou AI Out Of Credits Modal
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CreditCard, Sparkles, X } from 'lucide-react';
import { GenerationType } from '../../types';
import { IconTile } from '../common/IconTile';

export interface OutOfCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaType: GenerationType;
  requiredCredits: number;
  currentBalance: number;
  paidBalance?: number;
  promoBalance?: number;
  variantCount?: number;
  unitCost?: number;
  errorCode?: string;
  errorMessage?: string;
  maxSeconds?: number;
  requiredTier?: string;
  usedCap?: number;
  monthlyCap?: number;
  resetsAt?: string;
  onBuyCredits: () => void;
  onUpgradePlan: () => void;
  onSwitchToFreeEligibleModel?: () => void;
}

export const OutOfCreditsModal: React.FC<OutOfCreditsModalProps> = ({
  isOpen,
  onClose,
  mediaType,
  requiredCredits,
  currentBalance,
  paidBalance,
  promoBalance,
  variantCount = 1,
  unitCost,
  errorCode = 'INSUFFICIENT_CREDITS',
  errorMessage,
  onBuyCredits,
  onUpgradePlan,
  onSwitchToFreeEligibleModel,
}) => {
  if (!isOpen) return null;

  const calculatedUnitCost = unitCost ?? (variantCount > 1 ? Math.round(requiredCredits / variantCount) : requiredCredits);

  const mediaLabel =
    mediaType === 'video'
      ? 'video generation (Veo 3.1 / Wan 3.0)'
      : mediaType === 'music'
      ? 'studio track creation (Sonic v4.5 / Sonic v5)'
      : 'image rendering (Nano Banana / FLUX)';

  const isPromoNotAllowed = errorCode === 'PROMO_NOT_ALLOWED_FOR_MODEL';
  const isPlanLimit = errorCode === 'PLAN_LIMIT_DURATION' || errorCode === 'PREMIUM_CAP_REACHED';

  const modalTitle = isPromoNotAllowed
    ? 'Paid Credits Required for This Model'
    : errorCode === 'PLAN_LIMIT_DURATION'
    ? 'Plan Duration Limit Reached'
    : errorCode === 'PREMIUM_CAP_REACHED'
    ? 'Monthly Premium Cap Reached'
    : 'Insufficient Credits';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Modal Card with top/bottom gradient framing accents (Section 10.7) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 10 }}
          className="relative w-full max-w-md rounded-2xl overlay-panel p-6 overflow-hidden"
        >
          {/* Top subtle gradient bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand-gradient" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-[#6B6B75] dark:text-[#A0A0AA] hover:text-[#FF4B4B] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col items-center text-center">
            {/* Warning Icon Badge */}
            <IconTile icon={<AlertCircle size={28} />} tone="amber" size="lg" className="w-14 h-14 rounded-2xl mb-4 border border-[#FFB020]/40" />

            <h3 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7] mb-2">
              {modalTitle}
            </h3>

            {isPromoNotAllowed ? (
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed mb-4">
                Your 500 welcome credits are for fast image models like FLUX and Nano Banana Lite. Video, music and Pro models use paid credits — packs start at 2,000 FCFA.
              </p>
            ) : isPlanLimit ? (
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed mb-4">
                {errorMessage || 'Your current plan limit applies to this option. Upgrade your plan to unlock higher limits.'}
              </p>
            ) : variantCount > 1 ? (
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed mb-4">
                You need <strong className="text-[#F86A00] font-mono font-bold">{requiredCredits.toLocaleString()} credits</strong> for <strong className="text-[#1A1A1E] dark:text-[#F5F5F7]">{variantCount}× {mediaType}</strong> ({variantCount} × {calculatedUnitCost.toLocaleString()}). You have <strong className="font-mono font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">{currentBalance.toLocaleString()}</strong>.
              </p>
            ) : (
              <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed mb-4">
                You are out of credits for <strong className="text-[#1A1A1E] dark:text-[#F5F5F7]">{mediaLabel}</strong>.
                This generation requires <strong className="text-[#F86A00] font-mono font-bold">{requiredCredits.toLocaleString()} credits</strong>, but your wallet currently holds <strong className="font-mono font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">{currentBalance.toLocaleString()} credits</strong>.
              </p>
            )}

            <div className="w-full p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-[#FF8800]/20 flex flex-col gap-1 mb-6 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#6B6B75] dark:text-[#A0A0AA]">Total Credit Balance:</span>
                <span className="font-mono font-bold text-[#F86A00]">{currentBalance.toLocaleString()} credits</span>
              </div>
              {(paidBalance !== undefined || promoBalance !== undefined) && (
                <div className="flex items-center justify-between text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] pt-1 border-t border-black/5 dark:border-white/5">
                  <span>Paid: {(paidBalance ?? 0).toLocaleString()} cr</span>
                  {(promoBalance ?? 0) > 0 && (
                    <span className="text-[#2ECC71] font-semibold">
                      Free bonus: {(promoBalance ?? 0).toLocaleString()} cr (fast image models)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* CTAs */}
            <div className="flex flex-col w-full gap-2.5">
              {isPromoNotAllowed ? (
                <>
                  {onSwitchToFreeEligibleModel && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSwitchToFreeEligibleModel();
                      }}
                      className="w-full py-3 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-lg shadow-[#F86A00]/25 hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles size={16} />
                      <span>Try with a free-eligible model</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onBuyCredits();
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#1A1A1E] dark:text-[#F5F5F7] hover:border-[#FF8800] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard size={15} className="text-[#FF8800]" />
                    <span>Buy a credit pack</span>
                  </button>
                </>
              ) : isPlanLimit ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onUpgradePlan();
                  }}
                  className="w-full py-3 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-lg shadow-[#F86A00]/25 hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles size={16} />
                  <span>Upgrade plan</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onBuyCredits();
                    }}
                    className="w-full py-3 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-lg shadow-[#F86A00]/25 hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard size={16} />
                    <span>Buy Credits</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onUpgradePlan();
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#1A1A1E] dark:text-[#F5F5F7] hover:border-[#FF8800] active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles size={15} className="text-[#FF8800]" />
                    <span>Upgrade Monthly Subscription Plan</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bottom subtle gradient bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-gradient opacity-60" />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
