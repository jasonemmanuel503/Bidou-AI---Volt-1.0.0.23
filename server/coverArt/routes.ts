/**
 * server/coverArt/routes.ts
 *
 * Plain-language summary:
 * Express route definitions for AI Cover Art v2:
 * - GET  /api/ai/cover-art/options       -> Authoritative pricing, styles, fonts, and tier availability
 * - POST /api/ai/cover-art               -> Create & debit 2-version cover art job (returns 202 {id})
 * - GET  /api/ai/cover-art/:id           -> Poll status of generation job
 * - POST /api/ai/cover-art/:id/select    -> Select winning version
 * - POST /api/ai/cover-art/:id/recomposite -> Free re-compositing of text/layout (0 credits)
 * - POST /api/ai/generate-cover-art      -> Legacy backwards-compatible endpoint (upgraded with refund safety)
 */

import { Express, Request, Response } from 'express';
import {
  COVER_ART_FONTS,
  COVER_ART_LAYOUTS,
  COVER_ART_STYLES,
  COVER_ART_TIERS,
  CoverArtOptionsResponse,
  CreateCoverArtRequest,
} from '../../src/services/coverArtCatalog';
import {
  createCoverArtJob,
  getCoverArtJob,
  recompositeCoverArtJob,
  selectCoverArtVersion,
} from './service';
import { getEffectiveStandardEngine, isStandardTierAvailable } from './engines';
import { runFontBootSelfTest } from './fonts';

export interface CoverArtRouteDependencies {
  resolveUserFromAuthHeader: (authHeader?: string) => Promise<{ id: string; email?: string } | null>;
  checkRateLimit?: (userId: string, action: string) => Promise<{ allowed: boolean; retryAfterSeconds?: number }>;
}

