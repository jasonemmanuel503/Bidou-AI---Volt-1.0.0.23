import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline, Readable } from 'stream';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

import { ModelRouter } from './src/services/modelRouter';
import { INITIAL_AI_MODELS } from './src/services/configData';
import { quoteGenerationCost } from './src/services/pricingEngine';
import { COVER_ART_ROUTE_KEY, IMAGE_ROUTES } from './src/services/providerCatalog';
import { PlanTier } from './src/types';
import { saveGenerationAsset } from './server/storage';
import { signMediaUrl, verifyMediaSignature } from './server/mediaSigning';
import {
  sanitizeOccasionInput,
  buildOccasionEnhancerContext,
  composeLyrics,
} from './server/occasionPrompts';

import {
  getSupabaseAdmin,
  resolveUserFromAuthHeader,
  loadModelConfig,
  findJobByIdempotency,
  reserveCreditsForJob,
  createGenerationJob,
  updateJob,
  insertJobVariants,
  deleteJob,
  getJobWithVariants,
  getRecentJobsForUser,
  getVariantById,
  softDeleteVariant,
  permanentlyDeleteFailedGeneration,
  recordDownload,
  createUpscaleRecord,
  updateUpscaleRecord,
  getUpscaleById,
  findUpscaleByIdempotency,
  findUpscaleByVariantAndScale,
  addUpscaledUrlToVariant,
  resolveUpscalePath,
  settleJobReservation,
  getUserWallet,
  getUserTransactions,
  getProjectsForUser,
  createProject,
  updateProject,
  deleteProject,
  getProjectItems,
  addProjectItems,
  removeProjectItem,
  reorderProjectItems,
  moveProjectItem,
  getTrashVariants,
  trashVariants,
  restoreVariants,
  purgeVariantsNow,
  purgeAllTrashVariants,
  getLibraryItems,
  getUserFavoriteVariantIds,
  addFavorite,
  removeFavorite,
  getPlaylistsForUser,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  getPlaylistItems,
  addPlaylistItems,
  removePlaylistItem,
  reorderPlaylistItems,
  createPaymentRecord,
  getPaymentByReference,
  getActiveCreditPackage,
  grantPurchase,
  debitCredits,
  refundCredits,
} from './server/db';
import {
  isLiveMode,
  isDemoMode,
  requireLiveMode,
  providerFlags,
} from './server/config/mode';
import {
  getProviderHealthReport,
  getProviderHealthMap,
} from './server/providers/health';
import {
  executeDirectPaymentFlow,
  checkFuturaPayStatus,
} from './server/providers/futurapay';
import {
  dispatchJobVariants,
  cancelActiveJob,
  startBackgroundPoller,
  recoverOrphanedJobs,
} from './server/jobs';
import { startRetentionWorker } from './server/retention';
import { resolveSuppliers } from './server/providers/suppliers';
import { resolveModelWithOptInFallback } from './server/providers/routing';
import { TIER_RANK } from './src/services/tiers';
import {
  getPlanLimitForTier,
  findRequiredTierForDuration,
  countUserPremiumJobsThisMonth,
  getStartOfNextUtcMonthIso,
} from './server/planLimits';
import { registerModelsAndAdminRoutes } from './server/modelsApi';
import { logStartupValidationTable } from './server/adminAuth';

dotenv.config();

const app = express();
const PORT = 3000;

// ---------------------------------------------------------------------------
// Section F.5 — Express CORS with explicit allowlist and credentials safety
// ---------------------------------------------------------------------------
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://bidou.ai,https://www.bidou.ai')
  .split(',')
  .map((s) => s.trim());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED.includes(origin) || origin.includes('.run.app') || origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin'); // or caches will cross-serve
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, Idempotency-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '20mb' }));

// ---------------------------------------------------------------------------
// Phase 0: Require Live Mode Guard Middleware
// If REQUIRE_LIVE_MODE is set and Supabase keys are missing, reject API calls.
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  if (requireLiveMode() && isDemoMode() && req.path.startsWith('/api/') && req.path !== '/api/health') {
    return res.status(503).json({
      error: 'SUPABASE_REQUIRED_BY_ENVIRONMENT',
      message: 'This environment requires Supabase credentials to be configured in live mode.',
    });
  }
  next();
});

import { TokenBucketRateLimiter } from './server/rateLimit';

// ---------------------------------------------------------------------------
// In-Memory Token Bucket Rate Limiting (Phase 7: Hardening)
// ---------------------------------------------------------------------------
const generateLimiter = new TokenBucketRateLimiter(10, 10); // 10 burst, 10/min
const checkoutLimiter = new TokenBucketRateLimiter(5, 5);   // 5 burst, 5/min
const enhanceLimiter = new TokenBucketRateLimiter(20, 20);  // 20 burst, 20/min
const inFlightIdempotencyLocks = new Map<string, Promise<void>>();


/**
 * Helper: Resolve MIME type for media files
 */
function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Checks whether a candidate file extension or URL is compatible with the declared media type.
 */
function isCompatibleMediaType(declaredType: string | undefined | null, targetPathOrUrl: string): boolean {
  if (!declaredType) return true;
  const clean = targetPathOrUrl.split('?')[0].split('#')[0].toLowerCase();
  const ext = path.extname(clean);
  const isAudioExt = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext);
  const isVideoExt = ['.mp4', '.webm', '.mov', '.mkv'].includes(ext);
  const isImageExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext);

  if (declaredType === 'video') {
    return isVideoExt || (!isAudioExt && !isImageExt);
  }
  if (declaredType === 'audio' || declaredType === 'music' || declaredType === 'voice') {
    return isAudioExt || (!isVideoExt && !isImageExt);
  }
  if (declaredType === 'image') {
    return isImageExt || (!isAudioExt && !isVideoExt);
  }
  return true;
}

/**
 * POST /api/media/:variantId/url
 * Issues a signed same-origin media streaming URL for audio/video playback (no Authorization bearer needed by element).
 * Verifies variant belongs to user, returns { url, expiresAt }.
 */
app.post('/api/media/:variantId/url', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantId } = req.params;
    const { scale } = req.body || {};

    const admin = getSupabaseAdmin();
    let variant: any = null;

    if (admin) {
      try {
        const { data } = await admin
          .from('generation_job_variants')
          .select('id, user_id, storage_path, output_url, purged_at')
          .eq('id', variantId)
          .maybeSingle();
        variant = data;
      } catch (err) {
        console.warn('[MediaSigning] Supabase variant lookup failed, falling back to mock:', err);
      }
    }

    if (!variant) {
      const mock = await getVariantById(variantId);
      if (mock?.variant) {
        variant = {
          id: mock.variant.id,
          user_id: mock.variant.user_id,
          storage_path: mock.variant.storage_path,
          output_url: mock.variant.output_url,
          purged_at: mock.variant.purged_at,
        };
      }
    }

    if (!variant || variant.user_id !== user.id) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (variant.purged_at) {
      return res.status(410).json({ error: 'ASSET_PURGED' });
    }

    const signed = signMediaUrl(variant.id, user.id, {
      scale: typeof scale === 'string' ? scale : null,
    });
    return res.json(signed);
  } catch (err: any) {
    console.error('[MediaSigning] Error creating signed URL:', err);
    return res.status(500).json({ error: 'Failed to sign media URL' });
  }
});

/**
 * GET/HEAD /api/media/:variantId
 * Streams a generated asset from the SAME ORIGIN as the app without memory buffering.
 * Same-origin ⇒ never tainted ⇒ Web Audio always works, in every browser.
 * Accepts EITHER a valid Authorization header OR a valid HMAC signature (uid/exp/sig).
 * Supports HTTP Range and HEAD requests for videos and audio seeking.
 */
