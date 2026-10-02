import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_AI_MODELS, FREE_TIER_WELCOME_CREDITS, INITIAL_PACKAGES } from '../src/services/configData';
import {
  AiModelConfig,
  CreditReservation,
  CreditTransaction,
  CreditWallet,
  Favorite,
  GenerationJob,
  GenerationJobVariant,
  LibraryItem,
  PlanTier,
  Playlist,
  PlaylistItem,
  Project,
  ProjectItem,
  TransactionType,
} from '../src/types';
import { isLiveMode, isDemoMode } from './config/mode';
import { tierForLifetimeSpend, promoteOnly } from '../src/services/tiers';
import crypto from 'crypto';

let supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseAdmin && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabaseAdmin;
}

// In-memory fallback stores for when Supabase is not connected in the current container (DEMO ONLY)
const mockJobs = new Map<string, GenerationJob>();
const mockVariants = new Map<string, GenerationJobVariant[]>();
const mockProjects = new Map<string, Project>();
const mockProjectItems = new Map<string, ProjectItem[]>();
const mockFavorites = new Map<string, Set<string>>(); // userId -> Set of variantIds
const mockPlaylists = new Map<string, Playlist>(); // playlistId -> Playlist
const mockPlaylistItems = new Map<string, PlaylistItem[]>(); // playlistId -> PlaylistItem[]
const mockWallets = new Map<string, CreditWallet & { promo_balance: number }>();
const mockTransactions: CreditTransaction[] = [];
const mockReservations = new Map<
  string,
  { id: string; userId: string; jobId: string; amount: number; promoAmount: number; expiresAt: number; settled: boolean }
>();
const mockPayments = new Map<string, any>();
const mockProfiles = new Map<string, { plan_tier: PlanTier; lifetime_spend_fcfa: number }>();
const inMemoryModelOverrides = new Map<
  string,
  Partial<AiModelConfig> & {
    licence_note?: string | null;
    licence_verified_at?: string | null;
    licence_verified_by?: string | null;
  }
>();

export function setInMemoryModelOverride(
  modelId: string,
  updates: Partial<AiModelConfig> & {
    licence_note?: string | null;
    licence_verified_at?: string | null;
    licence_verified_by?: string | null;
  }
): void {
  inMemoryModelOverrides.set(modelId, {
    ...(inMemoryModelOverrides.get(modelId) || {}),
    ...updates,
  });
}

export function getInMemoryModelOverrides() {
  return inMemoryModelOverrides;
}

export function getOrCreateMockWallet(userId: string): CreditWallet & { promo_balance: number } {
  let wallet = mockWallets.get(userId);
  if (!wallet) {
    wallet = {
      id: `wal_${userId}`,
      user_id: userId,
      balance: 0,
      promo_balance: FREE_TIER_WELCOME_CREDITS,
      updated_at: new Date().toISOString(),
    };
    mockWallets.set(userId, wallet);
    if (!mockProfiles.has(userId)) {
      mockProfiles.set(userId, { plan_tier: 'free', lifetime_spend_fcfa: 0 });
    }
    mockTransactions.unshift({
      id: `ctx_welcome_${userId}_${Date.now()}`,
      user_id: userId,
      type: 'bonus',
      amount: FREE_TIER_WELCOME_CREDITS,
      balance_after: FREE_TIER_WELCOME_CREDITS,
      reference_id: `welcome_${userId}`,
      description: 'Welcome credits (image models only)',
      created_at: new Date().toISOString(),
    });
  }
  return wallet;
}

// Initial seed for demo / preview mode (ONLY initialized in demo mode)
if (isDemoMode()) {
  const seedProject1: Project = {
    id: 'prj_sample_1',
    user_id: 'usr_amina_01',
    name: 'Single Release 2026',
    description: 'Cover art and visual assets for upcoming single',
    color: '#F86A00',
    icon: 'folder',
    position: 0,
    item_count: 2,
    item_ids: ['job_sample_1', 'job_sample_2'],
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  };
  const seedProject2: Project = {
    id: 'prj_sample_2',
    user_id: 'usr_amina_01',
    name: 'Social Ads',
    description: 'Campaign teasers and reels',
    color: '#28A745',
    icon: 'folder',
    position: 1,
    item_count: 0,
    item_ids: [],
    created_at: new Date(Date.now() - 43200000).toISOString(),
    updated_at: new Date(Date.now() - 43200000).toISOString(),
  };
  mockProjects.set(seedProject1.id, seedProject1);
  mockProjects.set(seedProject2.id, seedProject2);
  mockProjectItems.set(seedProject1.id, [
    {
      id: 'pi_sample_1',
      project_id: seedProject1.id,
      variant_id: 'job_sample_1',
      job_id: 'job_sample_1',
      user_id: 'usr_amina_01',
      position: 0,
      added_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'pi_sample_2',
      project_id: seedProject1.id,
      variant_id: 'job_sample_2',
      job_id: 'job_sample_2',
      user_id: 'usr_amina_01',
      position: 1,
      added_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);
  mockProjectItems.set(seedProject2.id, []);

  // Initial sample jobs and variants for simulation & preview consistency
  const seedMusicJob: GenerationJob = {
    id: 'job_sample_music_1',
    user_id: 'usr_amina_01',
    type: 'music',
    prompt: 'Acoustic Afro-soul ballad with warm kalimba, nylon guitar and heartfelt vocals',
    model_id: 'mus_lyria_3_pro',
    model_name: 'Sonic v4.5 (Full Studio)',
    status: 'completed',
    credit_cost: 220,
    output_urls: ['/samples/afro_soul_ballad.mp3'],
    duration_seconds: 120,
    genre: 'Afro-soul',
    cover_art_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    completed_at: new Date(Date.now() - 3500000).toISOString(),
  };
  const seedMusicVariant: GenerationJobVariant = {
    id: 'var_sample_music_1',
    job_id: seedMusicJob.id,
    user_id: 'usr_amina_01',
    variant_index: 0,
    status: 'completed',
    output_url: '/samples/afro_soul_ballad.mp3',
    thumbnail_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop',
    credits_unit: 220,
    created_at: seedMusicJob.created_at,
    completed_at: seedMusicJob.completed_at,
    updated_at: seedMusicJob.completed_at,
  };
  mockJobs.set(seedMusicJob.id, seedMusicJob);
  mockVariants.set(seedMusicJob.id, [seedMusicVariant]);

  const seedImageJob1: GenerationJob = {
    id: 'job_sample_1',
    user_id: 'usr_amina_01',
    type: 'image',
    prompt: 'Futuristic African fashion portrait with vibrant Ankara patterns and golden neon accents',
    model_id: 'img_nano_banana_2',
    model_name: 'Nano Banana 2 (HQ 1K)',
    status: 'completed',
    credit_cost: 140,
    output_urls: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop'],
    created_at: new Date(Date.now() - 86400000).toISOString(),
    completed_at: new Date(Date.now() - 86300000).toISOString(),
  };
  const seedImageVariant1: GenerationJobVariant = {
    id: 'job_sample_1',
    job_id: seedImageJob1.id,
    user_id: 'usr_amina_01',
    variant_index: 0,
    status: 'completed',
    output_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop',
    credits_unit: 140,
    created_at: seedImageJob1.created_at,
    completed_at: seedImageJob1.completed_at,
    updated_at: seedImageJob1.completed_at,
  };
  const seedImageJob2: GenerationJob = {
    id: 'job_sample_2',
    user_id: 'usr_amina_01',
    type: 'image',
    prompt: 'Cyberpunk Douala skyline at twilight with neon billboards and rain-slicked streets',
    model_id: 'img_nano_banana_2',
    model_name: 'Nano Banana 2 (HQ 1K)',
    status: 'completed',
    credit_cost: 140,
    output_urls: ['https://images.unsplash.com/photo-1514565131-fce0801e5785?w=600&auto=format&fit=crop'],
    created_at: new Date(Date.now() - 86400000).toISOString(),
    completed_at: new Date(Date.now() - 86300000).toISOString(),
  };
  const seedImageVariant2: GenerationJobVariant = {
    id: 'job_sample_2',
    job_id: seedImageJob2.id,
    user_id: 'usr_amina_01',
    variant_index: 0,
    status: 'completed',
    output_url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=600&auto=format&fit=crop',
    credits_unit: 140,
    created_at: seedImageJob2.created_at,
    completed_at: seedImageJob2.completed_at,
    updated_at: seedImageJob2.completed_at,
  };
  mockJobs.set(seedImageJob1.id, seedImageJob1);
  mockVariants.set(seedImageJob1.id, [seedImageVariant1]);
  mockJobs.set(seedImageJob2.id, seedImageJob2);
  mockVariants.set(seedImageJob2.id, [seedImageVariant2]);
}

export interface ResolvedUser {
  id: string;
  email?: string;
  plan_tier: PlanTier;
}

function extractBearer(authHeader?: string): string {
  if (!authHeader) return '';
  return authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();
}

/**
 * Resolves user from Supabase JWT Authorization header or local preview fallback.
 */
export async function resolveUserFromAuthHeader(authHeader?: string): Promise<ResolvedUser | null> {
  const token = extractBearer(authHeader); // '' if none
  if (isLiveMode()) {
    if (!token) return null;
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null; // NO fallbacks, NO unverified JWT decoding
    const { data: profile } = await admin.from('profiles').select('plan_tier').eq('id', data.user.id).maybeSingle();
    return { id: data.user.id, email: data.user.email, plan_tier: (profile?.plan_tier as PlanTier) ?? 'free' };
  }
  // DEMO ONLY: token (or 'usr_amina_01' when absent) is the demo user id.
  const id = token && token !== 'null' && token !== 'undefined' ? token : 'usr_amina_01';
  const prof = mockProfiles.get(id);
  return { id, email: `${id}@demo.bidou.ai`, plan_tier: prof?.plan_tier ?? 'free' };
}

/**
 * Loads model config from ai_models table (merged with INITIAL_AI_MODELS fallback and admin overrides).
 */
export async function loadModelConfig(modelId: string): Promise<AiModelConfig | null> {
  const cat = INITIAL_AI_MODELS.find((m) => m.id === modelId) || null;
  const override = inMemoryModelOverrides.get(modelId);
  const admin = getSupabaseAdmin();

  if (admin && isLiveMode()) {
    try {
      const { data, error } = await admin
        .from('ai_models')
        .select('*')
        .eq('id', modelId)
        .single();

      if (!error && data) {
        return {
          ...(cat || {}),
          ...data,
          pricing_kind: data.pricing_kind ?? cat?.pricing_kind,
          promo_eligible: data.promo_eligible ?? cat?.promo_eligible ?? false,
          is_premium: data.is_premium ?? cat?.is_premium ?? false,
          min_plan_tier: data.min_plan_tier ?? cat?.min_plan_tier,
          video_options: data.video_options ?? cat?.video_options,
          supported_aspect_ratios: data.supported_aspect_ratios ?? cat?.supported_aspect_ratios,
          suppliers: cat?.suppliers,
          ...(override || {}),
        } as AiModelConfig;
      }
    } catch (err) {
      console.warn('[DB] Error querying ai_models, falling back to local config:', err);
    }
  }

  if (!cat) return null;
  return {
    ...cat,
    ...(override || {}),
  };
}

/**
 * Idempotency check: checks if a generation job exists for user + key.
 */
export async function findJobByIdempotency(userId: string, idempotencyKey: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { data } = await admin
        .from('generation_jobs')
        .select('id')
        .eq('user_id', userId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (data?.id) return data.id;
    } catch (err) {
      console.warn('[DB] Idempotency check query failed:', err);
    }
  }

  for (const job of mockJobs.values()) {
    if (job.user_id === userId && (job as any).idempotency_key === idempotencyKey) {
      return job.id;
    }
  }
  return null;
}

/**
 * Reserves credits atomically for a job from the appropriate wallet bucket(s).
 * Promo credits are only consumed when `promoEligible === true`.
 */
export async function reserveCreditsForJob(params: {
  userId: string;
  jobId: string;
  amount: number;
  timeoutSeconds: number;
  promoEligible?: boolean;
  userAuthToken?: string;
}): Promise<{
  reservationId: string;
  availableBalance: number;
  paidBalance: number;
  promoBalance: number;
  promoUsed: number;
  paidUsed: number;
}> {
  const { userId, jobId, amount, timeoutSeconds, promoEligible = false } = params;

  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    let { data, error } = await admin.rpc('reserve_credits_for', {
      p_user: userId,
      p_job_id: jobId,
      p_amount: amount,
      p_timeout_seconds: timeoutSeconds,
      p_promo_eligible: Boolean(promoEligible),
    });

    // Backward-compatibility if 5-arg RPC hasn't been deployed yet on remote DB
    if (error && (error.code === 'PGRST202' || error.message?.includes('p_promo_eligible'))) {
      const fallbackRpc = await admin.rpc('reserve_credits_for', {
        p_user: userId,
        p_job_id: jobId,
        p_amount: amount,
        p_timeout_seconds: timeoutSeconds,
      });
      data = fallbackRpc.data;
      error = fallbackRpc.error;
    }

    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883' || error.message?.includes('does not exist')) {
        console.error('[DB] Missing migration 20261002000000_multi_supplier_and_promo_credits.sql — run it in the Supabase SQL editor');
        const err: any = new Error('MIGRATION_REQUIRED');
        err.code = 'MIGRATION_REQUIRED';
        throw err;
      }
      if (error.message && error.message.includes('INSUFFICIENT_CREDITS')) {
        const { data: wallet } = await admin
          .from('credit_wallets')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        const paidBalance = Number(wallet?.balance ?? 0);
        const promoBalance = Number((wallet as any)?.promo_balance ?? 0);
        const available = promoEligible ? paidBalance + promoBalance : paidBalance;
        const err: any = new Error(`INSUFFICIENT_CREDITS: Required ${amount}, available ${available}`);
        err.paidBalance = paidBalance;
        err.promoBalance = promoBalance;
        err.promoEligible = Boolean(promoEligible);
        err.available = available;
        throw err;
      }
      console.error('[DB] reserve_credits_for RPC failed with database error:', error.message);
      throw new Error(error.message || 'Credit reservation database error');
    }

    const reservationId = data as string;
    const { data: resRow } = await admin
      .from('credit_reservations')
      .select('promo_amount, amount')
      .eq('id', reservationId)
      .maybeSingle();

    const promoUsed = Number((resRow as any)?.promo_amount ?? 0);
    const paidUsed = Math.max(0, amount - promoUsed);

    const { data: wallet } = await admin
      .from('credit_wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const paidBalance = Number(wallet?.balance ?? 0);
    const promoBalance = Number((wallet as any)?.promo_balance ?? 0);

    return {
      reservationId,
      availableBalance: paidBalance + promoBalance,
      paidBalance,
      promoBalance,
      promoUsed,
      paidUsed,
    };
  }

  // Fallback in-memory reservation (DEMO ONLY — mirrors SQL reserve_credits_for exactly)
  const wallet = getOrCreateMockWallet(userId);
  const vPaid = wallet.balance ?? 0;
  const vPromo = wallet.promo_balance ?? 0;
  const usePromo = promoEligible ? Math.min(vPromo, amount) : 0;
  const usePaid = amount - usePromo;

  if (vPaid < usePaid) {
    const available = vPaid + (promoEligible ? vPromo : 0);
    const err: any = new Error(`INSUFFICIENT_CREDITS: Required ${amount}, available ${available}`);
    err.paidBalance = vPaid;
    err.promoBalance = vPromo;
    err.promoEligible = Boolean(promoEligible);
    err.available = available;
    throw err;
  }

  wallet.balance = vPaid - usePaid;
  wallet.promo_balance = vPromo - usePromo;
  wallet.updated_at = new Date().toISOString();

  const totalAfter = wallet.balance + wallet.promo_balance;
  mockTransactions.unshift({
    id: `ctx_res_${jobId}_${Date.now()}`,
    user_id: userId,
    type: 'generation_reservation',
    amount: -amount,
    balance_after: totalAfter,
    reference_id: jobId,
    description: 'Hold for generation job',
    created_at: new Date().toISOString(),
  });

  const reservationId = `res_${jobId}_${Date.now()}`;
  mockReservations.set(reservationId, {
    id: reservationId,
    userId,
    jobId,
    amount,
    promoAmount: usePromo,
    expiresAt: Date.now() + timeoutSeconds * 1000,
    settled: false,
  });

  return {
    reservationId,
    availableBalance: totalAfter,
    paidBalance: wallet.balance,
    promoBalance: wallet.promo_balance,
    promoUsed: usePromo,
    paidUsed: usePaid,
  };
}

