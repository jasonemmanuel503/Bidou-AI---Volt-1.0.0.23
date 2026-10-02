import React, { useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { CreditPackage, PaymentRail } from '../../types';
import { INITIAL_PACKAGES } from '../../services/configData';
import { PricingCardGrid } from '../pricing/PricingCardGrid';
import { FuturaPayCheckoutModal } from '../pricing/FuturaPayCheckoutModal';

export interface LandingPricingPreviewProps {
  onOpenSignUp: () => void;
  isAuthenticated?: boolean;
  onCompletePayment?: (rail: PaymentRail, phone: string, pkg: CreditPackage) => Promise<any>;
}

export const LandingPricingPreview: React.FC<LandingPricingPreviewProps> = ({
  onOpenSignUp,
  isAuthenticated = false,
  onCompletePayment,
}) => {
  const [checkoutPkg, setCheckoutPkg] = useState<CreditPackage | null>(null);

  // Filter active packages (the 4-tier ladder: Starter, Creator, Pro, Studio)
  const packages = INITIAL_PACKAGES.filter((p) => p.active !== false);

  const handlePayment = async (rail: PaymentRail, phone: string, pkg: CreditPackage) => {
    if (!isAuthenticated) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('bidou:pending_package', pkg.id);
      }
      setCheckoutPkg(null);
      onOpenSignUp();
      return;
    }

    if (onCompletePayment) {
      return await onCompletePayment(rail, phone, pkg);
    }
  };

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10" id="pricing-preview">
      <div className="flex flex-col items-center text-center gap-4 mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full glass-panel border border-[#FF8800]/30 text-xs font-bold text-brand-gradient">
          <Sparkles size={14} />
          <span>Universal Wallet Credit Packs</span>
        </div>

        <h2 className="jost text-3xl sm:text-4xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight">
          Transparent, Fair Pricing in <span className="text-brand-gradient">FCFA</span>
        </h2>

        <p className="inter text-sm sm:text-base text-[#6B6B75] dark:text-[#A0A0AA] max-w-2xl leading-relaxed">
          No subscriptions required. Buy credits on-demand with MTN Mobile Money or Orange Money. One universal wallet fuels images, cinema, and music.
        </p>
      </div>

      {/* Pricing Cards Grid (Unified 4-card ladder matching PricingPage) */}
      <PricingCardGrid
        packages={packages}
        onSelectPackage={(pkg) => setCheckoutPkg(pkg)}
      />

      <div className="mt-8 text-center">
        <div className="inline-flex items-center gap-2 text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
          <ShieldCheck size={14} className="text-[#2ECC71]" />
          <span>Need custom enterprise volumes? Contact enterprise@bidou.ai for API and agency accounts.</span>
        </div>
      </div>

      {/* Checkout Modal */}
      <FuturaPayCheckoutModal
        isOpen={!!checkoutPkg}
        onClose={() => setCheckoutPkg(null)}
        selectedPackage={checkoutPkg}
        isAuthenticated={isAuthenticated}
        onCompletePayment={handlePayment}
      />
    </section>
  );
};
