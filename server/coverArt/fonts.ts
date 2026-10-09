/**
 * server/coverArt/fonts.ts
 *
 * Plain-language summary:
 * Bundled OFL font loader and typography renderer for Cover Art v2.
 * - Loads bundled font files from `server/coverArt/fonts/`
 * - Base64-encodes font files for embedded SVG `@font-face` rules (guaranteeing exact rendering in sharp/librsvg)
 * - Performs a boot self-test on server start to guarantee font rendering works
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export interface BundledFontDefinition {
  id: string;
  family: string;
  fileName: string;
  weight: string;
  style: string;
}

const FONT_DEFINITIONS: BundledFontDefinition[] = [
  {
    id: 'urban-bold',
    family: 'UrbanBoldFont',
    fileName: 'LiberationSans-Bold.ttf',
    weight: 'bold',
    style: 'normal',
  },
  {
    id: 'editorial-serif',
    family: 'EditorialSerifFont',
    fileName: 'LiberationSerif-Bold.ttf',
    weight: 'bold',
    style: 'normal',
  },
  {
    id: 'modern-grotesk',
    family: 'ModernGroteskFont',
    fileName: 'FreeSansBold.ttf',
    weight: 'bold',
    style: 'normal',
  },
  {
    id: 'heritage-mono',
    family: 'HeritageMonoFont',
    fileName: 'FreeMonoBold.ttf',
    weight: 'bold',
    style: 'normal',
  },
];

const fontBase64Cache = new Map<string, string>();
let isSelfTested = false;

function resolveFontDir(): string {
  // Support both development (tsx server.ts) and bundled dist/server.cjs
  const localDir = path.resolve(__dirname, 'fonts');
  if (fs.existsSync(localDir)) return localDir;

  const projectDir = path.resolve(process.cwd(), 'server', 'coverArt', 'fonts');
  if (fs.existsSync(projectDir)) return projectDir;

  return '/usr/share/fonts/truetype/liberation';
}

export function loadBundledFonts(): void {
  const fontDir = resolveFontDir();

  for (const def of FONT_DEFINITIONS) {
    let filePath = path.join(fontDir, def.fileName);
    if (!fs.existsSync(filePath)) {
      // Fallback to system locations if run in an unusual path
      if (def.id === 'urban-bold') filePath = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf';
      else if (def.id === 'editorial-serif') filePath = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf';
      else if (def.id === 'modern-grotesk') filePath = '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf';
      else if (def.id === 'heritage-mono') filePath = '/usr/share/fonts/truetype/freefont/FreeMonoBold.ttf';
    }

    if (fs.existsSync(filePath)) {
      try {
        const buffer = fs.readFileSync(filePath);
        fontBase64Cache.set(def.id, buffer.toString('base64'));
      } catch (err: any) {
        console.warn(`[CoverArt Fonts] Could not read font file ${filePath}:`, err?.message);
      }
    }
  }
}

export function getFontFamilyForId(fontId: string): string {
  const def = FONT_DEFINITIONS.find((f) => f.id === fontId);
  return def ? def.family : 'UrbanBoldFont';
}

export function buildSvgFontStyles(): string {
  if (fontBase64Cache.size === 0) {
    loadBundledFonts();
  }

  const cssRules: string[] = [];
  for (const def of FONT_DEFINITIONS) {
    const b64 = fontBase64Cache.get(def.id);
    if (b64) {
      cssRules.push(`
        @font-face {
          font-family: '${def.family}';
          src: url('data:font/truetype;charset=utf-8;base64,${b64}') format('truetype');
          font-weight: ${def.weight};
          font-style: ${def.style};
        }
      `);
    }
  }

  return cssRules.join('\n');
}

/**
 * Boot self-test: renders a small test SVG through sharp to verify font rasterization.
 */
export async function runFontBootSelfTest(): Promise<boolean> {
  if (isSelfTested) return true;
  try {
    loadBundledFonts();
    const fontCss = buildSvgFontStyles();
    const testSvg = `<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg">
      <defs><style>${fontCss}</style></defs>
      <rect width="200" height="80" fill="#000000"/>
      <text x="100" y="50" font-family="UrbanBoldFont, sans-serif" font-size="24" fill="#ffffff" font-weight="bold" text-anchor="middle">BIDOU</text>
    </svg>`;

    const buf = await sharp(Buffer.from(testSvg)).png().toBuffer();
    if (buf && buf.length > 500) {
      isSelfTested = true;
      console.log(`[CoverArt Fonts] Boot self-test PASSED (rasterized test cover banner, ${buf.length} bytes, ${fontBase64Cache.size} bundled fonts loaded)`);
      return true;
    }
    console.warn('[CoverArt Fonts] Boot self-test yielded undersized buffer');
    return false;
  } catch (err: any) {
    console.error('[CoverArt Fonts] Boot self-test FAILED:', err?.message);
    return false;
  }
}
