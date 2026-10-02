import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiModelConfig, PlanTier } from '../types';
import { INITIAL_AI_MODELS } from '../services/configData';
import { fetchPublicModels, PlanLimitInfo } from '../services/apiClient';
import { getSupabaseClient, hasSupabaseEnv } from '../services/persistence';
import { modelRouter } from '../services/modelRouter';

export function useModelCatalog() {
  const [models, setModels] = useState<AiModelConfig[]>(INITIAL_AI_MODELS);
  const [planLimits, setPlanLimits] = useState<Record<PlanTier, PlanLimitInfo> | undefined>(undefined);
  const [providerEnv, setProviderEnv] = useState<'dev' | 'prod'>('dev');
  const lastVersion = useRef<number>(0);
  const realtimeOk = useRef(false);

  const refresh = useCallback(async (fresh = false) => {
    try {
      const data: any = await fetchPublicModels(fresh);
      if (Array.isArray(data?.models) && data.models.length > 0) {
        setModels(data.models);
        modelRouter.updateModels(data.models); // fixes the stale-closure bug in handleUpdateModel
      }
      if (data?.plan_limits) setPlanLimits(data.plan_limits);
      if (data?.provider_env === 'dev' || data?.provider_env === 'prod') setProviderEnv(data.provider_env);
    } catch (err) {
      console.warn('[useModelCatalog] /api/models unavailable, keeping current list:', err);
    }
  }, []);

  const checkVersion = useCallback(async () => {
    try {
      const r = await fetch('/api/models/version', { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (typeof version === 'number' && version !== lastVersion.current) {
        const first = lastVersion.current === 0;
        lastVersion.current = version;
        if (!first) await refresh(true);
      }
    } catch {
      /* ignore */
    }
  }, [refresh]);

  useEffect(() => {
    refresh(false).then(checkVersion);

    // 1) Supabase realtime on catalog_version (instant)
    let cleanup: (() => void) | undefined;
    if (hasSupabaseEnv()) {
      const sb = getSupabaseClient();
      if (sb) {
        const ch = sb
          .channel('catalog_version')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'catalog_version' },
            () => {
              checkVersion();
            }
          )
          .subscribe((status: string) => {
            realtimeOk.current = status === 'SUBSCRIBED';
          });
        cleanup = () => {
          sb.removeChannel(ch);
        };
      }
    }

    // 2) Safety-net polling: every 20 s (cheap — returns one integer), plus on tab focus.
    const poll = window.setInterval(checkVersion, 20_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cleanup?.();
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh, checkVersion]);

  return { models, setModels, planLimits, providerEnv, refresh, checkVersion };
}
