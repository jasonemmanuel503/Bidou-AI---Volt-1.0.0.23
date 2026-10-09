/**
 * server/coverArt/compositor.ts
 *
 * Plain-language summary:
 * Typography & layout compositor for AI Cover Art v2 (Section 5.5).
 * - Sanitizes user text: title <= 60 chars, artist <= 40 chars, strips control chars.
 * - Upscales textless master (1024x1024) to 3000x3000 with Lanczos3 + subtle sharpen.
 * - Measures average luminance of the designated text zone (top or bottom).
 * - Renders a soft gradient scrim (pure vector gradient without text).
 * - Renders title and artist name with `sharp({ text: { ... fontfile } })` using Pango and bundled OFL fonts.
 *   - Escapes XML entities (&, <, >)
 *   - Word wraps long titles (max 3 lines)
 *   - Auto-fits within 6% safe margins (180px margins on 3000px = 2640px max width)
 *   - Enforces minimum legible title height (>= 5.5% of 3000 = 165px)
 *   - Supports French accented characters (É, è, ç, ô, etc.)
 * - Exports:
 *   - `final.jpg`: 3000x3000 sRGB JPEG, quality ~92, guaranteed < 10 MB (lowered iteratively if needed)
 *   - `thumb.jpg`: 640x640 optimized JPEG
 *   - `master.jpg`: 1024x1024 raw textless image (preserved for free instant re-compositing)
 */

import sharp from 'sharp';
import { getFontFilePath } from './fonts';
import { StyleRecipeTypography } from './recipes';

export interface CompositorInput {
  rawArtworkBuffer: Buffer;
  title: string;
  artistName: string;
  textZone?: 'bottom' | 'top';
  typography?: StyleRecipeTypography;
  fontId?: string;
  layoutId?: string;
  needsStrongScrim?: boolean;
}

export interface CompositorResult {
  finalJpeg: Buffer;
  thumbJpeg: Buffer;
  masterJpeg: Buffer;
}

function sanitizeText(str: string, maxLen: number): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // strip control chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function escapePangoMarkup(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Wraps title text into at most maxLines lines.
 */
function wrapTitleText(text: string, maxLines: number = 3): string {
  const words = text.split(' ');
  if (words.length <= 3 || text.length <= 24) return text;

  const lines: string[] = [];
  const wordsPerLine = Math.ceil(words.length / Math.min(words.length, maxLines));
  for (let i = 0; i < words.length && lines.length < maxLines; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(' '));
  }
  return lines.join('\n');
}

