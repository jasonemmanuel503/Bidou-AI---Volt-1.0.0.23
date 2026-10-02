import React from 'react';
import { Smartphone, Zap, ShieldCheck, CreditCard, Sparkles, CheckCircle2 } from 'lucide-react';
import { IconTile } from '../common/IconTile';

export interface BuiltForAfricaSectionProps {
  onGetStarted?: () => void;
}

export const BuiltForAfricaSection: React.FC<BuiltForAfricaSectionProps> = ({ onGetStarted }) => {
  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10" id="trust-section">
      <div className="relative rounded-3xl built-for-africa-card glass-panel border border-[#FF8800]/25 dark:!border-0 dark:!border-none dark:!shadow-none dark:!bg-transparent dark:!bg-none dark:!backdrop-blur-none p-8 sm:p-12 overflow-hidden bg-gradient-to-b from-[#F86A00]/5 via-transparent to-[#FFB020]/5">
        {/* Subtle ambient light gradient in corner (hidden in dark mode) */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FF8800]/10 rounded-full blur-3xl pointer-events-none dark:hidden" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto gap-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-panel border border-[#FF8800]/30 dark:!border-0 dark:!border-none dark:!shadow-none text-xs font-bold text-brand-gradient">
            <Sparkles size={14} />
            <span>African Creative Infrastructure</span>
          </div>

          {/* Heading */}
          <h2 className="jost text-3xl sm:text-4xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] tracking-tight">
            Built for Africa. Powered by <span className="text-brand-gradient">Local Mobile Money</span>.
          </h2>

          {/* Core explanation */}
          <p className="inter text-sm sm:text-base text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
            World-class AI studios shouldn't require international credit cards, US dollar conversions, or offshore banking. Bidou AI integrates directly with Central and West African mobile payment rails, allowing creators to top up on-demand in <strong className="text-[#1A1A1E] dark:text-[#F5F5F7]">FCFA</strong> with zero foreign exchange fees.
          </p>

          {/* Payment Partner Logos & Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl my-2">
            {/* MTN MoMo Card */}
            <div className="flex items-center gap-4 p-4 rounded-2xl glass-panel border border-[#FFCC00]/30 hover:border-[#FFCC00] dark:!border-0 dark:!border-none dark:!shadow-none transition-colors bg-white/40 dark:bg-white/5">
              <div className="w-12 h-12 rounded-xl bg-[#FFCC00] text-black flex items-center justify-center font-black text-sm shrink-0 shadow-md dark:shadow-none">
                MoMo
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    MTN Mobile Money
                  </h4>
                  <CheckCircle2 size={14} className="text-[#2ECC71]" />
                </div>
                <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                  Instant USSD push verification across Cameroon & CEMAC.
                </p>
              </div>
            </div>

            {/* Orange Money Card */}
            <div className="flex items-center gap-4 p-4 rounded-2xl glass-panel border border-[#FF6600]/30 hover:border-[#FF6600] dark:!border-0 dark:!border-none dark:!shadow-none transition-colors bg-white/40 dark:bg-white/5">
              <div className="w-12 h-12 rounded-xl bg-[#FF6600] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-md dark:shadow-none">
                OM
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Orange Money
                  </h4>
                  <CheckCircle2 size={14} className="text-[#2ECC71]" />
                </div>
                <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                  Direct OTP & secret code confirmation via FuturaPay rails.
                </p>
              </div>
            </div>
          </div>

          {/* Trust Highlights Checklist */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full text-left pt-4 border-t border-[#FF8800]/15 dark:border-transparent dark:border-t-0">
            <div className="flex items-start gap-3">
              <IconTile icon={<CreditCard size={18} />} tone="primary" size="sm" className="mt-0.5" />
              <div>
                <h5 className="jost text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Honest FCFA Pricing
                </h5>
                <p className="inter text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                  Clear rates starting from 1,500 FCFA. What you see is what your mobile balance is charged.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <IconTile icon={<Zap size={18} />} tone="green" size="sm" className="mt-0.5" />
              <div>
                <h5 className="jost text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Instant Credit Delivery
                </h5>
                <p className="inter text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                  Automated webhook confirmation funds your Universal Wallet within 3-5 seconds.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <IconTile icon={<ShieldCheck size={18} />} tone="amber" size="sm" className="mt-0.5" />
              <div>
                <h5 className="jost text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Zero International Locks
                </h5>
                <p className="inter text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                  Never get blocked by foreign payment gateways or declined overseas transactions again.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
