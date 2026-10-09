/**
 * server/coverArt/recipes.ts
 *
 * Plain-language summary:
 * Style Library recipes for AI Cover Art v2.
 * Each recipe specifies:
 * - id, label
 * - artDirection: evocative wording for the Gemini art director
 * - palette: hex color palette
 * - composition: textZone ('bottom' | 'top') and framing instructions
 * - typography: fontId, case, tracking, align, titleToArtistRatio
 * - optional styleRefs: paths under server/coverArt/style-refs/
 *
 * Shipped recipes (Section 5.1):
 * 1. Afrobeats Sunset
 * 2. Amapiano Neon
 * 3. Makossa Retro
 * 4. Bikutsi Heritage
 * 5. Gospel Light
 * 6. Dark Trap
 * 7. Minimal Pop
 * 8. Coupé-Décalé Gold
 */

import fs from 'fs';
import path from 'path';

export interface StyleRecipeComposition {
  textZone: 'bottom' | 'top';
  framingNotes: string;
}

export interface StyleRecipeTypography {
  fontId: 'bebas' | 'anton' | 'oswald' | 'montserrat' | 'playfair' | 'alexbrush';
  case: 'uppercase' | 'titlecase';
  tracking: number; // letter-spacing in pixels
  align: 'center' | 'left' | 'right';
  titleToArtistRatio: number; // e.g. 2.2
}

export interface StyleRecipe {
  id: string;
  label: string;
  artDirection: string;
  palette: string[];
  composition: StyleRecipeComposition;
  typography: StyleRecipeTypography;
  styleRefs: string[];
}

