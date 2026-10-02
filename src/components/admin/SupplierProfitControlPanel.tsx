import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Edit3,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldAlert,
  Sliders,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  AdminModelItem,
  AdminModelSupplierRow,
  AdminPlanLimitRow,
  AdminProfitReportResponse,
  AdminSupplierSummary,
  fetchAdminModels,
  fetchAdminPlanLimits,
  fetchAdminProfitReport,
  updateAdminModel,
  updateAdminModelSupplier,
  updateAdminPlanLimit,
  updateAdminSupplier,
} from '../../services/apiClient';
import { toast } from '../../services/toast';

interface SupplierProfitControlPanelProps {
  mode: 'models_suppliers' | 'profit';
  onModelsChanged?: () => void;
}

export const SupplierProfitControlPanel: React.FC<SupplierProfitControlPanelProps> = ({
  mode,
  onModelsChanged,
}) => {
  const [adminModels, setAdminModels] = useState<AdminModelItem[]>([]);
  const [suppliers, setSuppliers] = useState<AdminSupplierSummary[]>([]);
  const [planLimits, setPlanLimits] = useState<AdminPlanLimitRow[]>([]);
  const [providerEnv, setProviderEnv] = useState<'dev' | 'prod'>('dev');
  const [profitReport, setProfitReport] = useState<AdminProfitReportResponse | null>(null);
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [licenceNoteDraft, setLicenceNoteDraft] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'models_suppliers') {
        const [mRes, pRes, limRes] = await Promise.all([
          fetchAdminModels().catch(() => null),
          fetchAdminProfitReport(days).catch(() => null),
          fetchAdminPlanLimits().catch(() => null),
        ]);
        if (mRes?.models) {
          setAdminModels(mRes.models);
          if (mRes.provider_env) setProviderEnv(mRes.provider_env);
        }
        if (pRes?.suppliers) {
          setSuppliers(pRes.suppliers);
          if (pRes.provider_env) setProviderEnv(pRes.provider_env);
        }
        if (limRes?.plan_limits) {
          setPlanLimits(limRes.plan_limits);
        }
      } else {
        const rep = await fetchAdminProfitReport(days).catch(() => null);
        if (rep) {
          setProfitReport(rep);
          setSuppliers(rep.suppliers || []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [mode, days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [licenceConfirm, setLicenceConfirm] = useState<{ model: AdminModelItem; note: string } | null>(null);

  const applyModelPatch = async (
    m: AdminModelItem,
    patch: { active?: boolean; licensing_verified?: boolean; licence_note?: string | null }
  ) => {
    setBusyModelId(m.id);
    try {
      await updateAdminModel(m.id, patch);
      toast.success(
        patch.active === false
          ? `${m.display_name} hidden from users`
          : `${m.display_name} is now live for users`
      );
      await loadData();
      onModelsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update model');
    } finally {
      setBusyModelId(null);
    }
  };

  const handleVisibilitySwitch = (m: AdminModelItem, nextOn: boolean) => {
    if (nextOn && !m.licensing_verified) {
      setLicenceConfirm({ model: m, note: m.licence_note || '' });
      return;
    }
    applyModelPatch(m, { active: nextOn });
  };

  const confirmLicenceAndActivate = async () => {
    if (!licenceConfirm) return;
    const note = licenceConfirm.note.trim();
    if (!note) {
      toast.error('Write a licence note first (who approved it, which terms, when).');
      return;
    }
    await applyModelPatch(licenceConfirm.model, {
      licensing_verified: true,
      active: true,
      licence_note: note,
    });
    setLicenceConfirm(null);
  };

  const handleSaveLicenceNote = async (model: AdminModelItem) => {
    try {
      await updateAdminModel(model.id, {
        licence_note: licenceNoteDraft.trim() || null,
      });
      toast.success(`Saved licence note for ${model.display_name}`);
      setEditingModelId(null);
      await loadData();
      onModelsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save licence note');
    }
  };

  const handleSupplierOrderChange = async (
    model: AdminModelItem,
    index: number,
    direction: 'up' | 'down'
  ) => {
    const list = [...(model.model_suppliers || [])].sort((a, b) => a.priority - b.priority);
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;

    const itemA = list[index];
    const itemB = list[swapIdx];

    try {
      await Promise.all([
        updateAdminModelSupplier(itemA.id, { priority: swapIdx + 1 }),
        updateAdminModelSupplier(itemB.id, { priority: index + 1 }),
      ]);
      toast.success(`Updated supplier priority for ${model.display_name}`);
      await loadData();
      onModelsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reorder suppliers');
    }
  };

  const handleToggleModelSupplier = async (row: AdminModelSupplierRow) => {
    try {
      await updateAdminModelSupplier(row.id, { enabled: !row.enabled });
      toast.success(`Updated ${row.supplier} route`);
      await loadData();
      onModelsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update model supplier');
    }
  };

  const handleToggleSupplierGlobal = async (s: AdminSupplierSummary) => {
    try {
      await updateAdminSupplier(s.supplier, { enabled: !s.enabled });
      toast.success(`${s.supplier} ${!s.enabled ? 'enabled' : 'disabled'}`);
      await loadData();
      onModelsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update supplier');
    }
  };

  const handleUpdateSupplierCap = async (s: AdminSupplierSummary, rawValue: string) => {
    const num = rawValue.trim() === '' ? null : parseFloat(rawValue);
    if (num !== null && (!Number.isFinite(num) || num < 0)) return;
    try {
      await updateAdminSupplier(s.supplier, { daily_spend_limit_usd: num });
      toast.success(`Updated daily spend cap for ${s.supplier}`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update cap');
    }
  };

  const handleResetBreaker = async (s: AdminSupplierSummary) => {
    try {
      await updateAdminSupplier(s.supplier, { clear_trip: true });
      toast.success(`Circuit breaker cleared for ${s.supplier}`);
      await loadData();
      onModelsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to clear circuit breaker');
    }
  };

  const handleUpdatePlanLimit = async (
    row: AdminPlanLimitRow,
    field: 'max_video_seconds' | 'premium_monthly_cap',
    rawVal: string
  ) => {
    const val = parseInt(rawVal, 10);
    if (!Number.isFinite(val) || val < 0) return;
    try {
      await updateAdminPlanLimit(row.plan_tier, { [field]: val });
      toast.success(`Updated ${row.plan_tier.toUpperCase()} ${field}`);
      await loadData();
      onModelsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update plan limit');
    }
  };

  if (mode === 'profit') {
    const totals = profitReport?.totals;
    const dailyRows = profitReport?.daily || [];
    const lowMarginRows = dailyRows.filter(
      (r) => r.margin_pct !== null && r.margin_pct < 45
    );

    return (
      <div className="space-y-6 mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl glass-panel border border-[#FF8800]/25">
          <div>
            <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-2">
              <TrendingUp size={18} className="text-[#FF8800]" />
              <span>Real Provider Cost Ledger & Daily Profit Report (`v_profit_daily`)</span>
            </h3>
            <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
              Live reconciliation of revenue floor (XAF), actual provider cost (XAF), and realized gross margin.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs cursor-pointer transition-colors ${
                  days === d
                    ? 'bg-brand-gradient text-white font-bold'
                    : 'glass-panel text-[#6B6B75] dark:text-[#A0A0AA]'
                }`}
              >
                {d}d
              </button>
            ))}
            <button
              type="button"
              onClick={loadData}
              className="p-2 rounded-xl glass-panel text-[#6B6B75] hover:text-[#FF8800] cursor-pointer"
              title="Refresh report"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-[#FF8800]' : ''} />
            </button>
          </div>
        </div>

        {/* Warning Banner for any model/day with margin < 45% */}
        {lowMarginRows.length > 0 && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3">
            <AlertTriangle size={20} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-600 dark:text-rose-400">
              <p className="font-bold mb-1">
                Margin Alert: {lowMarginRows.length} daily model/supplier bucket(s) below 45% target gross margin
              </p>
              <p>
                {lowMarginRows
                  .slice(0, 5)
                  .map((r) => `${r.model_id} via ${r.supplier} (${r.margin_pct?.toFixed(1)}%)`)
                  .join(' · ')}
              </p>
            </div>
          </div>
        )}

        {/* Top KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl glass-panel">
            <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] uppercase font-bold">
              Succeeded Runs ({days}d)
            </span>
            <p className="font-mono text-xl font-extrabold text-[#1A1A1E] dark:text-[#F5F5F7] mt-1">
              {(totals?.succeeded_count ?? 0).toLocaleString()}
            </p>
            <span className="text-[11px] font-mono text-[#6B6B75] dark:text-[#A0A0AA]">
              Completed billable generations
            </span>
          </div>

          <div className="p-4 rounded-2xl glass-panel">
            <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] uppercase font-bold">
              Revenue Floor ({days}d)
            </span>
            <p className="font-mono text-xl font-extrabold text-[#FF8800] mt-1">
              {(totals?.revenue_floor_xaf ?? 0).toLocaleString()} FCFA
            </p>
            <span className="text-[11px] font-mono text-[#6B6B75] dark:text-[#A0A0AA]">
              At 0.79 XAF / credit floor
            </span>
          </div>

          <div className="p-4 rounded-2xl glass-panel">
            <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] uppercase font-bold">
              Real Provider Cost ({days}d)
            </span>
            <p className="font-mono text-xl font-extrabold text-rose-500 mt-1">
              {(totals?.total_cost_xaf ?? 0).toLocaleString()} FCFA
            </p>
            <span className="text-[11px] font-mono text-[#6B6B75] dark:text-[#A0A0AA]">
              From provider_cost_ledger
            </span>
          </div>

          <div className="p-4 rounded-2xl glass-panel">
            <span className="text-[11px] text-[#6B6B75] dark:text-[#A0A0AA] uppercase font-bold">
              Real Gross Margin
            </span>
            <p
              className={`font-mono text-xl font-extrabold mt-1 ${
                totals?.margin_pct !== null && (totals?.margin_pct ?? 100) < 45
                  ? 'text-rose-500'
                  : 'text-emerald-500'
              }`}
            >
              {totals?.margin_pct !== null && totals?.margin_pct !== undefined
                ? `${totals.margin_pct.toFixed(1)}%`
                : '—'}
            </p>
            <span className="text-[11px] font-mono text-[#6B6B75] dark:text-[#A0A0AA]">
              Target ≥ 55% (warn &lt; 45%)
            </span>
          </div>
        </div>

        {/* Daily Profit & Cost Breakdown Table */}
        <div className="p-5 rounded-2xl glass-panel">
          <h4 className="jost text-sm font-bold mb-3">Daily Profit & Cost Ledger (`v_profit_daily`)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/5 text-[10px] uppercase text-[#6B6B75] dark:text-[#A0A0AA]">
                  <th className="pb-2">Day (UTC)</th>
                  <th className="pb-2">Model</th>
                  <th className="pb-2">Supplier</th>
                  <th className="pb-2">Env</th>
                  <th className="pb-2">OK / Fail</th>
                  <th className="pb-2">Rev Floor (FCFA)</th>
                  <th className="pb-2">Cost (FCFA)</th>
                  <th className="pb-2">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono">
                {dailyRows.map((row, idx) => {
                  const low = row.margin_pct !== null && row.margin_pct < 45;
                  return (
                    <tr key={`${row.day_utc}-${row.model_id}-${row.supplier}-${idx}`}>
                      <td className="py-2">{row.day_utc}</td>
                      <td className="py-2 font-sans font-semibold">{row.model_id}</td>
                      <td className="py-2 uppercase text-[#FF8800] font-bold">{row.supplier}</td>
                      <td className="py-2 uppercase">{row.env}</td>
                      <td className="py-2">
                        {row.succeeded_count} / {row.failed_count}
                      </td>
                      <td className="py-2">{row.revenue_floor_xaf.toLocaleString()}</td>
                      <td className="py-2 text-rose-400">{row.total_cost_xaf.toLocaleString()}</td>
                      <td className={`py-2 font-bold ${low ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {row.margin_pct !== null ? `${row.margin_pct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
                {dailyRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-[#6B6B75]">
                      No provider ledger entries in the selected window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // mode === 'models_suppliers'
  return (
    <div className="space-y-6 mt-6">
      {/* Suppliers & Safety Section */}
      <div className="p-5 rounded-2xl glass-panel border border-[#FF8800]/25 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Server size={18} className="text-[#FF8800]" />
              <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                Suppliers, Daily Caps & Circuit Breakers
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                  providerEnv === 'prod'
                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                }`}
              >
                ENV: {providerEnv.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] mt-0.5">
              Same-model supplier routing with automatic circuit breaker and daily USD / call caps.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel text-xs font-semibold hover:text-[#FF8800] cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-[#FF8800]' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {suppliers.map((s) => {
            const tripped =
              s.tripped_until && new Date(s.tripped_until).getTime() > Date.now();
            return (
              <div
                key={s.supplier}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  tripped
                    ? 'border-rose-500/40 bg-rose-500/5'
                    : s.enabled
                    ? 'border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]'
                    : 'border-black/5 dark:border-white/5 opacity-60'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-extrabold uppercase text-[#1A1A1E] dark:text-[#F5F5F7]">
                        {s.supplier}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          s.configured
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-rose-500/15 text-rose-500'
                        }`}
                      >
                        {s.configured ? 'Key OK' : 'Not Configured'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleSupplierGlobal(s)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase cursor-pointer ${
                        s.enabled
                          ? 'bg-emerald-500/20 text-emerald-500'
                          : 'bg-black/10 dark:bg-white/10 text-[#6B6B75]'
                      }`}
                    >
                      {s.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono">
                    <div className="p-2 rounded-xl bg-black/5 dark:bg-white/5">
                      <span className="text-[10px] text-[#6B6B75] block">Spend Today / Limit</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="font-bold">${Number(s.spend_today_usd || 0).toFixed(2)}</span>
                        <span>/ $</span>
                        <input
                          type="number"
                          step="1"
                          defaultValue={s.daily_spend_limit_usd ?? ''}
                          placeholder="∞"
                          onBlur={(e) => handleUpdateSupplierCap(s, e.target.value)}
                          className="w-14 bg-transparent border-b border-black/20 dark:border-white/20 focus:border-[#FF8800] focus:outline-none text-xs font-bold"
                        />
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-black/5 dark:bg-white/5">
                      <span className="text-[10px] text-[#6B6B75] block">Dev Guard</span>
                      <span className="text-[10px] font-bold block mt-0.5 truncate" title={s.dev_cap_usage?.cap_description}>
                        {s.dev_cap_usage?.cap_description || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {s.trip_reason && (
                    <p className="text-[10px] font-mono text-rose-400 truncate" title={s.trip_reason}>
                      Trip reason: {s.trip_reason}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
                  {tripped ? (
                    <span className="text-[10px] font-mono font-bold text-rose-500 flex items-center gap-1">
                      <ShieldAlert size={12} />
                      Tripped until {new Date(s.tripped_until!).toLocaleTimeString()}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Healthy
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleResetBreaker(s)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg glass-panel text-[10px] font-bold text-[#FF8800] hover:border-[#FF8800] cursor-pointer"
                  >
                    <RotateCcw size={11} />
                    <span>Clear trip</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan Limits Editor */}
      {planLimits.length > 0 && (
        <div className="p-5 rounded-2xl glass-panel border border-[#FF8800]/25 space-y-3">
          <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
            Plan Limits (`max_video_seconds` & `premium_monthly_cap`)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {planLimits.map((row) => (
              <div
                key={row.plan_tier}
                className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-2 font-mono text-xs"
              >
                <span className="uppercase font-extrabold text-[#FF8800] block">
                  {row.plan_tier}
                </span>
                <div>
                  <label className="text-[10px] text-[#6B6B75] block">Max Video Seconds</label>
                  <input
                    type="number"
                    defaultValue={row.max_video_seconds}
                    onBlur={(e) => handleUpdatePlanLimit(row, 'max_video_seconds', e.target.value)}
                    className="w-full px-2 py-1 rounded bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#6B6B75] block">Premium Monthly Cap</label>
                  <input
                    type="number"
                    defaultValue={row.premium_monthly_cap}
                    onBlur={(e) => handleUpdatePlanLimit(row, 'premium_monthly_cap', e.target.value)}
                    className="w-full px-2 py-1 rounded bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 font-bold"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Server-Backed Models, Licensing Verification & Ordered Suppliers */}
      <div className="p-5 rounded-2xl glass-panel border border-[#FF8800]/25 space-y-4">
        <div>
          <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7] flex items-center gap-2">
            <Sliders size={18} className="text-[#FF8800]" />
            <span>Models, Licensing Gate & Same-Model Supplier Priority</span>
          </h3>
          <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA]">
            Toggle active status (gated by `licensing_verified`), inspect computed credit prices, and reorder supplier priorities.
          </p>
        </div>

        <div className="space-y-3">
          {adminModels.map((m) => {
            const isEditing = editingModelId === m.id;
            const sortedSuppliers = [...(m.model_suppliers || [])].sort(
              (a, b) => a.priority - b.priority
            );

            return (
              <div
                key={m.id}
                className="p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.015] dark:bg-white/[0.015] space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-[#1A1A1E] dark:text-[#F5F5F7]">
                        {m.display_name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[#6B6B75] dark:text-[#A0A0AA]">
                        {m.id}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#FF8800]/15 text-[#FF8800] font-bold">
                        {m.generation_type} · {m.pricing_kind || 'flat'}
                      </span>
                      {m.promo_eligible && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-bold">
                          Free Credits OK
                        </span>
                      )}
                      {m.is_premium && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 font-bold">
                          Premium Cap
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-[#6B6B75] dark:text-[#A0A0AA] mt-1">
                      Price: <strong className="text-[#F86A00]">{m.computed_credit_cost ?? m.credit_cost} cr</strong>
                      {m.licence_note ? ` · Licence: ${m.licence_note}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-2.5">
                    {/* Read-only Licence Chip */}
                    <span
                      title={
                        m.licence_verified_by || m.licence_verified_at
                          ? `Verified by ${m.licence_verified_by || 'admin'} on ${
                              m.licence_verified_at ? new Date(m.licence_verified_at).toLocaleDateString() : ''
                            }`
                          : undefined
                      }
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.licensing_verified
                          ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                      }`}
                    >
                      {m.licensing_verified ? 'Licence verified' : 'Licence not verified'}
                    </span>

                    {/* Visible to users Switch */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-[#6B6B75] dark:text-[#A0A0AA]">
                        Visible to users
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={m.active}
                        aria-label={`Toggle user visibility for ${m.display_name}`}
                        disabled={busyModelId === m.id}
                        onClick={() => handleVisibilitySwitch(m, !m.active)}
                        className={`min-w-[44px] min-h-[44px] flex items-center justify-center p-0 cursor-pointer ${
                          busyModelId === m.id ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      >
                        <div
                          className={`w-11 h-6 rounded-full transition-colors relative p-0.5 flex items-center ${
                            m.active ? 'bg-[#2ECC71]' : 'bg-black/20 dark:bg-white/20'
                          }`}
                        >
                          {busyModelId === m.id ? (
                            <div className="w-5 h-5 flex items-center justify-center">
                              <Loader2 size={12} className="animate-spin text-white" />
                            </div>
                          ) : (
                            <div
                              className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                                m.active ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          )}
                        </div>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          setEditingModelId(null);
                        } else {
                          setEditingModelId(m.id);
                          setLicenceNoteDraft(m.licence_note || '');
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg glass-panel text-[11px] font-semibold text-[#FF8800] cursor-pointer"
                    >
                      <Edit3 size={12} />
                      <span>{isEditing ? 'Close' : 'Licence Note'}</span>
                    </button>
                  </div>
                </div>

                {/* Supplier Priority Chain for this Model */}
                {sortedSuppliers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-black/5 dark:border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B75]">
                      Suppliers (Priority Order):
                    </span>
                    {sortedSuppliers.map((sup, idx) => (
                      <div
                        key={sup.id}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-mono ${
                          sup.enabled
                            ? 'border-[#FF8800]/30 bg-[#FF8800]/10 text-[#1A1A1E] dark:text-[#F5F5F7]'
                            : 'border-black/10 dark:border-white/10 opacity-50'
                        }`}
                      >
                        <span className="font-bold text-[#FF8800]">#{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleModelSupplier(sup)}
                          className="font-bold uppercase hover:underline cursor-pointer"
                          title="Click to enable/disable this supplier for this model"
                        >
                          {sup.supplier}
                        </button>
                        <span className="text-[10px] text-[#6B6B75]">({sup.upstream_model})</span>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleSupplierOrderChange(m, idx, 'up')}
                          className="p-0.5 hover:text-[#FF8800] disabled:opacity-30 cursor-pointer"
                          title="Move higher priority"
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          type="button"
                          disabled={idx === sortedSuppliers.length - 1}
                          onClick={() => handleSupplierOrderChange(m, idx, 'down')}
                          className="p-0.5 hover:text-[#FF8800] disabled:opacity-30 cursor-pointer"
                          title="Move lower priority"
                        >
                          <ArrowDown size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isEditing && (
                  <div className="p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-[#FF8800]/30 space-y-3">
                    <div>
                      <label className="text-[11px] font-bold block mb-1">
                        Commercial Licence Note
                      </label>
                      <input
                        type="text"
                        value={licenceNoteDraft}
                        onChange={(e) => setLicenceNoteDraft(e.target.value)}
                        placeholder="e.g. Verified commercial terms via DashScope / Cloudflare Workers AI"
                        className="w-full px-3 py-1.5 rounded-lg glass-panel font-mono text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingModelId(null)}
                        className="px-3 py-1.5 rounded-lg glass-panel text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveLicenceNote(m)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-gradient text-white text-xs font-bold cursor-pointer"
                      >
                        <Save size={12} />
                        <span>Save Note</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Licence Verification & Activation Modal */}
      <AnimatePresence>
        {licenceConfirm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLicenceConfirm(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="relative w-full max-h-[85vh] sm:max-h-none sm:max-w-md bg-white dark:bg-[#18181B] rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-black/10 dark:border-white/10 z-10 overflow-y-auto flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Lock size={16} />
                  </div>
                  <h3 className="jost text-base font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                    Turn on {licenceConfirm.model.display_name}?
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setLicenceConfirm(null)}
                  className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#6B6B75] cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] leading-relaxed">
                This model has not been licence-verified. By continuing you confirm that its
                commercial licence/terms have been reviewed and that using it in a paid product is allowed.
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
                  Licence note <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={licenceConfirm.note}
                  onChange={(e) =>
                    setLicenceConfirm((prev) => (prev ? { ...prev, note: e.target.value } : null))
                  }
                  placeholder="Who approved it, which terms, when (e.g. Approved by Grace, Cloudflare Workers AI Terms of Service, 2026-10-02)"
                  className="w-full px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-mono resize-none focus:outline-hidden focus:ring-1 focus:ring-[#FF8800]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLicenceConfirm(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold glass-panel text-[#6B6B75] dark:text-[#A0A0AA] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmLicenceAndActivate}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-gradient shadow-xs cursor-pointer"
                >
                  Verify &amp; turn on
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