export function registerCoverArtRoutes(
  app: Express,
  deps: CoverArtRouteDependencies
): void {
  const { resolveUserFromAuthHeader } = deps;

  // Run font self-test on server start
  runFontBootSelfTest().catch((err) => {
    console.error('[CoverArt] Font self-test boot failed:', err);
  });

  // 1. Options & Authoritative Pricing Endpoint
  app.get('/api/ai/cover-art/options', async (_req: Request, res: Response) => {
    const standardEngine = getEffectiveStandardEngine();
    const standardAvailable = isStandardTierAvailable();

    const responseData: CoverArtOptionsResponse = {
      tiers: COVER_ART_TIERS,
      styles: COVER_ART_STYLES,
      fonts: COVER_ART_FONTS,
      layouts: COVER_ART_LAYOUTS,
      standardEngineConfigured: standardEngine,
      isStandardTierAvailable: standardAvailable,
    };

    return res.json(responseData);
  });

  // 2. Create Cover Art Generation Job (Debits credits, returns 202)
  app.post('/api/ai/cover-art', async (req: Request, res: Response) => {
    try {
      const user = await resolveUserFromAuthHeader(req.headers.authorization);
      if (!user) {
        return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
      }

      const body = req.body as CreateCoverArtRequest;

      if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
        return res.status(400).json({ error: 'INVALID_REQUEST', detail: 'Music title is required' });
      }

      const tier = body.tier === 'pro' ? 'pro' : 'standard';

      if (tier === 'standard' && !isStandardTierAvailable()) {
        return res.status(503).json({
          error: 'COVER_TIER_UNAVAILABLE',
          detail: 'Standard cover art engine is temporarily unavailable. Please choose Pro tier.',
        });
      }

      if (body.photoDataUrl && !body.photoConsent) {
        return res.status(400).json({
          error: 'CONSENT_REQUIRED',
          detail: 'You must confirm consent to use the uploaded artist photo for generative artwork.',
        });
      }

      try {
        const job = await createCoverArtJob(user.id, {
          ...body,
          tier,
        });

        return res.status(202).json({
          id: job.id,
          status: job.status,
          tier: job.tier,
          creditCost: job.creditCost,
          estimatedSeconds: 8,
        });
      } catch (err: any) {
        if (err.status === 402 || err.message === 'INSUFFICIENT_CREDITS') {
          return res.status(402).json({
            error: 'INSUFFICIENT_CREDITS',
            required: err.required,
            available: err.available,
          });
        }
        throw err;
      }
    } catch (err: any) {
      console.error('[CoverArt Route] Error creating cover art:', err);
      return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message || 'Failed to initialize cover art' });
    }
  });

  // 3. Poll Cover Art Job Status
  app.get('/api/ai/cover-art/:id', async (req: Request, res: Response) => {
    try {
      const user = await resolveUserFromAuthHeader(req.headers.authorization);
      if (!user) {
        return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
      }

      const job = getCoverArtJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'NOT_FOUND', detail: 'Cover art job not found' });
      }

      if ((job as any).userId !== user.id) {
        return res.status(403).json({ error: 'FORBIDDEN', detail: 'Job belongs to another user' });
      }

      return res.json(job);
    } catch (err: any) {
      return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message });
    }
  });

  // 4. Select Chosen Version
  app.post('/api/ai/cover-art/:id/select', async (req: Request, res: Response) => {
    try {
      const user = await resolveUserFromAuthHeader(req.headers.authorization);
      if (!user) {
        return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
      }

      const versionIndex = Number(req.body?.versionIndex ?? 0);
      const result = selectCoverArtVersion(req.params.id, user.id, versionIndex);

      return res.json({
        success: true,
        coverUrl: result.selectedCoverUrl,
        thumbnailUrl: result.selectedThumbnailUrl,
      });
    } catch (err: any) {
      const status = err.message === 'UNAUTHORIZED' ? 403 : err.message === 'JOB_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({ error: err?.message || 'Failed to select version' });
    }
  });

  // 5. Free Re-compositing (Instant Typography / Layout Adjustment without AI cost)
  app.post('/api/ai/cover-art/:id/recomposite', async (req: Request, res: Response) => {
    try {
      const user = await resolveUserFromAuthHeader(req.headers.authorization);
      if (!user) {
        return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
      }

      const updatedJob = await recompositeCoverArtJob(req.params.id, user.id, req.body);
      return res.json({
        success: true,
        job: updatedJob,
      });
    } catch (err: any) {
      console.error('[CoverArt Route] Recomposite error:', err);
      const status = err.message === 'UNAUTHORIZED' ? 403 : err.message === 'JOB_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({ error: err?.message || 'Failed to re-composite artwork' });
    }
  });

  // 6. Upgraded Legacy Route (For backward compatibility; safely refunds on failure)
  app.post('/api/ai/generate-cover-art', async (req: Request, res: Response) => {
    try {
      const user = await resolveUserFromAuthHeader(req.headers.authorization);
      if (!user) {
        return res.status(401).json({ error: 'UNAUTHORIZED', detail: 'Bearer token is required' });
      }

      const { title = 'Single', genre = 'Afrobeats' } = req.body;

      // Delegate to standard cover art service
      const job = await createCoverArtJob(user.id, {
        title,
        artistName: 'Artist',
        genre,
        tier: 'standard',
        styleId: 'afrobeats-vibrant',
      });

      // Poll until completion (or up to 20 seconds timeout)
      const startTime = Date.now();
      while (Date.now() - startTime < 25000) {
        const current = getCoverArtJob(job.id);
        if (current?.status === 'completed' && current.versions.length > 0) {
          return res.json({
            coverUrl: current.versions[0].imageUrl,
            thumbnailUrl: current.versions[0].thumbnailUrl,
            title: current.title,
            aspectRatio: '1:1',
          });
        }
        if (current?.status === 'failed') {
          return res.status(502).json({
            error: 'GENERATION_FAILED',
            detail: current.errorMessage || 'Cover art generation failed. Credits were refunded.',
          });
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      return res.status(504).json({ error: 'TIMEOUT', detail: 'Cover art generation is taking longer than expected.' });
    } catch (err: any) {
      if (err.status === 402 || err.message === 'INSUFFICIENT_CREDITS') {
        return res.status(402).json({
          error: 'INSUFFICIENT_CREDITS',
          required: err.required,
          available: err.available,
        });
      }
      return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message });
    }
  });
}