app.all('/api/media/:variantId', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    let resolvedUserId: string | null = null;

    // 1. Signature-based verification (uid, exp, sig, scale)
    const sigUid = verifyMediaSignature(req.params.variantId, {
      uid: typeof req.query.uid === 'string' ? req.query.uid : undefined,
      exp: typeof req.query.exp === 'string' ? req.query.exp : undefined,
      sig: typeof req.query.sig === 'string' ? req.query.sig : undefined,
      scale: typeof req.query.scale === 'string' ? req.query.scale : undefined,
    });

    if (sigUid) {
      resolvedUserId = sigUid;
    } else {
      // 2. Authorization header fallback
      const user = await resolveUserFromAuthHeader(req.headers.authorization);
      if (user) {
        resolvedUserId = user.id;
      }
    }

    if (!resolvedUserId) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const admin = getSupabaseAdmin();
    let variant: any = null;
    let mediaType: string | undefined = undefined;

    if (admin) {
      try {
        const { data } = await admin
          .from('generation_job_variants')
          .select('id, user_id, job_id, storage_path, output_url, purged_at')
          .eq('id', req.params.variantId)
          .maybeSingle();
        variant = data;
        if (variant?.job_id) {
          const { data: jobData } = await admin
            .from('generation_jobs')
            .select('id, media_type, type')
            .eq('id', variant.job_id)
            .maybeSingle();
          mediaType = jobData?.media_type || jobData?.type;
        }
      } catch (err) {
        console.warn('[MediaProxy] Supabase variant lookup failed, falling back to mock:', err);
      }
    }

    if (!variant) {
      const mock = await getVariantById(req.params.variantId);
      if (mock?.variant) {
        variant = {
          id: mock.variant.id,
          user_id: mock.variant.user_id,
          storage_path: mock.variant.storage_path,
          output_url: mock.variant.output_url,
          purged_at: mock.variant.purged_at,
        };
        mediaType = mock.job?.type;
      }
    }

    // 404, not 403 — never leak that another user's asset exists.
    if (!variant || variant.user_id !== resolvedUserId) {
      return res.status(404).end();
    }
    if (variant.purged_at) {
      return res.status(410).json({ error: 'ASSET_PURGED' });
    }

    const scale = typeof req.query.scale === 'string' ? req.query.scale : null;
    const mediaPath = scale ? await resolveUpscalePath(variant.id, scale) : variant.storage_path;

    // Resolve a source descriptor in order:
    // 1. Supabase storage (live)
    // 2. Exact local file (public/<storage_path>, public/<output_url>, public/generations/<storage_path>)
    // 3. External output_url
    // 4. Last resort: only in demo mode and only for audio may demo-track.mp3 be used
    type SourceDescriptor =
      | { type: 'local'; filePath: string; contentType: string }
      | { type: 'remote'; url: string; contentType: string };

    let source: SourceDescriptor | null = null;

    // 1. Supabase storage (live)
    if (admin && isLiveMode() && mediaPath && !mediaPath.startsWith('http://') && !mediaPath.startsWith('https://')) {
      try {
        const { data: signedData, error } = await admin.storage.from('generations').createSignedUrl(mediaPath, 60);
        if (!error && signedData?.signedUrl) {
          source = {
            type: 'remote',
            url: signedData.signedUrl,
            contentType: contentTypeFor(mediaPath),
          };
        }
      } catch (storageErr) {
        console.warn('[MediaProxy] Failed to create signed storage URL:', storageErr);
      }
    }

    // 2. Exact local file
    if (!source) {
      const candidates = [
        mediaPath ? path.join(process.cwd(), 'public', mediaPath) : null,
        variant.output_url?.startsWith('/') ? path.join(process.cwd(), 'public', variant.output_url) : null,
        mediaPath ? path.join(process.cwd(), 'public', 'generations', mediaPath) : null,
      ].filter(Boolean) as string[];

      for (const p of candidates) {
        if (fs.existsSync(p)) {
          try {
            const stat = fs.statSync(p);
            if (stat.isFile() && isCompatibleMediaType(mediaType, p)) {
              source = {
                type: 'local',
                filePath: p,
                contentType: contentTypeFor(p),
              };
              break;
            }
          } catch {}
        }
      }
    }

    // 3. External output_url
    if (!source && variant.output_url && (variant.output_url.startsWith('http://') || variant.output_url.startsWith('https://'))) {
      if (isCompatibleMediaType(mediaType, variant.output_url)) {
        source = {
          type: 'remote',
          url: variant.output_url,
          contentType: contentTypeFor(variant.output_url),
        };
      }
    }

    // 4. Demo mode audio fallback
    if (!source && isDemoMode() && (mediaType === 'audio' || mediaType === 'music' || mediaType === 'voice')) {
      const samplePath = path.join(process.cwd(), 'public', 'samples', 'demo-track.mp3');
      if (fs.existsSync(samplePath)) {
        source = {
          type: 'local',
          filePath: samplePath,
          contentType: 'audio/mpeg',
        };
      }
    }

    if (!source) {
      return res.status(404).end();
    }

    // Stream the media without buffering in memory
    if (source.type === 'local') {
      const stat = await fs.promises.stat(source.filePath);
      const size = stat.size;
      const range = req.headers.range;

      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Content-Type', source.contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=3600');

      let start = 0;
      let end = size - 1;
      let isRange = false;

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (match) {
          const [_, rawStart, rawEnd] = match;
          if (rawStart === '' && rawEnd !== '') {
            const suffix = parseInt(rawEnd, 10);
            if (suffix <= 0) {
              res.setHeader('Content-Range', `bytes */${size}`);
              return res.status(416).end();
            }
            start = Math.max(0, size - suffix);
            end = size - 1;
            isRange = true;
          } else if (rawStart !== '' && rawEnd === '') {
            start = parseInt(rawStart, 10);
            end = size - 1;
            isRange = true;
          } else if (rawStart !== '' && rawEnd !== '') {
            start = parseInt(rawStart, 10);
            end = parseInt(rawEnd, 10);
            isRange = true;
          }
        } else {
          res.setHeader('Content-Range', `bytes */${size}`);
          return res.status(416).end();
        }

        if (start < 0 || start >= size || end < start || end >= size) {
          res.setHeader('Content-Range', `bytes */${size}`);
          return res.status(416).end();
        }
      }

      if (isRange) {
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', String(end - start + 1));
      } else {
        res.status(200);
        res.setHeader('Content-Length', String(size));
      }

      if (req.method === 'HEAD') {
        return res.end();
      }

      const stream = fs.createReadStream(source.filePath, isRange ? { start, end } : undefined);
      req.on('close', () => {
        stream.destroy();
      });
      pipeline(stream, res, (err) => {
        if (err && (err as any).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          console.warn('[MediaProxy] Pipeline error:', err);
        }
      });
      return;
    }

    if (source.type === 'remote') {
      const controller = new AbortController();
      req.on('close', () => {
        controller.abort();
      });

      const forwardHeaders: Record<string, string> = {};
      if (req.headers.range) {
        forwardHeaders.range = req.headers.range;
      }

      const upstream = await fetch(source.url, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: forwardHeaders,
        signal: AbortSignal.timeout(15000),
      });

      res.status(upstream.status);
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      const contentType = upstream.headers.get('content-type') || source.contentType;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=3600');

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      if (req.method === 'HEAD' || !upstream.body) {
        return res.end();
      }

      const nodeStream = Readable.fromWeb(upstream.body as any);
      req.on('close', () => {
        nodeStream.destroy();
      });
      pipeline(nodeStream, res, (err) => {
        if (err && (err as any).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          console.warn('[MediaProxy] Remote pipeline error:', err);
        }
      });
      return;
    }
  } catch (err: any) {
    console.error('[MediaProxy] Unhandled error:', err);
    return res.status(500).json({ error: 'Failed to stream media' });
  }
});

// Helper: Tier-based concurrent variant caps
function getTierVariantCap(planTier: PlanTier): number {
  switch (planTier) {
    case 'free':
      return 1;
    case 'starter':
      return 2;
    case 'creator':
      return 3;
    case 'pro':
    case 'studio':
      return 4;
    default:
      return 1;
  }
}

// Lazy initialization of Gemini client (Prompt enhancement & lyrics)
let genAI: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set. Using fallback simulation for prompt enhancement.');
    }
    genAI = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
  }
  return genAI;
}

// ---------------------------------------------------------------------------
// Health & Provider Endpoints
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  const pFlags = providerFlags();
  res.json({
    status: 'ok',
    service: 'Bidou AI Creative Studio',
    mode: isLiveMode() ? 'live' : 'demo',
    requireLiveMode: requireLiveMode(),
    providers: pFlags,
    timestamp: new Date().toISOString(),
    geminiConfigured: pFlags.gemini,
    supabaseConfigured: isLiveMode(),
    musicApiConfigured: pFlags.musicapi,
  });
});

app.get('/api/health/providers', (req, res) => {
  res.json({
    status: 'ok',
    providers: getProviderHealthReport(),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Universal Credit Endpoints (Section 6.2.2)
// ---------------------------------------------------------------------------

/**
 * GET /api/credits/wallet
 * Returns authoritative balance and updated_at timestamp.
 */
app.get('/api/credits/wallet', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Valid Supabase Authorization Bearer token is required' });
    }
    const wallet = await getUserWallet(user.id);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found for authenticated user' });
    }
    res.json({
      balance: wallet.total_balance,
      paid_balance: wallet.paid_balance,
      promo_balance: wallet.promo_balance,
      total_balance: wallet.total_balance,
      updated_at: wallet.updated_at,
      plan_tier: wallet.plan_tier,
      lifetime_spend_fcfa: wallet.lifetime_spend_fcfa,
      mode: isLiveMode() ? 'live' : 'demo',
    });
  } catch (err: any) {
    console.error('[Credits] GET /api/credits/wallet error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to retrieve credit wallet' });
  }
});

/**
 * GET /api/credits/transactions
 * Returns paginated recent ledger rows for authenticated user only.
 */
app.get('/api/credits/transactions', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Valid Supabase Authorization Bearer token is required' });
    }
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
    const transactions = await getUserTransactions(user.id, limit, offset);
    res.json({ transactions, limit, offset });
  } catch (err: any) {
    console.error('[Credits] GET /api/credits/transactions error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to retrieve transactions' });
  }
});

// ---------------------------------------------------------------------------
// Payment Endpoints (Phase 1: FuturaPay & Purchases)
// ---------------------------------------------------------------------------

/**
 * Authoritative single choke point for payment confirmation and idempotent credit granting.
 * Both client polling (GET /api/payments/:referenceId) and webhooks route through here.
 */
async function confirmAndGrant(referenceId: string): Promise<any> {
  const payment = await getPaymentByReference(referenceId);
  if (!payment) {
    return null;
  }

  // If already successful, return immediately (idempotent source of truth)
  if (payment.status === 'successful') {
    return payment;
  }

  // If already terminated as failed or cancelled, do not attempt to grant
  if (payment.status === 'failed' || payment.status === 'cancelled') {
    return payment;
  }

  // In demo mode, status changes happen via simulatePaymentSuccess
  if (isDemoMode()) {
    return payment;
  }

  // LIVE MODE: Query authoritative FuturaPay status endpoint
  try {
    const fpStatus = await checkFuturaPayStatus(referenceId);

    if (fpStatus.status === 'SUCCESS') {
      console.log(`[Payments] FuturaPay confirmed SUCCESS for ${referenceId}. Granting purchase...`);
      await grantPurchase(referenceId, fpStatus.transactionId || `fp_tx_${Date.now()}`);
      // Refresh record from DB
      const updated = await getPaymentByReference(referenceId);
      return updated || { ...payment, status: 'successful' };
    }

    if (fpStatus.status === 'FAILED') {
      console.log(`[Payments] FuturaPay confirmed FAILED for ${referenceId}.`);
      const admin = getSupabaseAdmin();
      if (admin) {
        await admin
          .from('payments')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('reference_id', referenceId);
      }
      payment.status = 'failed';
      return payment;
    }

    // Still pending
    return payment;
  } catch (err: any) {
    console.warn(`[Payments] Failed to check status with FuturaPay for ${referenceId}:`, err?.message);
    // Keep as pending so subsequent polls or webhooks can retry
    return payment;
  }
}

/**
 * POST /api/payments/checkout
 * Initiates an authoritative payment checkout with FuturaPay direct REST flow or demo sandbox.
 */
app.post('/api/payments/checkout', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Bearer token is required' });
    }

    // Rate limit check (Phase 7)
    const rateCheck = checkoutLimiter.tryConsume(user.id);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds || 10));
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many checkout attempts. Please wait a moment before trying again.',
        retryAfter: rateCheck.retryAfterSeconds,
      });
    }

    const { packageId, channel, phoneNumber } = req.body;
    if (!packageId) {
      return res.status(400).json({ error: 'packageId is required' });
    }

    // Strictly allowed payment rails: only mtn_momo and orange_money are supported in DB
    const validChannels = ['mtn_momo', 'orange_money'];
    if (!channel || !validChannels.includes(channel)) {
      return res.status(400).json({
        error: 'INVALID_CHANNEL',
        detail: `Channel must be one of: ${validChannels.join(', ')}`,
      });
    }

    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.replace(/\D/g, '').length < 8) {
      return res.status(400).json({
        error: 'INVALID_PHONE_NUMBER',
        detail: 'A valid mobile money phone number is required for MTN/Orange transactions',
      });
    }

    const pkg = await getActiveCreditPackage(packageId);
    if (!pkg) {
      return res.status(404).json({ error: 'PACKAGE_NOT_FOUND', detail: `Credit package '${packageId}' is inactive or not found` });
    }

    const referenceId = `pay_${crypto.randomUUID()}`;
    const totalCredits = pkg.credits; // totalCredits = pkg.credits (no + bonus_credits)

    await createPaymentRecord({
      reference_id: referenceId,
      user_id: user.id,
      package_id: pkg.id,
      amount_fcfa: pkg.price_fcfa,
      credits: totalCredits,
      payment_rail: channel,
      phone: phoneNumber,
      status: 'pending',
      metadata: {
        user_email: user.email,
        payment_rail: channel,
        package_name: pkg.name,
      },
    });

    const isLive = isLiveMode();
    const pFlags = providerFlags();

    if (isLive && pFlags.futurapay) {
      try {
        const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
        await executeDirectPaymentFlow({
          referenceId,
          amount: pkg.price_fcfa,
          channel,
          phoneNumber,
          customerEmail: user.email,
          callbackUrl: `${appUrl}/api/payments/webhook/futurapay`,
          returnUrl: `${appUrl}/?payment_ref=${referenceId}`,
        });
      } catch (fpErr: any) {
        console.error('[FuturaPay] Payment flow dispatch error:', fpErr?.message || fpErr);
        return res.status(502).json({
          error: 'PAYMENT_GATEWAY_ERROR',
          detail: 'Unable to initiate mobile money transaction with FuturaPay. Please check your phone number and try again.',
        });
      }
    }

    return res.status(201).json({
      referenceId,
      status: 'pending',
      amount: pkg.price_fcfa,
      currency: 'XAF',
      credits: totalCredits,
      packageName: pkg.name,
      mode: isLive && pFlags.futurapay ? 'live' : 'demo',
    });
  } catch (err: any) {
    console.error('[Payments] POST /api/payments/checkout error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create payment checkout' });
  }
});