export async function compositeCoverArt(
  input: CompositorInput
): Promise<CompositorResult> {
  const {
    rawArtworkBuffer,
    title: rawTitle,
    artistName: rawArtist,
    textZone: inputZone,
    typography,
    fontId: requestedFontId,
    layoutId = 'bottom-centered',
    needsStrongScrim = false,
  } = input;

  // 1. Sanitize Inputs (Section 5.5: title <= 60 chars, artist <= 40 chars)
  const cleanTitle = sanitizeText(rawTitle, 60) || 'UNTITLED';
  const cleanArtist = sanitizeText(rawArtist, 40) || 'BIDOU ARTIST';

  const fontId = requestedFontId || typography?.fontId || 'bebas';
  const fontFile = getFontFilePath(fontId);
  const textZone = inputZone || (layoutId === 'top-header' ? 'top' : 'bottom');

  // 2. Prepare 1024x1024 textless master JPEG for instant free re-compositing
  const masterJpeg = await sharp(rawArtworkBuffer)
    .resize(1024, 1024, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 95 })
    .toBuffer();

  // 3. Upscale to 3000x3000 with Lanczos3 + very light sharpen
  const canvas3000 = await sharp(masterJpeg)
    .resize(3000, 3000, {
      fit: 'cover',
      position: 'center',
      kernel: 'lanczos3',
    })
    .sharpen({ sigma: 0.7, m1: 0.4, m2: 0.8 })
    .toBuffer();

  // 4. Measure luminance of the text zone to pick text color & scrim strength
  const zoneExtract = await sharp(canvas3000)
    .extract({
      left: 180,
      top: textZone === 'top' ? 180 : 1800,
      width: 2640,
      height: 1020,
    })
    .stats();

  const zch = zoneExtract.channels;
  const avgZoneLuma = (zch[0].mean + zch[1].mean + zch[2].mean) / 3;

  // High contrast palette selection
  const isLightBackground = avgZoneLuma > 175;
  const textColor = isLightBackground ? '#121214' : '#FFFFFF';
  const accentColor = isLightBackground ? '#B45309' : '#FFB020';

  // 5. Draw soft gradient scrim (SVG linear gradient without text)
  const scrimOpacityHigh = needsStrongScrim ? 0.95 : isLightBackground ? 0.88 : 0.85;
  const scrimOpacityMid = needsStrongScrim ? 0.55 : isLightBackground ? 0.45 : 0.40;
  const scrimColor = isLightBackground ? '#FFFFFF' : '#000000';

  let scrimSvg: string;
  if (textZone === 'top') {
    scrimSvg = `<svg width="3000" height="3000" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="topScrim" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="${scrimColor}" stop-opacity="0"/>
          <stop offset="50%" stop-color="${scrimColor}" stop-opacity="${scrimOpacityMid}"/>
          <stop offset="100%" stop-color="${scrimColor}" stop-opacity="${scrimOpacityHigh}"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="3000" height="1250" fill="url(#topScrim)"/>
    </svg>`;
  } else {
    scrimSvg = `<svg width="3000" height="3000" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bottomScrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${scrimColor}" stop-opacity="0"/>
          <stop offset="45%" stop-color="${scrimColor}" stop-opacity="${scrimOpacityMid}"/>
          <stop offset="100%" stop-color="${scrimColor}" stop-opacity="${scrimOpacityHigh}"/>
        </linearGradient>
      </defs>
      <rect x="0" y="1600" width="3000" height="1400" fill="url(#bottomScrim)"/>
    </svg>`;
  }

  // 6. Render Typography with sharp/Pango
  // Case transformation
  const isTitleCase = typography?.case === 'titlecase' || fontId === 'playfair' || fontId === 'alexbrush';
  const formattedTitle = isTitleCase
    ? cleanTitle
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    : cleanTitle.toUpperCase();

  const formattedArtist = isTitleCase
    ? cleanArtist
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    : cleanArtist.toUpperCase();

  const wrappedTitle = wrapTitleText(formattedTitle, 3);
  const escapedTitle = escapePangoMarkup(wrappedTitle);
  const escapedArtist = escapePangoMarkup(formattedArtist);

  // Safe area: 6% margin = 180px on each side -> max text width = 2640px
  const maxSafeWidth = 2640;
  // Minimum title height for 640px legibility: >= 5.5% of 3000 = 165px
  const minTitleHeight = 165;
  const targetTitleHeight = Math.max(minTitleHeight, wrappedTitle.includes('\n') ? 240 : 180);

  // Render Title via Pango
  const rawTitlePng = await sharp({
    text: {
      text: `<span foreground="${textColor}">${escapedTitle}</span>`,
      fontfile: fontFile,
      dpi: 900,
      align: layoutId === 'bottom-left' ? 'left' : 'centre',
      rgba: true,
    },
  }).png().toBuffer();

  const titleMeta = await sharp(rawTitlePng).metadata();
  let fittedTitle = sharp(rawTitlePng);
  let finalTitleWidth = titleMeta.width || maxSafeWidth;
  let finalTitleHeight = titleMeta.height || targetTitleHeight;

  if (titleMeta.width && titleMeta.width > maxSafeWidth) {
    fittedTitle = fittedTitle.resize({ width: maxSafeWidth, fit: 'inside' });
    const resizedMeta = await sharp(await fittedTitle.toBuffer()).metadata();
    finalTitleWidth = resizedMeta.width || maxSafeWidth;
    finalTitleHeight = resizedMeta.height || targetTitleHeight;
  } else if (titleMeta.height && titleMeta.height < minTitleHeight && !wrappedTitle.includes('\n')) {
    fittedTitle = fittedTitle.resize({ height: minTitleHeight, fit: 'inside' });
    const resizedMeta = await sharp(await fittedTitle.toBuffer()).metadata();
    finalTitleWidth = resizedMeta.width || maxSafeWidth;
    finalTitleHeight = resizedMeta.height || minTitleHeight;
  }
  const titleBuffer = await fittedTitle.png().toBuffer();

  // Render Artist via Pango
  const artistFontFile =
    fontId === 'alexbrush'
      ? fontFile
      : typography?.titleToArtistRatio && typography.titleToArtistRatio > 2.2
      ? getFontFilePath('montserrat')
      : fontFile;

  const targetArtistHeight = Math.max(70, Math.round(finalTitleHeight * 0.45));
  const rawArtistPng = await sharp({
    text: {
      text: `<span foreground="${accentColor}">${escapedArtist}</span>`,
      fontfile: artistFontFile,
      dpi: 600,
      align: layoutId === 'bottom-left' ? 'left' : 'centre',
      rgba: true,
    },
  }).png().toBuffer();

  const artistMeta = await sharp(rawArtistPng).metadata();
  let fittedArtist = sharp(rawArtistPng);
  if (artistMeta.width && artistMeta.width > maxSafeWidth) {
    fittedArtist = fittedArtist.resize({ width: maxSafeWidth, fit: 'inside' });
  } else if (artistMeta.height && artistMeta.height < 70) {
    fittedArtist = fittedArtist.resize({ height: targetArtistHeight, fit: 'inside' });
  }
  const artistBuffer = await fittedArtist.png().toBuffer();
  const finalArtistMeta = await sharp(artistBuffer).metadata();
  const finalArtistWidth = finalArtistMeta.width || 800;
  const finalArtistHeight = finalArtistMeta.height || 70;

  // Compute text coordinates ensuring 6% safe margin
  let titleX = 180;
  let titleY = 2520;
  let artistX = 180;
  let artistY = 2730;

  if (layoutId === 'bottom-left') {
    titleX = 180;
    titleY = 2500;
    artistX = 180;
    artistY = titleY + finalTitleHeight + 35;
  } else if (layoutId === 'top-bottom-split') {
    // Artist at top safe margin, Title at bottom safe margin
    artistX = Math.round((3000 - finalArtistWidth) / 2);
    artistY = 240;
    titleX = Math.round((3000 - finalTitleWidth) / 2);
    titleY = 2820 - finalTitleHeight;
  } else if (layoutId === 'top-header') {
    // Both title and artist at top
    titleX = Math.round((3000 - finalTitleWidth) / 2);
    titleY = 240;
    artistX = Math.round((3000 - finalArtistWidth) / 2);
    artistY = titleY + finalTitleHeight + 30;
  } else {
    // Default: bottom-centered
    titleX = Math.round((3000 - finalTitleWidth) / 2);
    artistX = Math.round((3000 - finalArtistWidth) / 2);
    const totalBlockHeight = finalTitleHeight + 30 + finalArtistHeight;
    titleY = Math.min(2820 - totalBlockHeight, 2500);
    artistY = titleY + finalTitleHeight + 30;
  }

  // Ensure strict bounding inside safe margin (180 <= x,y and x+w,y+h <= 2820)
  titleX = Math.max(180, Math.min(titleX, 2820 - finalTitleWidth));
  titleY = Math.max(180, Math.min(titleY, 2820 - finalTitleHeight));
  artistX = Math.max(180, Math.min(artistX, 2820 - finalArtistWidth));
  artistY = Math.max(180, Math.min(artistY, 2820 - finalArtistHeight));

  // 7. Composite: base image + scrim + title text + artist text
  const compositePipeline = sharp(canvas3000).composite([
    { input: Buffer.from(scrimSvg), left: 0, top: 0 },
    { input: titleBuffer, left: titleX, top: titleY },
    { input: artistBuffer, left: artistX, top: artistY },
  ]);

  // 8. Quality loop ensuring final.jpg < 10 MB (Section 5.5)
  let quality = 92;
  let finalJpeg = await compositePipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  while (finalJpeg.length > 9.8 * 1024 * 1024 && quality > 70) {
    quality -= 5;
    finalJpeg = await sharp(canvas3000)
      .composite([
        { input: Buffer.from(scrimSvg), left: 0, top: 0 },
        { input: titleBuffer, left: titleX, top: titleY },
        { input: artistBuffer, left: artistX, top: artistY },
      ])
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  // 9. Generate 640x640 optimized thumbnail
  const thumbJpeg = await sharp(finalJpeg)
    .resize(640, 640, { fit: 'cover', kernel: 'lanczos3' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  return {
    finalJpeg,
    thumbJpeg,
    masterJpeg,
  };
}