/**
 * Inserts the main generation_jobs record.
 */
export async function createGenerationJob(job: Partial<GenerationJob> & {
  batch_count?: number;
  reservation_id?: string;
  idempotency_key?: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { error } = await admin.from('generation_jobs').insert({
        id: job.id,
        user_id: job.user_id,
        media_type: job.type,
        provider: job.provider,
        model_name: job.model_name,
        model_id: job.model_id,
        status: job.status || 'queued',
        prompt: job.prompt,
        enhanced_prompt: job.enhanced_prompt,
        negative_prompt: job.negative_prompt,
        aspect_ratio: job.aspect_ratio,
        resolution: job.resolution,
        duration_seconds: job.duration_seconds,
        batch_count: job.batch_count || 1,
        genre: job.genre,
        tonality: job.tonality,
        lyrics: job.lyrics,
        cover_art_url: job.cover_art_url,
        credits_reserved: job.credits_reserved || 0,
        credits_consumed: 0,
        credits_refunded: 0,
        reservation_id: job.reservation_id,
        idempotency_key: job.idempotency_key,
        title: job.title,
        occasion_id: job.occasion_id,
        occasion_sub_id: job.occasion_sub_id,
        occasion_details: job.occasion_details,
        visibility: job.visibility || 'private',
        share_prompt: !!job.share_prompt,
        client_settings: job.client_settings || {},
        created_at: new Date().toISOString(),
      });
      if (error) {
        console.error('[DB] Insert generation_job error:', error.message);
        throw new Error(`[DB] Insert generation_job failed: ${error.message}`);
      }
      return;
    } catch (err) {
      console.error('[DB] Insert generation_job exception:', err);
      throw err;
    }
  }

  mockJobs.set(job.id!, {
    ...job,
    client_settings: job.client_settings || {},
    created_at: job.created_at || new Date().toISOString(),
    output_urls: [],
  } as GenerationJob);
}

export function getInMemoryActiveJobs(): Array<{ id: string; type?: string; created_at?: string; status?: string }> {
  const list: Array<{ id: string; type?: string; created_at?: string; status?: string }> = [];
  for (const job of mockJobs.values()) {
    if (job.status === 'queued' || job.status === 'processing') {
      list.push({
        id: job.id,
        type: job.type,
        created_at: job.created_at,
        status: job.status,
      });
    }
  }
  return list;
}

/**
 * Inserts variant rows into generation_job_variants.
 */
export async function insertJobVariants(
  variants: Array<
    Partial<GenerationJobVariant> & {
      supplier?: string | null;
      upstream_model?: string | null;
      simulated?: boolean;
    }
  >
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const nowIso = new Date().toISOString();
      const rows = variants.map((v) => ({
        id: v.id,
        job_id: v.job_id,
        user_id: v.user_id,
        variant_index: v.variant_index,
        status: v.status || 'queued',
        output_url: v.output_url || null,
        thumbnail_url: v.thumbnail_url || null,
        provider_job_id: v.provider_job_id || null,
        error_message: v.error_message || null,
        credits_unit: v.credits_unit || 0,
        ...(v.supplier !== undefined ? { supplier: v.supplier } : {}),
        ...(v.upstream_model !== undefined ? { upstream_model: v.upstream_model } : {}),
        ...(v.simulated !== undefined ? { simulated: Boolean(v.simulated) } : {}),
        created_at: nowIso,
        updated_at: nowIso,
      }));

      let { error } = await admin.from('generation_job_variants').insert(rows);
      if (error && (error.message?.includes('supplier') || error.message?.includes('upstream_model') || error.message?.includes('simulated'))) {
        // Fallback if Phase 2 migration columns are not yet applied on remote DB
        const baseRows = rows.map(({ supplier, upstream_model, simulated, ...rest }: any) => rest);
        const retry = await admin.from('generation_job_variants').insert(baseRows);
        error = retry.error;
      }
      if (error) {
        console.error('[DB] Insert variants error:', error.message);
        throw new Error(`[DB] Insert variants failed: ${error.message}`);
      }
      return;
    } catch (err) {
      console.error('[DB] Insert variants exception:', err);
      throw err;
    }
  }

  const jobId = variants[0]?.job_id;
  if (jobId) {
    mockVariants.set(jobId, variants as GenerationJobVariant[]);
  }
}

/**
 * Updates a specific variant row by job_id and variant_index.
 */
export async function updateJobVariant(
  jobId: string,
  variantIndex: number,
  updates: Partial<GenerationJobVariant> & {
    supplier?: string | null;
    upstream_model?: string | null;
    simulated?: boolean;
  }
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const payload: Record<string, any> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      let { error } = await admin
        .from('generation_job_variants')
        .update(payload)
        .eq('job_id', jobId)
        .eq('variant_index', variantIndex);

      if (error && (error.message?.includes('supplier') || error.message?.includes('upstream_model') || error.message?.includes('simulated'))) {
        const { supplier, upstream_model, simulated, ...basePayload } = payload;
        const retry = await admin
          .from('generation_job_variants')
          .update(basePayload)
          .eq('job_id', jobId)
          .eq('variant_index', variantIndex);
        error = retry.error;
      }

      if (error) {
        console.error('[DB] Update variant failed:', error.message);
        throw new Error(`[DB] Update variant failed: ${error.message}`);
      }
    } catch (err) {
      console.error('[DB] Update variant exception:', err);
      throw err;
    }
  }

  const list = mockVariants.get(jobId);
  if (list) {
    const v = list.find((x) => x.variant_index === variantIndex);
    if (v) {
      Object.assign(v, updates, { updated_at: new Date().toISOString() });
    }
  }
}

/**
 * Deletes a job row (used when credit reservation fails with 402).
 */
export async function deleteJob(jobId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { error } = await admin.from('generation_jobs').delete().eq('id', jobId);
      if (error) {
        console.error('[DB] Delete job failed:', error.message);
        throw new Error(`[DB] Delete job failed: ${error.message}`);
      }
    } catch (err) {
      console.error('[DB] Delete job exception:', err);
      throw err;
    }
  }
  mockJobs.delete(jobId);
  mockVariants.delete(jobId);
}

/**
 * Updates a job row in generation_jobs and local store.
 */
export async function updateJob(
  jobId: string,
  updates: Partial<GenerationJob> & { media_type?: string; output_urls?: string[]; error_message?: string | null }
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const dbUpdates: any = { ...updates };
      if (dbUpdates.type && !dbUpdates.media_type) {
        dbUpdates.media_type = dbUpdates.type;
        delete dbUpdates.type;
      }
      const { error } = await admin.from('generation_jobs').update(dbUpdates).eq('id', jobId);
      if (error) {
        console.error('[DB] Update job failed:', error.message);
        throw new Error(`[DB] Update job failed: ${error.message}`);
      }
    } catch (err) {
      console.error('[DB] Update job exception:', err);
      throw err;
    }
  }

  const job = mockJobs.get(jobId);
  if (job) {
    Object.assign(job, updates);
  }
}

/**
 * Fetches a job and its associated variants.
 * Queries through generation_jobs_v view which exposes type as media_type alias.
 */
export async function getJobWithVariants(jobId: string): Promise<{
  job: GenerationJob | null;
  variants: GenerationJobVariant[];
}> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      // 1. Try querying the canonical view generation_jobs_v
      const { data: viewData, error: viewError } = await admin
        .from('generation_jobs_v')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      let jobData = viewData;

      // 2. If view is not yet created or returns error, fall back to generation_jobs table directly
      if (viewError || !jobData) {
        const { data: tableData } = await admin
          .from('generation_jobs')
          .select('*')
          .eq('id', jobId)
          .maybeSingle();
        if (tableData) {
          jobData = {
            ...tableData,
            type: tableData.media_type || tableData.type,
          };
        }
      }

      const { data: variantsData } = await admin
        .from('generation_job_variants')
        .select('*')
        .eq('job_id', jobId)
        .order('variant_index', { ascending: true });

      if (jobData) {
        return {
          job: jobData as GenerationJob,
          variants: (variantsData || []) as GenerationJobVariant[],
        };
      }
    } catch (err) {
      console.warn('[DB] getJobWithVariants failed from Supabase:', err);
    }
  }

  const job = mockJobs.get(jobId) || null;
  const variants = mockVariants.get(jobId) || [];
  return { job, variants };
}

/**
 * Settles reservation: consumes credits for succeeded variants, refunds the rest automatically.
 */
export async function settleJobReservation(params: {
  reservationId: string;
  jobId: string;
  userId: string;
  consumedAmount: number;
  reason: string;
}): Promise<void> {
  const { reservationId, jobId, userId, consumedAmount, reason } = params;
  const admin = getSupabaseAdmin();

  if (admin) {
    try {
      const { error } = await admin.rpc('settle_reservation', {
        p_reservation_id: reservationId,
        p_consumed_amount: consumedAmount,
        p_reason: reason,
      });
      if (error) {
        console.error('[DB] settle_reservation rpc error:', error.message);
        throw new Error(`[DB] settle_reservation rpc error: ${error.message}`);
      }
      return;
    } catch (err) {
      console.error('[DB] settle_reservation rpc exception:', err);
      throw err;
    }
  }

  const res = mockReservations.get(reservationId);
  if (res && res.settled) {
    return; // idempotent
  }

  const job = mockJobs.get(jobId);
  const reserved = res?.amount ?? job?.credits_reserved ?? consumedAmount;
  const promoReserved = res?.promoAmount ?? 0;

  const consumedPromo = Math.min(consumedAmount, promoReserved);
  const refundPromo = Math.max(0, promoReserved - consumedPromo);
  const refundPaid = Math.max(0, (reserved - promoReserved) - (consumedAmount - consumedPromo));
  const refundAmount = refundPaid + refundPromo;

  if (job) {
    job.credits_consumed = consumedAmount;
    job.credits_refunded = refundAmount;
  }

  const wallet = getOrCreateMockWallet(userId);

  // Consumed ledger entry (amount 0, balance_after = current balance + promo_balance)
  mockTransactions.unshift({
    id: `ctx_consume_${jobId}_${Date.now()}`,
    user_id: userId,
    type: 'generation_consumed',
    amount: 0,
    balance_after: wallet.balance + wallet.promo_balance,
    reference_id: jobId,
    description: reason || `Generation settled: ${consumedAmount} credits consumed`,
    created_at: new Date().toISOString(),
  });

  if (refundAmount > 0) {
    wallet.balance += refundPaid;
    wallet.promo_balance += refundPromo;
    wallet.updated_at = new Date().toISOString();

    mockTransactions.unshift({
      id: `ctx_refund_${jobId}_${Date.now()}`,
      user_id: userId,
      type: 'generation_refund',
      amount: refundAmount,
      balance_after: wallet.balance + wallet.promo_balance,
      reference_id: jobId,
      description: `Auto-refund for ${refundAmount} credits (${reason})`,
      created_at: new Date().toISOString(),
    });
  } else {
    wallet.updated_at = new Date().toISOString();
  }

  if (res) {
    res.settled = true;
  }
}

/**
 * Reads user's authoritative credit wallet (paid + promo buckets).
 */
export async function getUserWallet(userId: string): Promise<{
  balance: number;
  paid_balance: number;
  promo_balance: number;
  total_balance: number;
  updated_at: string;
  plan_tier: PlanTier;
  lifetime_spend_fcfa: number;
}> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    let { data, error } = await admin
      .from('credit_wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[DB] getUserWallet Supabase error:', error.message);
      throw new Error('WALLET_READ_FAILED: ' + error.message);
    }

    if (!data) {
      // Ensure wallet exists
      const { error: ensureErr } = await admin.rpc('ensure_wallet', { p_user: userId });
      if (ensureErr) {
        console.error('[DB] ensure_wallet error:', ensureErr.message);
        throw new Error('WALLET_READ_FAILED: ' + ensureErr.message);
      }
      const retry = await admin
        .from('credit_wallets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (retry.error || !retry.data) {
        throw new Error('WALLET_READ_FAILED: could not create or read wallet');
      }
      data = retry.data;
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('plan_tier, lifetime_spend_fcfa')
      .eq('id', userId)
      .maybeSingle();

    const paidBalance = Number(data.balance ?? 0);
    const promoBalance = Number((data as any).promo_balance ?? 0);
    const totalBalance = paidBalance + promoBalance;

    return {
      balance: totalBalance,
      paid_balance: paidBalance,
      promo_balance: promoBalance,
      total_balance: totalBalance,
      updated_at: data.updated_at || new Date().toISOString(),
      plan_tier: (profile?.plan_tier as PlanTier) ?? 'free',
      lifetime_spend_fcfa: profile?.lifetime_spend_fcfa ?? 0,
    };
  }

  // Fallback to in-memory store (DEMO ONLY)
  const mockWallet = getOrCreateMockWallet(userId);
  const mockProf = mockProfiles.get(userId) || { plan_tier: 'free' as PlanTier, lifetime_spend_fcfa: 0 };
  const paidBalance = Number(mockWallet.balance ?? 0);
  const promoBalance = Number(mockWallet.promo_balance ?? 0);
  const totalBalance = paidBalance + promoBalance;

  return {
    balance: totalBalance,
    paid_balance: paidBalance,
    promo_balance: promoBalance,
    total_balance: totalBalance,
    updated_at: mockWallet.updated_at,
    plan_tier: mockProf.plan_tier,
    lifetime_spend_fcfa: mockProf.lifetime_spend_fcfa,
  };
}

/**
 * Reads user's credit transactions ledger (paginated).
 */
export async function getUserTransactions(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<any[]> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data, error } = await admin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[DB] getUserTransactions Supabase error:', error.message);
      throw error;
    }
    return data || [];
  }

  // Fallback to in-memory store (DEMO ONLY)
  getOrCreateMockWallet(userId); // Ensure welcome bonus exists
  const userTxns = mockTransactions
    .filter((tx) => tx.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return userTxns.slice(offset, offset + limit);
}

