// Bidou AI - Dedicated Billing Tab Component
import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  ShieldCheck,
  Receipt,
  Sparkles,
  Layers,
  ArrowUpRight,
  Download,
  CheckCircle2,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  UserProfile,
  CreditWallet,
  AppView,
} from '../../types';
import { persistence, StoredPurchaseRecord } from '../../services/persistence';
import { TierBadge } from '../common/TierBadge';
import { TIER_LABEL } from '../../services/tiers';
import { BillingPaymentMethods } from './BillingPaymentMethods';

export interface BillingTabProps {
  user: UserProfile;
  wallet: CreditWallet;
  onNavigateToView: (view: AppView) => void;
}

export const BillingTab: React.FC<BillingTabProps> = ({
  user,
  wallet,
  onNavigateToView,
}) => {
  const [purchases, setPurchases] = useState<StoredPurchaseRecord[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<StoredPurchaseRecord | null>(null);

  // Load purchase history
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const history = await persistence.listPurchases(user.id);
        if (isMounted) {
          setPurchases(history);
        }
      } catch (err) {
        console.warn('Failed to load purchase history:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [user.id]);

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl">
      {/* Tab Header Banner */}
      <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/25 bg-gradient-to-r from-[#FF8800]/10 via-[#F86A00]/5 to-transparent flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-gradient flex items-center justify-center text-white shrink-0 shadow-md">
            <CreditCard size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Billing & Creative Subscriptions
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-gradient text-white uppercase tracking-wider">
                100% African Rails
              </span>
            </div>
            <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1 max-w-xl">
              Manage your saved Mobile Money accounts, active subscription tier, credit top-ups, and official payment receipts in FCFA.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateToView('pricing')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer"
          >
            <Sparkles size={14} /> Buy Credits / Change Plan
          </button>
        </div>
      </div>

      {/* Plan & Wallet Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Active Plan Card */}
        <div className="p-5 rounded-3xl glass-panel border border-black/10 dark:border-white/10 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-[#FF8800]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA]">
                Current Tier
              </span>
            </div>
            <TierBadge tier={user.plan_tier} size="md" />
          </div>

          <div>
            <h3 className="jost text-2xl font-black text-[#1A1A1E] dark:text-[#F5F5F7]">
              {TIER_LABEL[user.plan_tier] || 'Free'} Plan
            </h3>
            <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
              {user.plan_tier === 'free'
                ? '0 XAF / month, 0 rollover credits, standard generation speeds.'
                : 'Provides access to AI Image generation (Nano Banana 2 Lite), video creation, and African vocal synthesizers.'}
            </p>
          </div>

          <div className="pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between">
            <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
              Need more speed & pro models?
            </span>
            <button
              type="button"
              onClick={() => onNavigateToView('pricing')}
              className="text-xs font-bold text-[#FF8800] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Explore Tiers <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        {/* Universal Wallet Balance Card */}
        <div className="p-5 rounded-3xl glass-panel border border-black/10 dark:border-white/10 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-[#FF8800]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA]">
                Creative Wallet
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Active & Unexpiring
            </span>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="jost text-3xl font-black text-[#1A1A1E] dark:text-[#F5F5F7]">
                {wallet.balance.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-[#FF8800] uppercase tracking-wider">
                Credits (≈ {wallet.balance.toLocaleString()} FCFA)
              </span>
            </div>
            <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
              Universal credit pool usable interchangeably across Image, Video, Music, and Voice generation.
            </p>
          </div>

          <div className="pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between">
            <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
              Running low on generations?
            </span>
            <button
              type="button"
              onClick={() => onNavigateToView('pricing')}
              className="text-xs font-bold text-[#FF8800] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Top-up Pack <ArrowUpRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Saved Payment Methods Section */}
      <div className="flex flex-col gap-4">
        <BillingPaymentMethods userId={user.id} />
      </div>

      {/* Invoices & Purchase History Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-[#FF8800]" />
            <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              Billing History & Receipts
            </h3>
          </div>
          <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
            {purchases.length} total transactions
          </span>
        </div>

        {purchases.length === 0 ? (
          <div className="p-8 rounded-2xl glass-panel border border-dashed border-black/15 dark:border-white/15 text-center flex flex-col items-center gap-2">
            <Receipt size={28} className="text-[#6B6B75]" />
            <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
              No purchases recorded yet. Credit pack purchases and invoices will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl glass-panel border border-black/10 dark:border-white/10 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10 text-[#6B6B75] dark:text-[#A0A0AA]">
                  <tr>
                    <th className="py-3 px-4 font-bold">Date</th>
                    <th className="py-3 px-4 font-bold">Description</th>
                    <th className="py-3 px-4 font-bold">Payment Rail</th>
                    <th className="py-3 px-4 font-bold text-right">Amount (FCFA)</th>
                    <th className="py-3 px-4 font-bold text-center">Status</th>
                    <th className="py-3 px-4 font-bold text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {purchases.map((purchase, idx) => {
                    const dateVal = purchase.purchasedAt || purchase.created_at || new Date().toISOString();
                    const dateStr = new Date(dateVal).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });
                    const pkgName = purchase.packageName || purchase.package_name || purchase.packageId;
                    const rail = purchase.paymentRail || purchase.payment_rail || 'mtn_momo';
                    const amount = purchase.amountFcfa ?? purchase.amount_fcfa ?? 0;
                    const refId = purchase.referenceId || purchase.id || `TXN-${idx}`;

                    return (
                      <tr
                        key={refId}
                        className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-[#1A1A1E] dark:text-[#F5F5F7]">
                          {dateStr}
                        </td>
                        <td className="py-3 px-4 text-[#1A1A1E] dark:text-[#F5F5F7]">
                          <span className="font-bold">{pkgName}</span>
                          <span className="block text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
                            +{purchase.credits.toLocaleString()} Credits
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                rail === 'mtn_momo' ? 'bg-[#FFCC00]' : 'bg-[#FF6600]'
                              }`}
                            />
                            {rail === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                          {amount.toLocaleString()} FCFA
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                            <CheckCircle2 size={11} /> Paid
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(purchase)}
                            className="px-2.5 py-1 rounded-lg border border-black/15 dark:border-white/15 hover:border-[#FF8800] text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] transition-all cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Branded Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl overlay-panel p-6 border border-[#FF8800]/30 shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Receipt size={20} className="text-[#FF8800]" />
                <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Official Purchase Receipt
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="p-1.5 rounded-lg text-[#6B6B75] hover:text-[#1A1A1E] dark:hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5">
                <span className="text-[#6B6B75] dark:text-[#A0A0AA]">Receipt Reference</span>
                <span className="font-mono font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  {selectedReceipt.referenceId || selectedReceipt.id || 'N/A'}
                </span>
              </div>

              <div className="flex flex-col gap-2 p-4 rounded-xl border border-black/10 dark:border-white/10">
                <div className="flex justify-between">
                  <span className="text-[#6B6B75] dark:text-[#A0A0AA]">Product</span>
                  <span className="font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    {selectedReceipt.packageName || selectedReceipt.package_name || selectedReceipt.packageId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B6B75] dark:text-[#A0A0AA]">Credits Credited</span>
                  <span className="font-bold text-[#FF8800]">
                    +{selectedReceipt.credits.toLocaleString()} Credits
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B6B75] dark:text-[#A0A0AA]">Payment Rail</span>
                  <span className="font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    {(selectedReceipt.paymentRail || selectedReceipt.payment_rail) === 'mtn_momo'
                      ? 'MTN Mobile Money'
                      : 'Orange Money'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B6B75] dark:text-[#A0A0AA]">Sender Phone</span>
                  <span className="font-mono font-semibold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    {selectedReceipt.phoneNumber || selectedReceipt.phone_number || 'Mobile Money'}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-black/10 dark:border-white/10 text-sm">
                  <span className="font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">Total Paid</span>
                  <span className="font-black text-[#FF8800]">
                    {(selectedReceipt.amountFcfa ?? selectedReceipt.amount_fcfa ?? 0).toLocaleString()} FCFA
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-[#6B6B75] dark:text-[#A0A0AA]">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span>Verified FuturaPay African Gateway settlement.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold text-[#1A1A1E] dark:text-[#F5F5F7] transition-all cursor-pointer"
              >
                <Download size={14} /> Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-2 rounded-xl bg-brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
