import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Settings,
  DollarSign,
  Activity,
  AlertTriangle,
  CheckCircle,
  Lock,
  RefreshCw,
  BarChart3,
  Database,
  Users,
  Share2,
  Clock,
  CheckSquare,
  Square,
  AlertOctagon,
  ShieldAlert,
  Send,
  Check,
  UserPlus,
  Save,
} from 'lucide-react';
import {
  AiModelConfig,
  CreditPackage,
  CreditTransaction,
  FuturaPayPayment,
  AffiliateLeaderboardItem,
  ReferralRewardRecord,
  AffiliateFraudFlag,
} from '../../types';
import { computeCreditCost } from '../../services/pricingEngine';
import { persistence } from '../../services/persistence';
import { newId } from '../../services/ids';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { AdminShell, AdminTab } from './AdminShell';
import { EmptyState } from '../common/EmptyState';
import { AdminPinModal } from './AdminPinModal';
import { SupplierProfitControlPanel } from './SupplierProfitControlPanel';

export interface AdminDashboardProps {
  models: AiModelConfig[];
  onRefreshModels?: () => void;
  transactions: CreditTransaction[];
  payments: FuturaPayPayment[];
  packages: CreditPackage[];
  onExitAdmin: () => void;
  theme: 'light' | 'dark';
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  models,
  onRefreshModels,
  transactions,
  payments,
  packages,
  onExitAdmin,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('models');
  const [selectedModel, setSelectedModel] = useState<AiModelConfig | null>(models[0] || null);
  const [editingCost, setEditingCost] = useState<number>(models[0]?.provider_cost || 0.035);
  const [editingVariants, setEditingVariants] = useState<number>(models[0]?.max_concurrent_variants || 1);

