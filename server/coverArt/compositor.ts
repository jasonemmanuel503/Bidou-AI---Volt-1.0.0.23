/**
 * server/coverArt/compositor.ts
 *
 * Plain-language summary:
 * Typography & layout compositor for AI Cover Art v2.
 * - Resizes raw textless artwork to 3000x3000 master resolution.
 * - Builds an SVG overlay with gradient scrims, drop shadows, and bundled typography.
 * - Renders crisp vector text via sharp (Title + Artist Name).
 * - Exports:
 *   1. 3000x3000 high-resolution cover JPEG
 *   2. 640x640 optimized thumbnail JPEG
 *   3. 3000x3000 textless master JPEG (preserved for instant free re-compositing).
 */

import sharp from 'sharp';
import { buildSvgFontStyles, getFontFamilyForId } from './fonts';

export interface CompositorParams {
  rawArtworkBuffer: Buffer;
  title: string;
  artistName: string;
  fontId?: string;
  layoutId?: string;
}

export interface CompositorOutput {
  fullMasterJpeg: Buffer;
  thumbnailJpeg: Buffer;
  textlessMasterJpeg: Buffer;
}

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds the vector SVG overlay containing scrim gradients and typography.
 */
function buildOverlaySvg(params: {
  title: string;
  artistName: string;
  fontFamily: string;
  layoutId: string;
}): string {
  const { title, artistName, fontFamily, layoutId } = params;
  const fontCss = buildSvgFontStyles();

  const cleanTitle = escapeXml(title.trim() || 'Untitled Single');
  const cleanArtist = escapeXml(artistName.trim() || 'Bidou Artist');

  // Dynamic font sizing based on string length to guarantee no overflow on 3000px canvas
  const titleLen = cleanTitle.length;
  let titleFontSize = 140;
  if (titleLen > 24) titleFontSize = 95;
  else if (titleLen > 18) titleFontSize = 110;
  else if (titleLen > 12) titleFontSize = 125;

  const artistFontSize = Math.max(50, Math.round(titleFontSize * 0.45));

  let scrimDefs = `
    <linearGradient id="bottomScrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="40%" stop-color="#000000" stop-opacity="0.35"/>
      <stop offset="75%" stop-color="#000000" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.95"/>
    </linearGradient>
    <filter id="textGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.8"/>
    </filter>
  `;

  let bodyContent = '';

  if (layoutId === 'bottom-left') {
    bodyContent = `
      <rect x="0" y="1600" width="3000" height="1400" fill="url(#bottomScrim)"/>
      <g filter="url(#textGlow)">
        <text x="220" y="2600" font-family="${fontFamily}, sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="#FFFFFF" text-anchor="start" letter-spacing="1">${cleanTitle.toUpperCase()}</text>
        <text x="225" y="2720" font-family="${fontFamily}, sans-serif" font-size="${artistFontSize}" font-weight="600" fill="#FFB020" text-anchor="start" letter-spacing="4">${cleanArtist.toUpperCase()}</text>
      </g>
    `;
  } else if (layoutId === 'top-bottom-split') {
    scrimDefs += `
      <linearGradient id="topScrim" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="70%" stop-color="#000000" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
      </linearGradient>
    `;
    bodyContent = `
      <rect x="0" y="0" width="3000" height="800" fill="url(#topScrim)"/>
      <rect x="0" y="1800" width="3000" height="1200" fill="url(#bottomScrim)"/>
      <g filter="url(#textGlow)">
        <text x="1500" y="320" font-family="${fontFamily}, sans-serif" font-size="${artistFontSize}" font-weight="600" fill="#FFB020" text-anchor="middle" letter-spacing="8">${cleanArtist.toUpperCase()}</text>
        <line x1="1200" y1="380" x2="1800" y2="380" stroke="#FFB020" stroke-width="3" opacity="0.6"/>
        <text x="1500" y="2650" font-family="${fontFamily}, sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="#FFFFFF" text-anchor="middle" letter-spacing="2">${cleanTitle.toUpperCase()}</text>
      </g>
    `;
  } else if (layoutId === 'center-framed') {
    scrimDefs += `
      <radialGradient id="centerDarken" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.65"/>
        <stop offset="70%" stop-color="#000000" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    `;
    bodyContent = `
      <circle cx="1500" cy="1500" r="1100" fill="url(#centerDarken)"/>
      <rect x="150" y="150" width="2700" height="2700" fill="none" stroke="#FFFFFF" stroke-width="4" opacity="0.4"/>
      <g filter="url(#textGlow)">
        <text x="1500" y="1460" font-family="${fontFamily}, sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="#FFFFFF" text-anchor="middle" letter-spacing="3">${cleanTitle.toUpperCase()}</text>
        <text x="1500" y="1600" font-family="${fontFamily}, sans-serif" font-size="${artistFontSize}" font-weight="600" fill="#FFB020" text-anchor="middle" letter-spacing="6">${cleanArtist.toUpperCase()}</text>
      </g>
    `;
  } else {
    // Default: 'bottom-centered'
    bodyContent = `
      <rect x="0" y="1600" width="3000" height="1400" fill="url(#bottomScrim)"/>
      <g filter="url(#textGlow)">
        <text x="1500" y="2600" font-family="${fontFamily}, sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="#FFFFFF" text-anchor="middle" letter-spacing="2">${cleanTitle.toUpperCase()}</text>
        <text x="1500" y="2720" font-family="${fontFamily}, sans-serif" font-size="${artistFontSize}" font-weight="600" fill="#FFB020" text-anchor="middle" letter-spacing="5">${cleanArtist.toUpperCase()}</text>
      </g>
    `;
  }

  return `<svg width="3000" height="3000" viewBox="0 0 3000 3000" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>${fontCss}</style>
      ${scrimDefs}
    </defs>
    ${bodyContent}
  </svg>`;
}

export async function compositeCoverArt(
  params: CompositorParams
): Promise<CompositorOutput> {
  const { rawArtworkBuffer, title, artistName, fontId = 'urban-bold', layoutId = 'bottom-centered' } = params;

  // 1. Prepare 3000x3000 textless master base
  const textlessMasterJpeg = await sharp(rawArtworkBuffer)
    .resize(3000, 3000, {
      fit: 'cover',
      position: 'center',
      kernel: 'lanczos3',
    })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  // 2. Build SVG overlay
  const fontFamily = getFontFamilyForId(fontId);
  const overlaySvg = buildOverlaySvg({
    title,
    artistName,
    fontFamily,
    layoutId,
  });

  const overlayBuffer = Buffer.from(overlaySvg);

  // 3. Composite text + scrim onto 3000x3000 master
  const fullMasterJpeg = await sharp(textlessMasterJpeg)
    .composite([
      {
        input: overlayBuffer,
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  // 4. Generate 640x640 optimized thumbnail
  const thumbnailJpeg = await sharp(fullMasterJpeg)
    .resize(640, 640, {
      fit: 'cover',
      kernel: 'lanczos3',
    })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  return {
    fullMasterJpeg,
    thumbnailJpeg,
    textlessMasterJpeg,
  };
}
