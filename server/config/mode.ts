export const isLiveMode = (): boolean =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const isDemoMode = (): boolean => !isLiveMode();

export const requireLiveMode = (): boolean => process.env.REQUIRE_LIVE_MODE === 'true';

export const providerFlags = () => ({
  gemini: Boolean(process.env.GEMINI_API_KEY),
  musicapi: Boolean(process.env.MUSICAPI_API_KEY),
  sunor: Boolean(process.env.SUNOR_API_KEY),
  futurapay: Boolean(process.env.FUTURAPAY_API_KEY && (process.env.FUTURAPAY_MERCHANT_KEY || process.env.FUTURAPAY_MERCHANT_ID)),
  cloudflare: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
  kie: Boolean(process.env.KIE_API_KEY),
  alibaba: Boolean(process.env.DASHSCOPE_API_KEY),
});

export function logBootMode(): void {
  const flags = providerFlags();
  const geminiStr = flags.gemini ? '✓' : '✗';
  const musicapiStr = flags.musicapi ? '✓' : '✗';
  const futurapayStr = flags.futurapay ? '✓' : '✗';
  const modeStr = isLiveMode() ? 'LIVE' : 'DEMO';
  const requireLive = requireLiveMode();

  console.log(`[Bidou] DATA MODE = ${modeStr} | gemini:${geminiStr} musicapi:${musicapiStr} futurapay:${futurapayStr} | REQUIRE_LIVE_MODE=${requireLive}`);

  if (isDemoMode() && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  [Bidou] LOUD WARN: Running in DEMO DATA MODE under production environment! Supabase credentials are not configured.');
  }
}