/**
 * GET /api/payments/:referenceId
 * Looks up status of a payment by its reference ID and confirms via authoritative choke point.
 */
app.get('/api/payments/:referenceId', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Bearer token is required' });
    }

    const { referenceId } = req.params;
    // Confirm and grant through single authoritative choke point
    const payment = await confirmAndGrant(referenceId);
    if (!payment) {
      return res.status(404).json({ error: 'PAYMENT_NOT_FOUND', detail: 'Payment record not found' });
    }

    if (payment.user_id && payment.user_id !== user.id) {
      return res.status(403).json({ error: 'FORBIDDEN', detail: 'Payment does not belong to current user' });
    }

    return res.json({
      referenceId: payment.reference_id,
      status: payment.status,
      packageId: payment.package_id,
      amount: payment.amount_fcfa || payment.amount,
      credits: payment.credits,
      currency: payment.currency || 'XAF',
      channel: payment.payment_rail || payment.channel,
      paymentRail: payment.payment_rail || payment.channel,
      settledAt: payment.settled_at || null,
      mode: isLiveMode() && providerFlags().futurapay ? 'live' : 'demo',
    });
  } catch (err: any) {
    console.error('[Payments] GET /api/payments/:referenceId error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to lookup payment' });
  }
});

/**
 * POST /api/payments/webhook/futurapay
 * Webhook handler — acts as a trigger to re-check, never blindly grants.
 */
app.post('/api/payments/webhook/futurapay', async (req, res) => {
  try {
    const webhookSecret = process.env.FUTURAPAY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-futurapay-signature'] as string;
      const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (signature !== expected) {
        console.warn('[FuturaPay Webhook] Invalid signature rejected');
        return res.status(401).json({ error: 'INVALID_SIGNATURE' });
      }
    }

    const { reference_id, reference, data } = req.body;
    const refId = reference_id || reference || data?.reference_id || data?.reference;

    if (!refId) {
      return res.status(400).json({ error: 'Missing reference_id in webhook payload' });
    }

    console.log(`[FuturaPay Webhook] Trigger received for reference: ${refId}. Re-checking status...`);
    // Authoritative choke point: re-checks with FuturaPay and grants only if verified
    await confirmAndGrant(refId);

    return res.json({ received: true, referenceId: refId });
  } catch (err: any) {
    console.error('[FuturaPay Webhook] Error processing webhook:', err);
    return res.status(500).json({ error: err?.message || 'Webhook processing failed' });
  }
});

/**
 * POST /api/payments/simulate-success
 * DEMO SANDBOX ONLY: Instantly simulates successful payment for preview/testing.
 */
app.post('/api/payments/simulate-success', async (req, res) => {
  try {
    if (isLiveMode() && providerFlags().futurapay) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const { referenceId } = req.body;
    if (!referenceId) {
      return res.status(400).json({ error: 'referenceId is required' });
    }
    const result = await grantPurchase(referenceId, `sim_tx_${Date.now()}`);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Payments] simulate-success error:', err);
    return res.status(500).json({ error: err?.message || 'Simulation failed' });
  }
});

// ---------------------------------------------------------------------------
// Generation Endpoints (Phase 2: Real Provider Execution)
// ---------------------------------------------------------------------------

/**
 * POST /api/ai/generate
 * Dispatches image, video, or music generation job with server-authoritative pricing and credit reservations.
 */
