/**
 * server/coverArt/fonts.ts
 *
 * Plain-language summary:
 * Bundled OFL font manager for AI Cover Art v2:
 * - Manages SIL Open Font License files in server/coverArt/fonts/
 * - Resolves font paths relative to COVER_ASSETS_DIR with sensible defaults
 * - Executes boot self-test rendering French accented glyphs ('Aa Éé ç ô û ï œ') with each font
 * - Exposes getFontFilePath(fontId) for sharp({ text: { ... fontfile } }) Pango rendering
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { isLiveMode } from '../config/mode';

export type CoverFontId = 'bebas' | 'anton' | 'oswald' | 'montserrat' | 'playfair' | 'alexbrush';

export interface FontEntry {
  id: CoverFontId;
  name: string;
  fileName: string;
  path: string;
  verified: boolean;
}

const FONT_MAP: Record<CoverFontId, { name: string; fileName: string }> = {
  bebas: { name: 'Bebas Neue', fileName: 'BebasNeue-Regular.ttf' },
  anton: { name: 'Anton', fileName: 'Anton-Regular.ttf' },
  oswald: { name: 'Oswald', fileName: 'Oswald.ttf' },
  montserrat: { name: 'Montserrat ExtraBold', fileName: 'Montserrat.ttf' },
  playfair: { name: 'Playfair Display', fileName: 'PlayfairDisplay.ttf' },
  alexbrush: { name: 'Alex Brush', fileName: 'AlexBrush-Regular.ttf' },
};

let fontDirectory: string = '';
let areFontsOperational = false;
const loadedFontPaths = new Map<CoverFontId, string>();

export function resolveFontsDirectory(): string {
  if (fontDirectory && fs.existsSync(fontDirectory)) {
    return fontDirectory;
  }

  const envDir = process.env.COVER_ASSETS_DIR;
  if (envDir && fs.existsSync(envDir)) {
    const sub = path.join(envDir, 'fonts');
    if (fs.existsSync(sub)) {
      fontDirectory = sub;
      return fontDirectory;
    }
    fontDirectory = envDir;
    return fontDirectory;
  }

  const distFonts = path.resolve(process.cwd(), 'dist', 'fonts');
  if (fs.existsSync(distFonts)) {
    fontDirectory = distFonts;
    return fontDirectory;
  }

  const projectFonts = path.resolve(process.cwd(), 'server', 'coverArt', 'fonts');
  if (fs.existsSync(projectFonts)) {
    fontDirectory = projectFonts;
    return fontDirectory;
  }

  const localFonts = path.resolve(__dirname, 'fonts');
  if (fs.existsSync(localFonts)) {
    fontDirectory = localFonts;
    return fontDirectory;
  }

  fontDirectory = projectFonts;
  return fontDirectory;
}

export function getFontFilePath(fontId: string): string {
  const normalized = (fontId || 'bebas').toLowerCase() as CoverFontId;
  const mapped = loadedFontPaths.get(normalized) || loadedFontPaths.get('bebas');
  if (mapped && fs.existsSync(mapped)) return mapped;

  const fontDir = resolveFontsDirectory();
  const def = FONT_MAP[normalized] || FONT_MAP.bebas;
  return path.join(fontDir, def.fileName);
}

export function areFontsReady(): boolean {
  return areFontsOperational;
}

/**
 * Boot Self-Test:
 * Renders 'Aa Éé ç ô û ï œ' with each bundled font file through sharp/Pango.
 * In live mode, fails loudly if any font is missing or fails rasterization.
 */
export async function runFontBootSelfTest(): Promise<boolean> {
  const fontDir = resolveFontsDirectory();
  const fontIds = Object.keys(FONT_MAP) as CoverFontId[];
  const testPhrase = '<span foreground="white">Aa Éé ç ô û ï œ</span>';
  let allPassed = true;

  for (const fId of fontIds) {
    const def = FONT_MAP[fId];
    const fullPath = path.join(fontDir, def.fileName);

    if (!fs.existsSync(fullPath)) {
      console.error(`[CoverArt Fonts] CRITICAL: Missing font file for ${def.name} at ${fullPath}`);
      allPassed = false;
      continue;
    }

    try {
      const buf = await sharp({
        text: {
          text: testPhrase,
          fontfile: fullPath,
          rgba: true,
        },
      })
        .png()
        .toBuffer();

      if (buf && buf.length > 200) {
        loadedFontPaths.set(fId, fullPath);
      } else {
        console.error(`[CoverArt Fonts] CRITICAL: Render of ${def.name} produced undersized output`);
        allPassed = false;
      }
    } catch (err: any) {
      console.error(`[CoverArt Fonts] CRITICAL: Boot self-test failed for font ${def.name}:`, err?.message);
      allPassed = false;
    }
  }

  if (allPassed) {
    areFontsOperational = true;
    console.log(
      `[CoverArt Fonts] Boot self-test PASSED: All 6 OFL fonts verified with French accents in ${fontDir}`
    );
    return true;
  }

  if (isLiveMode()) {
    console.error(
      '[CoverArt Fonts] FATAL IN LIVE MODE: One or more fonts failed boot self-test. Disabling Cover Art feature (503).'
    );
    areFontsOperational = false;
    return false;
  }

  // In demo/dev mode, permit operation if at least 1 font loaded
  areFontsOperational = loadedFontPaths.size > 0;
  return areFontsOperational;
}