export const STYLE_RECIPES: Record<string, StyleRecipe> = {
  'afrobeats-sunset': {
    id: 'afrobeats-sunset',
    label: 'Afrobeats Sunset',
    artDirection: 'Warm golden hour sunlight over Lagos coastal horizon, vibrant African elegance, saturated amber backlight, subtle tropical haze, deep velvet shadows, celebratory and charismatic.',
    palette: ['#F86A00', '#FFB020', '#121214'],
    composition: {
      textZone: 'bottom',
      framingNotes: 'Medium 3/4 portrait or central hero subject with expansive warm sky above and calm darker ground at the bottom.',
    },
    typography: {
      fontId: 'bebas',
      case: 'uppercase',
      tracking: 3,
      align: 'center',
      titleToArtistRatio: 2.2,
    },
    styleRefs: [],
  },

  'amapiano-neon': {
    id: 'amapiano-neon',
    label: 'Amapiano Neon',
    artDirection: 'Deep Johannesburg nightlife ambiance, volumetric neon magenta and violet lighting, glossy reflective surfaces, atmospheric club smoke haze, moody cinematic contrast.',
    palette: ['#7928CA', '#FF0080', '#0D0E15'],
    composition: {
      textZone: 'bottom',
      framingNotes: 'Close portrait with intense rim light and shallow depth of field; deep indigo shadow across the bottom third.',
    },
    typography: {
      fontId: 'anton',
      case: 'uppercase',
      tracking: 2,
      align: 'center',
      titleToArtistRatio: 2.4,
    },
    styleRefs: [],
  },

  'makossa-retro': {
    id: 'makossa-retro',
    label: 'Makossa Retro',
    artDirection: '1970s West African vinyl record sleeve aesthetic, warm Kodachrome film grain, analog color saturation, vintage brass instruments patina, nostalgic Douala groove.',
    palette: ['#D97706', '#92400E', '#292524'],
    composition: {
      textZone: 'bottom',
      framingNotes: 'Square album crop, authentic period-accurate styling, balanced warm vignette with clean lower margin.',
    },
    typography: {
      fontId: 'oswald',
      case: 'uppercase',
      tracking: 2,
      align: 'center',
      titleToArtistRatio: 2.0,
    },
    styleRefs: [],
  },

  'bikutsi-heritage': {
    id: 'bikutsi-heritage',
    label: 'Bikutsi Heritage',
    artDirection: 'Equatorial Cameroon forest twilight, rich red clay soil, raw organic wood textures, atmospheric mist through dense canopy, majestic cultural dignity.',
    palette: ['#B45309', '#78350F', '#1C1917'],
    composition: {
      textZone: 'bottom',
      framingNotes: 'Ground-level low angle or centered majestic portrait with shaded lower foreground.',
    },
    typography: {
      fontId: 'montserrat',
      case: 'uppercase',
      tracking: 4,
      align: 'center',
      titleToArtistRatio: 2.1,
    },
    styleRefs: [],
  },

  'gospel-light': {
    id: 'gospel-light',
    label: 'Gospel Light',
    artDirection: 'Radiant atmospheric light shafts streaming through soft clouds, warm ivory and celestial gold highlights, peaceful reverence, pure emotional uplift.',
    palette: ['#FFD700', '#FFF8DC', '#1C1917'],
    composition: {
      textZone: 'bottom',
      framingNotes: 'Upward gazing portrait or serene figure illuminated by heavenly downlight; soft dark falloff at the bottom.',
    },
    typography: {
      fontId: 'playfair',
      case: 'titlecase',
      tracking: 1,
      align: 'center',
      titleToArtistRatio: 2.3,
    },
    styleRefs: [],
  },

  'dark-trap': {
    id: 'dark-trap',
    label: 'Dark Trap',
    artDirection: 'High-contrast monochrome with hard strobe lighting, wet asphalt reflections, harsh silver chrome accents, intense aggressive stare, gritty urban textures.',
    palette: ['#E6E6E6', '#FF8800', '#0A0A0C'],
    composition: {
      textZone: 'bottom',
      framingNotes: 'Direct frontal close-up with wide-angle perspective distortion and deep pitch-black base.',
    },
    typography: {
      fontId: 'anton',
      case: 'uppercase',
      tracking: 3,
      align: 'center',
      titleToArtistRatio: 2.5,
    },
    styleRefs: [],
  },

  'minimal-pop': {
    id: 'minimal-pop',
    label: 'Minimal Pop',
    artDirection: 'Bold negative space, stark architectural concrete and clean lines, high-fashion editorial styling, soft diffused daylight, sophisticated restraint.',
    palette: ['#FFFFFF', '#52525B', '#09090B'],
    composition: {
      textZone: 'top',
      framingNotes: 'Asymmetrical silhouette positioned in the lower half, leaving a vast clean upper third for typography.',
    },
    typography: {
      fontId: 'montserrat',
      case: 'uppercase',
      tracking: 6,
      align: 'center',
      titleToArtistRatio: 1.9,
    },
    styleRefs: [],
  },

  'coupe-decale-gold': {
    id: 'coupe-decale-gold',
    label: 'Coupé-Décalé Gold',
    artDirection: 'Glamorous Abidjan VIP nightlife, glittering champagne sparkles, glossy black leather and fine jewelry, radiant golden spotlights, exuberant luxury.',
    palette: ['#F59E0B', '#FCD34D', '#18181B'],
    composition: {
      textZone: 'bottom',
      framingNotes: 'Heroic waist-up portrait surrounded by golden lens flares with dark shadowed bottom border.',
    },
    typography: {
      fontId: 'bebas',
      case: 'uppercase',
      tracking: 3,
      align: 'center',
      titleToArtistRatio: 2.2,
    },
    styleRefs: [],
  },
};

export function getRecipe(styleId: string): StyleRecipe {
  return STYLE_RECIPES[styleId] || STYLE_RECIPES['afrobeats-sunset'];
}

/**
 * Resolves up to two cleared style reference image paths for a recipe.
 */
export function getRecipeStyleRefBuffers(recipe: StyleRecipe): { buffer: Buffer; mime: string }[] {
  const result: { buffer: Buffer; mime: string }[] = [];
  const baseDir = process.env.COVER_ASSETS_DIR
    ? path.join(process.env.COVER_ASSETS_DIR, 'style-refs')
    : path.resolve(process.cwd(), 'server', 'coverArt', 'style-refs');

  for (const refPath of recipe.styleRefs.slice(0, 2)) {
    const fullPath = path.isAbsolute(refPath) ? refPath : path.join(baseDir, refPath);
    if (fs.existsSync(fullPath)) {
      try {
        const buf = fs.readFileSync(fullPath);
        const mime = fullPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        result.push({ buffer: buf, mime });
      } catch (err: any) {
        console.warn(`[CoverArt Recipes] Could not read style ref ${fullPath}:`, err?.message);
      }
    }
  }

  return result;
}