app.post('/api/ai/generate', async (req, res) => {
  try {
    // 1. Authenticate Supabase JWT
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Valid Supabase Authorization Bearer token is required' });
    }

    // Rate limit check (Phase 7)
    const rateCheck = generateLimiter.tryConsume(user.id);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds || 10));
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Generation rate limit exceeded. Please wait a moment before requesting another generation.',
        retryAfter: rateCheck.retryAfterSeconds,
      });
    }

    const {
      modelId,
      prompt,
      enhancedPrompt,
      negativePrompt,
      aspectRatio = '1:1',
      resolution = '720p',
      durationSeconds = 8,
      audioFlag = true,
      genre,
      tonality,
      lyrics,
      coverArtUrl,
      idempotencyKey: bodyIdempotencyKey,
      title,
      occasion: rawOccasion,
      shareToShowcase,
      sharePrompt,
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'A valid prompt string is required' });
    }

    // 2. Idempotency Check (with per-key lock to prevent concurrent duplicate job creation)
    const idempotencyKey = bodyIdempotencyKey || (req.headers['idempotency-key'] as string);
    let releaseIdempotencyLock: (() => void) | null = null;
    const lockKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : null;

    if (lockKey) {
      while (inFlightIdempotencyLocks.has(lockKey)) {
        await inFlightIdempotencyLocks.get(lockKey);
      }
      let resolveLock!: () => void;
      const lockPromise = new Promise<void>((resolve) => {
        resolveLock = resolve;
      });
      inFlightIdempotencyLocks.set(lockKey, lockPromise);
      releaseIdempotencyLock = () => {
        if (inFlightIdempotencyLocks.get(lockKey) === lockPromise) {
          inFlightIdempotencyLocks.delete(lockKey);
        }
        resolveLock();
      };
      res.on('finish', () => releaseIdempotencyLock?.());
      res.on('close', () => releaseIdempotencyLock?.());

      const existingJobId = await findJobByIdempotency(user.id, idempotencyKey);
      if (existingJobId) {
        releaseIdempotencyLock();
        return res.json({ jobId: existingJobId, status: 'existing' });
      }
    }

    // 3. Step 1 Validation (all server-side, in strict order)
    // 3.1 Model exists, active, and licensing_verified -> else MODEL_NOT_AVAILABLE
    if (!modelId) {
      return res.status(400).json({
        error: 'MODEL_NOT_AVAILABLE',
        message: 'modelId is required',
      });
    }
    const rawModel = await loadModelConfig(modelId);
    if (!rawModel) {
      return res.status(404).json({
        error: 'MODEL_NOT_AVAILABLE',
        message: `Selected model '${modelId}' was not found in the commercial catalog`,
        modelId,
      });
    }
    if (!rawModel.active || !rawModel.licensing_verified) {
      return res.status(409).json({
        error: 'MODEL_NOT_AVAILABLE',
        message: 'Selected model is inactive or awaiting commercial licence verification',
        modelId: rawModel.id,
        active: Boolean(rawModel.active),
        licensingVerified: Boolean(rawModel.licensing_verified),
      });
    }

    let occasion = null;
    if (rawModel.generation_type === 'music' && rawOccasion) {
      const parsed = sanitizeOccasionInput(rawOccasion);       // from server/occasionPrompts.ts
      if (!parsed.ok) return res.status(400).json({ error: 'INVALID_OCCASION', message: (parsed as { ok: false; message: string }).message });
      occasion = parsed.value;
    }
    const cleanTitle = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 80) : undefined;
    const cleanLyrics = typeof lyrics === 'string' ? lyrics.slice(0, 5000) : undefined;

    // 3.2 Duration and resolution are allowed by video_options of THAT model -> else INVALID_OPTIONS
    if (rawModel.generation_type === 'video' && rawModel.video_options) {
      const reqDuration = Number(durationSeconds);
      const reqResolution = String(resolution || '720p').toLowerCase();
      const allowedResolutions = (rawModel.video_options.resolutions || ['720p', '1080p']).map((r) =>
        r.toLowerCase()
      );

      if (!allowedResolutions.includes(reqResolution)) {
        return res.status(400).json({
          error: 'INVALID_OPTIONS',
          message: `Resolution '${resolution}' is not allowed for ${rawModel.display_name}. Allowed: ${rawModel.video_options.resolutions.join(', ')}`,
          field: 'resolution',
          requested: resolution,
          allowedResolutions: rawModel.video_options.resolutions,
        });
      }

      const durs = rawModel.video_options.durations;
      let durationAllowed = false;
      if (Array.isArray(durs)) {
        durationAllowed = Number.isInteger(reqDuration) && durs.includes(reqDuration);
      } else if (typeof durs === 'object' && durs !== null) {
        const min = Number(durs.min ?? 2);
        const max = Number(durs.max ?? 15);
        const step = Number(durs.step ?? 1);
        durationAllowed =
          Number.isInteger(reqDuration) &&
          reqDuration >= min &&
          reqDuration <= max &&
          (reqDuration - min) % step === 0;
      }

      if (!durationAllowed) {
        return res.status(400).json({
          error: 'INVALID_OPTIONS',
          message: `Duration ${durationSeconds}s is not allowed for ${rawModel.display_name}.`,
          field: 'durationSeconds',
          requested: durationSeconds,
          allowedDurations: durs,
        });
      }

      // Veo 3.1 models require 8s duration when rendering at 1080p
      if (rawModel.id.startsWith('vid_veo_') && reqResolution === '1080p' && reqDuration !== 8) {
        return res.status(400).json({
          error: 'INVALID_OPTIONS',
          message: `${rawModel.display_name} requires 8s duration when rendering at 1080p resolution.`,
          field: 'durationSeconds',
          requested: durationSeconds,
          resolution: reqResolution,
          allowedDurations: [8],
        });
      }
    }

    // 3.3 Plan limit: duration <= plan_limits.max_video_seconds for user's tier (and model.min_plan_tier if set)
    const userPlanLimit = await getPlanLimitForTier(user.plan_tier);
    if (rawModel.min_plan_tier && (TIER_RANK[user.plan_tier] ?? 0) < (TIER_RANK[rawModel.min_plan_tier] ?? 0)) {
      return res.status(403).json({
        error: 'PLAN_LIMIT_DURATION',
        message: `${rawModel.display_name} requires at least the ${rawModel.min_plan_tier} plan tier.`,
        maxSeconds: userPlanLimit.max_video_seconds,
        requiredTier: rawModel.min_plan_tier,
        currentTier: user.plan_tier,
      });
    }

    if (rawModel.generation_type === 'video') {
      const reqDuration = Number(durationSeconds);
      const modelTierCap = rawModel.video_options?.max_duration_by_plan?.[user.plan_tier];
      const maxSeconds =
        modelTierCap !== undefined
          ? Math.min(userPlanLimit.max_video_seconds, modelTierCap)
          : userPlanLimit.max_video_seconds;

      if (reqDuration > maxSeconds) {
        const requiredTier = await findRequiredTierForDuration(reqDuration, rawModel.min_plan_tier);
        return res.status(403).json({
          error: 'PLAN_LIMIT_DURATION',
          message: `Your ${user.plan_tier} plan allows videos up to ${maxSeconds}s. Upgrade to ${requiredTier} for ${reqDuration}s clips.`,
          maxSeconds,
          requestedSeconds: reqDuration,
          currentTier: user.plan_tier,
          requiredTier,
        });
      }
    }

    // 3.4 Premium monthly cap: if model.is_premium, count user's premium jobs this UTC month
    if (rawModel.is_premium) {
      const used = await countUserPremiumJobsThisMonth(user.id);
      const cap = userPlanLimit.premium_monthly_cap;
      if (used >= cap) {
        return res.status(403).json({
          error: 'PREMIUM_CAP_REACHED',
          message: `Monthly cap of ${cap} premium model generations reached on your ${user.plan_tier} plan.`,
          used,
          cap,
          currentTier: user.plan_tier,
          resetsAt: getStartOfNextUtcMonthIso(),
        });
      }
    }

    // 3.5 Aspect ratio allowed by the model's supported_aspect_ratios
    if (
      Array.isArray(rawModel.supported_aspect_ratios) &&
      rawModel.supported_aspect_ratios.length > 0 &&
      !rawModel.supported_aspect_ratios.includes(aspectRatio)
    ) {
      return res.status(400).json({
        error: 'INVALID_OPTIONS',
        message: `Aspect ratio '${aspectRatio}' is not supported by ${rawModel.display_name}. Allowed: ${rawModel.supported_aspect_ratios.join(', ')}`,
        field: 'aspectRatio',
        requested: aspectRatio,
        allowedAspectRatios: rawModel.supported_aspect_ratios,
      });
    }

    // 3.6 Clamp variant count (min: 1, max: hard cap, model cap, user tier cap)
    const tierCap = getTierVariantCap(user.plan_tier);
    const maxHardCap = parseInt(process.env.MAX_VARIANTS_HARD_CAP || '4', 10);
    const requestedCount = Number(req.body.variantCount) || 1;

    let n = Math.min(
      Math.max(1, requestedCount),
      rawModel.max_concurrent_variants || 1,
      maxHardCap,
      tierCap
    );

    // For music, clamp to tierCap (max 2 takes)
    if (rawModel.generation_type === 'music') {
      n = Math.min(2, tierCap);
    }

    // 4. Opt-in cross-model fallback (never switches model unless caller explicitly opts in)
    const healthMap = getProviderHealthMap();
    const decision = resolveModelWithOptInFallback({
      requestedModel: rawModel,
      allModels: INITIAL_AI_MODELS,
      healthMap,
      allowFallback: Boolean(req.body.allowFallback),
    });
    const selectedModel = decision.selectedModel;
    const fallbackReason = decision.fallbackReason;

    // 5. Authoritative server-side pricing using validated values (never client numbers)
    let coverArtAddonCredits = 0;
    if (selectedModel.generation_type === 'music' && (req.body.musicAddons?.generateCoverArt || req.body.generateCoverArt)) {
      const coverModel = INITIAL_AI_MODELS.find((m) => m.model_name === COVER_ART_ROUTE_KEY);
      coverArtAddonCredits = coverModel
        ? quoteGenerationCost({ model: coverModel, variantCount: 1 }).totalCost
        : Math.round(IMAGE_ROUTES.nano_banana_2_lite.providerCostUsd * 571.23 * 1.03 / (0.3 * 0.975));
    }

    const baseQuote = quoteGenerationCost({
      model: selectedModel,
      durationSeconds: Number(durationSeconds),
      resolution,
      includeAudio: audioFlag !== false,
      variantCount: n,
    });
    const quote = {
      ...baseQuote,
      totalCost: baseQuote.totalCost + coverArtAddonCredits,
    };
    const effectiveDuration =
      selectedModel.generation_type === 'video'
        ? Number(durationSeconds)
        : selectedModel.generation_type === 'music'
        ? selectedModel.id === 'mus_lyria_3_clip'
          ? 30
          : null
        : null;
    const effectiveResolution =
      selectedModel.generation_type === 'video'
        ? String(resolution || '720p').toLowerCase()
        : (quote.resolution ?? resolution);

    // 6. Supplier pre-flight BEFORE creating job or reserving credits
    try {
      await resolveSuppliers(selectedModel.id, {
        durationSeconds: selectedModel.generation_type === 'video' ? Number(effectiveDuration) : undefined,
        resolution: selectedModel.generation_type === 'video' ? String(effectiveResolution) : undefined,
        aspectRatio,
        hasReferenceImage: Boolean(req.body.referenceImageUrl),
        allowUnconfiguredInDev: !isLiveMode(),
      });
    } catch (supErr: any) {
      return res.status(503).json({
        error: 'MODEL_TEMPORARILY_UNAVAILABLE',
        message: `No healthy supplier is currently available for ${selectedModel.display_name}. No credits were reserved.`,
        modelId: selectedModel.id,
      });
    }

    const jobId = crypto.randomUUID();

    const rawClientSettings = req.body.clientSettings || req.body.client_settings || {};
    const explicitTitle =
      (typeof req.body.title === 'string' && req.body.title.trim()) ||
      (typeof rawClientSettings.musicTitle === 'string' && rawClientSettings.musicTitle.trim()) ||
      (typeof rawClientSettings.title === 'string' && rawClientSettings.title.trim()) ||
      undefined;

    const finalTitle = cleanTitle || explicitTitle;
    const finalLyrics = cleanLyrics || lyrics;
    const visibility = shareToShowcase ? 'public' : 'private';
    const sharePromptBool = Boolean(sharePrompt);

    // 7. Insert generation_jobs row
    await createGenerationJob({
      id: jobId,
      user_id: user.id,
      type: selectedModel.generation_type,
      provider: selectedModel.provider,
      model_name: selectedModel.display_name || selectedModel.model_name,
      model_id: selectedModel.id,
      status: 'queued',
      prompt,
      enhanced_prompt: enhancedPrompt,
      negative_prompt: negativePrompt,
      aspect_ratio: aspectRatio,
      resolution: effectiveResolution || null,
      duration_seconds: effectiveDuration ? parseInt(String(effectiveDuration), 10) : null,
      batch_count: n,
      genre,
      tonality,
      lyrics: finalLyrics,
      cover_art_url: coverArtUrl,
      credits_reserved: quote.totalCost,
      idempotency_key: idempotencyKey,
      title: finalTitle,
      occasion_id: occasion?.id,
      occasion_sub_id: occasion?.subId,
      occasion_details: occasion?.details,
      visibility,
      share_prompt: sharePromptBool,
      client_settings: {
        ...rawClientSettings,
        ...(finalTitle ? { title: finalTitle, musicTitle: finalTitle } : {}),
      },
    });

    // 8. Reserve credits atomically from the appropriate bucket (promo allowed only if promo_eligible)
    // Video hold (35 min / 2100 s) must exceed the 30-min job timeout (MAX_TIMEOUT_MS) so the job timeout handler always settles first before sweep_expired_reservations
    const timeoutSeconds = selectedModel.generation_type === 'video' ? 2100 : 600;
    const promoEligible = Boolean(selectedModel.promo_eligible);
    let reservationId: string;
    let availableBalance: number | undefined;
    let paidBalanceAfter: number | undefined;
    let promoBalanceAfter: number | undefined;
    try {
      const reservation = await reserveCreditsForJob({
        userId: user.id,
        jobId,
        amount: quote.totalCost,
        timeoutSeconds,
        promoEligible,
        userAuthToken: req.headers.authorization?.replace('Bearer ', '').trim(),
      });
      reservationId = reservation.reservationId;
      availableBalance = reservation.availableBalance;
      paidBalanceAfter = reservation.paidBalance;
      promoBalanceAfter = reservation.promoBalance;

      // Persist the reservation onto the job row immediately.
      await updateJob(jobId, { reservation_id: reservationId });
      releaseIdempotencyLock?.();
    } catch (err: any) {
      releaseIdempotencyLock?.();
      // Clean up orphaned job row on credit failure
      await deleteJob(jobId);
      if (err?.message?.includes('INSUFFICIENT_CREDITS')) {
        const paidBalance = typeof err.paidBalance === 'number' ? err.paidBalance : 0;
        const promoBalance = typeof err.promoBalance === 'number' ? err.promoBalance : 0;
        const availableMatch = err?.message?.match(/available (\d+)/i);
        const available =
          typeof err.available === 'number'
            ? err.available
            : availableMatch
              ? parseInt(availableMatch[1], 10)
              : 0;
        const isPromoBlocked = !promoEligible && promoBalance > 0 && paidBalance < quote.totalCost;
        return res.status(402).json({
          error: 'INSUFFICIENT_CREDITS',
          code: isPromoBlocked ? 'PROMO_NOT_ELIGIBLE' : 'INSUFFICIENT_CREDITS',
          message: isPromoBlocked
            ? `${selectedModel.display_name} requires paid credits. Your ${promoBalance} free welcome credits can only be spent on eligible image models.`
            : `Insufficient credits: required ${quote.totalCost}, available ${available}.`,
          required: quote.totalCost,
          available,
          paid_balance: paidBalance,
          promo_balance: promoBalance,
          promoEligible,
          variantCount: n,
          unitCost: quote.unitCost,
        });
      }
      console.error('[Generate] Credit reservation failed with server error:', err?.message || err);
      return res.status(500).json({
        error: err?.message || 'Failed to reserve credits',
      });
    }

    // 9. Insert N variant rows
    const variantRows = Array.from({ length: n }).map((_, idx) => ({
      id: crypto.randomUUID(),
      job_id: jobId,
      user_id: user.id,
      variant_index: idx,
      status: 'queued' as const,
      credits_unit: quote.unitCost,
    }));
    await insertJobVariants(variantRows);

    // 10. Return 202 Accepted immediately with updated wallet snapshot
    let walletSnapshot: { balance: number; paid_balance: number; promo_balance: number } | undefined;
    if (typeof paidBalanceAfter === 'number' && typeof promoBalanceAfter === 'number') {
      walletSnapshot = {
        balance: paidBalanceAfter + promoBalanceAfter,
        paid_balance: paidBalanceAfter,
        promo_balance: promoBalanceAfter,
      };
    } else {
      try {
        const w = await getUserWallet(user.id);
        walletSnapshot = {
          balance: w.total_balance,
          paid_balance: w.paid_balance,
          promo_balance: w.promo_balance,
        };
        availableBalance = w.total_balance;
        paidBalanceAfter = w.paid_balance;
        promoBalanceAfter = w.promo_balance;
      } catch {
        // non-fatal
      }
    }

    res.status(202).json({
      jobId,
      variantCount: n,
      unitCost: quote.unitCost,
      totalCost: quote.totalCost,
      walletBalance: availableBalance,
      paidBalance: paidBalanceAfter,
      promoBalance: promoBalanceAfter,
      wallet: walletSnapshot,
      fallbackReason,
    });

    // 11. Dispatch background execution without awaiting
    const jobData = {
      id: jobId,
      user_id: user.id,
      type: selectedModel.generation_type,
      provider: selectedModel.provider,
      model_name: selectedModel.display_name || selectedModel.model_name,
      model_id: selectedModel.id,
      status: 'queued' as const,
      prompt,
      enhanced_prompt: enhancedPrompt,
      negative_prompt: negativePrompt,
      aspect_ratio: aspectRatio,
      resolution: effectiveResolution,
      duration_seconds: effectiveDuration ? parseInt(String(effectiveDuration), 10) : null,
      batch_count: n,
      genre,
      tonality,
      lyrics: finalLyrics,
      cover_art_url: coverArtUrl,
      credits_reserved: quote.totalCost,
      reservation_id: reservationId,
      title: finalTitle,
      occasion_id: occasion?.id,
      occasion_sub_id: occasion?.subId,
      occasion_details: occasion?.details,
      visibility,
      share_prompt: sharePromptBool,
      output_urls: [],
      created_at: new Date().toISOString(),
    };

    dispatchJobVariants(jobData as any, variantRows as any, {
      userId: user.id,
      jobId,
      prompt,
      title: finalTitle,
      occasion,
      enhancedPrompt,
      negativePrompt,
      aspectRatio,
      resolution: effectiveResolution,
      durationSeconds: effectiveDuration ? parseInt(String(effectiveDuration), 10) : undefined,
      audioFlag: audioFlag !== false,
      genre,
      tonality,
      lyrics: finalLyrics,
      coverArtUrl,
      model: selectedModel,
      variantCount: n,
      unitCost: quote.unitCost,
    }).catch((dispatchErr) => {
      console.error(`[Background Dispatcher] Job ${jobId} failed during execution:`, dispatchErr);
    });
  } catch (err: any) {
    console.error('Error handling /api/ai/generate:', err);
    return res.status(500).json({ error: err?.message || 'Internal generation dispatch failure' });
  }
});

