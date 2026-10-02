// Bidou AI Pricing Page
import React, { useState, useEffect } from 'react';
import { Layers, ShieldCheck } from 'lucide-react';
import { CreditPackage, PlanTier } from '../../types';
import { INITIAL_PACKAGES } from '../../services/configData';
import { FuturaPayCheckoutModal } from './FuturaPayCheckoutModal';
import { PricingCardGrid } from './PricingCardGrid';

export interface PricingPageProps {
  packages?: CreditPackage[];
  currentPlanTier?: PlanTier;
  initialCheckoutPackage?: CreditPackage | null;
  onSelectPackage?: (pkg: CreditPackage) => void;
  onCompletePayment: (rail: any, phone: string, pkg: CreditPackage) => Promise<any>;
  userId?: string;
}

export const PricingPage: React.FC<PricingPageProps> = ({
  packages = INITIAL_PACKAGES,
  currentPlanTier,
  initialCheckoutPackage,
  onSelectPackage,
  onCompletePayment,
  userId,
}) => {
  const [checkoutPkg, setCheckoutPkg] = useState<CreditPackage | null>(initialCheckoutPackage || null);

  useEffect(() => {
    if (initialCheckoutPackage) {
      setCheckoutPkg(initialCheckoutPackage);
    }
  }, [initialCheckoutPackage]);

  // Render only active packages (4-tier ladder: Starter, Creator, Pro, Studio)
  const visiblePackages = packages.filter((pkg) => pkg.active !== false);

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-8 py-6 px-4 sm:px-6">
      {/* Universal Wallet Informational Banner */}
      <div className="p-4 rounded-2xl glass-panel border border-[#FF8800]/30 bg-gradient-to-r from-[#F86A00]/10 via-[#FF8800]/5 to-[#FFB020]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-gradient flex items-center justify-center text-white shrink-0 shadow-md">
            <Layers size={20} />
          </div>
          <div>
            <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              Universal African Creative Wallet
            </h4>
            <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
              One wallet powers all media: spend credits freely across Image, Video, and Music without siloed balances. Tiers never downgrade.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel-subtle text-xs font-semibold text-brand-gradient border border-[#FF8800]/20 shrink-0">
          <ShieldCheck size={15} />
          <span>MTN & Orange Mobile Money</span>
        </div>
      </div>

      {/* Hero Title */}
      <div className="flex flex-col items-center text-center gap-3">
        <h2 className="jost text-3xl sm:text-4xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight">
          Transparent, Fair African Pricing in <span className="text-brand-gradient">FCFA</span>
        </h2>
        <p className="inter text-sm text-[#6B6B75] dark:text-[#A0A0AA] max-w-xl">
          Purchase credit packs on-demand with volume discounts — Starter 2,000 FCFA (1,500 credits), Creator 5,400 FCFA (5,500 credits), Pro 16,000 FCFA (18,000 credits), and Studio 42,000 FCFA (53,000 credits).
        </p>
      </div>

      {/* Credit Package Cards 4-Card Grid */}
      <PricingCardGrid
        packages={visiblePackages}
        currentPlanTier={currentPlanTier}
        onSelectPackage={(pkg) => {
          onSelectPackage?.(pkg);
          setCheckoutPkg(pkg);
        }}
      />

      {/* Checkout Modal */}
      <FuturaPayCheckoutModal
        isOpen={!!checkoutPkg}
        onClose={() => setCheckoutPkg(null)}
        selectedPackage={checkoutPkg}
        onCompletePayment={onCompletePayment}
        userId={userId}
      />
    </div>
  );
};

