/**
 * server/coverArt/recipes.ts
 *
 * Plain-language summary:
 * Style Library recipes for AI Cover Art v2.
 * Server-only art direction guidelines that drive the Gemini Art Director step.
 * Instructs the image model to produce TEXTLESS, high-fidelity artwork
 * with appropriate lighting, cultural authenticity, composition, and negative space
 * specifically allocated for sharp typography compositing.
 */

export interface StyleRecipe {
  id: string;
  name: string;
  vibe: string;
  lightingAndAtmosphere: string;
  colorPaletteDescription: string;
  cameraAndFraming: string;
  negativeSpaceInstruction: string;
  negativePrompt: string;
}

export const STYLE_RECIPES: Record<string, StyleRecipe> = {
  'afrobeats-vibrant': {
    id: 'afrobeats-vibrant',
    name: 'Afrobeats Vibrant',
    vibe: 'Celebratory, sun-drenched Lagos golden hour, high-energy modern African luxury, rich cultural pride.',
    lightingAndAtmosphere: 'Warm golden backlight, volumetric sunlight through tropical palm leaves or cityscape, amber lens flares, saturated glowing skin tones.',
    colorPaletteDescription: 'Deep warm amber, sunset orange (#F86A00), electric marigold (#FFB020), rich obsidian shadows.',
    cameraAndFraming: 'Medium close-up or dynamic low-angle portrait, 35mm cinematic lens, soft bokeh in background, crisp focal subject.',
    negativeSpaceInstruction: 'Keep the bottom third of the frame darker and relatively uncluttered so bold album title and artist text remain perfectly legible.',
    negativePrompt: 'text, watermark, typography, letters, font, logo, signature, low-resolution, blurry, oversaturated plastic skin, distorted anatomy, extra fingers, cartoonish',
  },

  'amapiano-night': {
    id: 'amapiano-night',
    name: 'Amapiano Night',
    vibe: 'Moody Johannesburg underground club culture, hypnotic bass rhythm, stylish nightlife, atmospheric glow.',
    lightingAndAtmosphere: 'Subtle neon magenta, deep violet ambient wash, dramatic rim lighting, soft smoke haze, moody reflections on dark metallic surfaces.',
    colorPaletteDescription: 'Electric violet, deep indigo, neon pink (#FF0080), rich velvety midnight black.',
    cameraAndFraming: 'Cinematic portrait with shallow depth of field, anamorphic lens flares, moody club lighting.',
    negativeSpaceInstruction: 'Ensure dark atmospheric falloff at the bottom edge for luminous typography.',
    negativePrompt: 'text, watermark, typography, letters, banner, low contrast, daytime, washed out colors, generic stock photo',
  },

  'afrotrap-street': {
    id: 'afrotrap-street',
    name: 'Afro-Trap & Drill',
    vibe: 'Gritty urban street style, heavy metallic bass aesthetic, high-fashion streetwear, fierce and confident.',
    lightingAndAtmosphere: 'High-contrast studio strobe lighting, hard rim highlights, moody streetlights reflecting on wet asphalt, subtle silver chrome highlights.',
    colorPaletteDescription: 'Monochromatic slate, graphite black, harsh white highlights with sharp neon orange accents.',
    cameraAndFraming: 'Intense wide-angle portrait from a slightly low angle, high sharpness, architectural urban background.',
    negativeSpaceInstruction: 'Reserve clean shadowed negative space at the bottom or top for typography.',
    negativePrompt: 'text, watermark, writing, letters, weak contrast, soft pastel colors, cartoon, blurry, deformed hands',
  },

  'gospel-divine': {
    id: 'gospel-divine',
    name: 'Gospel & Worship',
    vibe: 'Sacred majesty, spiritual uplift, gratitude, serene devotion, ethereal grace.',
    lightingAndAtmosphere: 'Soft divine volumetric light shafts streaming from above, golden atmospheric haze, gentle warm rim light, luminous glowing aura.',
    colorPaletteDescription: 'Pure ivory, radiant gold, warm sandstone, deep mahogany, peaceful celestial white.',
    cameraAndFraming: 'Heroic upward angle or serene contemplative portrait, soft focus background, dignified posture.',
    negativeSpaceInstruction: 'Smooth, soft gradient at the bottom for elegant serif typography.',
    negativePrompt: 'text, words, logo, watermark, dark sinister mood, horror, violent, chaotic, blurry, cartoon',
  },

  'rnb-velvet': {
    id: 'rnb-velvet',
    name: 'Afro R&B Dusk',
    vibe: 'Sensual intimacy, midnight romance, smooth silk and velvet textures, nostalgic soul.',
    lightingAndAtmosphere: 'Warm tungsten candle glow, deep burgundy and rose ambient shadows, creamy bokeh spheres, soft analog film grain.',
    colorPaletteDescription: 'Burgundy velvet, rose dusk, deep espresso, warm champagne highlights.',
    cameraAndFraming: 'Close-up portrait or evocative mood shot, 85mm portrait lens, ultra-shallow depth of field.',
    negativeSpaceInstruction: 'Deep shadows along the bottom margin for clean typography overlay.',
    negativePrompt: 'text, words, title, font, harsh sunlight, cartoon, neon clutter, low quality, noise artifacts',
  },

  'highlife-vintage': {
    id: 'highlife-vintage',
    name: 'Highlife Heritage',
    vibe: '1970s West African vinyl record sleeve nostalgia, timeless brass instruments, authentic vintage analog warmth.',
    lightingAndAtmosphere: 'Warm kodachrome analog film lighting, natural sunlight through lace curtains, subtle film dust, nostalgic yellow-amber tint.',
    colorPaletteDescription: 'Rich mustard yellow, burnt sienna, retro olive green, aged vinyl cardboard sepia.',
    cameraAndFraming: 'Classic vintage medium shot, square album framing, authentic period-accurate African fashion and props.',
    negativeSpaceInstruction: 'Aged textured borders with clear bottom region for retro album lettering.',
    negativePrompt: 'modern digital artifacts, 3D render, futuristic neon, text, letters, watermarks, bad anatomy',
  },

  'cinematic-legend': {
    id: 'cinematic-legend',
    name: 'Cinematic Epic',
    vibe: 'Epic African folklore, majestic savannah sunsets, legendary hero posture, cinematic motion picture scale.',
    lightingAndAtmosphere: 'Dramatic twilight rim light, glowing embers or dust motes, towering storm clouds illuminated by crimson sun.',
    colorPaletteDescription: 'Deep crimson, burnt orange, golden savannah straw, deep obsidian charcoal.',
    cameraAndFraming: 'Wide cinematic scale, majestic posture, epic horizon background, anamorphic widescreen feel.',
    negativeSpaceInstruction: 'Deep silhouette baseline with spacious gradient for cinematic title styling.',
    negativePrompt: 'text, title, font, words, logo, modern cars, modern clothes, blur, distorted faces',
  },

  'minimalist-clean': {
    id: 'minimalist-clean',
    name: 'Minimalist Luxury',
    vibe: 'High-end African luxury, editorial magazine cover, architectural geometry, sophisticated negative space.',
    lightingAndAtmosphere: 'Clean directional gallery studio lighting, soft sculpted shadows, pristine highlights.',
    colorPaletteDescription: 'Pure monochrome with single muted accent (warm ochre or brushed bronze).',
    cameraAndFraming: 'Strong geometric silhouette, balanced asymmetrical composition, stark minimalism.',
    negativeSpaceInstruction: 'Vast, intentional negative space across the lower half specifically framed for editorial typography.',
    negativePrompt: 'clutter, busy background, text, letters, writing, watermark, messy composition, low resolution',
  },
};

export function getRecipe(styleId: string): StyleRecipe {
  return STYLE_RECIPES[styleId] || STYLE_RECIPES['afrobeats-vibrant'];
}