/**
 * GET /api/ai/job/:jobId
 * Fetches status of a generation job and all of its individual variants.
 */
app.get('/api/ai/job/:jobId', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Valid bearer token required' });
    }

    const { jobId } = req.params;
    const { job, variants } = await getJobWithVariants(jobId);
    if (!job || job.user_id !== user.id) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const succeededCount = variants.filter((v) => v.status === 'completed').length;
    return res.json({
      job,
      variants,
      succeededCount,
      status: job.status,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to fetch job status' });
  }
});

/**
 * POST /api/ai/job/:jobId/cancel
 * Aborts any pending operations and triggers automatic partial refund settlement.
 */
app.post('/api/ai/job/:jobId/cancel', async (req, res) => {
  try {
    const { jobId } = req.params;
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Bearer token is required' });
    }

    const cancelled = await cancelActiveJob(jobId, user.id);
    if (!cancelled) {
      return res.status(404).json({ error: 'Job not found or does not belong to the user' });
    }

    return res.json({ success: true, message: 'Job cancelled and unrendered credits refunded' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to cancel job' });
  }
});

/**
 * GET /api/ai/jobs
 * Fetches recent non-deleted generations for the authenticated user.
 */
app.get('/api/ai/jobs', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Bearer token is required' });
    }

    const type = req.query.type as string | undefined;
    const limit = parseInt((req.query.limit as string) || '24', 10);
    const jobs = await getRecentJobsForUser(user.id, type, limit);
    return res.json({ jobs });
  } catch (err: any) {
    console.error('Error fetching recent jobs:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch jobs' });
  }
});

/**
 * POST /api/ai/variant/:variantId/upscale
 * Upgrades resolution of a completed variant with credit reservation and model bounds check.
 */
app.post('/api/ai/variant/:variantId/upscale', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantId } = req.params;
    const { targetScale } = req.body;
    const idempotencyKey = ((req.body?.idempotencyKey || req.headers['idempotency-key'] || '') as string).trim();

    if (!targetScale || !['1080p', '1k', '2k', '4k'].includes(targetScale)) {
      return res.status(400).json({
        error: 'INVALID_SCALE',
        detail: "Target scale must be one of '1080p', '1k', '2k', '4k'",
      });
    }

    // 0. Idempotency check: if an upscale with this key exists, return it
    if (idempotencyKey) {
      const existingUpscale = await findUpscaleByIdempotency(user.id, idempotencyKey);
      if (existingUpscale) {
        if (existingUpscale.status === 'completed') {
          return res.json({
            success: true,
            alreadyUpscaled: true,
            outputUrl: existingUpscale.output_url,
            targetScale: existingUpscale.target_scale,
            upscaleId: existingUpscale.id,
            cost: existingUpscale.credits_cost,
          });
        }
        return res.json({
          success: true,
          status: existingUpscale.status,
          targetScale: existingUpscale.target_scale,
          upscaleId: existingUpscale.id,
        });
      }
    }

    // 1. Load variant and verify ownership
    const { variant, job } = await getVariantById(variantId);
    if (!variant) {
      return res.status(404).json({ error: 'VARIANT_NOT_FOUND', detail: 'Variant not found' });
    }
    if (variant.user_id !== user.id) {
      return res.status(403).json({ error: 'FORBIDDEN', detail: 'Variant belongs to another user' });
    }
    if (variant.status !== 'completed' || !variant.output_url) {
      return res.status(400).json({ error: 'INVALID_STATE', detail: 'Only completed variants can be upscaled' });
    }

    // 2. Reject scale above model's max_upscale
    const SCALE_RANK: Record<string, number> = {
      '720p': 1,
      '1080p': 2,
      '1k': 2,
      '2k': 3,
      '4k': 4,
    };
    const model = await loadModelConfig(job?.model_id || 'img_nano_banana_2_lite');
    const maxScale = model?.max_upscale || '1080p';

    if ((SCALE_RANK[targetScale] || 0) > (SCALE_RANK[maxScale] || 0)) {
      return res.status(400).json({
        error: 'SCALE_EXCEEDS_MODEL',
        detail: `Target scale '${targetScale}' exceeds model maximum upscale limit of '${maxScale}'`,
      });
    }

    // 3. Return existing if already upscaled on this variant
    if (variant.upscaled_urls?.[targetScale]) {
      return res.json({
        success: true,
        alreadyUpscaled: true,
        outputUrl: variant.upscaled_urls[targetScale],
        targetScale,
      });
    }

    const inFlightOrDone = await findUpscaleByVariantAndScale(variantId, targetScale);
    if (inFlightOrDone) {
      if (inFlightOrDone.status === 'completed') {
        return res.json({
          success: true,
          alreadyUpscaled: true,
          outputUrl: inFlightOrDone.output_url,
          targetScale,
          upscaleId: inFlightOrDone.id,
          cost: inFlightOrDone.credits_cost,
        });
      }
      return res.json({
        success: true,
        status: inFlightOrDone.status,
        targetScale,
        upscaleId: inFlightOrDone.id,
      });
    }

    // 4. Quote cost
    let cost = model?.upscale_credit_cost || 35;
    if (targetScale === '1k' || targetScale === '1080p') {
      cost = Math.min(cost, 35);
    } else if (targetScale === '2k') {
      cost = Math.min(cost, 70);
    }

    // 5. Reserve credits atomically
    const upscaleId = (await import('crypto')).randomUUID();
    const userAuthToken = req.headers.authorization?.replace('Bearer ', '').trim();
    let reservationId: string;
    try {
      const reservation = await reserveCreditsForJob({
        userId: user.id,
        jobId: upscaleId,
        amount: cost,
        timeoutSeconds: 300,
        userAuthToken,
      });
      reservationId = reservation.reservationId;
    } catch (err: any) {
      if (err?.message?.includes('INSUFFICIENT_CREDITS')) {
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS', required: cost });
      }
      return res.status(500).json({ error: 'CREDIT_RESERVATION_FAILED', detail: err?.message || 'Credit reservation failed' });
    }

    // 6. Insert generation_upscales row
    await createUpscaleRecord({
      id: upscaleId,
      variant_id: variant.id,
      job_id: variant.job_id,
      user_id: user.id,
      target_scale: targetScale as any,
      source_url: variant.output_url,
      status: 'processing',
      credits_cost: cost,
      reservation_id: reservationId,
      idempotency_key: idempotencyKey || undefined,
      provider: model?.provider || 'google',
      created_at: new Date().toISOString(),
    });

    // 7. Dispatch and settle
    try {
      let upscaledUrl = variant.output_url;
      if (upscaledUrl.includes('unsplash.com')) {
        const param =
          targetScale === '4k'
            ? 'w=3840&q=95'
            : targetScale === '2k'
            ? 'w=2048&q=90'
            : 'w=1920&q=85';
        upscaledUrl = upscaledUrl.replace(/w=\d+(&q=\d+)?/, param);
        if (!upscaledUrl.includes('w=')) {
          upscaledUrl = `${upscaledUrl}${upscaledUrl.includes('?') ? '&' : '?'}${param}`;
        }
      } else {
        upscaledUrl = `${upscaledUrl}${upscaledUrl.includes('?') ? '&' : '?'}upscale=${targetScale}`;
      }

      await updateUpscaleRecord(upscaleId, {
        status: 'completed',
        output_url: upscaledUrl,
        completed_at: new Date().toISOString(),
      });

      await addUpscaledUrlToVariant(variant.id, targetScale, upscaledUrl);

      await settleJobReservation({
        reservationId,
        jobId: upscaleId,
        userId: user.id,
        consumedAmount: cost,
        reason: `upscale_${targetScale}_completed`,
      });

      return res.json({
        success: true,
        upscaleId,
        targetScale,
        outputUrl: upscaledUrl,
        cost,
      });
    } catch (dispatchErr: any) {
      console.error('[Upscale Dispatcher] Upscale failed:', dispatchErr);
      await updateUpscaleRecord(upscaleId, {
        status: 'failed',
        error_message: dispatchErr?.message || 'Upscale failed',
      });
      await settleJobReservation({
        reservationId,
        jobId: upscaleId,
        userId: user.id,
        consumedAmount: 0,
        reason: 'upscale_failed_refund',
      });
      return res.status(500).json({ error: 'UPSCALE_FAILED', detail: 'Upscale processing failed' });
    }
  } catch (err: any) {
    console.error('Error handling upscale:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Upscale request failed' });
  }
});

/**
 * GET /api/ai/upscale/:upscaleId
 * Retrieves status and result of an upscale operation.
 */
