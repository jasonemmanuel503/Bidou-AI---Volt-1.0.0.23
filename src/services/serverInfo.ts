export interface ServerInfo {
  status: string;
  service: string;
  mode: 'live' | 'demo';
  requireLiveMode: boolean;
  providers: {
    gemini: boolean;
    musicapi: boolean;
    sunor?: boolean;
    futurapay: boolean;
  };
  geminiConfigured: boolean;
  supabaseConfigured: boolean;
  musicApiConfigured: boolean;
  sunorConfigured?: boolean;
  timestamp: string;
}

let cachedServerInfo: ServerInfo | null = null;
let fetchPromise: Promise<ServerInfo | null> | null = null;

export async function fetchServerInfo(forceRefresh = false): Promise<ServerInfo | null> {
  if (!forceRefresh && cachedServerInfo) {
    return cachedServerInfo;
  }
  if (fetchPromise && !forceRefresh) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) {
        throw new Error(`Failed to fetch server info: ${res.status}`);
      }
      const data = await res.json();
      const info: ServerInfo = {
        status: data.status || 'ok',
        service: data.service || 'Bidou AI Creative Studio',
        mode: data.mode === 'live' ? 'live' : 'demo',
        requireLiveMode: Boolean(data.requireLiveMode),
        providers: {
          gemini: Boolean(data.providers?.gemini ?? data.geminiConfigured),
          musicapi: Boolean(data.providers?.musicapi ?? data.musicApiConfigured),
          sunor: Boolean(data.providers?.sunor),
          futurapay: Boolean(data.providers?.futurapay),
        },
        geminiConfigured: Boolean(data.geminiConfigured),
        supabaseConfigured: Boolean(data.supabaseConfigured),
        musicApiConfigured: Boolean(data.musicApiConfigured),
        sunorConfigured: Boolean(data.providers?.sunor),
        timestamp: data.timestamp || new Date().toISOString(),
      };
      cachedServerInfo = info;
      return info;
    } catch (err) {
      console.warn('[ServerInfo] Failed to load server info:', err);
      return cachedServerInfo;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function getServerInfoSync(): ServerInfo | null {
  return cachedServerInfo;
}

export function isServerLiveMode(): boolean {
  return cachedServerInfo?.mode === 'live';
}

export function isServerDemoMode(): boolean {
  return cachedServerInfo?.mode !== 'live';
}
