/**
 * server/coverArt/engines.ts
 *
 * Plain-language summary:
 * Image generation engine dispatch for AI Cover Art v2 (Section 5.3):
 * - Standard Tier: FLUX.2 Klein 9B on Cloudflare Workers AI (`@cf/black-forest-labs/flux-2-klein-9b`)
 *   with fallback to Nano Banana 2 Lite if configured or unverified.
 * - Pro Tier: Nano Banana 2 on Google (`gemini-3.1-flash-image` with 1K square output).
 * - Multi-image conditioning:
 *   input_image_0 = style ref (if present)
 *   input_image_1 = artist photo (if present)
 * - Strict financial safeguards:
 *   - reserveSupplierBudget before call (simulated in dev on cap_reached; trips fail version)
 *   - recordAttempt before & markSucceeded/markFailed after (unitLabel: 'image')
 *   - Provider health metrics and secrets redaction
 *   - Friendly SAFETY_FILTER code for filtered prompts or photos
 *   - In live mode: NEVER return a placeholder as real output; honest failure triggers refund.
 */

import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { isLiveMode } from '../config/mode';
import { recordAttempt, markSucceeded, markFailed } from '../costLedger';
import { recordProviderFailure, recordProviderSuccess } from '../providers/health';
import {
  reserveSupplierBudget,
  withSupplierBudgetMutex,
  fetchWithTimeout,
  redactSecrets,
  getProviderEnv,
} from '../providers/suppliers';
import { resolveGoogleModelId } from '../providers/routing';
import { callCloudflareSingleImage } from '../providers/cloudflare';
import { CoverArtTierId } from '../../src/services/coverArtCatalog';
import { INITIAL_AI_MODELS } from '../../src/services/configData';
import { IMAGE_ROUTES } from '../../src/services/providerCatalog';

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

export interface EngineExecutionParams {
  tier: CoverArtTierId;
  prompt: string;
  styleRefs?: { buffer: Buffer; mime: string }[];
  artistPhoto?: { buffer: Buffer; mime: string } | null;
  userId: string;
  jobId: string;
  versionIndex: number;
  retryNumber?: number;
}

export interface EngineExecutionResult {
  imageBuffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  engineUsed: string;
  supplier: 'cloudflare' | 'google' | 'mock';
  costUsd: number;
  isSimulated?: boolean;
}

export function getEffectiveStandardEngine(): 'klein9b' | 'nb2lite' {
  const envChoice = (process.env.COVER_STANDARD_ENGINE || 'klein9b').toLowerCase().trim();
  if (envChoice === 'nb2lite') return 'nb2lite';

  const kleinModel = INITIAL_AI_MODELS.find((m) => m.id === 'img_cf_flux2_klein_9b');
  const licensingOk = kleinModel ? kleinModel.licensing_verified : true;

  if (!licensingOk && envChoice !== 'klein9b_force') {
    return 'nb2lite';
  }
  return 'klein9b';
}

export function isStandardTierAvailable(): boolean {
  const standardEngine = getEffectiveStandardEngine();
  if (standardEngine === 'klein9b') {
    const hasCf = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
    return !isLiveMode() || hasCf;
  }
  const hasGoogle = Boolean(process.env.GEMINI_API_KEY);
  return !isLiveMode() || hasGoogle;
}

function isSafetyFilterMessage(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return (
    lower.includes('safety') ||
    lower.includes('blocked') ||
    lower.includes('filter') ||
    lower.includes('moderation') ||
    lower.includes('policy') ||
    lower.includes('nsfw') ||
    lower.includes('inappropriate') ||
    lower.includes('sensitive')
  );
}

/**
 * Dispatches a single cover art variant generation to the chosen tier engine.
 */
export async function executeEngineVariant(
  params: EngineExecutionParams
): Promise<EngineExecutionResult> {
  const { tier } = params;

  if (tier === 'standard') {
    const stdEngine = getEffectiveStandardEngine();
    if (stdEngine === 'klein9b') {
      return executeCloudflareKlein9b(params);
    }
    return executeGoogleCoverCall({
      ...params,
      googleCatalogId: 'img_nano_banana_2_lite',
      googleModelId: 'gemini-3.1-flash-lite-image',
      estCostUsd: 0.0336,
      engineLabel: 'Nano Banana 2 Lite (Standard Fallback)',
    });
  }

  // Pro Tier: Nano Banana 2 on Google
  return executeGoogleCoverCall({
    ...params,
    googleCatalogId: 'img_nano_banana_2',
    googleModelId: IMAGE_ROUTES.nano_banana_2.googleModelId || 'gemini-3.1-flash-image',
    estCostUsd: 0.067,
    engineLabel: 'Nano Banana 2 (Pro)',
  });
}

/**
 * Standard Tier: FLUX.2 Klein 9B on Cloudflare Workers AI.
 */