app.get('/api/ai/upscale/:upscaleId', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const upscale = await getUpscaleById(req.params.upscaleId);
    if (!upscale || upscale.user_id !== user.id) {
      return res.status(404).json({ error: 'UPSCALE_NOT_FOUND', detail: 'Upscale record not found' });
    }

    return res.json({ upscale });
  } catch (err: any) {
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to fetch upscale' });
  }
});

/**
 * DELETE /api/ai/variant/:variantId
 * Soft deletes a completed variant (or permanently deletes a failed variant/job).
 */
app.delete('/api/ai/variant/:variantId', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantId } = req.params;
    const permanent = req.query.permanent === 'true' || req.query.permanent === '1';
    const result = await softDeleteVariant(variantId, user.id, permanent);
    if (!result.success) {
      return res.status(404).json({ error: 'VARIANT_NOT_FOUND', detail: 'Variant not found or already deleted' });
    }
    return res.json(result);
  } catch (err: any) {
    console.error('Error deleting variant:', err);
    if (err?.message?.includes('Forbidden')) {
      return res.status(403).json({ error: 'FORBIDDEN', detail: err.message });
    }
    return res.status(500).json({ error: 'DELETE_FAILED', detail: err?.message || 'Delete failed' });
  }
});

/**
 * DELETE /api/ai/job/:jobId
 * Permanently deletes a generation job and all of its variants for the authenticated user.
 */
app.delete('/api/ai/job/:jobId', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { jobId } = req.params;
    const result = await permanentlyDeleteFailedGeneration(user.id, { jobIds: [jobId] });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Error permanently deleting job:', err);
    return res.status(500).json({ error: 'DELETE_FAILED', detail: err?.message || 'Failed to delete job' });
  }
});

/**
 * POST /api/ai/jobs/delete-failed
 * Permanently deletes one or more failed generation jobs and/or failed variants.
 */
app.post('/api/ai/jobs/delete-failed', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { jobIds, variantIds } = req.body || {};
    const result = await permanentlyDeleteFailedGeneration(user.id, {
      jobIds: Array.isArray(jobIds) ? jobIds : undefined,
      variantIds: Array.isArray(variantIds) ? variantIds : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Error permanently deleting failed generations:', err);
    return res.status(500).json({ error: 'DELETE_FAILED', detail: err?.message || 'Failed to delete failed generations' });
  }
});

/**
 * POST /api/ai/download
 * Logs download event to generation_downloads.
 */
app.post('/api/ai/download', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantId, resolution = 'original' } = req.body;
    await recordDownload(user.id, variantId, resolution);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Download logging failed' });
  }
});

// ---------------------------------------------------------------------------
// Section B: Projects & Asset Organization Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/projects
 * Returns user projects ordered by position, including item_count
 */
app.get('/api/projects', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const projects = await getProjectsForUser(user.id);
    return res.json({ projects });
  } catch (err: any) {
    console.error('Error fetching projects:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to fetch projects' });
  }
});

/**
 * POST /api/projects
 * Discards client-supplied ID, generates UUID. Checks unique name.
 */
app.post('/api/projects', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { name, description, color, icon } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'INVALID_NAME', detail: 'Project name is required' });
    }

    // Discard any client-supplied id, call createProject
    const project = await createProject(user.id, {
      name,
      description,
      color,
      icon,
    });

    return res.status(201).json({ project, ...project });
  } catch (err: any) {
    if (err?.code === '23505' || err?.message === 'PROJECT_NAME_TAKEN' || err?.status === 409) {
      return res.status(409).json({ error: 'PROJECT_NAME_TAKEN', detail: 'A project with this name already exists' });
    }
    if (err?.status === 400) {
      return res.status(400).json({ error: 'BAD_REQUEST', detail: err.message });
    }
    console.error('Error creating project:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to create project' });
  }
});

/**
 * PATCH /api/projects/:id
 * Updates name, description, color, position. 404 on unowned.
 */
app.patch('/api/projects/:id', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    const { name, description, color, position } = req.body;

    const project = await updateProject(user.id, id, {
      name,
      description,
      color,
      position,
    });

    return res.json({ project, ...project });
  } catch (err: any) {
    if (err?.status === 404 || err?.message === 'Project not found') {
      return res.status(404).json({ error: 'NOT_FOUND', detail: 'Project not found' });
    }
    if (err?.code === '23505' || err?.message === 'PROJECT_NAME_TAKEN' || err?.status === 409) {
      return res.status(409).json({ error: 'PROJECT_NAME_TAKEN', detail: 'A project with this name already exists' });
    }
    if (err?.status === 400) {
      return res.status(400).json({ error: 'BAD_REQUEST', detail: err.message });
    }
    console.error('Error updating project:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:id
 * Soft deletes project; ?cascade=true also trashes members. 404 on unowned.
 */
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    const cascade = req.query.cascade === 'true';

    await deleteProject(user.id, id, cascade);
    return res.json({ success: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.message === 'Project not found') {
      return res.status(404).json({ error: 'NOT_FOUND', detail: 'Project not found' });
    }
    console.error('Error deleting project:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to delete project' });
  }
});

/**
 * GET /api/projects/:id/items
 * Returns joined variant + job rows, ordered by position
 */
app.get('/api/projects/:id/items', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    const items = await getProjectItems(user.id, id);
    return res.json({ items });
  } catch (err: any) {
    if (err?.status === 404 || err?.message === 'Project not found') {
      return res.status(404).json({ error: 'NOT_FOUND', detail: 'Project not found' });
    }
    console.error('Error fetching project items:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to fetch project items' });
  }
});

/**
 * POST /api/projects/:id/items
 * Adds variantIds to project. Idempotent. Returns resulting member list.
 */
app.post('/api/projects/:id/items', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    const { variantIds } = req.body;
    if (!Array.isArray(variantIds)) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'variantIds must be an array' });
    }

    const items = await addProjectItems(user.id, id, variantIds);
    return res.json({ items });
  } catch (err: any) {
    if (err?.status === 404 || err?.message === 'Project not found') {
      return res.status(404).json({ error: 'NOT_FOUND', detail: 'Project not found' });
    }
    console.error('Error adding project items:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to add project items' });
  }
});

/**
 * DELETE /api/projects/:id/items/:variantId
 * Removes item from project (does NOT trash the asset).
 */
app.delete('/api/projects/:id/items/:variantId', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id, variantId } = req.params;
    await removeProjectItem(user.id, id, variantId);
    return res.json({ success: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.message === 'Project not found') {
      return res.status(404).json({ error: 'NOT_FOUND', detail: 'Project not found' });
    }
    console.error('Error removing project item:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to remove project item' });
  }
});

/**
 * POST /api/projects/:id/reorder
 * Atomically reorders items in project.
 */
app.post('/api/projects/:id/reorder', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    const { variantIds } = req.body;
    if (!Array.isArray(variantIds)) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'variantIds must be an array' });
    }

    await reorderProjectItems(user.id, id, variantIds);
    return res.json({ success: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.message === 'Project not found') {
      return res.status(404).json({ error: 'NOT_FOUND', detail: 'Project not found' });
    }
    console.error('Error reordering project items:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to reorder items' });
  }
});

/**
 * POST /api/projects/items/move
 * Atomically moves variant between projects.
 */
app.post('/api/projects/items/move', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantId, fromProjectId, toProjectId, position = 0 } = req.body;
    if (!variantId || !fromProjectId || !toProjectId) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'Missing required parameters' });
    }

    await moveProjectItem(user.id, variantId, fromProjectId, toProjectId, position);
    return res.json({ success: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.message === 'Project not found') {
      return res.status(404).json({ error: 'NOT_FOUND', detail: 'Project not found' });
    }
    console.error('Error moving project item:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to move project item' });
  }
});

// ---------------------------------------------------------------------------
// Section D: Trash, Restore & Tiered Retention Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/trash
 * Fetches trashed, unpurged variants + purge_after for authenticated user.
 */
app.get('/api/trash', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const items = await getTrashVariants(user.id);
    return res.json({ items, count: items.length });
  } catch (err: any) {
    console.error('Error fetching trash:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to fetch trash' });
  }
});

/**
 * POST /api/trash
 * Soft-deletes variants into trash. Computes & writes purge_after based on current tier.
 * Returns each item's purge_after so the client can render countdown immediately.
 */
app.post('/api/trash', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantIds } = req.body;
    if (!Array.isArray(variantIds) || variantIds.length === 0) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'variantIds must be a non-empty array' });
    }

    const trashed = await trashVariants(user.id, variantIds);
    return res.json({ success: true, trashed, count: trashed.length });
  } catch (err: any) {
    console.error('Error moving variants to trash:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to move to trash' });
  }
});

/**
 * POST /api/trash/restore
 * Restores variants from trash (if not yet purged).
 * Asset returns to All Assets, does NOT rejoin previous projects.
 */
app.post('/api/trash/restore', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantIds } = req.body;
    if (!Array.isArray(variantIds) || variantIds.length === 0) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'variantIds must be a non-empty array' });
    }

    const restored = await restoreVariants(user.id, variantIds);
    return res.json({ success: true, restored, count: restored.length });
  } catch (err: any) {
    console.error('Error restoring variants:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to restore variants' });
  }
});

/**
 * DELETE /api/trash
 * Manual permanent delete: marks for immediate byte purge.
 */
app.delete('/api/trash', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantIds } = req.body;
    if (!Array.isArray(variantIds) || variantIds.length === 0) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'variantIds must be a non-empty array' });
    }

    const purged = await purgeVariantsNow(user.id, variantIds);
    return res.json({ success: true, purged, count: purged.length });
  } catch (err: any) {
    console.error('Error purging variants:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to purge variants' });
  }
});

/**
 * DELETE /api/trash/all
 * Empties all trashed variants for the authenticated user.
 */
app.delete('/api/trash/all', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const purged = await purgeAllTrashVariants(user.id);
    return res.json({ success: true, purged, count: purged.length });
  } catch (err: any) {
    console.error('Error emptying trash:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to empty trash' });
  }
});

// ---------------------------------------------------------------------------
// Section E: Library, Favorites & Music Playlists Endpoints (Phase 5)
// ---------------------------------------------------------------------------

/**
 * GET /api/library
 * Query: type=video|image|music, limit=24, cursor=..., favorites=0|1, q=..., projectId=...
 * Returns flattened, completed, non-trashed variants with job metadata + is_favorite.
 */
app.get('/api/library', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { type, limit, cursor, favorites, q, projectId } = req.query;
    const isFavorites = favorites === '1' || favorites === 'true';

    const result = await getLibraryItems(user.id, {
      type: type as any,
      limit: limit ? Number(limit) : undefined,
      cursor: cursor as string | undefined,
      favorites: isFavorites,
      q: q as string | undefined,
      projectId: projectId ? String(projectId) : undefined,
    });

    return res.json(result);
  } catch (err: any) {
    if (err?.status === 404 || err?.message === 'Project not found') {
      return res.status(404).json({ error: 'PROJECT_NOT_FOUND', detail: 'Project not found' });
    }
    console.error('Error fetching library items:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to fetch library' });
  }
});

