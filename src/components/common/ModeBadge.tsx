import React, { useEffect, useState } from 'react';
import { Database, AlertTriangle, ShieldCheck, Info } from 'lucide-react';
import { fetchServerInfo, ServerInfo } from '../../services/serverInfo';

interface ModeBadgeProps {
  className?: string;
}

export const ModeBadge: React.FC<ModeBadgeProps> = ({ className = '' }) => {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    fetchServerInfo().then((info) => {
      if (info) setServerInfo(info);
    });
  }, []);

  if (!serverInfo) return null;

  const isDemo = serverInfo.mode === 'demo';

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        id="bidou-mode-badge-btn"
        onClick={() => setShowTooltip((v) => !v)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 border ${
          isDemo
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
        }`}
        title={isDemo ? 'Running in Demo Sandbox Mode' : 'Connected to Live Supabase'}
        aria-label={isDemo ? 'Demo Mode' : 'Live Mode'}
      >
        {isDemo ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="font-mono text-[10px]">DEMO DATA</span>
            <Info className="w-3 h-3 opacity-70" />
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="font-mono text-[10px]">LIVE</span>
          </>
        )}
      </button>

      {showTooltip && (
        <div
          id="bidou-mode-badge-tooltip"
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-64 p-3 bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-xl shadow-2xl text-left pointer-events-none"
        >
          <div className="flex items-center gap-2 mb-1.5">
            {isDemo ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="text-xs font-bold text-white">
              {isDemo ? 'Sandboxed Demo Mode' : 'Live Production Mode'}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-300">
            {isDemo
              ? 'Supabase credentials are not connected. Generations, credit transactions, and assets run safely in an isolated in-memory test sandbox.'
              : 'Securely connected to Supabase Postgres, Auth, and Storage. Real credits, payments, and assets are fully authoritative.'}
          </p>
          <div className="mt-2 pt-2 border-t border-neutral-800 flex items-center justify-between text-[10px] text-neutral-400">
            <span>Gemini: {serverInfo.providers.gemini ? '✓ Connected' : '✗ Unset'}</span>
            <span>MusicAPI: {serverInfo.providers.musicapi ? '✓' : '✗'}</span>
            <span>Sunor: {serverInfo.providers.sunor ? '✓' : '✗'}</span>
          </div>
        </div>
      )}
    </div>
  );
};
