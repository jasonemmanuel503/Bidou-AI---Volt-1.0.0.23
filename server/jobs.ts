import { GenerationJob, GenerationJobVariant } from '../src/types';
import { executeImageGeneration } from './providers/imagen';
import { startVeoVariants, pollVeoOperation } from './providers/veo';
import { startMusicTask, pollMusicTask } from './providers/musicapi';
import { GenerationTaskContext } from './providers/types';
import {
  getJobWithVariants,
  updateJobVariant,
  updateJob,
  settleJobReservation,
  getSupabaseAdmin,
  getInMemoryActiveJobs,
} from './db';
import { isLiveMode } from './config/mode';
import { updateLedgerCreditsCharged, markFailed, markSucceeded } from './costLedger';

// NOTE: Assumes a single server instance; horizontal scaling needs a DB lease so two instances do not poll the same job.
// Active in-process AbortControllers for cancellation support
const activeAbortControllers = new Map<string, AbortController>();

// Active jobs being polled
interface TrackedJob {
  jobId: string;
  userId: string;
  type: string;
  startedAt: number;
}
const trackedActiveJobs = new Map<string, TrackedJob>();

/**
 * Registers an AbortController for a job.
 */
export function registerJobAbortController(jobId: string): AbortController {
  const controller = new AbortController();
  activeAbortControllers.set(jobId, controller);
  return controller;
}

/**
 * Cancels an active job.
 */
export async function cancelActiveJob(jobId: string, userId: string): Promise<boolean> {
  const controller = activeAbortControllers.get(jobId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(jobId);
  }

  const { job, variants } = await getJobWithVariants(jobId);
  if (!job || job.user_id !== userId) {
    return false;
  }

  if (job.status === 'completed' || job.status === 'cancelled') {
    return true;
  }

  // Mark all incomplete variants as cancelled
  for (const v of variants) {
    if (v.status === 'queued' || v.status === 'processing') {
      await updateJobVariant(jobId, v.variant_index, {
        status: 'cancelled',
        error_message: 'Cancelled by user request',
      });
    }
  }

  // Immediately settle whatever finished
  await finalizeAndSettleJob(jobId, 'User cancelled job');
  return true;
}

/**
 * Dispatches background generation variants according to provider.
 */