/**
 * GET /api/favorites
 * Query: type=video|image|music
 * Returns favorited variant IDs and full items.
 */
app.get('/api/favorites', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { type } = req.query;
    const ids = await getUserFavoriteVariantIds(user.id, type as any);
    const { items } = await getLibraryItems(user.id, {
      type: type as any,
      favorites: true,
      limit: 100,
    });

    return res.json({ ids, items });
  } catch (err: any) {
    console.error('Error fetching favorites:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to fetch favorites' });
  }
});

/**
 * PUT /api/favorites/:variantId
 * Idempotently adds variant to favorites, verifying variant belongs to caller.
 */
app.put('/api/favorites/:variantId', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantId } = req.params;
    if (!variantId) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'variantId is required' });
    }

    const result = await addFavorite(user.id, variantId);
    return res.json(result);
  } catch (err: any) {
    if (err?.code === 'VARIANT_NOT_FOUND' || err?.status === 404) {
      return res.status(404).json({ error: 'VARIANT_NOT_FOUND', detail: 'Variant not found or does not belong to you' });
    }
    console.error('Error adding favorite:', err);
    return res.status(500).json({ error: 'FAVORITE_FAILED', detail: err?.message || 'Could not update favorites' });
  }
});

/**
 * DELETE /api/favorites/:variantId
 * Idempotently removes variant from favorites.
 */
app.delete('/api/favorites/:variantId', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { variantId } = req.params;
    if (!variantId) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'variantId is required' });
    }

    const result = await removeFavorite(user.id, variantId);
    return res.json(result);
  } catch (err: any) {
    console.error('Error removing favorite:', err);
    return res.status(500).json({ error: 'FAVORITE_FAILED', detail: err?.message || 'Could not update favorites' });
  }
});

/**
 * GET /api/playlists
 * Returns [{ id, name, tags, item_count, cover_urls[<=4], created_at, updated_at }]
 */
app.get('/api/playlists', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const playlists = await getPlaylistsForUser(user.id);
    return res.json(playlists);
  } catch (err: any) {
    console.error('Error fetching playlists:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to fetch playlists' });
  }
});

/**
 * POST /api/playlists
 * Body: { name, tags?: string[], variantId?: string }
 */
app.post('/api/playlists', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { name, tags, variantId } = req.body;
    const created = await createPlaylist(user.id, { name, tags, variantId });
    return res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === 'PLAYLIST_NAME_TAKEN' || err?.status === 409) {
      return res.status(409).json({ error: 'PLAYLIST_NAME_TAKEN', detail: err.message });
    }
    if (err?.code === 'PLAYLIST_MUSIC_ONLY' || err?.status === 400) {
      return res.status(400).json({ error: 'PLAYLIST_MUSIC_ONLY', detail: err.message });
    }
    if (err?.code === 'INVALID_NAME') {
      return res.status(400).json({ error: 'INVALID_NAME', detail: err.message });
    }
    if (err?.code === 'VARIANT_NOT_FOUND' || err?.status === 404) {
      return res.status(404).json({ error: 'VARIANT_NOT_FOUND', detail: 'Variant not found' });
    }
    console.error('Error creating playlist:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to create playlist' });
  }
});

/**
 * PATCH /api/playlists/:id
 * Body: { name?: string, tags?: string[] }
 */
app.patch('/api/playlists/:id', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    const { name, tags } = req.body;
    const updated = await updatePlaylist(user.id, id, { name, tags });
    return res.json(updated);
  } catch (err: any) {
    if (err?.code === 'PLAYLIST_NAME_TAKEN' || err?.status === 409) {
      return res.status(409).json({ error: 'PLAYLIST_NAME_TAKEN', detail: err.message });
    }
    if (err?.code === 'PLAYLIST_NOT_FOUND' || err?.status === 404) {
      return res.status(404).json({ error: 'PLAYLIST_NOT_FOUND', detail: err.message });
    }
    if (err?.code === 'INVALID_NAME') {
      return res.status(400).json({ error: 'INVALID_NAME', detail: err.message });
    }
    console.error('Error updating playlist:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to update playlist' });
  }
});

/**
 * DELETE /api/playlists/:id
 * Removes the playlist and its join rows only — never the tracks.
 */
app.delete('/api/playlists/:id', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    await deletePlaylist(user.id, id);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting playlist:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to delete playlist' });
  }
});

/**
 * GET /api/playlists/:id/items
 * Returns ordered, non-trashed variants with full track metadata.
 */
app.get('/api/playlists/:id/items', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    const items = await getPlaylistItems(user.id, id);
    return res.json({ items });
  } catch (err: any) {
    if (err?.code === 'PLAYLIST_NOT_FOUND' || err?.status === 404) {
      return res.status(404).json({ error: 'PLAYLIST_NOT_FOUND', detail: 'Playlist not found' });
    }
    console.error('Error fetching playlist items:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to fetch playlist items' });
  }
});

/**
 * POST /api/playlists/:id/items
 * Body: { variantIds: string[] }
 * Idempotently adds tracks to playlist, verifying music-only.
 */
app.post('/api/playlists/:id/items', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    const { variantIds } = req.body;
    if (!Array.isArray(variantIds) || variantIds.length === 0) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'variantIds must be a non-empty array' });
    }

    const items = await addPlaylistItems(user.id, id, variantIds);
    return res.json({ success: true, items });
  } catch (err: any) {
    if (err?.code === 'PLAYLIST_MUSIC_ONLY' || err?.status === 400) {
      return res.status(400).json({ error: 'PLAYLIST_MUSIC_ONLY', detail: err.message });
    }
    if (err?.code === 'PLAYLIST_NOT_FOUND' || err?.status === 404) {
      return res.status(404).json({ error: 'PLAYLIST_NOT_FOUND', detail: 'Playlist not found' });
    }
    if (err?.code === 'VARIANT_NOT_FOUND') {
      return res.status(404).json({ error: 'VARIANT_NOT_FOUND', detail: err.message });
    }
    console.error('Error adding playlist items:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to add playlist items' });
  }
});

/**
 * DELETE /api/playlists/:id/items/:variantId
 * Removes a single track from playlist.
 */
app.delete('/api/playlists/:id/items/:variantId', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id, variantId } = req.params;
    await removePlaylistItem(user.id, id, variantId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error removing playlist item:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to remove playlist item' });
  }
});

/**
 * POST /api/playlists/:id/reorder
 * Body: { variantIds: string[] }
 * Reorders tracks in playlist.
 */
app.post('/api/playlists/:id/reorder', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { id } = req.params;
    const { variantIds } = req.body;
    if (!Array.isArray(variantIds)) {
      return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'variantIds must be an array' });
    }

    await reorderPlaylistItems(user.id, id, variantIds);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error reordering playlist items:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to reorder playlist items' });
  }
});


// ---------------------------------------------------------------------------
// Existing Creative Assistants (Prompt Enhancer, Lyrics, Cover Art)
// ---------------------------------------------------------------------------

// Prompt Enhancer (Section 10.6.4: Prompt rewriter that adapts user prompts for AI models)
app.post('/api/ai/enhance-prompt', async (req, res) => {
  // Rate limit check (Phase 7)
  const user = await resolveUserFromAuthHeader(req.headers.authorization);
  const rateKey = user?.id || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'anonymous';
  const rateCheck = enhanceLimiter.tryConsume(rateKey);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds || 5));
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Enhance prompt rate limit exceeded. Please try again shortly.',
      retryAfter: rateCheck.retryAfterSeconds,
    });
  }

  const {
    prompt, mediaType, modelId, aspectRatio, variantCount,
    durationSeconds, resolution, genre, tonality,
    hasReferenceImage, previousVariants = [],
    occasion: rawOccasion, language,
  } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  if (!process.env.GEMINI_API_KEY) {
    // Honest failure. Never return a suffixed prompt and call it enhanced.
    return res.status(503).json({ error: 'PROMPT_ENHANCER_UNAVAILABLE' });
  }

  // Read the ACTUAL selected model so Gemini writes in that model's dialect.
  const model = await loadModelConfig(modelId);
  if (!model) return res.status(400).json({ error: 'Unknown modelId' });

  const constraints: string[] = [];
  if (aspectRatio)      constraints.push(`Output aspect ratio: ${aspectRatio}.`);
  if (durationSeconds)  constraints.push(`Clip duration: ${durationSeconds}s — the entire described action must resolve within it.`);
  if (resolution)       constraints.push(`Render resolution: ${resolution}.`);
  if (model.generation_type === 'music') {
    if (genre)    constraints.push(`Musical genre: ${genre}. Name concrete instruments, rhythm feel and arrangement typical of it.`);
    if (tonality) constraints.push(`Mood: ${tonality}.`);
    constraints.push('The rewritten text is a SONG BRIEF (story/message of the lyrics + instrumentation + vocal style). It will be handed to a lyric writer. Do NOT write lyrics yourself and do NOT include section markers.');
    if (rawOccasion) {
      const parsed = sanitizeOccasionInput(rawOccasion);
      if (parsed.ok) {
        constraints.push(buildOccasionEnhancerContext(parsed.value));
      }
    }
  } else {
    if (genre)            constraints.push(`Genre: ${genre}.`);
    if (tonality)         constraints.push(`Mood: ${tonality}.`);
  }
  if (hasReferenceImage) constraints.push('A reference image is attached; describe how the output should relate to it rather than re-describing it from scratch.');
  if (variantCount > 1) constraints.push(`${variantCount} variants render from this one prompt — leave room for meaningful variation; do not over-specify every pixel.`);

  const systemInstruction = `You are a senior prompt engineer for Bidou AI.

TARGET MODEL: ${model.display_name} (provider: ${model.provider}, internal id: ${model.model_name}, media: ${model.generation_type}, quality tier: ${model.quality_tier}).

HOW THIS MODEL WANTS TO BE PROMPTED:
${model.prompt_style_guide || 'No model-specific guidance on file; apply general best practice for this media type.'}

GENERATION CONSTRAINTS:
${constraints.join('\n') || 'None.'}

YOUR TASK:
Rewrite the user's prompt as a single new prompt aimed squarely at ${model.display_name}.

RULES — follow all of them:
1. Preserve the user's SUBJECT and INTENT exactly. You are re-voicing their idea, not replacing it.
2. Write in the dialect described above. A video model wants camera and motion language; an image model wants composition, lens and lighting language; a music model wants instrumentation, tempo and arrangement language.
3. This is a REWRITE, not an append. Never echo the user's original sentence and bolt adjectives onto it.
4. Never emit generic filler such as "highly detailed", "8k", "masterpiece", "award-winning", "ultra-sharp" or "trending on artstation". Earn specificity with concrete nouns instead.
5. Respect the constraints above. Never contradict them.
6. Output ONLY the finished prompt. No preamble, no quotation marks, no markdown, no explanation.
7. Target 40-90 words for image and video, 30-70 for music.
${previousVariants.length ? `8. You have already produced the variants below. Produce a MEANINGFULLY DIFFERENT interpretation this time — change the angle, the light, or the staging.\n${previousVariants.map((v: string, i: number) => `   Variant ${i + 1}: ${v}`).join('\n')}` : ''}`;

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `User's prompt: ${prompt}`,
      config: {
        systemInstruction,
        temperature: previousVariants.length ? 1.0 : 0.85, // re-rolls diverge more
        maxOutputTokens: 400,
      },
    });

    const enhanced = response.text?.trim().replace(/^["'`]|["'`]$/g, '');
    if (!enhanced) return res.status(502).json({ error: 'ENHANCER_EMPTY_RESPONSE' });

    return res.json({
      enhancedPrompt: enhanced,
      targetModel: model.display_name,
      originalPrompt: prompt,
    });
  } catch (err: any) {
    console.error('[enhance-prompt] Gemini failure:', err);
    return res.status(502).json({ error: 'ENHANCER_FAILED', detail: err?.message });
  }
});