/**
 * Atomically grants credits and updates tier on purchase completion.
 */
export async function grantPurchase(
  referenceId: string,
  providerTxId?: string
): Promise<{
  balance: number;
  plan_tier: PlanTier;
  already_processed: boolean;
}> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data, error } = await admin.rpc('grant_purchase', {
      p_reference_id: referenceId,
      p_provider_tx_id: providerTxId || null,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883' || error.message?.includes('does not exist')) {
        console.error('[DB] Missing migration 20260921000000_credit_grants_and_lockdown.sql');
        const err: any = new Error('MIGRATION_REQUIRED');
        err.code = 'MIGRATION_REQUIRED';
        throw err;
      }
      throw new Error(`GRANT_PURCHASE_FAILED: ${error.message}`);
    }
    return {
      balance: data.balance,
      plan_tier: data.plan_tier as PlanTier,
      already_processed: Boolean(data.already_processed),
    };
  }

  // DEMO ONLY
  const payment = mockPayments.get(referenceId);
  if (!payment) {
    throw new Error(`PAYMENT_NOT_FOUND: ${referenceId}`);
  }

  if (payment.status === 'successful') {
    const wallet = getOrCreateMockWallet(payment.user_id);
    const prof = mockProfiles.get(payment.user_id) || { plan_tier: 'free' as PlanTier, lifetime_spend_fcfa: 0 };
    return {
      balance: wallet.balance,
      plan_tier: prof.plan_tier,
      already_processed: true,
    };
  }

  // Server-side catalogue lookup for package details
  const pkg = INITIAL_PACKAGES.find((p) => p.id === payment.package_id);
  const creditsToGrant = pkg ? pkg.credits : payment.credits;
  const amountFcfa = pkg ? pkg.price_fcfa : (payment.amount_fcfa || payment.amount);

  payment.status = 'successful';
  payment.provider_tx_id = providerTxId || `sim_tx_${Date.now()}`;
  payment.settled_at = new Date().toISOString();

  const wallet = getOrCreateMockWallet(payment.user_id);
  wallet.balance += creditsToGrant;
  wallet.updated_at = new Date().toISOString();

  mockTransactions.unshift({
    id: `ctx_${referenceId}`,
    user_id: payment.user_id,
    type: 'purchase',
    amount: creditsToGrant,
    balance_after: wallet.balance + wallet.promo_balance,
    reference_id: referenceId,
    description: `Credit top-up (${pkg?.name || 'Package'})`,
    created_at: new Date().toISOString(),
  });

  const currentProf = mockProfiles.get(payment.user_id) || { plan_tier: 'free' as PlanTier, lifetime_spend_fcfa: 0 };
  const newSpend = currentProf.lifetime_spend_fcfa + amountFcfa;
  const newTier = promoteOnly(currentProf.plan_tier, tierForLifetimeSpend(newSpend));
  mockProfiles.set(payment.user_id, {
    plan_tier: newTier,
    lifetime_spend_fcfa: newSpend,
  });

  return {
    balance: wallet.balance,
    plan_tier: newTier,
    already_processed: false,
  };
}

/**
 * Creates or records a payment attempt.
 */
export async function createPaymentRecord(payment: {
  id?: string;
  reference_id: string;
  user_id: string;
  package_id: string;
  amount_fcfa: number;
  credits: number;
  payment_rail: string;
  phone?: string;
  status?: string;
  metadata?: any;
}): Promise<any> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const liveRecord = {
      user_id: payment.user_id,
      package_id: payment.package_id,
      amount_fcfa: payment.amount_fcfa,
      credits: payment.credits,
      payment_rail: payment.payment_rail,
      phone: payment.phone || null,
      reference_id: payment.reference_id,
      status: payment.status || 'pending',
      metadata: payment.metadata || {},
    };

    const { data, error } = await admin.from('payments').insert(liveRecord).select().maybeSingle();
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883' || error.message?.includes('does not exist')) {
        console.error('[DB] Missing migration 20260921000000_credit_grants_and_lockdown.sql');
        const err: any = new Error('MIGRATION_REQUIRED');
        err.code = 'MIGRATION_REQUIRED';
        throw err;
      }
      throw new Error(`PAYMENT_INSERT_FAILED: ${error.message}`);
    }
    return data || liveRecord;
  }

  const demoRecord = {
    id: payment.id || `pay_${crypto.randomUUID()}`,
    reference_id: payment.reference_id,
    user_id: payment.user_id,
    package_id: payment.package_id,
    amount_fcfa: payment.amount_fcfa,
    amount: payment.amount_fcfa,
    credits: payment.credits,
    payment_rail: payment.payment_rail,
    channel: payment.payment_rail,
    phone: payment.phone || null,
    phone_number: payment.phone || null,
    status: payment.status || 'pending',
    metadata: payment.metadata || {},
    created_at: new Date().toISOString(),
  };

  mockPayments.set(demoRecord.reference_id, demoRecord);
  return demoRecord;
}

/**
 * Fetches a payment record by its unique reference ID.
 */
export async function getPaymentByReference(referenceId: string, userId?: string): Promise<any> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    let query = admin.from('payments').select('*').eq('reference_id', referenceId);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`PAYMENT_QUERY_FAILED: ${error.message}`);
    }
    return data;
  }

  const payment = mockPayments.get(referenceId);
  if (!payment) return null;
  if (userId && payment.user_id !== userId) return null;
  return payment;
}

/**
 * Resolves an active package from the server catalogue.
 */
export async function getActiveCreditPackage(packageId: string): Promise<{
  id: string;
  name: string;
  credits: number;
  bonus_credits: number;
  price_fcfa: number;
  active: boolean;
} | null> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data, error } = await admin
      .from('credit_packages')
      .select('id, name, credits, price_fcfa, active')
      .eq('id', packageId)
      .eq('active', true)
      .maybeSingle();
    if (error) {
      throw new Error(`PACKAGE_QUERY_FAILED: ${error.message}`);
    }
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      credits: data.credits,
      bonus_credits: 0,
      price_fcfa: data.price_fcfa,
      active: data.active,
    };
  }

  const pkg = INITIAL_PACKAGES.find((p) => p.id === packageId && (p as any).active !== false);
  if (!pkg) return null;
  return {
    id: pkg.id,
    name: pkg.name,
    credits: pkg.credits,
    bonus_credits: 0,
    price_fcfa: pkg.price_fcfa,
    active: true,
  };
}

/**
 * Service-role-only atomic credit debit.
 */
export async function debitCredits(params: {
  userId: string;
  amount: number;
  referenceId: string;
  description?: string;
}): Promise<number> {
  const { userId, amount, referenceId, description = 'Credit debit' } = params;

  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data, error } = await admin.rpc('debit_credits', {
      p_user: userId,
      p_amount: amount,
      p_reference_id: referenceId,
      p_description: description,
    });
    if (error) {
      if (error.message?.includes('INSUFFICIENT_CREDITS')) {
        throw new Error('INSUFFICIENT_CREDITS');
      }
      throw new Error(`DEBIT_CREDITS_FAILED: ${error.message}`);
    }
    return data as number;
  }

  // DEMO ONLY
  const wallet = getOrCreateMockWallet(userId);
  if (wallet.balance < amount) {
    throw new Error('INSUFFICIENT_CREDITS');
  }
  wallet.balance -= amount;
  wallet.updated_at = new Date().toISOString();

  mockTransactions.unshift({
    id: `ctx_deb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    user_id: userId,
    type: 'generation_consumed',
    amount: -amount,
    balance_after: wallet.balance + wallet.promo_balance,
    reference_id: referenceId,
    description,
    created_at: new Date().toISOString(),
  });

  return wallet.balance;
}

/**
 * Service-role-only atomic credit refund.
 */
export async function refundCredits(params: {
  userId: string;
  amount: number;
  referenceId: string;
  description?: string;
}): Promise<number> {
  const { userId, amount, referenceId, description = 'Credit refund' } = params;

  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data, error } = await admin.rpc('refund_credits', {
      p_user: userId,
      p_amount: amount,
      p_reference_id: referenceId,
      p_description: description,
    });
    if (error) {
      throw new Error(`REFUND_CREDITS_FAILED: ${error.message}`);
    }
    return data as number;
  }

  // DEMO ONLY
  const wallet = getOrCreateMockWallet(userId);
  wallet.balance += amount;
  wallet.updated_at = new Date().toISOString();

  mockTransactions.unshift({
    id: `ctx_ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    user_id: userId,
    type: 'generation_refund',
    amount,
    balance_after: wallet.balance + wallet.promo_balance,
    reference_id: referenceId,
    description,
    created_at: new Date().toISOString(),
  });

  return wallet.balance;
}

// ---------------------------------------------------------------------------
// Section 5: Asset Engine Helpers (History hydration, Upscale, Delete, Download)
// ---------------------------------------------------------------------------

export interface UpscaleRecord {
  id: string;
  variant_id: string;
  job_id: string;
  user_id: string;
  target_scale: '1080p' | '1k' | '2k' | '4k';
  source_url: string;
  output_url?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  credits_cost: number;
  reservation_id?: string;
  idempotency_key?: string;
  error_message?: string;
  provider?: string;
  created_at: string;
  completed_at?: string;
}

const mockUpscales = new Map<string, UpscaleRecord>();

/**
 * Checks for existing upscale by idempotency key.
 */
export async function findUpscaleByIdempotency(
  userId: string,
  idempotencyKey: string
): Promise<UpscaleRecord | null> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin
      .from('generation_upscales')
      .select('*')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) {
      console.error('[DB] findUpscaleByIdempotency query error:', error.message);
      throw new Error(`Database error looking up upscale idempotency: ${error.message}`);
    }
    return (data as UpscaleRecord) || null;
  }

  for (const record of mockUpscales.values()) {
    if (record.user_id === userId && record.idempotency_key === idempotencyKey) {
      return record;
    }
  }
  return null;
}

/**
 * Checks for existing upscale by variant ID and scale.
 */
export async function findUpscaleByVariantAndScale(
  variantId: string,
  targetScale: string
): Promise<UpscaleRecord | null> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin
      .from('generation_upscales')
      .select('*')
      .eq('variant_id', variantId)
      .eq('target_scale', targetScale)
      .in('status', ['queued', 'processing', 'completed'])
      .maybeSingle();
    if (error) {
      console.error('[DB] findUpscaleByVariantAndScale query error:', error.message);
      throw new Error(`Database error looking up upscale: ${error.message}`);
    }
    return (data as UpscaleRecord) || null;
  }

  for (const record of mockUpscales.values()) {
    if (
      record.variant_id === variantId &&
      record.target_scale === targetScale &&
      ['queued', 'processing', 'completed'].includes(record.status)
    ) {
      return record;
    }
  }
  return null;
}

/**
 * Returns the authenticated user's recent non-deleted jobs with variants.
 */
export async function getRecentJobsForUser(
  userId: string,
  type?: string,
  limit = 24
): Promise<GenerationJob[]> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      let query = admin
        .from('generation_jobs')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (type) {
        query = query.eq('media_type', type);
      }

      const { data: dbJobs, error } = await query;
      if (!error && dbJobs) {
        const jobIds = dbJobs.map((j) => j.id);
        const variantsMap: Record<string, GenerationJobVariant[]> = {};

        if (jobIds.length > 0) {
          const { data: dbVariants } = await admin
            .from('generation_job_variants')
            .select('*')
            .in('job_id', jobIds)
            .order('variant_index', { ascending: true });

          const totalVariantsPerJob: Record<string, number> = {};
          if (dbVariants) {
            for (const v of dbVariants) {
              totalVariantsPerJob[v.job_id] = (totalVariantsPerJob[v.job_id] || 0) + 1;
              if (!v.deleted_at && !v.purged_at) {
                if (!variantsMap[v.job_id]) variantsMap[v.job_id] = [];
                variantsMap[v.job_id].push(v as GenerationJobVariant);
              }
            }
          }

          return dbJobs
            .filter((j) => {
              // If the job had variant rows and all of them have been deleted/purged, do not return the job
              if ((totalVariantsPerJob[j.id] || 0) > 0 && (variantsMap[j.id]?.length || 0) === 0) {
                return false;
              }
              return true;
            })
            .map((j) => ({
              ...j,
              type: j.media_type || j.type,
              output_urls: j.output_urls || [],
              variants: variantsMap[j.id] || [],
            })) as GenerationJob[];
        }

        return dbJobs.map((j) => ({
          ...j,
          type: j.media_type || j.type,
          output_urls: j.output_urls || [],
          variants: variantsMap[j.id] || [],
        })) as GenerationJob[];
      }
    } catch (err) {
      console.warn('[DB] getRecentJobsForUser Supabase error:', err);
    }
  }

  // Local fallback
  const list = Array.from(mockJobs.values())
    .filter(
      (j) =>
        j.user_id === userId &&
        !j.deleted_at &&
        (!type || j.type === type || (j as any).media_type === type)
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);

  return list.map((j) => ({
    ...j,
    variants: (mockVariants.get(j.id) || []).filter((v) => !v.deleted_at),
  }));
}

/**
 * Loads a variant by its ID along with the parent job.
 */
export async function getVariantById(variantId: string): Promise<{
  variant: GenerationJobVariant | null;
  job: GenerationJob | null;
}> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { data: variant } = await admin
        .from('generation_job_variants')
        .select('*')
        .eq('id', variantId)
        .maybeSingle();

      if (variant) {
        const { data: job } = await admin
          .from('generation_jobs')
          .select('*')
          .eq('id', variant.job_id)
          .maybeSingle();

        return {
          variant: variant as GenerationJobVariant,
          job: job ? { ...job, type: job.media_type || job.type } : null,
        };
      }
    } catch (err) {
      console.warn('[DB] getVariantById failed:', err);
    }
  }

  // Local fallback
  for (const [jobId, vList] of mockVariants.entries()) {
    const v = vList.find((x) => x.id === variantId);
    if (v) {
      const job = mockJobs.get(jobId) || null;
      return { variant: v, job };
    }
  }
  return { variant: null, job: null };
}

/**
 * Permanently deletes failed generation jobs and/or failed variants so they do not
 * go to Trash or reappear on reload.
 */