export async function dispatchJobVariants(
  job: GenerationJob,
  variants: GenerationJobVariant[],
  ctx: GenerationTaskContext
): Promise<void> {
  const controller = registerJobAbortController(job.id);
  ctx.abortSignal = controller.signal;

  try {
    // Write status: 'processing' to both the job row and each variant row immediately before provider call fires
    await updateJob(job.id, { status: 'processing' });
    for (const v of variants) {
      await updateJobVariant(job.id, v.variant_index, {
        status: 'processing',
        started_at: new Date().toISOString(),
      });
    }

    if (job.type === 'image') {
      // Synchronous image dispatch
      const results = await executeImageGeneration(ctx);
      for (let i = 0; i < variants.length; i++) {
        const res = results[i];
        if (res) {
          await updateJobVariant(job.id, i, {
            status: res.status,
            output_url: res.outputUrl,
            thumbnail_url: res.thumbnailUrl,
            storage_path: res.storagePath || `${job.user_id}/${job.id}/${i}.png`,
            error_message: res.errorMessage,
            supplier: res.supplier,
            upstream_model: res.upstreamModel,
            simulated: Boolean(res.simulated),
            completed_at: new Date().toISOString(),
          } as any);
        }
      }
      await finalizeAndSettleJob(job.id, 'Image batch complete');
      activeAbortControllers.delete(job.id);
      return;
    }

    if (job.type === 'video') {
      // Asynchronous Veo / Wan LRO
      const results = await startVeoVariants(ctx);
      for (let i = 0; i < variants.length; i++) {
        const res = results[i];
        if (res) {
          await updateJobVariant(job.id, i, {
            status: res.status,
            provider_job_id: res.providerJobId,
            error_message: res.errorMessage,
            supplier: res.supplier,
            upstream_model: res.upstreamModel,
            simulated: Boolean(res.simulated),
            started_at: new Date().toISOString(),
            ...(res.status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
          } as any);
        }
      }

      if (results.length > 0 && results.every((r) => r.status === 'failed')) {
        await finalizeAndSettleJob(job.id, results[0]?.errorMessage || 'Video dispatch failed');
        activeAbortControllers.delete(job.id);
        return;
      }

      trackedActiveJobs.set(job.id, {
        jobId: job.id,
        userId: job.user_id,
        type: 'video',
        startedAt: Date.now(),
      });
      return;
    }

    if (job.type === 'music') {
      // Asynchronous MusicAPI (Sonic v4.5 / Sonic v5) or Sunor task
      const results = await startMusicTask(ctx);
      for (let i = 0; i < variants.length; i++) {
        const res = results[i];
        if (res) {
          await updateJobVariant(job.id, i, {
            status: res.status,
            provider_job_id: res.providerJobId,
            error_message: res.errorMessage,
            supplier: res.supplier || 'musicapi',
            upstream_model: res.upstreamModel || ctx.model.model_name,
            simulated: Boolean(res.simulated),
            started_at: new Date().toISOString(),
            ...(res.status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
          } as any);
        }
      }

      if (results.length > 0 && results.every((r) => r.status === 'failed')) {
        await finalizeAndSettleJob(job.id, results[0]?.errorMessage || 'Music dispatch failed');
        activeAbortControllers.delete(job.id);
        return;
      }

      trackedActiveJobs.set(job.id, {
        jobId: job.id,
        userId: job.user_id,
        type: 'music',
        startedAt: Date.now(),
      });
      return;
    }
  } catch (err: any) {
    console.error(`[Job Engine] Unexpected failure during dispatch for job ${job.id}:`, err);
    for (const v of variants) {
      await updateJobVariant(job.id, v.variant_index, {
        status: 'failed',
        error_message: err?.message || 'Dispatch failed',
      });
    }
    await finalizeAndSettleJob(job.id, 'Dispatch failed exception');
    activeAbortControllers.delete(job.id);
  }
}

/**
 * Settles reservation and marks job finalized.
 * Charge only for variants that actually rendered (status === 'completed').
 * Automatically refund the rest.
 */
export async function finalizeAndSettleJob(jobId: string, reason: string): Promise<void> {
  const { job, variants } = await getJobWithVariants(jobId);
  if (!job) return;

  // Idempotency: don't re-settle already finalized job
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return;
  }

  const succeededVariants = variants.filter((v) => v.status === 'completed');
  const succeededCount = succeededVariants.length;
  const unitCost = variants[0]?.credits_unit || Math.round((job.credits_reserved || 0) / Math.max(1, variants.length));
  const consumedAmount = succeededCount * unitCost;

  if (job.reservation_id) {
    await settleJobReservation({
      reservationId: job.reservation_id,
      jobId: job.id,
      userId: job.user_id,
      consumedAmount,
      reason: `${reason}: ${succeededCount}/${variants.length} variants rendered`,
    });
  }

  if (job.type === 'music') {
    const musicSupplier = variants[0]?.supplier || 'musicapi';
    await updateLedgerCreditsCharged(job.id, 0, musicSupplier, consumedAmount);
    if (succeededCount === 0) {
      await markFailed(job.id, 0, musicSupplier, reason);
    } else {
      await markSucceeded(job.id, 0, musicSupplier);
    }
  }

  const newStatus = succeededCount > 0 ? 'completed' : 'failed';
  const completedAt = new Date().toISOString();
  const outputUrls = succeededVariants.map((v) => v.output_url).filter(Boolean) as string[];
  const variantThumb = succeededVariants.find((v) => v.thumbnail_url)?.thumbnail_url || null;
  const thumbnailUrl = variantThumb || (job.type === 'music' ? null : outputUrls[0] || null);
  const resolvedCoverArt = job.cover_art_url || (job.type === 'music' ? variantThumb : null);
  const errorMessage = succeededCount === 0 ? reason : null;

  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      await admin
        .from('generation_jobs')
        .update({
          status: newStatus,
          credits_consumed: consumedAmount,
          credits_refunded: (job.credits_reserved || 0) - consumedAmount,
          completed_at: completedAt,
          output_urls: outputUrls,
          thumbnail_url: thumbnailUrl,
          ...(resolvedCoverArt ? { cover_art_url: resolvedCoverArt } : {}),
          error_message: errorMessage,
        })
        .eq('id', jobId);
    } catch (err) {
      console.warn('[Job Engine] Supabase update job status warning:', err);
    }
  }

  job.status = newStatus;
  job.credits_consumed = consumedAmount;
  job.credits_refunded = (job.credits_reserved || 0) - consumedAmount;
  job.completed_at = completedAt;
  job.output_urls = outputUrls;
  job.thumbnail_url = thumbnailUrl || undefined;
  if (resolvedCoverArt) {
    job.cover_art_url = resolvedCoverArt;
  }
  job.error_message = errorMessage || undefined;

  trackedActiveJobs.delete(jobId);
  activeAbortControllers.delete(jobId);
}

// Background polling loop for asynchronous jobs (Veo and MusicAPI)
const POLLING_INTERVAL_MS = 10 * 1000; // 10 seconds
const ORPHAN_RECOVERY_INTERVAL_MS = 60 * 1000; // 60 seconds
const MAX_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes timeout

