/**
 * server/coverArt/engines.ts
 *
 * Plain-language summary:
 * Engine dispatch for AI Cover Art v2:
 * - Standard Tier: FLUX.2 Klein 9B on Cloudflare Workers AI (`@cf/black-forest-labs/flux-2-klein-9b`),
 *   with fallback to Nano Banana 2 Lite if configured (`COVER_STANDARD_ENGINE=nb2lite`)
 *   or if Klein 9B is not verified for commercial licensing.
 * - Pro Tier: Nano Banana 2 on Google (`gemini-3.1-flash-image` with 1K square output).
 * - Multi-modal reference image input: attaches the artist photo when provided.
 * - Full operational hardening: cost ledger tracking, supplier budget reservations, and health circuit.
 */

import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { isLiveMode } from '../config/mode';
import { recordAttempt, markSucceeded, markFailed } from '../costLedger';
import { recordProviderFailure, recordProviderSuccess } from '../providers/health';
import { reserveSupplierBudget, withSupplierBudgetMutex, getProviderEnv } from '../providers/suppliers';
import { CoverArtTierId } from '../../src/services/coverArtCatalog';
import { INITIAL_AI_MODELS } from '../../src/services/configData';

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
  negativePrompt?: string;
  referencePhotoBuffer?: Buffer | null;
  referencePhotoMime?: string;
  userId: string;
  jobId: string;
  versionIndex: number;
}

export interface EngineExecutionResult {
  imageBuffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  engineUsed: string;
  supplier: 'cloudflare' | 'google' | 'mock';
  costUsd: number;
}

/**
 * Checks whether the Standard engine is configured for Klein 9B or NB2Lite,
 * and confirms licensing status.
 */