async function executeCloudflareKlein9b(
  params: EngineExecutionParams
): Promise<EngineExecutionResult> {
  const { prompt, styleRefs = [], artistPhoto, userId, jobId, versionIndex, retryNumber = 0 } = params;
  const upstreamModel = '@cf/black-forest-labs/flux-2-klein-9b';
  const inputImagesCount = (styleRefs.length > 0 ? 1 : 0) + (artistPhoto ? 1 : 0);
  const estCostUsd = Number((0.015 + inputImagesCount * 0.002).toFixed(6));
  const attemptRef = `${jobId}_v${versionIndex}_r${retryNumber}_cf`;

  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();

  // Handle missing credentials
  if (!accountId || !apiToken) {
    if (isLiveMode()) {
      throw new Error('PROVIDER_KEY_MISSING: Cloudflare credentials required for Standard Cover Art in live mode');
    }
    return generateLocalMockArtwork(prompt, 'FLUX.2 Klein 9B (Dev Simulated)', versionIndex, true);
  }

  // Supplier Budget check & reservation
  let reservationResult = 'ok' as 'ok' | 'cap_reached' | 'tripped';
  await withSupplierBudgetMutex('cloudflare', async () => {
    reservationResult = await reserveSupplierBudget('cloudflare', estCostUsd, 1, 'image');
  });

  if (reservationResult === 'cap_reached') {
    if (!isLiveMode()) {
      console.warn('[CoverArt Cloudflare] Dev supplier cap reached, using simulated local art');
      return generateLocalMockArtwork(prompt, 'FLUX.2 Klein 9B (Cap Simulated)', versionIndex, true);
    }
    throw new Error('SUPPLIER_BUDGET_EXCEEDED: Cloudflare budget cap reached');
  } else if (reservationResult === 'tripped') {
    throw new Error('SUPPLIER_TRIPPED: Cloudflare circuit breaker is currently active');
  }

  await recordAttempt({
    userId,
    jobId,
    variantIndex: versionIndex,
    supplier: 'cloudflare',
    modelId: 'img_cf_flux2_klein_9b',
    upstreamModel,
    env: isLiveMode() ? 'prod' : 'dev',
    units: 1,
    unitLabel: 'image',
    estCostUsd,
  });

  // Prepare reference images order:
  // input_image_0 = style ref
  // input_image_1 = artist photo
  const refImagesList: { buffer: Buffer; mime: string }[] = [];
  if (styleRefs.length > 0) {
    refImagesList.push(styleRefs[0]);
  }
  if (artistPhoto) {
    refImagesList.push(artistPhoto);
  }

  let finalPrompt = prompt;
  if (styleRefs.length > 0 && artistPhoto) {
    finalPrompt = `Take the subject of image 1 and style it like image 0. ${prompt}`;
  }

  try {
    const cfResult = await callCloudflareSingleImage({
      upstreamModel,
      prompt: finalPrompt,
      aspectRatio: '1:1',
      referenceImages: refImagesList,
    });

    await markSucceeded(jobId, versionIndex, 'cloudflare', estCostUsd);
    recordProviderSuccess('cloudflare');

    return {
      imageBuffer: cfResult.buffer,
      mimeType: cfResult.extension === 'png' ? 'image/png' : 'image/jpeg',
      engineUsed: 'FLUX.2 Klein 9B',
      supplier: 'cloudflare',
      costUsd: estCostUsd,
    };
  } catch (err: any) {
    const rawMsg = err?.message || '';
    await markFailed(jobId, versionIndex, 'cloudflare', redactSecrets(rawMsg));
    recordProviderFailure('cloudflare', rawMsg);

    if (isSafetyFilterMessage(rawMsg)) {
      throw new Error(
        'SAFETY_FILTER: Generation was flagged by safety moderation. Please try a different artist photo or visual style.'
      );
    }
    throw err;
  }
}

/**
 * Dedicated Google call for Cover Art (Nano Banana 2 or NB2 Lite).
 */