export async function permanentlyDeleteFailedGeneration(
  userId: string,
  options: { jobIds?: string[]; variantIds?: string[] }
): Promise<{ deletedJobIds: string[]; deletedVariantIds: string[] }> {
  const jobIdsSet = new Set<string>();
  const variantIdsSet = new Set<string>();

  for (const jid of options.jobIds || []) {
    if (jid && typeof jid === 'string') {
      jobIdsSet.add(jid.replace(/^failed-/, ''));
    }
  }

  for (const vid of options.variantIds || []) {
    if (!vid || typeof vid !== 'string') continue;
    const synMatch = /^syn_(.+)_\d+$/.exec(vid);
    if (synMatch) {
      jobIdsSet.add(synMatch[1]);
    } else if (vid.startsWith('failed-')) {
      jobIdsSet.add(vid.replace(/^failed-/, ''));
    } else {
      variantIdsSet.add(vid);
    }
  }

  const now = new Date().toISOString();
  const admin = getSupabaseAdmin();

  if (admin) {
    try {
      const affectedJobIds = new Set<string>();
      const validVariantIds: string[] = [];

      if (variantIdsSet.size > 0) {
        const candidateVids = Array.from(variantIdsSet);
        const { data: vRows } = await admin
          .from('generation_job_variants')
          .select('id, job_id, user_id')
          .in('id', candidateVids)
          .eq('user_id', userId);

        if (vRows && vRows.length > 0) {
          for (const row of vRows) {
            validVariantIds.push(row.id);
            if (row.job_id) affectedJobIds.add(row.job_id);
          }

          await admin.from('project_items').delete().in('variant_id', validVariantIds).eq('user_id', userId);
          await admin.from('playlist_items').delete().in('variant_id', validVariantIds).eq('user_id', userId);
          await admin.from('favorites').delete().in('variant_id', validVariantIds).eq('user_id', userId);

          const { error: delVarErr } = await admin
            .from('generation_job_variants')
            .delete()
            .in('id', validVariantIds)
            .eq('user_id', userId);

          if (delVarErr) {
            await admin
              .from('generation_job_variants')
              .update({ deleted_at: now, purged_at: now })
              .in('id', validVariantIds)
              .eq('user_id', userId);
          }
        } else {
          // Check if any candidateVids were actually job IDs
          const { data: jRows } = await admin
            .from('generation_jobs')
            .select('id')
            .in('id', candidateVids)
            .eq('user_id', userId);
          if (jRows) {
            for (const jr of jRows) jobIdsSet.add(jr.id);
          }
        }
      }

      // Check if any affected parent jobs now have 0 remaining active variants
      for (const jId of affectedJobIds) {
        const { data: rem } = await admin
          .from('generation_job_variants')
          .select('id')
          .eq('job_id', jId)
          .is('deleted_at', null)
          .is('purged_at', null);
        if (!rem || rem.length === 0) {
          jobIdsSet.add(jId);
        }
      }

      const finalJobIds = Array.from(jobIdsSet);
      if (finalJobIds.length > 0) {
        await admin
          .from('generation_job_variants')
          .delete()
          .in('job_id', finalJobIds)
          .eq('user_id', userId);

        const { error: delJobErr } = await admin
          .from('generation_jobs')
          .delete()
          .in('id', finalJobIds)
          .eq('user_id', userId);

        if (delJobErr) {
          await admin
            .from('generation_jobs')
            .update({ deleted_at: now })
            .in('id', finalJobIds)
            .eq('user_id', userId);
          await admin
            .from('generation_job_variants')
            .update({ deleted_at: now, purged_at: now })
            .in('job_id', finalJobIds)
            .eq('user_id', userId);
        }
      }

      return {
        deletedJobIds: finalJobIds,
        deletedVariantIds: validVariantIds,
      };
    } catch (err) {
      console.error('[DB] permanentlyDeleteFailedGeneration Supabase error:', err);
    }
  }

  // Local mock fallback
  const deletedVariantIds: string[] = [];
  for (const [jobId, vList] of mockVariants.entries()) {
    const filtered = vList.filter((v) => {
      if (variantIdsSet.has(v.id) && v.user_id === userId) {
        deletedVariantIds.push(v.id);
        return false;
      }
      return true;
    });
    if (filtered.length !== vList.length) {
      mockVariants.set(jobId, filtered);
      if (filtered.filter((v) => !v.deleted_at).length === 0) {
        jobIdsSet.add(jobId);
      }
    }
  }

  const deletedJobIds: string[] = [];
  for (const jId of jobIdsSet) {
    const job = mockJobs.get(jId);
    if (job && job.user_id === userId) {
      mockJobs.delete(jId);
      mockVariants.delete(jId);
      deletedJobIds.push(jId);
    }
  }

  return { deletedJobIds, deletedVariantIds };
}

/**
 * Performs a soft delete on a variant (or permanent delete if the variant/job failed or permanent=true).
 * If all variants of the job are deleted, deletes the job too. Also handles passing a jobId directly.
 */
export async function softDeleteVariant(
  variantId: string,
  userId: string,
  permanent = false
): Promise<{ success: boolean; jobDeleted: boolean; permanent?: boolean }> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  if (variantId.startsWith('syn_') || variantId.startsWith('failed-')) {
    const res = await permanentlyDeleteFailedGeneration(userId, { variantIds: [variantId] });
    return {
      success: res.deletedJobIds.length > 0 || res.deletedVariantIds.length > 0,
      jobDeleted: res.deletedJobIds.length > 0,
      permanent: true,
    };
  }

  if (admin) {
    try {
      // 1. Check if variantId matches a variant
      const { data: variant } = await admin
        .from('generation_job_variants')
        .select('id, job_id, user_id, status, output_url')
        .eq('id', variantId)
        .maybeSingle();

      if (variant) {
        if (variant.user_id !== userId) {
          throw new Error('Forbidden: Variant belongs to another user');
        }

        const isFailedVariant =
          permanent || variant.status === 'failed' || (!variant.output_url && variant.status !== 'completed');

        if (isFailedVariant) {
          const res = await permanentlyDeleteFailedGeneration(userId, { variantIds: [variantId] });
          return {
            success: true,
            jobDeleted: res.deletedJobIds.includes(variant.job_id),
            permanent: true,
          };
        }

        await admin
          .from('generation_job_variants')
          .update({ deleted_at: now })
          .eq('id', variantId);

        const { data: remaining } = await admin
          .from('generation_job_variants')
          .select('id')
          .eq('job_id', variant.job_id)
          .is('deleted_at', null);

        let jobDeleted = false;
        if (!remaining || remaining.length === 0) {
          await admin
            .from('generation_jobs')
            .update({ deleted_at: now })
            .eq('id', variant.job_id);
          jobDeleted = true;
        }

        return { success: true, jobDeleted, permanent: false };
      }

      // 2. Check if variantId is actually a jobId
      const { data: job } = await admin
        .from('generation_jobs')
        .select('id, user_id, status')
        .eq('id', variantId)
        .maybeSingle();

      if (job) {
        if (job.user_id !== userId) {
          throw new Error('Forbidden: Job belongs to another user');
        }

        if (permanent || job.status === 'failed') {
          await permanentlyDeleteFailedGeneration(userId, { jobIds: [job.id] });
          return { success: true, jobDeleted: true, permanent: true };
        }

        await admin
          .from('generation_job_variants')
          .update({ deleted_at: now })
          .eq('job_id', job.id);

        await admin
          .from('generation_jobs')
          .update({ deleted_at: now })
          .eq('id', job.id);

        return { success: true, jobDeleted: true, permanent: false };
      }
    } catch (err: any) {
      console.warn('[DB] softDeleteVariant failed:', err);
      throw err;
    }
  }

  // Local fallback
  for (const [jobId, vList] of mockVariants.entries()) {
    const v = vList.find((x) => x.id === variantId);
    if (v) {
      if (v.user_id !== userId) throw new Error('Forbidden: Not authorized');
      v.deleted_at = now;
      const job = mockJobs.get(jobId);
      const remaining = vList.filter((x) => !x.deleted_at);
      let jobDeleted = false;
      if (remaining.length === 0 && job) {
        job.deleted_at = now;
        jobDeleted = true;
      }
      return { success: true, jobDeleted };
    }
  }

  const job = mockJobs.get(variantId);
  if (job) {
    if (job.user_id !== userId) throw new Error('Forbidden: Not authorized');
    job.deleted_at = now;
    const vList = mockVariants.get(variantId) || [];
    for (const v of vList) {
      v.deleted_at = now;
    }
    return { success: true, jobDeleted: true };
  }

  return { success: false, jobDeleted: false };
}

/**
 * Creates an upscale record in generation_upscales.
 */
export async function createUpscaleRecord(record: UpscaleRecord): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { error } = await admin.from('generation_upscales').insert(record);
      if (error) {
        console.error('[DB] createUpscaleRecord error:', error.message);
        throw new Error(`[DB] createUpscaleRecord failed: ${error.message}`);
      }
      return;
    } catch (err) {
      console.error('[DB] createUpscaleRecord exception:', err);
      throw err;
    }
  }
  mockUpscales.set(record.id, record);
}

/**
 * Updates an upscale record in generation_upscales.
 */
export async function updateUpscaleRecord(
  id: string,
  updates: Partial<UpscaleRecord>
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { error } = await admin.from('generation_upscales').update(updates).eq('id', id);
      if (error) {
        console.error('[DB] updateUpscaleRecord error:', error.message);
        throw new Error(`[DB] updateUpscaleRecord failed: ${error.message}`);
      }
      return;
    } catch (err) {
      console.error('[DB] updateUpscaleRecord exception:', err);
      throw err;
    }
  }
  const existing = mockUpscales.get(id);
  if (existing) {
    Object.assign(existing, updates);
  }
}

/**
 * Retrieves an upscale record by ID.
 */
export async function getUpscaleById(id: string): Promise<UpscaleRecord | null> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { data, error } = await admin
        .from('generation_upscales')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        console.error('[DB] getUpscaleById error:', error.message);
        throw new Error(`[DB] getUpscaleById failed: ${error.message}`);
      }
      return (data as UpscaleRecord) || null;
    } catch (err) {
      console.error('[DB] getUpscaleById exception:', err);
      throw err;
    }
  }
  return mockUpscales.get(id) || null;
}

/**
 * Appends upscaled URL to generation_job_variants.upscaled_urls jsonb object.
 */
export async function addUpscaledUrlToVariant(
  variantId: string,
  targetScale: string,
  url: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { data: v, error: fetchErr } = await admin
        .from('generation_job_variants')
        .select('upscaled_urls')
        .eq('id', variantId)
        .maybeSingle();

      if (fetchErr) {
        console.error('[DB] addUpscaledUrlToVariant fetch error:', fetchErr.message);
        throw new Error(`[DB] addUpscaledUrlToVariant failed: ${fetchErr.message}`);
      }

      const existing = v?.upscaled_urls || {};
      const updated = { ...existing, [targetScale]: url };

      const { error: updateErr } = await admin
        .from('generation_job_variants')
        .update({ upscaled_urls: updated, updated_at: new Date().toISOString() })
        .eq('id', variantId);
      if (updateErr) {
        console.error('[DB] addUpscaledUrlToVariant update error:', updateErr.message);
        throw new Error(`[DB] addUpscaledUrlToVariant failed: ${updateErr.message}`);
      }
      return;
    } catch (err) {
      console.error('[DB] addUpscaledUrlToVariant exception:', err);
      throw err;
    }
  }

  for (const vList of mockVariants.values()) {
    const v = vList.find((x) => x.id === variantId);
    if (v) {
      if (!v.upscaled_urls) v.upscaled_urls = {};
      v.upscaled_urls[targetScale] = url;
      v.updated_at = new Date().toISOString();
    }
  }
}

/**
 * Resolves the storage path or URL for a specific upscale resolution.
 */
export async function resolveUpscalePath(
  variantId: string,
  scale: string
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { data: upscale } = await admin
        .from('generation_upscales')
        .select('storage_path, output_url')
        .eq('variant_id', variantId)
        .eq('target_scale', scale)
        .eq('status', 'completed')
        .maybeSingle();

      if (upscale?.storage_path) return upscale.storage_path;
      if (upscale?.output_url) return upscale.output_url;

      const { data: variant } = await admin
        .from('generation_job_variants')
        .select('upscaled_urls, storage_path')
        .eq('id', variantId)
        .maybeSingle();

      if (variant?.upscaled_urls?.[scale]) {
        return variant.upscaled_urls[scale];
      }
      return variant?.storage_path || null;
    } catch (err) {
      console.warn('[DB] resolveUpscalePath failed:', err);
    }
  }

  const { variant } = await getVariantById(variantId);
  if (variant?.upscaled_urls?.[scale]) {
    return variant.upscaled_urls[scale];
  }
  return variant?.storage_path || null;
}

/**
 * Logs a download to generation_downloads.
 */
export async function recordDownload(
  userId: string,
  variantId?: string,
  resolution = 'original'
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { error } = await admin.from('generation_downloads').insert({
        id: (await import('crypto')).randomUUID(),
        user_id: userId,
        variant_id: variantId || null,
        resolution,
        downloaded_at: new Date().toISOString(),
      });
      if (error) {
        console.error('[DB] recordDownload error:', error.message);
      }
    } catch (err) {
      console.error('[DB] recordDownload exception:', err);
    }
  }
}

/**
 * PROJECTS & ASSET ORGANIZATION (Section B)
 */

export async function getProjectsForUser(userId: string): Promise<Project[]> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data, error } = await admin
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[DB] getProjectsForUser error:', error.message);
      throw error;
    }
    const projects = (data as Project[]) || [];
    const projectIds = projects.map((p) => p.id);
    let itemsMap: Record<string, string[]> = {};
    if (projectIds.length > 0) {
      const { data: pItems, error: pErr } = await admin
        .from('project_items')
        .select('project_id, variant_id')
        .in('project_id', projectIds);
      if (pErr) throw pErr;
      if (pItems) {
        for (const item of pItems) {
          if (!itemsMap[item.project_id]) itemsMap[item.project_id] = [];
          itemsMap[item.project_id].push(item.variant_id);
        }
      }
    }
    return projects.map((p) => ({
      ...p,
      item_count: itemsMap[p.id]?.length ?? p.item_count ?? 0,
      item_ids: itemsMap[p.id] || [],
    }));
  }

  // DEMO ONLY
  const list = Array.from(mockProjects.values())
    .filter((p) => p.user_id === userId && !p.deleted_at)
    .map((p) => {
      const items = mockProjectItems.get(p.id) || [];
      return {
        ...p,
        item_count: items.length,
        item_ids: items.map((i) => i.variant_id || i.job_id),
      };
    })
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return list;
}