// AI Lyrics Generation (Phase 3.9)
app.post('/api/ai/generate-lyrics', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.trim()) {
    return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
  }
  const user = await resolveUserFromAuthHeader(authHeader);
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
  const rc = enhanceLimiter.tryConsume(user.id);                 // reuse the existing limiter (20 burst / 20 per min)
  if (!rc.allowed) {
    res.setHeader('Retry-After', String(rc.retryAfterSeconds || 5));
    return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', retryAfter: rc.retryAfterSeconds });
  }

  const { title, genre, tonality, instructions, description, language, occasion: rawOccasion } = req.body || {};
  let occasion = null;
  if (rawOccasion) {
    const p = sanitizeOccasionInput(rawOccasion);
    if (!p.ok) return res.status(400).json({ error: 'INVALID_OCCASION', message: (p as { ok: false; message: string }).message });
    occasion = p.value;
  }

  if (!process.env.GEMINI_API_KEY) {
    if (isLiveMode()) return res.status(503).json({ error: 'LYRICS_UNAVAILABLE' });
    return res.json({ lyrics: '[Verse 1]\nDemo lyrics (set GEMINI_API_KEY for real lyrics)\n\n[Chorus]\nLa la la…' });   // demo mode only
  }
  try {
    const written = await composeLyrics({ title, genre, tonality, instructions, description, language, occasion });
    return res.json({ lyrics: written.lyrics, title: written.title });
  } catch (err: any) {
    console.error('[generate-lyrics] failed:', err?.message || err);
    return res.status(502).json({ error: 'LYRICS_FAILED' });
  }
});

// AI Lyrics Rewrite Add-on (Section 10.6.2: 30 credits paid add-on)
app.post('/api/ai/rewrite-lyrics', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { currentLyrics, targetVibe } = req.body;
    if (!currentLyrics) {
      return res.status(400).json({ error: 'Current lyrics are required' });
    }

    const cost = 30; // 30 credits add-on
    const refId = `rewrite_${crypto.randomUUID()}`;

    try {
      await debitCredits({
        userId: user.id,
        amount: cost,
        referenceId: refId,
        description: 'Lyrics Rewrite Add-on',
      });
    } catch (creditErr: any) {
      if (creditErr?.message?.includes('INSUFFICIENT_CREDITS')) {
        const wallet = await getUserWallet(user.id);
        return res.status(402).json({
          error: 'INSUFFICIENT_CREDITS',
          required: cost,
          available: wallet?.balance ?? 0,
        });
      }
      throw creditErr;
    }

    try {
      if (process.env.GEMINI_API_KEY) {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `You are a platinum hit songwriter and vocal arranger. Refactor, polish, and elevate the rhythmic cadence, rhyming scheme, and emotional delivery of the following lyrics while keeping the core theme intact.
Target vibe: ${targetVibe || 'poetic, infectious, and polished'}

Original lyrics:
${currentLyrics}`,
        });
        return res.json({ rewrittenLyrics: response.text ? response.text.trim() : currentLyrics });
      } else {
        if (isLiveMode()) {
          throw new Error('LYRICS_UNAVAILABLE');
        }
        const rewritten = currentLyrics
          .split('\n')
          .map((line: string) => (line.startsWith('[') ? line : `${line} ♪`))
          .join('\n');
        return res.json({ rewrittenLyrics: rewritten });
      }
    } catch (genErr: any) {
      // Refund credits on failure
      await refundCredits({
        userId: user.id,
        amount: cost,
        referenceId: `ref_${refId}`,
        description: 'Refund for failed lyrics rewrite',
      }).catch((rErr) => console.error('[Rewrite] Refund failed:', rErr));
      if (genErr?.message === 'LYRICS_UNAVAILABLE') {
        return res.status(503).json({ error: 'LYRICS_UNAVAILABLE' });
      }
      throw genErr;
    }
  } catch (err: any) {
    console.error('Error rewriting lyrics:', err);
    return res.status(500).json({ error: err?.message || 'Failed to rewrite lyrics' });
  }
});

// Cover Art Generation Endpoint (Section F.6 — real Imagen generation saved to storage bucket)
app.post('/api/ai/generate-cover-art', async (req, res) => {
  try {
    const user = await resolveUserFromAuthHeader(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
    }

    const { title, genre, aspectRatio = '1:1' } = req.body;
    const cost = 120; // 120 credits add-on
    const refId = `cover_${crypto.randomUUID()}`;

    try {
      await debitCredits({
        userId: user.id,
        amount: cost,
        referenceId: refId,
        description: 'Cover Art Generation Add-on',
      });
    } catch (creditErr: any) {
      if (creditErr?.message?.includes('INSUFFICIENT_CREDITS')) {
        const wallet = await getUserWallet(user.id);
        return res.status(402).json({
          error: 'INSUFFICIENT_CREDITS',
          required: cost,
          available: wallet?.balance ?? 0,
        });
      }
      throw creditErr;
    }

    try {
      const prompt = `Album cover art for single titled "${title || 'Echoes of the Motherland'}", genre: ${genre || 'Afrobeats'}, cinematic lighting, award-winning visual aesthetic, bold typography, vivid colors, 8k resolution`;

      const ai = getGeminiClient();
      let imageBuffer: Buffer | null = null;

      if (process.env.GEMINI_API_KEY && ai) {
        try {
          const response: any = await (ai.models as any).generateImages({
            model: 'imagen-3.0-generate-002',
            prompt,
            config: {
              numberOfImages: 1,
              aspectRatio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '1:1',
              outputMimeType: 'image/png',
            },
          });

          if (response?.generatedImages?.[0]?.image?.imageBytes) {
            imageBuffer = Buffer.from(response.generatedImages[0].image.imageBytes, 'base64');
          }
        } catch (imagenErr: any) {
          console.warn('[CoverArt] Imagen direct call failed, trying gemini-3.1-flash-image fallback:', imagenErr?.message);
          try {
            const resp = await ai.models.generateContent({
              model: 'gemini-3.1-flash-image',
              contents: { parts: [{ text: prompt }] },
            });
            const candidate = resp.candidates?.[0];
            const partWithInlineData = candidate?.content?.parts?.find((p: any) => p.inlineData?.data);
            if (partWithInlineData?.inlineData?.data) {
              imageBuffer = Buffer.from(partWithInlineData.inlineData.data, 'base64');
            }
          } catch (flashErr) {
            console.warn('[CoverArt] Flash image fallback exception:', flashErr);
          }
        }
      }

      // If Gemini key is not configured or generation failed, generate a clean SVG/PNG local art
      if (!imageBuffer) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F86A00"/>
      <stop offset="50%" stop-color="#FF8800"/>
      <stop offset="100%" stop-color="#1A1A1E"/>
    </linearGradient>
    <radialGradient id="disc" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFB020" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#F86A00" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="400" cy="400" r="280" fill="#121214" stroke="#FF8800" stroke-width="4"/>
  <circle cx="400" cy="400" r="120" fill="url(#disc)"/>
  <circle cx="400" cy="400" r="40" fill="#FF8800"/>
  <text x="400" y="320" fill="#FFFFFF" font-family="sans-serif" font-size="36" font-weight="bold" text-anchor="middle">${(title || 'Single').replace(/["'<>]/g, '').slice(0, 30)}</text>
  <text x="400" y="520" fill="#FFB020" font-family="sans-serif" font-size="24" font-weight="600" text-anchor="middle">${(genre || 'Music').replace(/["'<>]/g, '').toUpperCase()}</text>
</svg>`;
        imageBuffer = Buffer.from(svg, 'utf8');
      }

      const coverJobId = `cover_${Date.now()}`;
      const coverUrl = await saveGenerationAsset({
        userId: user.id,
        jobId: coverJobId,
        variantIndex: 0,
        extension: 'png',
        contentType: 'image/png',
        data: imageBuffer,
      });

      return res.json({
        coverUrl,
        title: title || 'Single',
        aspectRatio,
      });
    } catch (genErr: any) {
      await refundCredits({
        userId: user.id,
        amount: cost,
        referenceId: `ref_${refId}`,
        description: 'Refund for failed cover art generation',
      }).catch((rErr) => console.error('[CoverArt] Refund failed:', rErr));
      throw genErr;
    }
  } catch (err: any) {
    console.error('Error generating cover art:', err);
    return res.status(500).json({ error: err?.message || 'Failed to generate cover art' });
  }
});

// ---------------------------------------------------------------------------
// Phase 4: Public Models API & Admin Control Plane Routes
// ---------------------------------------------------------------------------
registerModelsAndAdminRoutes(app);

// ---------------------------------------------------------------------------
// Server Bootstrap & Static Handlers
// ---------------------------------------------------------------------------

async function start() {
  // Print Phase 4 startup validation summary table (never crashes)
  logStartupValidationTable();

  // Start background job polling engine for asynchronous tasks (Veo, MusicAPI)
  startBackgroundPoller();
  // Recover in-flight jobs after restarts/redeploys (T8)
  recoverOrphanedJobs().catch((err) => {
    console.error('[Bidou] Initial recoverOrphanedJobs error:', err);
  });
  // Start tiered retention & trash purge engine (Section D.3)
  startRetentionWorker();

  // Always serve static assets from public/
  app.use(express.static(path.join(process.cwd(), 'public')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const pFlags = providerFlags();
    console.log(`[Bidou] DATA MODE = ${isLiveMode() ? 'LIVE' : 'DEMO'} | gemini:${pFlags.gemini ? '✓' : '✗'} musicapi:${pFlags.musicapi ? '✓' : '✗'} futurapay:${pFlags.futurapay ? '✓' : '✗'} | REQUIRE_LIVE_MODE=${requireLiveMode()}`);
    if (isDemoMode() && process.env.NODE_ENV === 'production') {
      console.warn('[Bidou] ⚠️ WARN: Running in DEMO DATA MODE in production environment!');
    }
    console.log(`Bidou AI server listening on http://0.0.0.0:${PORT}`);
  });
}

start().catch(console.error);