let pollTimer: NodeJS.Timeout | null = null;
let lastOrphanRecovery = 0;

export function clearTrackedActiveJobs(): void {
  trackedActiveJobs.clear();
}

export function isJobTrackedActive(jobId: string): boolean {
  return trackedActiveJobs.has(jobId);
}

/**
 * Assumes a single server instance; horizontal scaling needs a DB lease so two instances do not poll the same job.
 * Recovers in-flight video/music/image jobs after server restarts or redeploys.
 */
export async function recoverOrphanedJobs(): Promise<void> {
  try {
    let rows: Array<{ id: string; type?: string; media_type?: string; created_at?: string; status?: string }> = [];

    if (isLiveMode()) {
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data, error } = await admin
          .from('generation_jobs')
          .select('id, media_type, created_at, status')
          .in('status', ['queued', 'processing'])
          .order('created_at', { ascending: true })
          .limit(200);

        if (error) {
          console.error('[Orphan Recovery] Error querying generation_jobs for orphan recovery:', error);
        } else if (Array.isArray(data)) {
          rows = data;
        }
      }
    } else {
      rows = getInMemoryActiveJobs();
    }

    if (!rows || rows.length === 0) {
      return;
    }

    const now = Date.now();

    for (const row of rows) {
      const jobId = row.id;
      if (trackedActiveJobs.has(jobId)) {
        continue;
      }

      const { job, variants } = await getJobWithVariants(jobId);
      if (!job || (job.status !== 'queued' && job.status !== 'processing')) {
        continue;
      }

      const jobCreatedAt = job.created_at ? Date.parse(job.created_at) : now;
      const jobAge = now - jobCreatedAt;

      // 1. A job older than MAX_TIMEOUT_MS (30 minutes)
      if (jobAge > MAX_TIMEOUT_MS) {
        console.warn(`[Orphan Recovery] Job ${jobId} timed out after 30+ minutes (${jobAge}ms). Failing non-terminal variants.`);
        for (const v of variants) {
          if (v.status === 'queued' || v.status === 'processing') {
            await updateJobVariant(jobId, v.variant_index, {
              status: 'failed',
              error_message: 'PROVIDER_TIMEOUT',
            });
          }
        }
        await finalizeAndSettleJob(jobId, 'PROVIDER_TIMEOUT');
        continue;
      }

      // 2. An image job older than 5 minutes (image dispatch is synchronous and cannot resume)
      if (job.type === 'image') {
        if (jobAge > 5 * 60 * 1000) {
          console.warn(`[Orphan Recovery] Image job ${jobId} older than 5 minutes found after restart. Failing non-terminal variants.`);
          for (const v of variants) {
            if (v.status === 'queued' || v.status === 'processing') {
              await updateJobVariant(jobId, v.variant_index, {
                status: 'failed',
                error_message: 'DISPATCH_INTERRUPTED',
              });
            }
          }
          await finalizeAndSettleJob(jobId, 'DISPATCH_INTERRUPTED');
        }
        continue;
      }

      // 3. Video / Music jobs
      if (job.type === 'video' || job.type === 'music') {
        const nonTerminalVariants = variants.filter(
          (v) => v.status === 'queued' || v.status === 'processing'
        );

        if (nonTerminalVariants.length === 0) {
          await finalizeAndSettleJob(jobId, 'All variants resolved');
          continue;
        }

        let hasActiveProviderJob = false;
        for (const v of nonTerminalVariants) {
          if (v.provider_job_id) {
            hasActiveProviderJob = true;
          } else {
            // video/music variant without provider_job_id older than 2 minutes
            const variantAge = v.started_at ? (now - Date.parse(v.started_at)) : jobAge;
            if (variantAge > 2 * 60 * 1000) {
              console.warn(`[Orphan Recovery] Variant ${v.variant_index} of job ${jobId} has no provider_job_id and is older than 2 minutes. Failing.`);
              await updateJobVariant(jobId, v.variant_index, {
                status: 'failed',
                error_message: 'DISPATCH_INTERRUPTED',
              });
            }
          }
        }

        if (hasActiveProviderJob) {
          // Register in trackedActiveJobs with startedAt = Date.parse(job.created_at) so existing 30-minute timeout still applies
          trackedActiveJobs.set(job.id, {
            jobId: job.id,
            userId: job.user_id,
            type: job.type,
            startedAt: jobCreatedAt,
          });
          console.log(`[Orphan Recovery] Re-adopted in-flight ${job.type} job ${job.id} into trackedActiveJobs.`);
        } else {
          // Check if all variants are now terminal
          const refreshed = await getJobWithVariants(jobId);
          const stillNonTerminal = refreshed.variants.filter(
            (v) => v.status === 'queued' || v.status === 'processing'
          );
          if (stillNonTerminal.length === 0) {
            await finalizeAndSettleJob(jobId, 'DISPATCH_INTERRUPTED');
          }
        }
      }
    }
  } catch (err) {
    console.error('[Orphan Recovery] Unexpected error during recovery:', err);
  }
}