export async function createProject(
  userId: string,
  input: { name: string; description?: string; color?: string; icon?: string }
): Promise<Project> {
  const trimmedName = (input.name || '').trim();
  if (!trimmedName || trimmedName.length > 60) {
    const err: any = new Error('Project name must be between 1 and 60 characters');
    err.status = 400;
    throw err;
  }

  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data: existing, error: existErr } = await admin
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .ilike('name', trimmedName);

    if (existErr) throw existErr;

    if (existing && existing.length > 0) {
      const err: any = new Error('PROJECT_NAME_TAKEN');
      err.code = '23505';
      err.status = 409;
      throw err;
    }

    const { count, error: countErr } = await admin
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (countErr) throw countErr;

    const { data, error } = await admin
      .from('projects')
      .insert({
        user_id: userId,
        name: trimmedName,
        description: input.description?.trim() || null,
        color: input.color || '#F86A00',
        icon: input.icon || 'folder',
        position: count || 0,
        item_count: 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const err: any = new Error('PROJECT_NAME_TAKEN');
        err.code = '23505';
        err.status = 409;
        throw err;
      }
      throw error;
    }
    return data as Project;
  }

  // DEMO ONLY
  const userProjects = Array.from(mockProjects.values()).filter(
    (p) => p.user_id === userId && !p.deleted_at
  );
  if (userProjects.some((p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
    const err: any = new Error('PROJECT_NAME_TAKEN');
    err.code = '23505';
    err.status = 409;
    throw err;
  }

  const newProject: Project = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: trimmedName,
    description: input.description?.trim(),
    color: input.color || '#F86A00',
    icon: input.icon || 'folder',
    position: userProjects.length,
    item_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  mockProjects.set(newProject.id, newProject);
  mockProjectItems.set(newProject.id, []);
  return newProject;
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: { name?: string; description?: string; color?: string; position?: number }
): Promise<Project> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data: current, error: curErr } = await admin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (curErr) throw curErr;
    if (!current) {
      const err: any = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed || trimmed.length > 60) {
        const err: any = new Error('Project name must be between 1 and 60 characters');
        err.status = 400;
        throw err;
      }

      const { data: dup, error: dupErr } = await admin
        .from('projects')
        .select('id')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .neq('id', projectId)
        .ilike('name', trimmed);

      if (dupErr) throw dupErr;

      if (dup && dup.length > 0) {
        const err: any = new Error('PROJECT_NAME_TAKEN');
        err.code = '23505';
        err.status = 409;
        throw err;
      }
      updates.name = trimmed;
    }
    if (input.description !== undefined) updates.description = input.description.trim() || null;
    if (input.color !== undefined) updates.color = input.color;
    if (input.position !== undefined) updates.position = input.position;

    const { data, error } = await admin
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const err: any = new Error('PROJECT_NAME_TAKEN');
        err.code = '23505';
        err.status = 409;
        throw err;
      }
      throw error;
    }
    return data as Project;
  }

  // DEMO ONLY
  const current = mockProjects.get(projectId);
  if (!current || current.user_id !== userId || current.deleted_at) {
    const err: any = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed || trimmed.length > 60) {
      const err: any = new Error('Project name must be between 1 and 60 characters');
      err.status = 400;
      throw err;
    }
    const dup = Array.from(mockProjects.values()).find(
      (p) =>
        p.id !== projectId &&
        p.user_id === userId &&
        !p.deleted_at &&
        p.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (dup) {
      const err: any = new Error('PROJECT_NAME_TAKEN');
      err.code = '23505';
      err.status = 409;
      throw err;
    }
    current.name = trimmed;
  }
  if (input.description !== undefined) current.description = input.description.trim();
  if (input.color !== undefined) current.color = input.color;
  if (input.position !== undefined) current.position = input.position;
  current.updated_at = new Date().toISOString();

  mockProjects.set(projectId, current);
  return current;
}

export async function deleteProject(
  userId: string,
  projectId: string,
  cascade = false
): Promise<void> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data: current, error: curErr } = await admin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (curErr) throw curErr;
    if (!current) {
      const err: any = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    if (cascade) {
      const { data: items } = await admin
        .from('project_items')
        .select('variant_id')
        .eq('project_id', projectId);

      if (items && items.length > 0) {
        const vIds = items.map((i) => i.variant_id);
        await admin
          .from('generation_job_variants')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', vIds);
      }
    }

    const { error: delErr } = await admin
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', projectId);
    if (delErr) throw delErr;
    return;
  }

  // DEMO ONLY
  const current = mockProjects.get(projectId);
  if (!current || current.user_id !== userId || current.deleted_at) {
    const err: any = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  if (cascade) {
    const items = mockProjectItems.get(projectId) || [];
    const vIds = new Set(items.map((i) => i.variant_id));
    for (const vList of mockVariants.values()) {
      for (const v of vList) {
        if (vIds.has(v.id)) {
          v.deleted_at = new Date().toISOString();
        }
      }
    }
  }

  current.deleted_at = new Date().toISOString();
  mockProjects.set(projectId, current);
}

export async function getProjectItems(userId: string, projectId: string): Promise<ProjectItem[]> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (projErr) throw projErr;
    if (!project) {
      const err: any = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    const { data: items, error } = await admin
      .from('project_items')
      .select(`
        id, project_id, variant_id, job_id, user_id, position, added_at,
        variant:generation_job_variants(*),
        job:generation_jobs(*)
      `)
      .eq('project_id', projectId)
      .order('position', { ascending: true })
      .order('added_at', { ascending: true });

    if (error) throw error;
    const normalized = (items || []).map((item: any) => ({
      ...item,
      variant: Array.isArray(item.variant) ? item.variant[0] : item.variant,
      job: Array.isArray(item.job) ? item.job[0] : item.job,
    })).filter((item: any) => !item.variant?.deleted_at);
    return normalized as unknown as ProjectItem[];
  }

  // DEMO ONLY
  const project = mockProjects.get(projectId);
  if (!project || project.user_id !== userId || project.deleted_at) {
    const err: any = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  const items = mockProjectItems.get(projectId) || [];
  const populated: ProjectItem[] = [];

  for (const item of items) {
    let variant: GenerationJobVariant | undefined;
    for (const vList of mockVariants.values()) {
      const match = vList.find((v) => v.id === item.variant_id);
      if (match) {
        variant = match;
        break;
      }
    }
    if (variant && variant.deleted_at) continue;

    const job = mockJobs.get(item.job_id);
    populated.push({
      ...item,
      variant,
      job,
    });
  }

  return populated.sort((a, b) => a.position - b.position);
}

export async function addProjectItems(
  userId: string,
  projectId: string,
  variantIds: string[]
): Promise<ProjectItem[]> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id, item_count')
      .eq('id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (projErr) throw projErr;
    if (!project) {
      const err: any = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    const { data: variants, error: vErr } = await admin
      .from('generation_job_variants')
      .select('id, job_id, user_id, deleted_at')
      .in('id', variantIds)
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (vErr) throw vErr;

    if (variants && variants.length > 0) {
      const rows = variants.map((v, idx) => ({
        project_id: projectId,
        variant_id: v.id,
        job_id: v.job_id,
        user_id: userId,
        position: (project.item_count || 0) + idx,
      }));
      const { error: upErr } = await admin
        .from('project_items')
        .upsert(rows, { onConflict: 'project_id,variant_id', ignoreDuplicates: true });
      if (upErr) throw upErr;
    }

    return await getProjectItems(userId, projectId);
  }

  // DEMO ONLY
  const project = mockProjects.get(projectId);
  if (!project || project.user_id !== userId || project.deleted_at) {
    const err: any = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  const existingItems = mockProjectItems.get(projectId) || [];
  const existingVariantIds = new Set(existingItems.map((i) => i.variant_id));

  for (const vId of variantIds) {
    if (existingVariantIds.has(vId)) continue;
    let variant: GenerationJobVariant | undefined;
    for (const vList of mockVariants.values()) {
      const found = vList.find((v) => v.id === vId && !v.deleted_at);
      if (found) {
        variant = found;
        break;
      }
    }

    const newItem: ProjectItem = {
      id: crypto.randomUUID(),
      project_id: projectId,
      variant_id: vId,
      job_id: variant?.job_id || '',
      user_id: userId,
      position: existingItems.length,
      added_at: new Date().toISOString(),
      variant,
      job: variant ? mockJobs.get(variant.job_id) : undefined,
    };
    existingItems.push(newItem);
    existingVariantIds.add(vId);
  }

  mockProjectItems.set(projectId, existingItems);
  project.item_count = existingItems.length;
  mockProjects.set(projectId, project);

  return getProjectItems(userId, projectId);
}

export async function removeProjectItem(
  userId: string,
  projectId: string,
  variantId: string
): Promise<void> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (projErr) throw projErr;
    if (!project) {
      const err: any = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    const { error: delErr } = await admin
      .from('project_items')
      .delete()
      .eq('project_id', projectId)
      .eq('variant_id', variantId)
      .eq('user_id', userId);
    if (delErr) throw delErr;
    return;
  }

  // DEMO ONLY
  const project = mockProjects.get(projectId);
  if (!project || project.user_id !== userId || project.deleted_at) {
    const err: any = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  const existingItems = mockProjectItems.get(projectId) || [];
  const filtered = existingItems.filter((i) => i.variant_id !== variantId);
  mockProjectItems.set(projectId, filtered);
  project.item_count = filtered.length;
  mockProjects.set(projectId, project);
}

export async function reorderProjectItems(
  userId: string,
  projectId: string,
  variantIds: string[]
): Promise<void> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (projErr) throw projErr;
    if (!project) {
      const err: any = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    const { error } = await admin.rpc('reorder_project_items', {
      p_project_id: projectId,
      p_variant_ids: variantIds,
    });

    if (error) {
      for (let i = 0; i < variantIds.length; i++) {
        await admin
          .from('project_items')
          .update({ position: i })
          .eq('project_id', projectId)
          .eq('variant_id', variantIds[i])
          .eq('user_id', userId);
      }
    }
    return;
  }

  // DEMO ONLY
  const project = mockProjects.get(projectId);
  if (!project || project.user_id !== userId || project.deleted_at) {
    const err: any = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  const items = mockProjectItems.get(projectId) || [];
  const map = new Map(items.map((it) => [it.variant_id, it]));
  const reordered: ProjectItem[] = [];

  variantIds.forEach((vid, idx) => {
    const it = map.get(vid);
    if (it) {
      it.position = idx;
      reordered.push(it);
      map.delete(vid);
    }
  });

  // Append any others not in the variantIds list
  map.forEach((it) => {
    it.position = reordered.length;
    reordered.push(it);
  });

  mockProjectItems.set(projectId, reordered);
}

export async function moveProjectItem(
  userId: string,
  variantId: string,
  fromProjectId: string,
  toProjectId: string,
  position: number
): Promise<void> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data: toProject, error: toErr } = await admin
      .from('projects')
      .select('id')
      .eq('id', toProjectId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (toErr) throw toErr;
    if (!toProject) {
      const err: any = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    const { error } = await admin.rpc('move_project_item', {
      p_variant_id: variantId,
      p_from_project: fromProjectId,
      p_to_project: toProjectId,
      p_position: position,
    });

    if (error) {
      const { data: existing } = await admin
        .from('project_items')
        .select('id')
        .eq('project_id', toProjectId)
        .eq('variant_id', variantId)
        .maybeSingle();

      if (existing) {
        await admin
          .from('project_items')
          .delete()
          .eq('project_id', fromProjectId)
          .eq('variant_id', variantId)
          .eq('user_id', userId);
      } else {
        await admin
          .from('project_items')
          .update({ project_id: toProjectId, position })
          .eq('project_id', fromProjectId)
          .eq('variant_id', variantId)
          .eq('user_id', userId);
      }
    }
    return;
  }

  // DEMO ONLY
  const toProject = mockProjects.get(toProjectId);
  if (!toProject || toProject.user_id !== userId || toProject.deleted_at) {
    const err: any = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  const fromItems = mockProjectItems.get(fromProjectId) || [];
  const toItems = mockProjectItems.get(toProjectId) || [];

  const itemIndex = fromItems.findIndex((it) => it.variant_id === variantId);
  if (itemIndex >= 0) {
    const [item] = fromItems.splice(itemIndex, 1);
    const existingInTo = toItems.find((it) => it.variant_id === variantId);
    if (!existingInTo) {
      item.project_id = toProjectId;
      item.position = position;
      toItems.splice(position, 0, item);
      toItems.forEach((it, idx) => (it.position = idx));
    }
    mockProjectItems.set(fromProjectId, fromItems);
    mockProjectItems.set(toProjectId, toItems);

    const fromProj = mockProjects.get(fromProjectId);
    if (fromProj) fromProj.item_count = fromItems.length;
    toProject.item_count = toItems.length;
  }
}

// ---------------------------------------------------------------------------
// Section D: Trash, Restore & Tiered Retention Database Operations
// ---------------------------------------------------------------------------

/**
 * Gets retention interval in milliseconds for a plan tier.
 * free: 2 hours, paid: 30 days.
 */
export function getTrashRetentionMs(tier?: PlanTier | string | null): number {
  if (tier === 'free' || !tier) {
    return 2 * 60 * 60 * 1000; // 2 hours
  }
  return 30 * 24 * 60 * 60 * 1000; // 30 days
}

/**
 * Fetches trashed, unpurged variants for a user with job details for rich UI cards.
 */
export async function getTrashVariants(userId: string): Promise<any[]> {
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { data: variants, error } = await admin
        .from('generation_job_variants')
        .select(`
          id, job_id, user_id, variant_index, status, output_url, thumbnail_url,
          storage_path, credits_unit, deleted_at, purge_after, deleted_by_tier,
          purged_at, created_at, updated_at
        `)
        .eq('user_id', userId)
        .neq('status', 'failed')
        .not('deleted_at', 'is', null)
        .is('purged_at', null)
        .order('deleted_at', { ascending: false });

      if (!error && variants) {
        // Collect job IDs to enrich cards with prompt, media type, etc.
        const jobIds = Array.from(new Set(variants.map((v) => v.job_id).filter(Boolean)));
        let jobMap = new Map<string, any>();
        if (jobIds.length > 0) {
          const { data: jobs } = await admin
            .from('generation_jobs')
            .select('id, prompt, type, media_type, aspect_ratio, resolution, duration_seconds, model_name')
            .in('id', jobIds);
          if (jobs) {
            jobs.forEach((j) => jobMap.set(j.id, j));
          }
        }

        return variants.map((v) => {
          const j = jobMap.get(v.job_id);
          return {
            ...v,
            prompt: j?.prompt || '',
            media_type: j?.media_type || j?.type || 'image',
            aspect_ratio: j?.aspect_ratio || '1:1',
            resolution: j?.resolution,
            duration_seconds: j?.duration_seconds,
            model_name: j?.model_name || 'AI Generator',
          };
        });
      }
    } catch (err) {
      console.error('[DB] getTrashVariants Supabase error, falling back to mock:', err);
    }
  }

  // Mock fallback
  const trashed: any[] = [];
  for (const [jobId, variants] of mockVariants.entries()) {
    const job = mockJobs.get(jobId);
    for (const v of variants) {
      if (v.user_id === userId && v.deleted_at && !v.purged_at) {
        trashed.push({
          ...v,
          prompt: job?.prompt || '',
          media_type: job?.media_type || job?.type || 'image',
          aspect_ratio: job?.aspect_ratio || '1:1',
          resolution: job?.resolution,
          duration_seconds: job?.duration_seconds,
          model_name: job?.model_name || 'AI Generator',
        });
      }
    }
  }
  return trashed.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
}

/**
 * Moves variants to trash.
 * Computes and writes purge_after based on user's current tier (2 hours for free, 30 days for paid).
 * Removes trashed variants from all projects.
 */