export function getEffectiveStandardEngine(): 'klein9b' | 'nb2lite' {
  const envChoice = (process.env.COVER_STANDARD_ENGINE || 'klein9b').toLowerCase().trim();
  if (envChoice === 'nb2lite') {
    return 'nb2lite';
  }

  // Check licensing_verified in model catalog
  const kleinCatalog = INITIAL_AI_MODELS.find(
    (m) => m.id === 'img_cf_flux2_klein_4b' || m.model_name === 'cf_flux2_klein_9b'
  );
  const licensingOk = kleinCatalog ? kleinCatalog.licensing_verified : true;

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

/**
 * Dispatches image generation for a single cover art variant.
 */
export async function executeEngineVariant(
  params: EngineExecutionParams
): Promise<EngineExecutionResult> {
  const { tier, prompt, referencePhotoBuffer, referencePhotoMime, userId, jobId, versionIndex } = params;

  if (tier === 'standard') {
    const standardEngine = getEffectiveStandardEngine();
    if (standardEngine === 'klein9b') {
      return executeKlein9bVariant(params);
    }
    return executeGoogleImageVariant({
      ...params,
      googleModelId: 'gemini-3.1-flash-lite-image',
      estCostUsd: 0.0336,
      engineLabel: 'Nano Banana 2 Lite (Standard Fallback)',
    });
  }

  // Pro Tier: Nano Banana 2 on Google
  return executeGoogleImageVariant({
    ...params,
    googleModelId: 'gemini-3.1-flash-image',
    estCostUsd: 0.067,
    engineLabel: 'Nano Banana 2 (Pro)',
  });
}

/**
 * Executes standard tier on Cloudflare Workers AI FLUX.2 Klein 9B.
 */
async function executeKlein9bVariant(
  params: EngineExecutionParams
): Promise<EngineExecutionResult> {
  const { prompt, referencePhotoBuffer, userId, jobId, versionIndex } = params;
  const upstreamModel = '@cf/black-forest-labs/flux-2-klein-9b';
  const estCostUsd = 0.019;
  const attemptRef = `${jobId}_v${versionIndex}_cf`;

  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();

  if (!accountId || !apiToken) {
    if (isLiveMode()) {
      throw new Error('PROVIDER_KEY_MISSING: Cloudflare credentials required for Standard Cover Art');
    }
    return generateLocalMockArtwork(prompt, 'FLUX.2 Klein 9B (Simulated)', versionIndex);
  }

  // Budget mutex and reservation
  await withSupplierBudgetMutex('cloudflare', async () => {
    const budgetOk = await reserveSupplierBudget('cloudflare', estCostUsd);
    if (!budgetOk) {
      throw new Error('SUPPLIER_BUDGET_EXCEEDED: Cloudflare budget cap reached');
    }
  });

  await recordAttempt({
    userId,
    jobId,
    supplier: 'cloudflare',
    modelId: 'img_cf_flux2_klein_9b',
    generationType: 'image',
    estimatedCostUsd: estCostUsd,
    attemptReference: attemptRef,
  });

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${upstreamModel}`;

  try {
    const form = new FormData();
    form.append('prompt', prompt.slice(0, 2048));
    form.append('width', '1024');
    form.append('height', '1024');
    form.append('steps', '4');

    if (referencePhotoBuffer && referencePhotoBuffer.length > 0) {
      // Cloudflare input image
      const photoBlob = new Blob([new Uint8Array(referencePhotoBuffer)], { type: 'image/jpeg' });
      form.append('image', photoBlob, 'reference.jpg');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      body: form,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Cloudflare error HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const ct = (response.headers.get('content-type') || '').toLowerCase();
    let imageBuffer: Buffer;
    let mimeType: 'image/png' | 'image/jpeg' = 'image/jpeg';

    if (ct.includes('application/json')) {
      const json: any = await response.json();
      const b64 = json?.result?.image || json?.result?.response || json?.image;
      if (!b64) throw new Error('Cloudflare response missing image bytes');
      imageBuffer = Buffer.from(b64, 'base64');
    } else {
      const arrayBuf = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuf);
      if (ct.includes('png')) mimeType = 'image/png';
    }

    await markSucceeded(attemptRef, estCostUsd);
    recordProviderSuccess('cloudflare');

    return {
      imageBuffer,
      mimeType,
      engineUsed: 'FLUX.2 Klein 9B',
      supplier: 'cloudflare',
      costUsd: estCostUsd,
    };
  } catch (err: any) {
    await markFailed(attemptRef, err?.message || 'Cloudflare call failed');
    recordProviderFailure('cloudflare', err);
    throw err;
  }
}

/**
 * Executes image generation on Google Gemini (Nano Banana 2 or Nano Banana 2 Lite).
 */
async function executeGoogleImageVariant(
  params: EngineExecutionParams & {
    googleModelId: string;
    estCostUsd: number;
    engineLabel: string;
  }
): Promise<EngineExecutionResult> {
  const { prompt, referencePhotoBuffer, referencePhotoMime, userId, jobId, versionIndex, googleModelId, estCostUsd, engineLabel } = params;
  const attemptRef = `${jobId}_v${versionIndex}_google`;
  const ai = getGemini();

  if (!process.env.GEMINI_API_KEY || !ai) {
    if (isLiveMode()) {
      throw new Error('PROVIDER_KEY_MISSING: Gemini API key required for Cover Art');
    }
    return generateLocalMockArtwork(prompt, `${engineLabel} (Simulated)`, versionIndex);
  }

  // Budget check
  await withSupplierBudgetMutex('google', async () => {
    const budgetOk = await reserveSupplierBudget('google', estCostUsd);
    if (!budgetOk) {
      throw new Error('SUPPLIER_BUDGET_EXCEEDED: Google supplier budget cap reached');
    }
  });

  await recordAttempt({
    userId,
    jobId,
    supplier: 'google',
    modelId: googleModelId === 'gemini-3.1-flash-lite-image' ? 'img_nano_banana_2_lite' : 'img_nano_banana_2',
    generationType: 'image',
    estimatedCostUsd: estCostUsd,
    attemptReference: attemptRef,
  });

  try {
    const parts: any[] = [{ text: prompt }];

    if (referencePhotoBuffer && referencePhotoBuffer.length > 0) {
      parts.push({
        inlineData: {
          data: referencePhotoBuffer.toString('base64'),
          mimeType: referencePhotoMime || 'image/jpeg',
        },
      });
    }

    const resp = await ai.models.generateContent({
      model: googleModelId,
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
      throw new Error('Google generation returned no image payload');
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const mimeType = (imagePart.inlineData.mimeType || 'image/png') as 'image/png' | 'image/jpeg';

    await markSucceeded(attemptRef, estCostUsd);
    recordProviderSuccess('google');

    return {
      imageBuffer,
      mimeType,
      engineUsed: engineLabel,
      supplier: 'google',
      costUsd: estCostUsd,
    };
  } catch (err: any) {
    await markFailed(attemptRef, err?.message || 'Google call failed');
    recordProviderFailure('google', err);
    throw err;
  }
}

/**
 * Creates high-aesthetic local placeholder artwork for demo / keyless mode.
 */
async function generateLocalMockArtwork(
  prompt: string,
  engineName: string,
  variationIndex: number
): Promise<EngineExecutionResult> {
  const colors = [
    { start: '#F86A00', mid: '#FF8800', end: '#121214', disc: '#FFB020' },
    { start: '#7928CA', mid: '#FF0080', end: '#0D0E15', disc: '#00DFD8' },
  ];
  const c = colors[variationIndex % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c.start}"/>
        <stop offset="45%" stop-color="${c.mid}"/>
        <stop offset="100%" stop-color="${c.end}"/>
      </linearGradient>
      <radialGradient id="halo" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stop-color="${c.disc}" stop-opacity="0.85"/>
        <stop offset="60%" stop-color="${c.start}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${c.end}" stop-opacity="0"/>
      </radialGradient>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0"/>
        <feBlend mode="overlay" in2="SourceGraphic"/>
      </filter>
    </defs>
    <rect width="1024" height="1024" fill="url(#bgGrad)"/>
    <circle cx="512" cy="460" r="380" fill="url(#halo)"/>
    <circle cx="512" cy="460" r="260" fill="${c.end}" opacity="0.6"/>
    <circle cx="512" cy="460" r="160" stroke="${c.disc}" stroke-width="3" fill="none" opacity="0.5"/>
    <circle cx="512" cy="460" r="60" fill="${c.disc}" opacity="0.9"/>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();

  return {
    imageBuffer: buffer,
    mimeType: 'image/jpeg',
    engineUsed: engineName,
    supplier: 'mock',
    costUsd: 0,
  };
}