async function executeGoogleCoverCall(
  params: EngineExecutionParams & {
    googleCatalogId: string;
    googleModelId: string;
    estCostUsd: number;
    engineLabel: string;
  }
): Promise<EngineExecutionResult> {
  const { prompt, styleRefs = [], artistPhoto, userId, jobId, versionIndex, retryNumber = 0, googleCatalogId, googleModelId, estCostUsd, engineLabel } = params;
  const attemptRef = `${jobId}_v${versionIndex}_r${retryNumber}_google`;
  const ai = getGemini();

  if (!process.env.GEMINI_API_KEY || !ai) {
    if (isLiveMode()) {
      throw new Error('PROVIDER_KEY_MISSING: Gemini API key required in live mode');
    }
    return generateLocalMockArtwork(prompt, `${engineLabel} (Dev Simulated)`, versionIndex, true);
  }

  // Budget reservation
  let reservationResult = 'ok' as 'ok' | 'cap_reached' | 'tripped';
  await withSupplierBudgetMutex('google', async () => {
    reservationResult = await reserveSupplierBudget('google', estCostUsd, 1, 'image');
  });

  if (reservationResult === 'cap_reached') {
    if (!isLiveMode()) {
      console.warn('[CoverArt Google] Dev supplier cap reached, using simulated local art');
      return generateLocalMockArtwork(prompt, `${engineLabel} (Cap Simulated)`, versionIndex, true);
    }
    throw new Error('SUPPLIER_BUDGET_EXCEEDED: Google supplier budget cap reached');
  } else if (reservationResult === 'tripped') {
    throw new Error('SUPPLIER_TRIPPED: Google circuit breaker is currently active');
  }

  await recordAttempt({
    userId,
    jobId,
    variantIndex: versionIndex,
    supplier: 'google',
    modelId: googleCatalogId,
    env: isLiveMode() ? 'prod' : 'dev',
    units: 1,
    unitLabel: 'image',
    estCostUsd,
  });

  try {
    const parts: any[] = [];

    // Attach artist photo first if present
    if (artistPhoto && artistPhoto.buffer.length > 0) {
      parts.push({
        inlineData: {
          mimeType: artistPhoto.mime || 'image/jpeg',
          data: artistPhoto.buffer.toString('base64'),
        },
      });
    }

    // Attach style reference if present
    if (styleRefs.length > 0 && styleRefs[0].buffer.length > 0) {
      parts.push({
        inlineData: {
          mimeType: styleRefs[0].mime || 'image/jpeg',
          data: styleRefs[0].buffer.toString('base64'),
        },
      });
    }

    // Attach prompt
    parts.push({ text: prompt });

    const resolvedModel = resolveGoogleModelId(googleCatalogId, googleModelId);
    const resp = await ai.models.generateContent({
      model: resolvedModel,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      } as any,
    });

    const candidate = resp.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((p: any) => p.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      // Check for safety filter block
      const finishReason = candidate?.finishReason || '';
      if (isSafetyFilterMessage(finishReason) || finishReason === 'SAFETY') {
        throw new Error(
          'SAFETY_FILTER: Image generation was blocked by safety filters. Try using a different artist photo or style preset.'
        );
      }
      throw new Error('Google generation returned no image payload');
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const mimeType = (imagePart.inlineData.mimeType || 'image/png') as 'image/png' | 'image/jpeg';

    await markSucceeded(jobId, versionIndex, 'google', estCostUsd);
    recordProviderSuccess('google');

    return {
      imageBuffer,
      mimeType,
      engineUsed: engineLabel,
      supplier: 'google',
      costUsd: estCostUsd,
    };
  } catch (err: any) {
    const msg = redactSecrets(err?.message || '');
    await markFailed(jobId, versionIndex, 'google', msg);
    recordProviderFailure('google', msg);

    if (isSafetyFilterMessage(msg)) {
      throw new Error(
        'SAFETY_FILTER: Generation was flagged by safety moderation. Please try a different artist photo or visual style.'
      );
    }
    throw err;
  }
}

/**
 * Local SVG artwork placeholder for dev / keyless / budget-capped mode.
 */
async function generateLocalMockArtwork(
  prompt: string,
  engineName: string,
  versionIndex: number,
  isSimulated = false
): Promise<EngineExecutionResult> {
  const palettes = [
    { start: '#F86A00', mid: '#FF8800', end: '#121214', disc: '#FFB020' },
    { start: '#7928CA', mid: '#FF0080', end: '#0D0E15', disc: '#00DFD8' },
  ];
  const p = palettes[versionIndex % palettes.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${p.start}"/>
        <stop offset="50%" stop-color="${p.mid}"/>
        <stop offset="100%" stop-color="${p.end}"/>
      </linearGradient>
      <radialGradient id="sun" cx="50%" cy="38%" r="45%">
        <stop offset="0%" stop-color="${p.disc}" stop-opacity="0.9"/>
        <stop offset="60%" stop-color="${p.start}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${p.end}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <circle cx="512" cy="420" r="320" fill="url(#sun)"/>
    <circle cx="512" cy="420" r="220" fill="${p.end}" opacity="0.6"/>
    <circle cx="512" cy="420" r="140" stroke="${p.disc}" stroke-width="4" fill="none" opacity="0.5"/>
    <rect x="0" y="700" width="1024" height="324" fill="#000000" opacity="0.6"/>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();

  return {
    imageBuffer: buffer,
    mimeType: 'image/jpeg',
    engineUsed: engineName,
    supplier: 'mock',
    costUsd: 0,
    isSimulated,
  };
}
