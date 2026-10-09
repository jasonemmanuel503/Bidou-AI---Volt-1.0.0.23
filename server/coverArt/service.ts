/**
 * server/coverArt/service.ts
 *
 * Plain-language summary:
 * Orchestration engine for AI Cover Art v2:
 * 1. Debits user credits (240 for Standard, 500 for Pro).
 * 2. Launches 2 parallel version generations (art director -> engine -> quality gate -> compositor).
 * 3. Enforces single retry on quality gate failure.
 * 4. Automatically refunds full credits if generation fails (fixing the money bug).
 * 5. Saves 3000x3000 JPEG covers, 640x640 thumbnails, and textless masters.
 * 6. Supports free instant re-compositing of title, artist, font, and layout.
 */

import crypto from 'crypto';
import { debitCredits, refundCredits, getUserWallet } from '../db';
import { saveGenerationAsset } from '../storage';
import {
  COVER_ART_TIERS,
  CoverArtJobDto,
  CoverArtTierId,
  CoverArtVersionDto,
  CreateCoverArtRequest,
  RecompositeRequest,
} from '../../src/services/coverArtCatalog';
import { getRecipe } from './recipes';
import { generateArtDirectorPrompt } from './artDirector';
import { executeEngineVariant } from './engines';
import { inspectArtworkQuality } from './qualityGate';
import { compositeCoverArt } from './compositor';

// In-memory registry of active and completed cover art jobs
const coverArtJobs = new Map<string, CoverArtJobDto>();

// Textless buffers cache for instant free re-compositing
const textlessMastersCache = new Map<string, { v0: Buffer; v1: Buffer }>();

export function getCoverArtJob(jobId: string): CoverArtJobDto | null {
  return coverArtJobs.get(jobId) || null;
}

