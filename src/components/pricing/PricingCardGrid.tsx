// Bidou AI Shared Pricing Card Grid
import React from 'react';
import { Check, Image as ImageIcon, Video as VideoIcon, Music } from 'lucide-react';
import { CreditPackage, PlanTier } from '../../types';
import { getTierIllustration } from '../../services/pricingEngine';
import { TIER_RANK } from '../../services/tiers';
import { GradientBorder } from '../common/GradientBorder';

export interface PricingCardGridProps {
  packages: CreditPackage[];
  currentPlanTier?: PlanTier;
  onSelectPackage: (pkg: CreditPackage) => void;
}

const cleanLabel = (label: string): string => {
  return label
    .replace(/,?\s*\(for example\)/gi, '')
    .replace(/\(for example\)/gi, '')
    .trim();
};

export const PricingCardGrid: React.FC<PricingCardGridProps> = ({
  packages,
  currentPlanTier,
  onSelectPackage,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
      {packages.map((pkg) => {
        const isPopular = pkg.popular;
        const costPerCredit = (pkg.price_fcfa / pkg.credits).toFixed(2);
        const starterRate = 2000 / 1500;
        const imageItems = getTierIllustration(pkg.credits, 'image');
        const videoItems = getTierIllustration(pkg.credits, 'video');
        const musicItems = getTierIllustration(pkg.credits, 'music');
        const discountPercent =
          pkg.discount_percent ?? Math.max(0, Math.round((1 - pkg.price_fcfa / pkg.credits / starterRate) * 100));
        const isUpgrade = Boolean(
          currentPlanTier &&
          pkg.tier &&
          TIER_RANK[pkg.tier] > TIER_RANK[currentPlanTier]
        );
        const buttonLabel = isUpgrade ? 'Upgrade' : 'Buy Now';

        return (
          <GradientBorder
            key={pkg.id}
            mode={isPopular ? 'always' : 'hover'}
            radius={24}
            glow
            className={`h-full transition-transform duration-300 ${
              isPopular ? 'scale-[1.02] z-10' : ''
            }`}
          >
            <div
              className="relative rounded-3xl bg-white dark:bg-[#18181B] p-5 sm:p-6 flex flex-col justify-between h-full transition-all duration-300 overflow-hidden"
            >
              {/* Top framing gradient accent bar */}
              <div
                className={`absolute top-0 left-0 right-0 h-1.5 bg-brand-gradient ${
                  isPopular ? 'opacity-100' : 'opacity-40'
                }`}
              />

              {/* Popular Ribbon */}
              {isPopular && (
                <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-brand-gradient text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm">
                  Most Popular
                </div>
              )}

              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA]">
                  {pkg.name}
                </span>

                {/* Price in FCFA prominently */}
                <div className="flex flex-col">
                  <span className="jost text-3xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] font-mono tracking-tight">
                    {pkg.price_fcfa.toLocaleString()}{' '}
                    <span className="text-sm font-sans font-semibold text-[#6B6B75]">FCFA</span>
                  </span>
                  {discountPercent > 0 && (
                    <span className="text-[11px] font-semibold text-brand-gradient">
                      ≈ {costPerCredit} FCFA per credit ({discountPercent}% savings)
                    </span>
                  )}
                </div>

                {/* Credits Count Pill */}
                <div className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#FF8800]/20 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#6B6B75] dark:text-[#A0A0AA]">Credits:</span>
                  <span className="text-sm font-extrabold font-mono text-[#F86A00] dark:text-[#FFB020]">
                    +{pkg.credits.toLocaleString()}
                  </span>
                </div>

                {/* All 3 Media Categories Illustrated at Once */}
                <div className="flex flex-col gap-3 pt-2.5 border-t border-[#FF8800]/15">
                  {/* 🖼 Images */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wider text-[#F86A00] dark:text-[#FFB020]">
                      <ImageIcon size={13} className="shrink-0" />
                      <span>Images</span>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[11px] text-[#1A1A1E] dark:text-[#F5F5F7]">
                      {imageItems.map((item, idx) => (
                        <div key={idx} className="flex items-baseline gap-1.5 leading-tight">
                          <span className="text-[#F86A00] text-[9px] shrink-0 leading-none">●</span>
                          <span>~{item.count.toLocaleString()} {cleanLabel(item.label)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 🎬 Video */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wider text-[#F86A00] dark:text-[#FFB020]">
                      <VideoIcon size={13} className="shrink-0" />
                      <span>Video</span>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[11px] text-[#1A1A1E] dark:text-[#F5F5F7]">
                      {videoItems.map((item, idx) => (
                        <div key={idx} className="flex items-baseline gap-1.5 leading-tight">
                          <span className="text-[#F86A00] text-[9px] shrink-0 leading-none">●</span>
                          <span>~{item.count.toLocaleString()} {cleanLabel(item.label)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 🎵 Music */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wider text-[#F86A00] dark:text-[#FFB020]">
                      <Music size={13} className="shrink-0" />
                      <span>Music</span>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[11px] text-[#1A1A1E] dark:text-[#F5F5F7]">
                      {musicItems.map((item, idx) => (
                        <div key={idx} className="flex items-baseline gap-1.5 leading-tight">
                          <span className="text-[#F86A00] text-[9px] shrink-0 leading-none">●</span>
                          <span>~{item.count.toLocaleString()} {cleanLabel(item.label)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shared bullets once per card */}
                  <div className="flex flex-col gap-1 pt-2 border-t border-black/5 dark:border-white/5 text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
                    <div className="flex items-center gap-1.5">
                      <Check size={13} className="text-[#2ECC71] shrink-0" />
                      <span>Rollover balance — credits never expire</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check size={13} className="text-[#2ECC71] shrink-0" />
                      <span>All studios and models unlocked</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Checkout Trigger CTA */}
              <div className="mt-5 pt-4 border-t border-[#FF8800]/15">
                <button
                  type="button"
                  onClick={() => onSelectPackage(pkg)}
                  className={`w-full py-3 rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer ${
                    isPopular
                      ? 'bg-brand-gradient text-white shadow-[#F86A00]/25 hover:opacity-95'
                      : 'bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#1A1A1E] dark:text-[#F5F5F7] hover:border-[#FF8800]'
                  }`}
                >
                  {buttonLabel}
                </button>
              </div>

              {/* Bottom framing gradient accent bar */}
              <div
                className={`absolute bottom-0 left-0 right-0 h-1 bg-brand-gradient ${
                  isPopular ? 'opacity-80' : 'opacity-20'
                }`}
              />
            </div>
          </GradientBorder>
        );
      })}
    </div>
  );
};