export async function trashVariants(
  userId: string,
  variantIds: string[]
): Promise<Array<{ variant_id: string; purge_after: string }>> {
  if (!variantIds.length) return [];

  // Separate synthetic/failed IDs from real UUIDs
  const synOrFailedIds = variantIds.filter((id) => id.startsWith('syn_') || id.startsWith('failed-'));
  const realIds = variantIds.filter((id) => !id.startsWith('syn_') && !id.startsWith('failed-'));

  if (synOrFailedIds.length > 0) {
    await permanentlyDeleteFailedGeneration(userId, { variantIds: synOrFailedIds });
  }
  if (!realIds.length) {
    return variantIds.map((id) => ({ variant_id: id, purge_after: new Date().toISOString() }));
  }

  const admin = getSupabaseAdmin();

  if (admin) {
    try {
      // Check which variants are failed vs completed
      const { data: targetVars } = await admin
        .from('generation_job_variants')
        .select('id, job_id, status, output_url')
        .in('id', realIds)
        .eq('user_id', userId);

      const failedVarIds: string[] = [];
      const completedVarIds: string[] = [];
      const affectedJobIds = new Set<string>();

      for (const v of targetVars || []) {
        if (v.job_id) affectedJobIds.add(v.job_id);
        if (v.status === 'failed' || (!v.output_url && v.status !== 'completed')) {
          failedVarIds.push(v.id);
        } else {
          completedVarIds.push(v.id);
        }
      }

      // If any realIds weren't in generation_job_variants, check if they are jobIds
      const foundVarIdSet = new Set((targetVars || []).map((v) => v.id));
      const unmatchedIds = realIds.filter((id) => !foundVarIdSet.has(id));
      if (unmatchedIds.length > 0) {
        await permanentlyDeleteFailedGeneration(userId, { jobIds: unmatchedIds });
      }

      if (failedVarIds.length > 0) {
        await permanentlyDeleteFailedGeneration(userId, { variantIds: failedVarIds });
      }

      const results: Array<{ variant_id: string; purge_after: string }> = failedVarIds.map((id) => ({
        variant_id: id,
        purge_after: new Date().toISOString(),
      }));

      if (completedVarIds.length > 0) {
        const { data: profile } = await admin
          .from('profiles')
          .select('plan_tier')
          .eq('id', userId)
          .maybeSingle();

        const userTier = profile?.plan_tier || 'free';
        const retentionMs = getTrashRetentionMs(userTier);
        const purgeAfter = new Date(Date.now() + retentionMs).toISOString();
        const now = new Date().toISOString();

        const { data: updated, error: updateError } = await admin
          .from('generation_job_variants')
          .update({
            deleted_at: now,
            deleted_by_tier: userTier,
            purge_after: purgeAfter,
          })
          .in('id', completedVarIds)
          .eq('user_id', userId)
          .is('deleted_at', null)
          .select('id, job_id, purge_after');

        if (!updateError && updated) {
          await admin
            .from('project_items')
            .delete()
            .in('variant_id', completedVarIds)
            .eq('user_id', userId);

          for (const v of updated) {
            results.push({
              variant_id: v.id,
              purge_after: v.purge_after || purgeAfter,
            });
          }
        }

        // If all variants of an affected job are now deleted, mark the job as deleted_at too
        for (const jId of affectedJobIds) {
          const { data: rem } = await admin
            .from('generation_job_variants')
            .select('id')
            .eq('job_id', jId)
            .is('deleted_at', null)
            .is('purged_at', null);
          if (!rem || rem.length === 0) {
            await admin
              .from('generation_jobs')
              .update({ deleted_at: now })
              .eq('id', jId)
              .eq('user_id', userId);
          }
        }
      }

      return results;
    } catch (err) {
      console.error('[DB] trashVariants Supabase error, falling back to mock:', err);
    }
  }

  // Mock store fallback
  const now = new Date().toISOString();
  const userTier = 'free'; // Mock default
  const purgeAfter = new Date(Date.now() + getTrashRetentionMs(userTier)).toISOString();
  const results: Array<{ variant_id: string; purge_after: string }> = [];

  for (const [jobId, variants] of mockVariants.entries()) {
    for (const v of variants) {
      if (variantIds.includes(v.id) && v.user_id === userId && !v.deleted_at) {
        v.deleted_at = now;
        v.deleted_by_tier = userTier as any;
        v.purge_after = purgeAfter;
        results.push({ variant_id: v.id, purge_after: purgeAfter });
      }
    }
  }

  // Remove from mock project items and update project counts
  mockProjectItems.forEach((items, projId) => {
    const remaining = items.filter((it) => !variantIds.includes(it.variant_id));
    if (remaining.length !== items.length) {
      mockProjectItems.set(projId, remaining);
      const proj = mockProjects.get(projId);
      if (proj) proj.item_count = remaining.length;
    }
  });

  return results;
}

/**
 * Restores soft-deleted variants (only if not yet purged).
 * Asset returns to All Assets, does NOT rejoin projects.
 */
export async function restoreVariants(userId: string, variantIds: string[]): Promise<string[]> {
  if (!variantIds.length) return [];
  const admin = getSupabaseAdmin();

  if (admin) {
    try {
      const { data: rpcData, error: rpcError } = await admin.rpc('restore_variants', {
        p_variant_ids: variantIds,
      });

      if (!rpcError && rpcData) {
        return rpcData.map((row: any) => row.variant_id || row.id || row);
      }

      // Direct fallback
      const { data: updated, error } = await admin
        .from('generation_job_variants')
        .update({
          deleted_at: null,
          purge_after: null,
          deleted_by_tier: null,
        })
        .in('id', variantIds)
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .is('purged_at', null)
        .select('id, job_id');

      if (!error && updated) {
        const parentJobIds = Array.from(new Set(updated.map((v: any) => v.job_id).filter(Boolean)));
        if (parentJobIds.length > 0) {
          await admin
            .from('generation_jobs')
            .update({ deleted_at: null })
            .in('id', parentJobIds)
            .eq('user_id', userId);
        }
        return updated.map((v) => v.id);
      }
    } catch (err) {
      console.error('[DB] restoreVariants Supabase error, falling back to mock:', err);
    }
  }

  // Mock store fallback
  const restoredIds: string[] = [];
  for (const variants of mockVariants.values()) {
    for (const v of variants) {
      if (variantIds.includes(v.id) && v.user_id === userId && v.deleted_at && !v.purged_at) {
        v.deleted_at = null;
        v.purge_after = null;
        v.deleted_by_tier = null;
        restoredIds.push(v.id);
      }
    }
  }
  return restoredIds;
}

/**
 * Permanently deletes variants immediately.
 * Sets purge_after in the past or performs immediate byte purge.
 */
export async function purgeVariantsNow(userId: string, variantIds: string[]): Promise<string[]> {
  if (!variantIds.length) return [];
  const admin = getSupabaseAdmin();

  if (admin) {
    try {
      const { data: rpcData, error: rpcError } = await admin.rpc('purge_variants_now', {
        p_variant_ids: variantIds,
      });

      if (!rpcError && rpcData) {
        // Also immediately remove bytes if possible
        const { data: targets } = await admin
          .from('generation_job_variants')
          .select('id, storage_path')
          .in('id', variantIds);

        if (targets?.length) {
          const paths = targets.map((t) => t.storage_path).filter(Boolean) as string[];
          if (paths.length) {
            await admin.storage.from('generations').remove(paths);
          }
          await admin
            .from('generation_job_variants')
            .update({
              purged_at: new Date().toISOString(),
              output_url: null,
              thumbnail_url: null,
              upscaled_urls: {},
            })
            .in('id', variantIds);
        }
        return rpcData.map((row: any) => row.variant_id || row.id || row);
      }

      // Direct fallback
      const { data: targets } = await admin
        .from('generation_job_variants')
        .select('id, storage_path')
        .in('id', variantIds)
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .is('purged_at', null);

      if (targets?.length) {
        const paths = targets.map((t) => t.storage_path).filter(Boolean) as string[];
        if (paths.length) {
          await admin.storage.from('generations').remove(paths);
        }
        await admin
          .from('generation_job_variants')
          .update({
            purged_at: new Date().toISOString(),
            output_url: null,
            thumbnail_url: null,
            upscaled_urls: {},
          })
          .in('id', targets.map((t) => t.id));

        return targets.map((t) => t.id);
      }
    } catch (err) {
      console.error('[DB] purgeVariantsNow Supabase error, falling back to mock:', err);
    }
  }

  // Mock store fallback
  const purgedIds: string[] = [];
  const now = new Date().toISOString();
  for (const variants of mockVariants.values()) {
    for (const v of variants) {
      if (variantIds.includes(v.id) && v.user_id === userId && v.deleted_at && !v.purged_at) {
        v.purged_at = now;
        v.output_url = undefined;
        v.thumbnail_url = undefined;
        v.upscaled_urls = {};
        purgedIds.push(v.id);
      }
    }
  }
  return purgedIds;
}

/**
 * Empties all trashed variants for a user.
 */
export async function purgeAllTrashVariants(userId: string): Promise<string[]> {
  const trashed = await getTrashVariants(userId);
  const ids = trashed.map((t) => t.id);
  if (!ids.length) return [];
  return purgeVariantsNow(userId, ids);
}

// ---------------------------------------------------------------------------
// SECTION G: Favorites, Playlists (Music Only), and Library
// ---------------------------------------------------------------------------

/**
 * Validates and sanitizes playlist tags:
 * Max 3 tags, each trimmed, leading '#' stripped, 1-20 chars, de-duplicated case-insensitively.
 */
export function sanitizePlaylistTags(rawTags?: unknown): string[] {
  if (!rawTags) return [];
  const list = Array.isArray(rawTags) ? rawTags : typeof rawTags === 'string' ? rawTags.split(',') : [];
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const item of list) {
    if (typeof item !== 'string') continue;
    let clean = item.trim();
    if (clean.startsWith('#')) {
      clean = clean.replace(/^#+/, '').trim();
    }
    if (clean.length >= 1 && clean.length <= 20) {
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        sanitized.push(clean);
        if (sanitized.length >= 3) break;
      }
    }
  }
  return sanitized;
}

/**
 * Validates playlist name: length between 1 and 60 chars.
 */
export function validatePlaylistName(name?: unknown): string {
  if (typeof name !== 'string') {
    const err: any = new Error('Playlist name must be a string');
    err.status = 400;
    err.code = 'INVALID_NAME';
    throw err;
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 60) {
    const err: any = new Error('Playlist name must be between 1 and 60 characters');
    err.status = 400;
    err.code = 'INVALID_NAME';
    throw err;
  }
  return trimmed;
}

/**
 * Encodes keyset cursor (created_at + id)
 */
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ created_at: createdAt, id })).toString('base64');
}

/**
 * Decodes keyset cursor
 */
function decodeCursor(cursor?: string): { created_at?: string; id?: string; offset?: number; position?: number } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed) return parsed;
  } catch {
    // fallback if format is created_at_id
    const parts = cursor.split('_');
    if (parts.length >= 2) {
      return { created_at: parts[0], id: parts.slice(1).join('_') };
    }
  }
  return null;
}

function getMockUserFavorites(userId: string): Set<string> {
  let favs = mockFavorites.get(userId);
  if (!favs) {
    favs = new Set<string>();
    mockFavorites.set(userId, favs);
  }
  return favs;
}

/**
 * GET /api/library
 * Flattened, completed, non-trashed variants + job fields + is_favorite.
 * Keyset or offset pagination.
 * Supports projectId parameter to return project-specific variants ordered by position.
 */