export function listUserCoverArtJobs(userId: string): CoverArtJobDto[] {
  const list: CoverArtJobDto[] = [];
  for (const job of coverArtJobs.values()) {
    if ((job as any).userId === userId) {
      list.push(job);
    }
  }
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Creates and queues a new cover art generation job.
 */
export async function createCoverArtJob(
  userId: string,
  request: CreateCoverArtRequest
): Promise<CoverArtJobDto> {
  const tierConfig = COVER_ART_TIERS[request.tier] || COVER_ART_TIERS.standard;
  const creditCost = tierConfig.creditCost;
  const jobId = `cover_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const refId = `ref_${jobId}`;

  // 1. Debit wallet
  try {
    await debitCredits({
      userId,
      amount: creditCost,
      referenceId: refId,
      description: `Cover Art (${tierConfig.name} - 2 Versions)`,
    });
  } catch (creditErr: any) {
    if (creditErr?.message?.includes('INSUFFICIENT_CREDITS')) {
      const wallet = await getUserWallet(userId);
      const err: any = new Error('INSUFFICIENT_CREDITS');
      err.status = 402;
      err.required = creditCost;
      err.available = wallet?.balance ?? 0;
      throw err;
    }
    throw creditErr;
  }

  // 2. Initialize Job Record
  const now = new Date().toISOString();
  const jobRecord: CoverArtJobDto & { userId: string } = {
    id: jobId,
    userId,
    status: 'processing',
    tier: request.tier,
    title: request.title || 'Untitled Single',
    artistName: request.artistName || 'Bidou Artist',
    genre: request.genre || 'Afrobeats',
    styleId: request.styleId || 'afrobeats-vibrant',
    fontId: request.fontId || 'urban-bold',
    layoutId: request.layoutId || 'bottom-centered',
    creditCost,
    versions: [],
    selectedVersionIndex: null,
    selectedCoverUrl: null,
    createdAt: now,
    updatedAt: now,
  };

  coverArtJobs.set(jobId, jobRecord);

  // 3. Process asynchronously in the background
  processCoverArtJobAsync(jobRecord, request, refId).catch((err) => {
    console.error(`[CoverArt Service] Unhandled error processing job ${jobId}:`, err);
  });

  return jobRecord;
}

/**
 * Executes the complete 2-version generation pipeline in the background.
 */
async function processCoverArtJobAsync(
  job: CoverArtJobDto & { userId: string },
  request: CreateCoverArtRequest,
  refId: string
): Promise<void> {
  const recipe = getRecipe(job.styleId);

  // Decode reference photo if provided and consent given
  let photoBuffer: Buffer | null = null;
  let photoMime = 'image/jpeg';
  if (request.photoDataUrl && request.photoConsent) {
    try {
      const match = request.photoDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        photoMime = match[1];
        photoBuffer = Buffer.from(match[2], 'base64');
      }
    } catch (parseErr) {
      console.warn(`[CoverArt] Could not decode artist photo data URL for job ${job.id}`);
    }
  }

  try {
    // Generate Version 0 and Version 1 in parallel
    const versionPromises = [0, 1].map((versionIndex) =>
      generateSingleVersion({
        job,
        request,
        recipe,
        versionIndex,
        photoBuffer,
        photoMime,
      })
    );

    const [v0Result, v1Result] = await Promise.all(versionPromises);

    // Save textless master buffers in cache for free re-compositing
    textlessMastersCache.set(job.id, {
      v0: v0Result.textlessBuffer,
      v1: v1Result.textlessBuffer,
    });

    job.versions = [v0Result.versionDto, v1Result.versionDto];
    job.status = 'completed';
    job.updatedAt = new Date().toISOString();
    coverArtJobs.set(job.id, job);
  } catch (err: any) {
    console.error(`[CoverArt Service] Job ${job.id} failed, executing full refund:`, err);
    job.status = 'failed';
    job.errorMessage = err?.message || 'Failed to generate cover art options';
    job.updatedAt = new Date().toISOString();
    coverArtJobs.set(job.id, job);

    // FIX MONEY BUG: Always refund when generation fails
    await refundCredits({
      userId: job.userId,
      amount: job.creditCost,
      referenceId: `refund_${refId}`,
      description: 'Refund for failed cover art generation',
    }).catch((refundErr) => {
      console.error(`[CoverArt Service] Refund failed for job ${job.id}:`, refundErr);
    });
  }
}

/**
 * Handles generation of a single version, including art director, engine call, quality gate retry, and compositing.
 */
async function generateSingleVersion(params: {
  job: CoverArtJobDto & { userId: string };
  request: CreateCoverArtRequest;
  recipe: any;
  versionIndex: number;
  photoBuffer: Buffer | null;
  photoMime: string;
}): Promise<{ versionDto: CoverArtVersionDto; textlessBuffer: Buffer }> {
  const { job, request, recipe, versionIndex, photoBuffer, photoMime } = params;

  // 1. Art Director prompt step
  const artDirection = await generateArtDirectorPrompt({
    title: job.title,
    genre: job.genre,
    tonality: request.tonality,
    recipe,
    hasPhoto: Boolean(photoBuffer && photoBuffer.length > 0),
    versionIndex,
  });

  // 2. Engine generation with 1 quality gate retry
  let rawArtworkBuffer: Buffer | null = null;
  let engineUsed = '';
  let retryCount = 0;
  let activePrompt = artDirection.prompt;

  while (retryCount <= 1) {
    const engineResult = await executeEngineVariant({
      tier: job.tier,
      prompt: activePrompt,
      artistPhoto: photoBuffer ? { buffer: photoBuffer, mime: photoMime } : null,
      userId: job.userId,
      jobId: job.id,
      versionIndex,
      retryNumber: retryCount,
    });

    engineUsed = engineResult.engineUsed;

    // Quality gate inspection
    const quality = await inspectArtworkQuality(engineResult.imageBuffer);
    if (quality.passed) {
      rawArtworkBuffer = engineResult.imageBuffer;
      break;
    }

    console.warn(
      `[CoverArt] Version ${versionIndex} failed quality gate (attempt ${retryCount + 1}): ${quality.reason}`
    );
    retryCount++;
    if (retryCount <= 1) {
      // Modify prompt for retry to increase lighting contrast
      activePrompt = `${activePrompt}. Enhanced dynamic contrast, crisp directional lighting, ultra detailed textures.`;
    } else {
      throw new Error(`QUALITY_GATE_FAILED: ${quality.reason}`);
    }
  }

  if (!rawArtworkBuffer) {
    throw new Error('NO_IMAGE_BUFFER_PRODUCED');
  }

  // 3. Composite Typography & Layout
  const compositeResult = await compositeCoverArt({
    rawArtworkBuffer,
    title: job.title,
    artistName: job.artistName,
    textZone: recipe.composition?.textZone,
    typography: recipe.typography,
    fontId: job.fontId,
    layoutId: job.layoutId,
  });

  // 4. Persist assets
  const masterUrl = await saveGenerationAsset({
    userId: job.userId,
    jobId: job.id,
    variantIndex: versionIndex, // 0 or 1
    extension: 'jpg',
    contentType: 'image/jpeg',
    data: compositeResult.finalJpeg,
  });

  const thumbUrl = await saveGenerationAsset({
    userId: job.userId,
    jobId: job.id,
    variantIndex: 10 + versionIndex, // 10 or 11
    extension: 'jpg',
    contentType: 'image/jpeg',
    data: compositeResult.thumbJpeg,
  });

  const textlessUrl = await saveGenerationAsset({
    userId: job.userId,
    jobId: job.id,
    variantIndex: 100 + versionIndex, // 100 or 101
    extension: 'jpg',
    contentType: 'image/jpeg',
    data: compositeResult.masterJpeg,
  });

  const versionDto: CoverArtVersionDto = {
    index: versionIndex,
    imageUrl: masterUrl,
    thumbnailUrl: thumbUrl,
    textlessUrl,
    engine: engineUsed,
  };

  return {
    versionDto,
    textlessBuffer: compositeResult.masterJpeg,
  };
}

/**
 * Re-composites the artwork with new title, artist, font, or layout.
 * Completely free of charge (no AI model called).
 */
export async function recompositeCoverArtJob(
  jobId: string,
  userId: string,
  recompositeParams: RecompositeRequest
): Promise<CoverArtJobDto> {
  const job = coverArtJobs.get(jobId);
  if (!job) throw new Error('JOB_NOT_FOUND');
  if ((job as any).userId !== userId) throw new Error('UNAUTHORIZED');
  if (job.status !== 'completed' || job.versions.length === 0) {
    throw new Error('JOB_NOT_READY_FOR_RECOMPOSITE');
  }

  const cached = textlessMastersCache.get(jobId);
  if (!cached || !cached.v0 || !cached.v1) {
    throw new Error('TEXTLESS_MASTERS_UNAVAILABLE');
  }

  // Update job properties
  if (recompositeParams.title !== undefined) job.title = recompositeParams.title;
  if (recompositeParams.artistName !== undefined) job.artistName = recompositeParams.artistName;
  if (recompositeParams.fontId !== undefined) job.fontId = recompositeParams.fontId;
  if (recompositeParams.layoutId !== undefined) job.layoutId = recompositeParams.layoutId;

  // Recomposite both versions
  const v0Comp = await compositeCoverArt({
    rawArtworkBuffer: cached.v0,
    title: job.title,
    artistName: job.artistName,
    fontId: job.fontId,
    layoutId: job.layoutId,
  });

  const v1Comp = await compositeCoverArt({
    rawArtworkBuffer: cached.v1,
    title: job.title,
    artistName: job.artistName,
    fontId: job.fontId,
    layoutId: job.layoutId,
  });

  // Overwrite existing storage assets
  const v0Url = await saveGenerationAsset({
    userId,
    jobId: job.id,
    variantIndex: 0,
    extension: 'jpg',
    contentType: 'image/jpeg',
    data: v0Comp.finalJpeg,
  });

  const v0ThumbUrl = await saveGenerationAsset({
    userId,
    jobId: job.id,
    variantIndex: 10,
    extension: 'jpg',
    contentType: 'image/jpeg',
    data: v0Comp.thumbJpeg,
  });

  const v1Url = await saveGenerationAsset({
    userId,
    jobId: job.id,
    variantIndex: 1,
    extension: 'jpg',
    contentType: 'image/jpeg',
    data: v1Comp.finalJpeg,
  });

  const v1ThumbUrl = await saveGenerationAsset({
    userId,
    jobId: job.id,
    variantIndex: 11,
    extension: 'jpg',
    contentType: 'image/jpeg',
    data: v1Comp.thumbJpeg,
  });

  job.versions[0].imageUrl = `${v0Url}?t=${Date.now()}`;
  job.versions[0].thumbnailUrl = `${v0ThumbUrl}?t=${Date.now()}`;
  job.versions[1].imageUrl = `${v1Url}?t=${Date.now()}`;
  job.versions[1].thumbnailUrl = `${v1ThumbUrl}?t=${Date.now()}`;

  if (job.selectedVersionIndex !== null) {
    job.selectedCoverUrl = job.versions[job.selectedVersionIndex]?.imageUrl || null;
  }

  job.updatedAt = new Date().toISOString();
  coverArtJobs.set(job.id, job);

  return job;
}

/**
 * Selects a chosen version for the track.
 */
export function selectCoverArtVersion(
  jobId: string,
  userId: string,
  versionIndex: number
): { selectedCoverUrl: string; selectedThumbnailUrl: string } {
  const job = coverArtJobs.get(jobId);
  if (!job) throw new Error('JOB_NOT_FOUND');
  if ((job as any).userId !== userId) throw new Error('UNAUTHORIZED');

  const chosen = job.versions[versionIndex];
  if (!chosen) throw new Error('VERSION_INDEX_INVALID');

  job.selectedVersionIndex = versionIndex;
  job.selectedCoverUrl = chosen.imageUrl;
  job.updatedAt = new Date().toISOString();
  coverArtJobs.set(job.id, job);

  return {
    selectedCoverUrl: chosen.imageUrl,
    selectedThumbnailUrl: chosen.thumbnailUrl,
  };
}