export async function pollActiveJobsOnce(): Promise<void> {
  const now = Date.now();

  if (trackedActiveJobs.size === 0) return;

  for (const [jobId, tracked] of Array.from(trackedActiveJobs.entries())) {
    try {
      const { job, variants } = await getJobWithVariants(jobId);
      if (!job) {
        trackedActiveJobs.delete(jobId);
        continue;
      }

      const jobCreatedAt = job.created_at ? Date.parse(job.created_at) : tracked.startedAt;
      const effectiveStart = Math.min(tracked.startedAt, jobCreatedAt);

      // Check for 30-minute timeout
      if (now - effectiveStart > MAX_TIMEOUT_MS) {
        console.warn(`[Job Poller] Job ${jobId} timed out after 30 minutes.`);
        for (const v of variants) {
          if (v.status === 'queued' || v.status === 'processing') {
            await updateJobVariant(jobId, v.variant_index, {
              status: 'failed',
              error_message: 'PROVIDER_TIMEOUT',
            });
          }
        }
        await finalizeAndSettleJob(jobId, 'PROVIDER_TIMEOUT');
        continue;
      }

      // Poll each variant that is still processing
      let allFinished = true;
      for (const v of variants) {
        if (v.status === 'processing' || v.status === 'queued') {
          if (!v.provider_job_id) {
            const variantAge = now - (v.started_at ? Date.parse(v.started_at) : effectiveStart);
            if (variantAge > 2 * 60 * 1000) {
              console.warn(`[Job Poller] Variant ${v.variant_index} of job ${jobId} has no provider_job_id and is older than 2 minutes. Failing.`);
              await updateJobVariant(jobId, v.variant_index, {
                status: 'failed',
                error_message: 'DISPATCH_INTERRUPTED',
              });
            } else {
              allFinished = false;
            }
            continue;
          }

          let result: any = null;
          if (tracked.type === 'video') {
            result = await pollVeoOperation({
              operationName: v.provider_job_id,
              userId: job.user_id,
              jobId: job.id,
              variantIndex: v.variant_index,
            });
          } else if (tracked.type === 'music') {
            result = await pollMusicTask({
              providerJobId: v.provider_job_id,
              userId: job.user_id,
              jobId: job.id,
              variantIndex: v.variant_index,
            });
          }

          if (result && result.status !== 'processing') {
            await updateJobVariant(jobId, v.variant_index, {
              status: result.status,
              output_url: result.outputUrl,
              thumbnail_url: result.thumbnailUrl,
              storage_path:
                result.storagePath ||
                (tracked.type === 'video'
                  ? `${job.user_id}/${job.id}/${v.variant_index}.mp4`
                  : undefined),
              error_message: result.errorMessage,
              ...(result.supplier ? { supplier: result.supplier } : {}),
              ...(result.upstreamModel ? { upstream_model: result.upstreamModel } : {}),
              ...(result.simulated !== undefined ? { simulated: Boolean(result.simulated) } : {}),
              completed_at: new Date().toISOString(),
            } as any);

            if (
              tracked.type === 'music' &&
              result.status === 'completed' &&
              (result.durationSeconds || result.thumbnailUrl)
            ) {
              await updateJob(jobId, {
                ...(result.durationSeconds ? { duration_seconds: result.durationSeconds } : {}),
                ...(!job.cover_art_url && result.thumbnailUrl ? { cover_art_url: result.thumbnailUrl } : {}),
              });
            }
          } else {
            allFinished = false;
          }
        }
      }

      if (allFinished) {
        await finalizeAndSettleJob(jobId, 'All variants resolved');
      }
    } catch (pollErr) {
      console.error(`[Job Poller] Error polling job ${jobId}:`, pollErr);
    }
  }
}

export function startBackgroundPoller() {
  if (pollTimer) return;

  pollTimer = setInterval(async () => {
    const now = Date.now();

    // Check orphan recovery every 60 seconds inside poller interval
    if (now - lastOrphanRecovery >= ORPHAN_RECOVERY_INTERVAL_MS) {
      lastOrphanRecovery = now;
      recoverOrphanedJobs().catch((err) => {
        console.error('[Job Poller] Periodic recoverOrphanedJobs error:', err);
      });
    }

    await pollActiveJobsOnce();
  }, POLLING_INTERVAL_MS);
}