export async function getLibraryItems(
  userId: string,
  options: {
    type?: 'video' | 'image' | 'music';
    limit?: number;
    cursor?: string;
    favorites?: boolean;
    q?: string;
    projectId?: string;
  } = {}
): Promise<{ items: LibraryItem[]; nextCursor: string | null; totalCount?: number }> {
  const limit = Math.min(Math.max(Number(options.limit) || 24, 1), 100);
  const parsedCursor = decodeCursor(options.cursor);
  const admin = getSupabaseAdmin();

  if (admin) {
    try {
      // 1. Fetch user favorite variant IDs for is_favorite resolution
      const { data: favRows } = await admin
        .from('favorites')
        .select('variant_id')
        .eq('user_id', userId);
      const favSet = new Set<string>((favRows || []).map((f: any) => f.variant_id));

      // 2. Project-scoped query
      if (options.projectId) {
        // Verify the project belongs to the user
        const { data: project, error: projErr } = await admin
          .from('projects')
          .select('id, item_count')
          .eq('id', options.projectId)
          .eq('user_id', userId)
          .is('deleted_at', null)
          .maybeSingle();

        if (projErr) throw projErr;
        if (!project) {
          const err: any = new Error('Project not found');
          err.status = 404;
          throw err;
        }

        let query = admin
          .from('project_items')
          .select(`
            id, project_id, variant_id, job_id, user_id, position, added_at,
            variant:generation_job_variants!inner(
              id, job_id, user_id, variant_index, status, output_url, thumbnail_url,
              error_message, credits_unit, started_at, completed_at, created_at, updated_at,
              upscaled_urls, deleted_at,
              generation_jobs!inner(
                id, prompt, model_name, aspect_ratio, resolution, duration_seconds,
                genre, tonality, lyrics, client_settings, cover_art_url, media_type, deleted_at
              )
            )
          `, { count: 'exact' })
          .eq('project_id', options.projectId)
          .eq('user_id', userId)
          .is('variant.deleted_at', null)
          .is('variant.generation_jobs.deleted_at', null)
          .not('variant.output_url', 'is', null);

        if (options.type) {
          query = query.eq('variant.generation_jobs.media_type', options.type);
        }

        if (options.q && options.q.trim()) {
          query = query.ilike('variant.generation_jobs.prompt', `%${options.q.trim()}%`);
        }

        if (options.favorites) {
          if (favSet.size === 0) {
            return { items: [], nextCursor: null, totalCount: 0 };
          }
          query = query.in('variant.id', Array.from(favSet));
        }

        query = query
          .order('position', { ascending: true })
          .order('added_at', { ascending: false })
          .order('id', { ascending: true });

        const offset = parsedCursor?.offset || 0;
        query = query.range(offset, offset + limit);

        const { data, count, error } = await query;
        if (error) throw error;

        if (data) {
          const hasMore = data.length > limit;
          const pageRows = hasMore ? data.slice(0, limit) : data;

          const items: LibraryItem[] = pageRows.map((row: any) => {
            const v = row.variant || {};
            const job = v.generation_jobs || {};
            return {
              id: v.id,
              job_id: v.job_id,
              user_id: v.user_id,
              variant_index: v.variant_index,
              status: v.status,
              output_url: v.output_url,
              thumbnail_url: v.thumbnail_url,
              credits_unit: v.credits_unit,
              created_at: v.created_at,
              completed_at: v.completed_at,
              updated_at: v.updated_at || v.created_at,
              upscaled_urls: v.upscaled_urls,
              prompt: job.prompt || '',
              model_name: job.model_name || '',
              aspect_ratio: job.aspect_ratio,
              resolution: job.resolution,
              duration_seconds: job.duration_seconds,
              genre: job.genre,
              tonality: job.tonality,
              lyrics: job.lyrics,
              client_settings: job.client_settings,
              cover_art_url: job.cover_art_url,
              media_type: (job.media_type || 'image') as any,
              is_favorite: favSet.has(v.id),
            };
          });

          const nextCursor = hasMore
            ? Buffer.from(JSON.stringify({ offset: offset + limit })).toString('base64')
            : null;

          return { items, nextCursor, totalCount: count ?? undefined };
        }
      }

      // 3. Global library query (All Assets)
      let query = admin
        .from('generation_job_variants')
        .select(`
          id, job_id, user_id, variant_index, status, output_url, thumbnail_url,
          error_message, credits_unit, started_at, completed_at, created_at, updated_at,
          upscaled_urls, deleted_at,
          generation_jobs!inner(
            id, prompt, model_name, aspect_ratio, resolution, duration_seconds,
            genre, tonality, lyrics, client_settings, cover_art_url, media_type, deleted_at
          )
        `, { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .is('generation_jobs.deleted_at', null)
        .not('output_url', 'is', null);

      if (options.type) {
        query = query.eq('generation_jobs.media_type', options.type);
      }

      if (options.q && options.q.trim()) {
        const searchTerm = `%${options.q.trim()}%`;
        query = query.ilike('generation_jobs.prompt', searchTerm);
      }

      if (options.favorites) {
        if (favSet.size === 0) {
          return { items: [], nextCursor: null, totalCount: 0 };
        }
        query = query.in('id', Array.from(favSet));
      }

      // Keyset pagination on (created_at, id)
      if (parsedCursor && parsedCursor.created_at && parsedCursor.id) {
        query = query.or(
          `created_at.lt.${parsedCursor.created_at},and(created_at.eq.${parsedCursor.created_at},id.lt.${parsedCursor.id})`
        );
      }

      query = query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);

      const { data, count, error } = await query;
      if (!error && data) {
        const hasMore = data.length > limit;
        const pageRows = hasMore ? data.slice(0, limit) : data;

        const items: LibraryItem[] = pageRows.map((row: any) => {
          const job = row.generation_jobs || {};
          return {
            id: row.id,
            job_id: row.job_id,
            user_id: row.user_id,
            variant_index: row.variant_index,
            status: row.status,
            output_url: row.output_url,
            thumbnail_url: row.thumbnail_url,
            credits_unit: row.credits_unit,
            created_at: row.created_at,
            completed_at: row.completed_at,
            updated_at: row.updated_at || row.created_at,
            upscaled_urls: row.upscaled_urls,
            prompt: job.prompt || '',
            model_name: job.model_name || '',
            aspect_ratio: job.aspect_ratio,
            resolution: job.resolution,
            duration_seconds: job.duration_seconds,
            genre: job.genre,
            tonality: job.tonality,
            lyrics: job.lyrics,
            client_settings: job.client_settings,
            cover_art_url: job.cover_art_url,
            media_type: (job.media_type || 'image') as any,
            is_favorite: favSet.has(row.id),
          };
        });

        let nextCursor: string | null = null;
        if (hasMore && items.length > 0) {
          const lastItem = items[items.length - 1];
          nextCursor = encodeCursor(lastItem.created_at, lastItem.id);
        }

        return { items, nextCursor, totalCount: count ?? undefined };
      }
    } catch (err: any) {
      if (err?.status === 404 || err?.message === 'Project not found') {
        throw err;
      }
      console.warn('[DB] getLibraryItems Supabase query failed, falling back to mock:', err);
    }
  }

  // In-Memory Fallback
  const favSet = getMockUserFavorites(userId);

  // If projectId is requested in demo fallback
  if (options.projectId) {
    const project = mockProjects.get(options.projectId);
    if (!project || project.user_id !== userId || project.deleted_at) {
      const err: any = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    const pItems = mockProjectItems.get(options.projectId) || [];
    const sortedPItems = [...pItems].sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
    });

    const candidates: LibraryItem[] = [];
    for (const pItem of sortedPItems) {
      let variant: GenerationJobVariant | undefined;
      for (const vList of mockVariants.values()) {
        const match = vList.find((v) => v.id === pItem.variant_id);
        if (match) {
          variant = match;
          break;
        }
      }
      if (!variant || variant.deleted_at || variant.purged_at || variant.status !== 'completed' || !variant.output_url) {
        continue;
      }

      const job = mockJobs.get(pItem.job_id);
      if (!job || job.deleted_at) continue;

      const jobMediaType = (job.type || (job as any).media_type || 'image') as any;
      if (options.type && jobMediaType !== options.type) continue;

      if (options.q && options.q.trim()) {
        const qLower = options.q.trim().toLowerCase();
        const promptMatch = job.prompt?.toLowerCase().includes(qLower);
        const genreMatch = job.genre?.toLowerCase().includes(qLower);
        if (!promptMatch && !genreMatch) continue;
      }

      const isFav = favSet.has(variant.id);
      if (options.favorites && !isFav) continue;

      candidates.push({
        id: variant.id,
        job_id: variant.job_id,
        user_id: variant.user_id,
        variant_index: variant.variant_index,
        status: variant.status,
        output_url: variant.output_url,
        thumbnail_url: variant.thumbnail_url,
        credits_unit: variant.credits_unit,
        created_at: variant.created_at,
        completed_at: variant.completed_at,
        updated_at: variant.updated_at || variant.created_at,
        upscaled_urls: variant.upscaled_urls,
        prompt: job.prompt || '',
        model_name: job.model_name || '',
        aspect_ratio: job.aspect_ratio,
        resolution: job.resolution,
        duration_seconds: job.duration_seconds,
        genre: job.genre,
        cover_art_url: job.cover_art_url,
        media_type: jobMediaType,
        is_favorite: isFav,
      });
    }

    const offset = parsedCursor?.offset || 0;
    const totalCount = candidates.length;
    const pageItems = candidates.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ offset: offset + limit })).toString('base64')
      : null;

    return { items: pageItems, nextCursor, totalCount };
  }

  const candidates: LibraryItem[] = [];

  for (const [jobId, variants] of mockVariants.entries()) {
    const job = mockJobs.get(jobId);
    if (!job || job.deleted_at) continue;

    const jobMediaType = (job.type || (job as any).media_type || 'image') as any;
    if (options.type && jobMediaType !== options.type) continue;

    if (options.q && options.q.trim()) {
      const qLower = options.q.trim().toLowerCase();
      const promptMatch = job.prompt?.toLowerCase().includes(qLower);
      const genreMatch = job.genre?.toLowerCase().includes(qLower);
      if (!promptMatch && !genreMatch) continue;
    }

    for (const v of variants) {
      if (v.user_id !== userId && job.user_id !== userId) continue;
      if (v.deleted_at || v.purged_at) continue;
      if (v.status !== 'completed' || !v.output_url) continue;

      const isFav = favSet.has(v.id);
      if (options.favorites && !isFav) continue;

      candidates.push({
        id: v.id,
        job_id: v.job_id,
        user_id: v.user_id,
        variant_index: v.variant_index,
        status: v.status,
        output_url: v.output_url,
        thumbnail_url: v.thumbnail_url,
        credits_unit: v.credits_unit,
        created_at: v.created_at,
        completed_at: v.completed_at,
        updated_at: v.updated_at || v.created_at,
        upscaled_urls: v.upscaled_urls,
        prompt: job.prompt || '',
        model_name: job.model_name || '',
        aspect_ratio: job.aspect_ratio,
        resolution: job.resolution,
        duration_seconds: job.duration_seconds,
        genre: job.genre,
        cover_art_url: job.cover_art_url,
        media_type: jobMediaType,
        is_favorite: isFav,
      });
    }
  }

  // Sort by (created_at desc, id desc)
  candidates.sort((a, b) => {
    const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });

  // Apply cursor slicing
  let filtered = candidates;
  if (parsedCursor) {
    const cursorTime = new Date(parsedCursor.created_at).getTime();
    filtered = candidates.filter((item) => {
      const itemTime = new Date(item.created_at).getTime();
      if (itemTime < cursorTime) return true;
      if (itemTime === cursorTime) return item.id < parsedCursor.id;
      return false;
    });
  }

  const hasMore = filtered.length > limit;
  const pageItems = hasMore ? filtered.slice(0, limit) : filtered;

  let nextCursor: string | null = null;
  if (hasMore && pageItems.length > 0) {
    const lastItem = pageItems[pageItems.length - 1];
    nextCursor = encodeCursor(lastItem.created_at, lastItem.id);
  }

  return { items: pageItems, nextCursor, totalCount: candidates.length };
}

/**
 * GET /api/favorites
 * Returns favorited variant IDs (and optionally full items).
 */
export async function getUserFavoriteVariantIds(
  userId: string,
  type?: 'video' | 'image' | 'music'
): Promise<string[]> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    let query = admin
      .from('favorites')
      .select(`
        variant_id,
        generation_job_variants!inner(
          id, deleted_at,
          generation_jobs!inner(media_type, deleted_at)
        )
      `)
      .eq('user_id', userId)
      .is('generation_job_variants.deleted_at', null)
      .is('generation_job_variants.generation_jobs.deleted_at', null);

    if (type) {
      query = query.eq('generation_job_variants.generation_jobs.media_type', type);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[DB] getUserFavoriteVariantIds Supabase error:', error.message);
      throw error;
    }
    return (data || []).map((r: any) => r.variant_id);
  }

  const favSet = getMockUserFavorites(userId);
  const result: string[] = [];

  for (const variantId of favSet) {
    for (const [jobId, vList] of mockVariants.entries()) {
      const v = vList.find((cand) => cand.id === variantId);
      if (v && !v.deleted_at && !v.purged_at) {
        const job = mockJobs.get(jobId);
        if (job && !job.deleted_at) {
          const mType = (job.type || (job as any).media_type) as any;
          if (!type || mType === type) {
            result.push(variantId);
          }
        }
      }
    }
  }

  return result;
}

/**
 * PUT /api/favorites/:variantId
 * Idempotently adds variant to favorites, verifying variant belongs to caller.
 */
export async function addFavorite(userId: string, variantId: string): Promise<{ success: boolean; is_favorite: boolean }> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    // Verify variant belongs to caller
    const { data: variant, error: varErr } = await admin
      .from('generation_job_variants')
      .select('id, user_id, deleted_at')
      .eq('id', variantId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (varErr || !variant) {
      const err: any = new Error('Variant not found');
      err.status = 404;
      err.code = 'VARIANT_NOT_FOUND';
      throw err;
    }

    // Upsert into favorites
    const { error: upsertErr } = await admin
      .from('favorites')
      .upsert({ user_id: userId, variant_id: variantId }, { onConflict: 'user_id,variant_id' });

    if (upsertErr) {
      console.error('[DB] addFavorite Supabase error:', upsertErr.message);
      throw upsertErr;
    }

    return { success: true, is_favorite: true };
  }

  // Mock store fallback
  let found = false;
  for (const vList of mockVariants.values()) {
    const v = vList.find((item) => item.id === variantId);
    if (v && (v.user_id === userId || userId === 'usr_amina_01') && !v.deleted_at) {
      found = true;
      break;
    }
  }

  if (!found) {
    const err: any = new Error('Variant not found');
    err.status = 404;
    err.code = 'VARIANT_NOT_FOUND';
    throw err;
  }

  getMockUserFavorites(userId).add(variantId);
  return { success: true, is_favorite: true };
}

/**
 * DELETE /api/favorites/:variantId
 * Idempotently removes variant from favorites.
 */
export async function removeFavorite(userId: string, variantId: string): Promise<{ success: boolean; is_favorite: boolean }> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { error } = await admin
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('variant_id', variantId);

    if (error) {
      console.error('[DB] removeFavorite Supabase error:', error.message);
      throw error;
    }

    return { success: true, is_favorite: false };
  }

  getMockUserFavorites(userId).delete(variantId);
  return { success: true, is_favorite: false };
}

/**
 * GET /api/playlists
 * Fetches user playlists with item_count and cover_urls computed at read-time.
 */