  // Affiliate & Payout State
  const [leaderboard, setLeaderboard] = useState<AffiliateLeaderboardItem[]>([]);
  const [payoutQueue, setPayoutQueue] = useState<ReferralRewardRecord[]>([]);
  const [fraudFlags, setFraudFlags] = useState<AffiliateFraudFlag[]>([]);
  const [selectedPayoutIds, setSelectedPayoutIds] = useState<string[]>([]);
  const [batchReference, setBatchReference] = useState<string>(
    `MOMO-BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  );
  const [payoutStatusMsg, setPayoutStatusMsg] = useState<string | null>(null);

  // Platform Stats State (Users & Growth)
  const [platformStats, setPlatformStats] = useState<{ totalUsers: number; paidUsers: number; updatedAt: string }>({
    totalUsers: 2000,
    paidUsers: 140,
    updatedAt: new Date().toISOString(),
  });
  const [editingTotalUsers, setEditingTotalUsers] = useState<string>('2000');
  const [editingPaidUsers, setEditingPaidUsers] = useState<string>('140');
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  const [statsSuccessMsg, setStatsSuccessMsg] = useState<string | null>(null);
  const [statsErrorMsg, setStatsErrorMsg] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [pendingStatSave, setPendingStatSave] = useState<{
    key: 'total_users' | 'paid_users';
    value: number;
  } | null>(null);

  const loadPlatformStats = async () => {
    setStatsLoading(true);
    try {
      const stats = await persistence.getPlatformStats();
      setPlatformStats(stats);
      setEditingTotalUsers(String(stats.totalUsers));
      setEditingPaidUsers(String(stats.paidUsers));
    } catch (err) {
      console.warn('Failed to load platform stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadPlatformStats();
    const unsub = persistence.subscribeToPlatformStats((updated) => {
      setPlatformStats((prev) => ({ ...prev, ...updated, updatedAt: new Date().toISOString() }));
    });
    return unsub;
  }, []);

  const handleRequestSaveStat = (key: 'total_users' | 'paid_users', valueStr: string) => {
    const num = parseInt(valueStr, 10);
    if (isNaN(num) || num < 0) {
      setStatsErrorMsg('Please enter a valid positive number');
      setTimeout(() => setStatsErrorMsg(null), 3000);
      return;
    }
    setPendingStatSave({ key, value: num });
    setPinModalOpen(true);
  };

  const handlePinSuccessForStat = async (pin?: string) => {
    if (!pendingStatSave || !pin) {
      setPinModalOpen(false);
      setPendingStatSave(null);
      return;
    }
    setPinModalOpen(false);
    setStatsLoading(true);
    setStatsErrorMsg(null);

    try {
      const ok = await persistence.setPlatformStatManually(
        pin,
        pendingStatSave.key,
        pendingStatSave.value
      );
      if (ok) {
        setStatsSuccessMsg(
          `Successfully updated ${pendingStatSave.key === 'total_users' ? 'Total Active Users' : 'Paid Subscribers'} to ${pendingStatSave.value.toLocaleString()}!`
        );
        setTimeout(() => setStatsSuccessMsg(null), 4000);
        await loadPlatformStats();
      } else {
        setStatsErrorMsg('Failed to update stat. PIN verification failed or permission denied.');
        setTimeout(() => setStatsErrorMsg(null), 4000);
      }
    } catch {
      setStatsErrorMsg('An error occurred while saving.');
      setTimeout(() => setStatsErrorMsg(null), 4000);
    } finally {
      setStatsLoading(false);
      setPendingStatSave(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await persistence.getAdminAffiliateData();
        if (mounted) {
          setLeaderboard(data.leaderboard);
          setPayoutQueue(data.payoutQueue);
          setFraudFlags(data.fraudFlags);
        }
      } catch (err) {
        console.warn('Error loading affiliate admin data:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleSelectPayout = (id: string) => {
    setSelectedPayoutIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllPayable = () => {
    const payableIds = payoutQueue.filter((p) => p.is_payable).map((p) => p.id);
    const allSelected = payableIds.length > 0 && payableIds.every((id) => selectedPayoutIds.includes(id));
    if (allSelected) {
      setSelectedPayoutIds((prev) => prev.filter((id) => !payableIds.includes(id)));
    } else {
      setSelectedPayoutIds((prev) => Array.from(new Set([...prev, ...payableIds])));
    }
  };

  const handleMarkBatchPaid = async () => {
    if (selectedPayoutIds.length === 0) return;
    const ref = batchReference.trim() || `MOMO-BATCH-${newId().toUpperCase()}`;
    await persistence.markPayoutsPaid(selectedPayoutIds, ref);

    setPayoutQueue((prev) => prev.filter((item) => !selectedPayoutIds.includes(item.id)));
    setPayoutStatusMsg(`Disbursed ${selectedPayoutIds.length} reward payouts with reference "${ref}"!`);
    setSelectedPayoutIds([]);
    setTimeout(() => setPayoutStatusMsg(null), 4000);
  };

  // Financial summary calculations
  const totalRevenueFcfa = payments
    .filter((p) => p.status === 'successful')
    .reduce((sum, p) => sum + p.amount_fcfa, 0);

  const totalFeeFcfa = payments
    .filter((p) => p.status === 'successful')
    .reduce((sum, p) => sum + p.fee_fcfa, 0);

  // Derive real daily revenue data from payments
  const revenueTrendData = useMemo(() => {
    const byDate = new Map<string, number>();
    payments
      .filter((p) => p.status === 'successful')
      .forEach((p) => {
        const day = p.created_at.slice(0, 10); // YYYY-MM-DD
        byDate.set(day, (byDate.get(day) || 0) + p.amount_fcfa);
      });
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ date, revenue }));
  }, [payments]);

  // Custom Tooltip component for daily revenue trend and period-over-period momentum
  const RevenueTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const currentValue = payload[0].value as number;
    const idx = revenueTrendData.findIndex((d) => d.date === label);
    const prevValue = idx > 0 ? revenueTrendData[idx - 1].revenue : null;
    const pctChange = prevValue ? ((currentValue - prevValue) / prevValue) * 100 : null;

    return (
      <div className="p-3 rounded-xl border border-[#FF8800]/30 text-xs shadow-xl bg-white/95 dark:bg-[#1A1A1E]/95 backdrop-blur-md pointer-events-none">
        <div className="font-bold text-[#1A1A1E] dark:text-[#F5F5F7] mb-1">{label}</div>
        <div className="font-mono font-bold text-brand-gradient text-sm">
          {currentValue.toLocaleString()} FCFA
        </div>
        {pctChange !== null && (
          <div className={`mt-1 font-semibold flex items-center gap-1 ${pctChange >= 0 ? 'text-[#2ECC71]' : 'text-[#FF4B4B]'}`}>
            <span>{pctChange >= 0 ? '▲' : '▼'}</span>
            <span>{Math.abs(pctChange).toFixed(1)}% vs. previous day</span>
          </div>
        )}
      </div>
    );
  };

  const pieColors = ['#F86A00', '#FF8800', '#FFB020'];

  const handleSaveModelCost = () => {
    if (!selectedModel) return;
    const { creditCost: newCreditCost } = computeCreditCost(
      editingCost,
      selectedModel.generation_type
    );

    const safeVariants = Math.max(1, Math.min(4, Math.round(editingVariants) || 1));
    const updated: AiModelConfig = {
      ...selectedModel,
      provider_cost: editingCost,
      credit_cost: newCreditCost,
      max_concurrent_variants: safeVariants,
    };
    setSelectedModel(updated);
  };

  return (
    <AdminShell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onExitAdmin={onExitAdmin}
      theme={theme}
    >
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-6">
        {/* TAB 1: Models & Router Governance */}
        {activeTab === 'models' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 flex flex-col gap-3">
              <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Registered AI Providers & Commercial Models
              </h3>
              <div className="flex flex-col gap-3">
                {models.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model);
                      setEditingCost(model.provider_cost);
                      setEditingVariants(model.max_concurrent_variants || 1);
                    }}
                    className={`p-4 rounded-2xl bg-white/90 dark:bg-[#18181B]/90 shadow-xs border transition-all cursor-pointer flex items-center justify-between ${
                      selectedModel?.id === model.id
                        ? 'border-[#FF8800] ring-1 ring-[#FF8800]/50 shadow-md'
                        : 'border-[#FF8800]/20 hover:border-[#FF8800]/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center font-bold text-xs">
                        {model.generation_type.toUpperCase().substring(0, 3)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                            {model.display_name}
                          </span>
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-bold">
                            {model.provider}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
                          Raw: ${model.provider_cost} • User Price:{' '}
                          <strong className="text-brand-gradient font-mono">
                            {model.credit_cost} credits
                          </strong>
                          {' '}• Max Variants:{' '}
                          <span className="font-mono font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                            {model.max_concurrent_variants || 1}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {model.licensing_verified ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-[#2ECC71] bg-[#2ECC71]/10 px-2 py-0.5 rounded-full">
                          <CheckCircle size={12} />
                          <span>Verified</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Model Editor & Central Pricing Recalculator */}
            {selectedModel && (
              <div className="lg:col-span-5 p-5 rounded-3xl glass-panel border border-[#FF8800]/30 flex flex-col gap-4">
                <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Model Pricing & Margin Governance
                </h4>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                    Raw Provider Cost (USD):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.001"
                      value={editingCost}
                      onChange={(e) => setEditingCost(parseFloat(e.target.value) || 0)}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSaveModelCost}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-xs shrink-0 cursor-pointer"
                    >
                      Recalculate
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#6B6B75] dark:text-[#A0A0AA] flex items-center justify-between">
                    <span>Max Concurrent Variants (1–4):</span>
                    <span className="text-[10px] text-[#FF8800] font-mono font-bold">
                      {editingVariants} take{editingVariants > 1 ? 's' : ''} max
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={4}
                      step={1}
                      value={editingVariants}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (isNaN(val)) return;
                        setEditingVariants(Math.max(1, Math.min(4, val)));
                      }}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSaveModelCost}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-xs shrink-0 cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                  <span className="text-[10px] text-amber-500 font-medium">
                    Preview only — not saved to the database
                  </span>
                  <span className="text-[10px] text-[#6B6B75]">
                    Constrains maximum parallel takes/variations generated per prompt (1 to 4).
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#FF8800]/20 flex flex-col gap-2 text-xs">
                  <span className="font-bold text-brand-gradient">
                    Pricing Engine Live Breakdown:
                  </span>
                  <div className="flex justify-between text-[#6B6B75]">
                    <span>Provider API Cost:</span>
                    <span className="font-mono font-bold">${editingCost}</span>
                  </div>
                  <div className="flex justify-between text-[#6B6B75]">
                    <span>Target Gross Margin:</span>
                    <span className="font-mono font-bold text-[#2ECC71]">70.0%</span>
                  </div>
                  <div className="flex justify-between text-[#6B6B75]">
                    <span>Est. FCFA per run:</span>
                    <span className="font-mono font-bold">
                      {Math.round((editingCost / 0.3) * 600)} FCFA
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-black/5 dark:border-white/5 pt-2 font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    <span>User Credit Deduction:</span>
                    <span className="font-mono text-brand-gradient text-sm">
                      {computeCreditCost(editingCost, selectedModel.generation_type).creditCost} credits
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="lg:col-span-3">
              <SupplierProfitControlPanel
                mode="models_suppliers"
                onModelsChanged={onRefreshModels}
              />
            </div>
          </div>
        )}

        {/* TAB 2: Revenues & Analytics */}
        {activeTab === 'financials' && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl glass-panel border border-[#FF8800]/20">
                <span className="text-xs text-[#6B6B75] uppercase font-bold">Total Reconciled Revenue</span>
                <h3 className="jost text-2xl font-bold text-brand-gradient mt-1 font-mono">
                  {totalRevenueFcfa.toLocaleString()} FCFA
                </h3>
                <span className="text-[10px] text-[#2ECC71]">100% via FuturaPay MoMo</span>
              </div>
              <div className="p-4 rounded-2xl glass-panel border border-[#FF8800]/20">
                <span className="text-xs text-[#6B6B75] uppercase font-bold">Payment Gateway Fees (2.5%)</span>
                <h3 className="jost text-2xl font-bold text-[#FF4B4B] mt-1 font-mono">
                  {totalFeeFcfa.toLocaleString()} FCFA
                </h3>
                <span className="text-[10px] text-[#6B6B75]">MTN & Orange blended rail</span>
              </div>
              <div className="p-4 rounded-2xl glass-panel border border-[#FF8800]/20">
                <span className="text-xs text-[#6B6B75] uppercase font-bold">Estimated Net Platform Margin</span>
                <h3 className="jost text-2xl font-bold text-[#2ECC71] mt-1 font-mono">
                  {Math.round((totalRevenueFcfa - totalFeeFcfa) * 0.67).toLocaleString()} FCFA
                </h3>
                <span className="text-[10px] text-[#2ECC71]">Healthy 67% Net Target</span>
              </div>
            </div>

            <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Revenues & Analytics (Daily Trend)
                  </h4>
                  <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                    Real revenue collection over time via FuturaPay MoMo with period-over-period momentum. Hover to inspect daily earnings.
                  </p>
                </div>
                {revenueTrendData.length > 0 && (
                  <span className="text-xs font-mono font-bold text-brand-gradient self-start sm:self-auto">
                    {revenueTrendData.length} recording days
                  </span>
                )}
              </div>
              <div className="h-72 w-full">
                {revenueTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                      <XAxis dataKey="date" stroke="#6B6B75" fontSize={11} tickLine={false} />
                      <YAxis
                        stroke="#6B6B75"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`)}
                      />
                      <Tooltip
                        cursor={{ stroke: 'var(--brand-primary)', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                        content={<RevenueTooltip />}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="var(--brand-primary)"
                        strokeWidth={2.5}
                        fill="url(#revenueFill)"
                        dot={{ fill: 'var(--brand-primary)', r: 3.5, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: '#FF8800', stroke: '#FFFFFF', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <EmptyState
                      variant="empty_transactions"
                      title="No Revenue Trend Available"
                      description="Successful payments via FuturaPay will automatically chart here."
                    />
                  </div>
                )}
              </div>
            </div>

            <SupplierProfitControlPanel
              mode="profit"
              onModelsChanged={onRefreshModels}
            />
          </div>
        )}

        {/* TAB 3: Credit Audit Ledger */}
        {activeTab === 'ledger' && (
          <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="jost text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Immutable Credit Ledger (Write-Time Balance After)
                </h4>
                <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                  All generation reservations, refunds, and purchases are logged with balance_after stored at write time.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#2ECC71]/15 text-[#2ECC71] text-xs font-bold font-mono">
                Audit Verified
              </span>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[#FF8800]/15 text-[#6B6B75]">
                    <th className="py-2.5 px-3">Transaction ID</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Delta</th>
                    <th className="py-2.5 px-3">Balance After</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {transactions.slice(-10).reverse().map((tx) => (
                    <tr key={tx.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                      <td className="py-2 px-3 font-mono text-[11px] text-[#6B6B75]">{tx.id}</td>
                      <td className="py-2 px-3">
                        <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10">
                          {tx.type}
                        </span>
                      </td>
                      <td className={`py-2 px-3 font-mono font-bold ${tx.amount >= 0 ? 'text-[#2ECC71]' : 'text-[#FF4B4B]'}`}>
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-brand-gradient">
                        {tx.balance_after}
                      </td>
                      <td className="py-2 px-3 text-[#1A1A1E] dark:text-[#F5F5F7] max-w-xs truncate">
                        {tx.description}
                      </td>
                      <td className="py-2 px-3 text-[#6B6B75] text-[11px]">
                        {new Date(tx.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: Affiliates & Payouts */}
        {activeTab === 'affiliates' && (
          <div className="flex flex-col gap-6">
            {/* Notification alert banner */}
            {payoutStatusMsg && (
              <div className="p-4 rounded-2xl bg-[#2ECC71]/10 border border-[#2ECC71]/30 flex items-center justify-between text-xs text-[#2ECC71] font-semibold">
                <div className="flex items-center gap-2">
                  <Check size={16} />
                  <span>{payoutStatusMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPayoutStatusMsg(null)}
                  className="opacity-70 hover:opacity-100 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Top KPI Metrics Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl glass-panel border border-[#FF8800]/20 flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] flex items-center gap-1.5">
                  <Users size={13} className="text-[#FF8800]" />
                  <span>Active Referrers</span>
                </span>
                <span className="font-mono text-2xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  {leaderboard.length}
                </span>
                <span className="text-[10px] text-[#6B6B75]">Enrolled in referral program</span>
              </div>

              <div className="p-4 rounded-2xl glass-panel border border-[#FF8800]/20 flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] flex items-center gap-1.5">
                  <CheckCircle size={13} className="text-[#2ECC71]" />
                  <span>Qualified Invites</span>
                </span>
                <span className="font-mono text-2xl font-bold text-[#2ECC71]">
                  {leaderboard.reduce((acc, curr) => acc + curr.qualified_count, 0)}
                </span>
                <span className="text-[10px] text-[#6B6B75]">First MoMo deposit completed</span>
              </div>

              <div className="p-4 rounded-2xl glass-panel border border-[#FF8800]/20 flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] flex items-center gap-1.5">
                  <Clock size={13} className="text-[#F86A00]" />
                  <span>Pending Payouts</span>
                </span>
                <span className="font-mono text-2xl font-bold text-brand-gradient">
                  {payoutQueue.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()} FCFA
                </span>
                <span className="text-[10px] text-[#6B6B75]">{payoutQueue.length} rewards awaiting transfer</span>
              </div>

              <div className="p-4 rounded-2xl glass-panel border border-[#FF8800]/20 flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] flex items-center gap-1.5">
                  <ShieldAlert size={13} className="text-[#FF4B4B]" />
                  <span>Fraud / Sybil Flags</span>
                </span>
                <span className="font-mono text-2xl font-bold text-[#FF4B4B]">
                  {fraudFlags.length}
                </span>
                <span className="text-[10px] text-[#6B6B75]">Multi-account / velocity triggers</span>
              </div>
            </div>

            {/* SECTION 1: Affiliate Leaderboard */}
            <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-2">
                    <Share2 size={16} className="text-[#FF8800]" />
                    <span>Affiliate Partner Leaderboard</span>
                  </h4>
                  <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                    Top performing African creators driving qualified customer acquisition.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-[#FF8800]/10 text-[#FF8800]">
                  500 FCFA / Qualified Conversion
                </span>
              </div>

              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#FF8800]/15 text-[#6B6B75]">
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="py-2.5 px-3">Referrer</th>
                      <th className="py-2.5 px-3">Affiliate Code</th>
                      <th className="py-2.5 px-3">Signups</th>
                      <th className="py-2.5 px-3">Qualified</th>
                      <th className="py-2.5 px-3">Conversion</th>
                      <th className="py-2.5 px-3">Total Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5">
                    {leaderboard.map((item, idx) => {
                      const convRate = item.signups_count > 0
                        ? Math.round((item.qualified_count / item.signups_count) * 100)
                        : 0;
                      return (
                        <tr key={item.referrer_id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#6B6B75]">
                            #{idx + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col">
                              <span className="font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">{item.name}</span>
                              <span className="text-[10px] text-[#6B6B75]">{item.email}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-brand-gradient">
                            {item.code}
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {item.signups_count}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#2ECC71]">
                            {item.qualified_count}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#6B6B75]">
                            {convRate}%
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                            {item.total_earned_fcfa.toLocaleString()} FCFA
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECTION 2: Payout Queue & Batch Settlement */}
            <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#FF8800]/15">
                <div>
                  <h4 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-2">
                    <DollarSign size={16} className="text-[#2ECC71]" />
                    <span>Payout Queue & Mobile Money Batch Processing</span>
                  </h4>
                  <p className="inter text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
                    Rewards are held for 7 days to guard against chargebacks and payment rejections before disbursement.
                  </p>
                </div>

                {/* Batch Action Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={batchReference}
                    onChange={(e) => setBatchReference(e.target.value)}
                    placeholder="Batch Ref e.g. MOMO-BATCH-01"
                    className="py-1.5 px-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-mono text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:border-[#FF8800]"
                  />
                  <button
                    type="button"
                    onClick={handleMarkBatchPaid}
                    disabled={selectedPayoutIds.length === 0}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-brand-gradient hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
                  >
                    <Send size={13} />
                    <span>Mark Selected Paid ({selectedPayoutIds.length})</span>
                  </button>
                </div>
              </div>

              {payoutQueue.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#6B6B75]">
                  No pending payouts in queue. All qualified rewards are settled.
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#FF8800]/15 text-[#6B6B75]">
                        <th className="py-2 px-3 w-8">
                          <button
                            type="button"
                            onClick={handleToggleSelectAllPayable}
                            className="text-[#6B6B75] hover:text-[#FF8800]"
                            title="Select all payable"
                          >
                            <CheckSquare size={16} />
                          </button>
                        </th>
                        <th className="py-2.5 px-3">Reward ID</th>
                        <th className="py-2.5 px-3">Referrer</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Qualified Date</th>
                        <th className="py-2.5 px-3">Hold Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/5">
                      {payoutQueue.map((item) => {
                        const isSelected = selectedPayoutIds.includes(item.id);
                        return (
                          <tr key={item.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                            <td className="py-2.5 px-3">
                              <button
                                type="button"
                                onClick={() => handleToggleSelectPayout(item.id)}
                                disabled={!item.is_payable}
                                className={`cursor-pointer ${!item.is_payable ? 'opacity-30 cursor-not-allowed' : 'text-[#FF8800]'}`}
                              >
                                {isSelected ? (
                                  <CheckSquare size={16} className="text-[#FF8800]" />
                                ) : (
                                  <Square size={16} className="text-[#6B6B75]" />
                                )}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#6B6B75]">
                              {item.id}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">{item.referrer_name}</span>
                                <span className="text-[10px] text-[#6B6B75]">{item.referrer_email}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-brand-gradient">
                              {item.amount.toLocaleString()} FCFA
                            </td>
                            <td className="py-2.5 px-3 text-[#6B6B75] text-[11px]">
                              {new Date(item.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-3">
                              {item.is_payable ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2ECC71]/15 text-[#2ECC71]">
                                  <Check size={11} />
                                  <span>Payable (Hold Cleared)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF8800]/15 text-[#FF8800]">
                                  <Clock size={11} />
                                  <span>Hold ({item.hold_days_remaining ?? 7}d left)</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* SECTION 3: Fraud & Sybil Prevention Flags */}
            <div className="p-6 rounded-3xl glass-panel border border-[#FF4B4B]/20 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#FF4B4B]/15">
                <div className="flex items-center gap-2">
                  <AlertOctagon size={18} className="text-[#FF4B4B]" />
                  <h4 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Fraud & Abuse Detection Rules (Anti-Sybil Guard)
                  </h4>
                </div>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FF4B4B]/10 text-[#FF4B4B]">
                  {fraudFlags.length} Flagged Incidents
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {fraudFlags.map((flag) => (
                  <div
                    key={flag.id}
                    className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${flag.severity === 'high' ? 'bg-[#FF4B4B]/15 text-[#FF4B4B]' : 'bg-[#FF8800]/15 text-[#FF8800]'}`}>
                        <ShieldAlert size={16} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                            {flag.type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-brand-gradient">
                            Code: {flag.affiliate_code}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${flag.severity === 'high' ? 'bg-[#FF4B4B]/20 text-[#FF4B4B]' : 'bg-[#FF8800]/20 text-[#FF8800]'}`}>
                            {flag.severity}
                          </span>
                        </div>
                        <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                          {flag.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <span className="text-[10px] font-mono text-[#6B6B75]">
                        {new Date(flag.created_at).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setFraudFlags((prev) => prev.filter((f) => f.id !== flag.id));
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold glass-panel border border-black/10 dark:border-white/10 hover:border-[#2ECC71] hover:text-[#2ECC71] transition-all cursor-pointer"
                      >
                        Dismiss / Clear
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Users & Growth (Active User Counters) */}
        {activeTab === 'users' && (
          <div className="flex flex-col gap-6">
            {/* Header / Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="jost text-xl font-bold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-2">
                  <UserPlus className="text-[#FF8800]" size={22} />
                  Users & Growth Counters
                </h3>
                <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
                  Control the live active member and subscriber counts featured on the landing page.
                  In production, counts auto-increment from database signups and tier upgrades, with optional admin override.
                </p>
              </div>

              <button
                type="button"
                onClick={loadPlatformStats}
                disabled={statsLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel text-xs font-semibold text-[#6B6B75] hover:text-[#F86A00] transition-colors self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw size={14} className={statsLoading ? 'animate-spin' : ''} />
                <span>Refresh Live Counts</span>
              </button>
            </div>

            {/* Status Notifications */}
            {statsSuccessMsg && (
              <div className="p-3 rounded-2xl bg-[#2ECC71]/10 border border-[#2ECC71]/20 text-[#2ECC71] text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <CheckCircle size={16} className="shrink-0" />
                <span>{statsSuccessMsg}</span>
              </div>
            )}
            {statsErrorMsg && (
              <div className="p-3 rounded-2xl bg-[#FF4B4B]/10 border border-[#FF4B4B]/20 text-[#FF4B4B] text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{statsErrorMsg}</span>
              </div>
            )}

            {/* Live Counter Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Metric 1: Total Active Users */}
              <div className="p-6 rounded-3xl glass-panel border border-black/5 dark:border-white/5 flex flex-col justify-between gap-5 relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] block">
                      Metric 01
                    </span>
                    <h4 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7] mt-0.5">
                      Total Active Users
                    </h4>
                    <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
                      Displayed on the landing page hero & proof bar (e.g., 2,000+ African Creators).
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#FF8800]/10 text-[#FF8800]">
                    <Users size={22} />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex items-baseline justify-between">
                  <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] font-medium">
                    Current Public Value:
                  </span>
                  <span className="jost text-2xl font-extrabold text-brand-gradient">
                    {platformStats.totalUsers.toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                    Update Metric Value (Admin Override):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={editingTotalUsers}
                      onChange={(e) => setEditingTotalUsers(e.target.value)}
                      placeholder="e.g. 2000"
                      className="flex-1 px-3.5 py-2.5 rounded-xl glass-panel text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:border-[#FF8800]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRequestSaveStat('total_users', editingTotalUsers)}
                      disabled={statsLoading}
                      className="px-4 py-2.5 rounded-xl bg-brand-gradient text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Save size={14} />
                      <span>Save</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA] flex items-center gap-1">
                    <Lock size={11} />
                    PIN re-verification required on save
                  </span>
                </div>
              </div>

              {/* Metric 2: Paid Subscribers */}
              <div className="p-6 rounded-3xl glass-panel border border-black/5 dark:border-white/5 flex flex-col justify-between gap-5 relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#6B6B75] dark:text-[#A0A0AA] block">
                      Metric 02
                    </span>
                    <h4 className="jost text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7] mt-0.5">
                      Paid Subscribers
                    </h4>
                    <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
                      Creators on Starter, Pro, or Studio tiers (e.g., 140+ Paying Creators).
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#2ECC71]/10 text-[#2ECC71]">
                    <DollarSign size={22} />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex items-baseline justify-between">
                  <span className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] font-medium">
                    Current Public Value:
                  </span>
                  <span className="jost text-2xl font-extrabold text-[#2ECC71]">
                    {platformStats.paidUsers.toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-[#6B6B75] dark:text-[#A0A0AA]">
                    Update Metric Value (Admin Override):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={editingPaidUsers}
                      onChange={(e) => setEditingPaidUsers(e.target.value)}
                      placeholder="e.g. 140"
                      className="flex-1 px-3.5 py-2.5 rounded-xl glass-panel text-sm font-bold text-[#1A1A1E] dark:text-[#F5F5F7] focus:outline-none focus:border-[#FF8800]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRequestSaveStat('paid_users', editingPaidUsers)}
                      disabled={statsLoading}
                      className="px-4 py-2.5 rounded-xl bg-brand-gradient text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Save size={14} />
                      <span>Save</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-[#6B6B75] dark:text-[#A0A0AA] flex items-center gap-1">
                    <Lock size={11} />
                    PIN re-verification required on save
                  </span>
                </div>
              </div>
            </div>

            {/* Architecture note card */}
            <div className="p-5 rounded-2xl glass-panel border border-[#FF8800]/15 bg-white/50 dark:bg-black/20 text-xs text-[#6B6B75] dark:text-[#A0A0AA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <strong className="text-[#1A1A1E] dark:text-[#F5F5F7] block">
                  Security & Persistence Guarantee:
                </strong>
                <span>
                  Updates are signed server-side via the <code>admin_set_platform_stat</code> RPC using PIN-hash verification and broadcasted in real time via Supabase Realtime channel.
                </span>
              </div>
              <span className="text-[10px] font-mono shrink-0">
                Last updated: {new Date(platformStats.updatedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}

        {/* TAB 4: Launch Checklist */}
        {activeTab === 'checklist' && (
          <div className="p-6 rounded-3xl glass-panel border border-[#FF8800]/20 flex flex-col gap-4">
            <h4 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              Production Commercial Readiness Checklist
            </h4>
            <div className="flex flex-col gap-2.5 text-xs text-[#1A1A1E] dark:text-[#F5F5F7]">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                <CheckCircle size={16} className="text-[#2ECC71] shrink-0" />
                <span><strong>Central Pricing Engine:</strong> Implemented in src/services/pricingEngine.ts. No hardcoded prices.</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                <CheckCircle size={16} className="text-[#2ECC71] shrink-0" />
                <span><strong>Model Router & Fallback:</strong> Cost-aware fallback logic verified (never fails over to &gt;25% costlier model).</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                <CheckCircle size={16} className="text-[#2ECC71] shrink-0" />
                <span><strong>Licensing Verification Gate:</strong> Strict unverified model lock implemented.</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                <CheckCircle size={16} className="text-[#2ECC71] shrink-0" />
                <span><strong>Immutable Credit Ledger:</strong> Two-phase reservation and write-time balance_after logging operational.</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                <CheckCircle size={16} className="text-[#2ECC71] shrink-0" />
                <span><strong>FuturaPay Mobile Money:</strong> MTN MoMo and Orange Money checkout with server-side webhook simulation & idempotency.</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                <CheckCircle size={16} className="text-[#2ECC71] shrink-0" />
                <span><strong>PIN-Gated Admin Architecture:</strong> Secure PIN modal gate and decoupled left-rail AdminShell.</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                <CheckCircle size={16} className="text-[#2ECC71] shrink-0" />
                <span><strong>Platform Stats & User Counter:</strong> Live auto-incrementing active user count with admin manual override.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Admin PIN Re-verification Modal for Platform Stat Override */}
      <AdminPinModal
        isOpen={pinModalOpen}
        onClose={() => {
          setPinModalOpen(false);
          setPendingStatSave(null);
        }}
        onSuccess={handlePinSuccessForStat}
      />
    </AdminShell>
  );
};