export async function getPlaylistsForUser(userId: string): Promise<Playlist[]> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { data: playlists, error } = await admin
      .from('playlists')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DB] getPlaylistsForUser Supabase error:', error.message);
      throw error;
    }

    // For each playlist, compute item_count and up to 4 cover_urls
    const results: Playlist[] = await Promise.all(
      (playlists || []).map(async (p: any) => {
        const { data: items, error: itemErr } = await admin
          .from('playlist_items')
          .select(`
            variant_id, position, added_at,
            generation_job_variants!inner(
              id, thumbnail_url, output_url, deleted_at,
              generation_jobs!inner(id, cover_art_url, deleted_at)
            )
          `)
          .eq('playlist_id', p.id)
          .is('generation_job_variants.deleted_at', null)
          .is('generation_job_variants.generation_jobs.deleted_at', null)
          .order('position', { ascending: true })
          .order('added_at', { ascending: true });

        if (itemErr) {
          console.error('[DB] getPlaylistsForUser items error:', itemErr.message);
          throw itemErr;
        }

        const coverUrls: string[] = [];
        for (const item of (items as any[]) || []) {
          const gjv = item.generation_job_variants;
          const url = gjv?.generation_jobs?.cover_art_url || gjv?.thumbnail_url || gjv?.output_url;
          if (url && !coverUrls.includes(url)) {
            coverUrls.push(url);
            if (coverUrls.length >= 4) break;
          }
        }

        return {
          id: p.id,
          user_id: p.user_id,
          name: p.name,
          tags: p.tags || [],
          position: p.position || 0,
          item_count: (items || []).length,
          cover_urls: coverUrls,
          deleted_at: p.deleted_at,
          created_at: p.created_at,
          updated_at: p.updated_at,
        };
      })
    );
    return results;
  }

  // Mock store fallback
  const userPlaylists: Playlist[] = [];
  for (const p of mockPlaylists.values()) {
    if (p.user_id === userId && !p.deleted_at) {
      const pItems = mockPlaylistItems.get(p.id) || [];
      // Filter out trashed variants
      const activeItems = pItems.filter((item) => {
        for (const [jobId, vList] of mockVariants.entries()) {
          const v = vList.find((cand) => cand.id === item.variant_id);
          if (v && !v.deleted_at && !v.purged_at) {
            const job = mockJobs.get(jobId);
            return !!job && !job.deleted_at;
          }
        }
        return false;
      });

      const coverUrls: string[] = [];
      for (const item of activeItems) {
        for (const [jobId, vList] of mockVariants.entries()) {
          const v = vList.find((cand) => cand.id === item.variant_id);
          if (v && !v.deleted_at && !v.purged_at) {
            const job = mockJobs.get(jobId);
            const url = job?.cover_art_url || v.thumbnail_url || v.output_url;
            if (url && !coverUrls.includes(url)) {
              coverUrls.push(url);
              if (coverUrls.length >= 4) break;
            }
          }
        }
      }

      userPlaylists.push({
        ...p,
        item_count: activeItems.length,
        cover_urls: coverUrls,
      });
    }
  }

  return userPlaylists.sort((a, b) => (a.position - b.position) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * POST /api/playlists
 * Creates a playlist and, if variantId is provided, adds the track in the same call.
 */
export async function createPlaylist(
  userId: string,
  input: { name: string; tags?: string[]; variantId?: string }
): Promise<Playlist> {
  const trimmedName = validatePlaylistName(input.name);
  const cleanTags = sanitizePlaylistTags(input.tags);

  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;

    // 1. Check duplicate name for user (case-insensitive)
    const { data: existing, error: existErr } = await admin
      .from('playlists')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .ilike('name', trimmedName);

    if (existErr) {
      console.error('[DB] createPlaylist check duplicate error:', existErr.message);
      throw existErr;
    }

    if (existing && existing.length > 0) {
      const err: any = new Error('You already have a playlist with that name');
      err.status = 409;
      err.code = 'PLAYLIST_NAME_TAKEN';
      throw err;
    }

    // 2. If variantId given, verify it is music and belongs to user
    let coverUrl: string | null = null;
    if (input.variantId) {
      const { data: vRow, error: vErr } = await admin
        .from('generation_job_variants')
        .select(`
          id, user_id, thumbnail_url, output_url, deleted_at,
          generation_jobs!inner(media_type, cover_art_url, deleted_at)
        `)
        .eq('id', input.variantId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .is('generation_jobs.deleted_at', null)
        .maybeSingle();

      if (vErr || !vRow) {
        const err: any = new Error('Variant not found');
        err.status = 404;
        err.code = 'VARIANT_NOT_FOUND';
        throw err;
      }

      const mediaType = (vRow as any).generation_jobs?.media_type;
      if (mediaType !== 'music') {
        const err: any = new Error('Playlists can only contain music tracks');
        err.status = 400;
        err.code = 'PLAYLIST_MUSIC_ONLY';
        throw err;
      }

      coverUrl = (vRow as any).generation_jobs?.cover_art_url || vRow.thumbnail_url || vRow.output_url || null;
    }

    // 3. Create playlist
    const now = new Date().toISOString();
    const { data: newPlaylist, error: createErr } = await admin
      .from('playlists')
      .insert({
        user_id: userId,
        name: trimmedName,
        tags: cleanTags,
        position: 0,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (createErr || !newPlaylist) {
      throw new Error(createErr?.message || 'Failed to create playlist');
    }

    // 4. Add variantId if provided
    if (input.variantId) {
      const { error: itemErr } = await admin.from('playlist_items').insert({
        playlist_id: newPlaylist.id,
        variant_id: input.variantId,
        user_id: userId,
        position: 0,
      });
      if (itemErr) {
        throw new Error(itemErr.message);
      }
    }

    return {
      id: newPlaylist.id,
      user_id: newPlaylist.user_id,
      name: newPlaylist.name,
      tags: newPlaylist.tags || [],
      position: newPlaylist.position || 0,
      item_count: input.variantId ? 1 : 0,
      cover_urls: coverUrl ? [coverUrl] : [],
      deleted_at: null,
      created_at: newPlaylist.created_at,
      updated_at: newPlaylist.updated_at,
    };
  }

  // Mock store fallback
  // Check duplicate name
  for (const p of mockPlaylists.values()) {
    if (p.user_id === userId && !p.deleted_at && p.name.trim().toLowerCase() === trimmedName.toLowerCase()) {
      const err: any = new Error('You already have a playlist with that name');
      err.status = 409;
      err.code = 'PLAYLIST_NAME_TAKEN';
      throw err;
    }
  }

  // If variantId given, verify it is music
  let coverUrl: string | null = null;
  if (input.variantId) {
    let found = false;
    for (const [jobId, vList] of mockVariants.entries()) {
      const v = vList.find((item) => item.id === input.variantId);
      if (v && (v.user_id === userId || userId === 'usr_amina_01') && !v.deleted_at) {
        const job = mockJobs.get(jobId);
        if (job && !job.deleted_at) {
          const mType = (job.type || (job as any).media_type);
          if (mType !== 'music') {
            const err: any = new Error('Playlists can only contain music tracks');
            err.status = 400;
            err.code = 'PLAYLIST_MUSIC_ONLY';
            throw err;
          }
          coverUrl = job.cover_art_url || v.thumbnail_url || v.output_url || null;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      const err: any = new Error('Variant not found');
      err.status = 404;
      err.code = 'VARIANT_NOT_FOUND';
      throw err;
    }
  }

  const playlistId = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const newPlaylist: Playlist = {
    id: playlistId,
    user_id: userId,
    name: trimmedName,
    tags: cleanTags,
    position: 0,
    item_count: input.variantId ? 1 : 0,
    cover_urls: coverUrl ? [coverUrl] : [],
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  mockPlaylists.set(playlistId, newPlaylist);

  if (input.variantId) {
    mockPlaylistItems.set(playlistId, [
      {
        id: `pli_${Date.now()}`,
        playlist_id: playlistId,
        variant_id: input.variantId,
        user_id: userId,
        position: 0,
        added_at: now,
      },
    ]);
  } else {
    mockPlaylistItems.set(playlistId, []);
  }

  return newPlaylist;
}

/**
 * PATCH /api/playlists/:id
 * Renames or updates tags of a playlist.
 */
export async function updatePlaylist(
  userId: string,
  playlistId: string,
  patch: { name?: string; tags?: string[] }
): Promise<Playlist> {
  const updateData: any = { updated_at: new Date().toISOString() };

  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;

    if (patch.name !== undefined) {
      const trimmed = validatePlaylistName(patch.name);
      // Case-insensitive duplicate check
      const { data: existing, error: existErr } = await admin
        .from('playlists')
        .select('id')
        .eq('user_id', userId)
        .neq('id', playlistId)
        .is('deleted_at', null)
        .ilike('name', trimmed);

      if (existErr) throw existErr;

      if (existing && existing.length > 0) {
        const err: any = new Error('You already have a playlist with that name');
        err.status = 409;
        err.code = 'PLAYLIST_NAME_TAKEN';
        throw err;
      }
      updateData.name = trimmed;
    }

    if (patch.tags !== undefined) {
      updateData.tags = sanitizePlaylistTags(patch.tags);
    }

    const { data, error } = await admin
      .from('playlists')
      .update(updateData)
      .eq('id', playlistId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !data) {
      const err: any = new Error('Playlist not found');
      err.status = 404;
      err.code = 'PLAYLIST_NOT_FOUND';
      throw err;
    }
    return data as Playlist;
  }

  if (patch.name !== undefined) {
    const trimmed = validatePlaylistName(patch.name);
    for (const p of mockPlaylists.values()) {
      if (p.user_id === userId && p.id !== playlistId && !p.deleted_at && p.name.trim().toLowerCase() === trimmed.toLowerCase()) {
        const err: any = new Error('You already have a playlist with that name');
        err.status = 409;
        err.code = 'PLAYLIST_NAME_TAKEN';
        throw err;
      }
    }
    updateData.name = trimmed;
  }

  if (patch.tags !== undefined) {
    updateData.tags = sanitizePlaylistTags(patch.tags);
  }

  const p = mockPlaylists.get(playlistId);
  if (!p || p.user_id !== userId || p.deleted_at) {
    const err: any = new Error('Playlist not found');
    err.status = 404;
    err.code = 'PLAYLIST_NOT_FOUND';
    throw err;
  }

  if (updateData.name) p.name = updateData.name;
  if (updateData.tags) p.tags = updateData.tags;
  p.updated_at = updateData.updated_at;

  return p;
}

/**
 * DELETE /api/playlists/:id
 * Removes the playlist and its join rows only — never the tracks.
 */
export async function deletePlaylist(userId: string, playlistId: string): Promise<void> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    // Delete join rows
    const { error: itemsErr } = await admin.from('playlist_items').delete().eq('playlist_id', playlistId).eq('user_id', userId);
    if (itemsErr) throw itemsErr;

    // Soft-delete playlist
    const { error } = await admin
      .from('playlists')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', playlistId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return;
  }

  mockPlaylistItems.delete(playlistId);
  const p = mockPlaylists.get(playlistId);
  if (p && p.user_id === userId) {
    p.deleted_at = new Date().toISOString();
  }
}

/**
 * GET /api/playlists/:id/items
 * Returns ordered, non-trashed variants with full track metadata.
 */
export async function getPlaylistItems(userId: string, playlistId: string): Promise<PlaylistItem[]> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    // Verify playlist belongs to user
    const { data: p, error: pErr } = await admin
      .from('playlists')
      .select('id')
      .eq('id', playlistId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (pErr || !p) {
      const err: any = new Error('Playlist not found');
      err.status = 404;
      err.code = 'PLAYLIST_NOT_FOUND';
      throw err;
    }

    const { data: items, error } = await admin
      .from('playlist_items')
      .select(`
        id, playlist_id, variant_id, user_id, position, added_at,
        generation_job_variants!inner(
          id, job_id, user_id, variant_index, status, output_url, thumbnail_url,
          credits_unit, created_at, completed_at, deleted_at,
          generation_jobs!inner(
            id, prompt, model_name, aspect_ratio, resolution, duration_seconds,
            genre, cover_art_url, media_type, deleted_at
          )
        )
      `)
      .eq('playlist_id', playlistId)
      .is('generation_job_variants.deleted_at', null)
      .is('generation_job_variants.generation_jobs.deleted_at', null)
      .order('position', { ascending: true })
      .order('added_at', { ascending: true });

    if (error) {
      console.error('[DB] getPlaylistItems Supabase error:', error.message);
      throw error;
    }

    return (items || []).map((row: any) => ({
      id: row.id,
      playlist_id: row.playlist_id,
      variant_id: row.variant_id,
      user_id: row.user_id,
      position: row.position,
      added_at: row.added_at,
      variant: row.generation_job_variants,
      job: row.generation_job_variants?.generation_jobs,
    }));
  }

  // Mock store fallback
  const p = mockPlaylists.get(playlistId);
  if (!p || p.user_id !== userId || p.deleted_at) {
    const err: any = new Error('Playlist not found');
    err.status = 404;
    err.code = 'PLAYLIST_NOT_FOUND';
    throw err;
  }

  const pItems = mockPlaylistItems.get(playlistId) || [];
  const results: PlaylistItem[] = [];

  for (const item of pItems) {
    for (const [jobId, vList] of mockVariants.entries()) {
      const v = vList.find((cand) => cand.id === item.variant_id);
      if (v && !v.deleted_at && !v.purged_at) {
        const job = mockJobs.get(jobId);
        if (job && !job.deleted_at) {
          results.push({
            ...item,
            variant: v,
            job: job,
          });
          break;
        }
      }
    }
  }

  return results.sort((a, b) => a.position - b.position || new Date(a.added_at).getTime() - new Date(b.added_at).getTime());
}

/**
 * POST /api/playlists/:id/items
 * Idempotently adds variantIds to playlist. Validates variants are music.
 */
export async function addPlaylistItems(
  userId: string,
  playlistId: string,
  variantIds: string[]
): Promise<PlaylistItem[]> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    // 1. Verify playlist belongs to user
    const { data: p, error: pErr } = await admin
      .from('playlists')
      .select('id')
      .eq('id', playlistId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (pErr || !p) {
      const err: any = new Error('Playlist not found');
      err.status = 404;
      err.code = 'PLAYLIST_NOT_FOUND';
      throw err;
    }

    // 2. Validate all variants are music and belong to user
    for (const vid of variantIds) {
      const { data: vRow, error: vErr } = await admin
        .from('generation_job_variants')
        .select(`
          id, user_id, deleted_at,
          generation_jobs!inner(media_type, deleted_at)
        `)
        .eq('id', vid)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .is('generation_jobs.deleted_at', null)
        .maybeSingle();

      if (vErr || !vRow) {
        const err: any = new Error(`Variant ${vid} not found`);
        err.status = 404;
        err.code = 'VARIANT_NOT_FOUND';
        throw err;
      }

      const mediaType = (vRow as any).generation_jobs?.media_type;
      if (mediaType !== 'music') {
        const err: any = new Error('Playlists can only contain music tracks');
        err.status = 400;
        err.code = 'PLAYLIST_MUSIC_ONLY';
        throw err;
      }

      // Insert join row idempotently
      const { error: upsertErr } = await admin.from('playlist_items').upsert(
        {
          playlist_id: playlistId,
          variant_id: vid,
          user_id: userId,
        },
        { onConflict: 'playlist_id,variant_id' }
      );
      if (upsertErr) {
        throw upsertErr;
      }
    }

    await admin.from('playlists').update({ updated_at: new Date().toISOString() }).eq('id', playlistId);
    return getPlaylistItems(userId, playlistId);
  }

  // Mock store fallback
  const p = mockPlaylists.get(playlistId);
  if (!p || p.user_id !== userId || p.deleted_at) {
    const err: any = new Error('Playlist not found');
    err.status = 404;
    err.code = 'PLAYLIST_NOT_FOUND';
    throw err;
  }

  let existingItems = mockPlaylistItems.get(playlistId) || [];

  for (const vid of variantIds) {
    let found = false;
    for (const [jobId, vList] of mockVariants.entries()) {
      const v = vList.find((item) => item.id === vid);
      if (v && (v.user_id === userId || userId === 'usr_amina_01') && !v.deleted_at) {
        const job = mockJobs.get(jobId);
        if (job && !job.deleted_at) {
          const mType = (job.type || (job as any).media_type);
          if (mType !== 'music') {
            const err: any = new Error('Playlists can only contain music tracks');
            err.status = 400;
            err.code = 'PLAYLIST_MUSIC_ONLY';
            throw err;
          }
          found = true;
          break;
        }
      }
    }

    if (!found) {
      const err: any = new Error(`Variant ${vid} not found`);
      err.status = 404;
      err.code = 'VARIANT_NOT_FOUND';
      throw err;
    }

    // Check if already in playlist (idempotent)
    if (!existingItems.some((item) => item.variant_id === vid)) {
      existingItems.push({
        id: `pli_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        playlist_id: playlistId,
        variant_id: vid,
        user_id: userId,
        position: existingItems.length,
        added_at: new Date().toISOString(),
      });
    }
  }

  mockPlaylistItems.set(playlistId, existingItems);
  p.updated_at = new Date().toISOString();
  return getPlaylistItems(userId, playlistId);
}

/**
 * DELETE /api/playlists/:id/items/:variantId
 * Removes a track from a playlist.
 */
export async function removePlaylistItem(
  userId: string,
  playlistId: string,
  variantId: string
): Promise<void> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    const { error } = await admin
      .from('playlist_items')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('variant_id', variantId)
      .eq('user_id', userId);

    if (error) throw error;

    await admin.from('playlists').update({ updated_at: new Date().toISOString() }).eq('id', playlistId);
    return;
  }

  const items = mockPlaylistItems.get(playlistId) || [];
  mockPlaylistItems.set(playlistId, items.filter((item) => item.variant_id !== variantId));
  const p = mockPlaylists.get(playlistId);
  if (p) p.updated_at = new Date().toISOString();
}

/**
 * POST /api/playlists/:id/reorder
 * Reorders items in a playlist.
 */
export async function reorderPlaylistItems(
  userId: string,
  playlistId: string,
  variantIds: string[]
): Promise<void> {
  if (isLiveMode()) {
    const admin = getSupabaseAdmin()!;
    for (let i = 0; i < variantIds.length; i++) {
      const { error } = await admin
        .from('playlist_items')
        .update({ position: i })
        .eq('playlist_id', playlistId)
        .eq('variant_id', variantIds[i])
        .eq('user_id', userId);
      if (error) throw error;
    }
    await admin.from('playlists').update({ updated_at: new Date().toISOString() }).eq('id', playlistId);
    return;
  }

  const items = mockPlaylistItems.get(playlistId) || [];
  const map = new Map<string, PlaylistItem>();
  items.forEach((it) => map.set(it.variant_id, it));

  const reordered: PlaylistItem[] = [];
  variantIds.forEach((vid, idx) => {
    const it = map.get(vid);
    if (it) {
      it.position = idx;
      reordered.push(it);
    }
  });

  mockPlaylistItems.set(playlistId, reordered);
  const p = mockPlaylists.get(playlistId);
  if (p) p.updated_at = new Date().toISOString();
}


