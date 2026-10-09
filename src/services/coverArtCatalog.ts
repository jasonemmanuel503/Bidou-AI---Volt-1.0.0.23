/**
 * src/services/coverArtCatalog.ts
 *
 * Plain-language summary:
 * Shared catalog and configuration for Bidou AI Cover Art v2.
 * Pure data and type definitions safe to bundle for the browser:
 * - Commercial pricing: Standard 240 credits, Pro 500 credits (both deliver 2 versions)
 * - 8 Curated African & global music style presets:
 *   Afrobeats Sunset, Amapiano Neon, Makossa Retro, Bikutsi Heritage,
 *   Gospel Light, Dark Trap, Minimal Pop, Coupé-Décalé Gold.
 * - Bundled SIL OFL typography fonts with French accent support (Bebas, Anton, Oswald, Montserrat, Playfair, Alex Brush)
 * - Request and response contract interfaces
 *
 * Rule: NO Node APIs, NO process.env.
 */

export type CoverArtTierId = 'standard' | 'pro';

export interface CoverArtTierConfig {
  id: CoverArtTierId;
  name: string;
  engineName: string;
  description: string;
  creditCost: number;
  optionsCount: number;
  providerCostUsdPerVersion: number;
}

export const COVER_ART_TIERS: Record<CoverArtTierId, CoverArtTierConfig> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    engineName: 'FLUX.2 Klein 9B',
    description: 'High-speed, crisp artwork with balanced lighting and vivid color.',
    creditCost: 240, // 2 versions × 120 credits commercial target (floor ≈ 110 credits)
    optionsCount: 2,
    providerCostUsdPerVersion: 0.019,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    engineName: 'Nano Banana 2',
    description: 'Studio-grade fidelity, rich textures, volumetric lighting, and fine portrait detail.',
    creditCost: 500, // 2 versions × 250 credits commercial target (floor ≈ 370 credits)
    optionsCount: 2,
    providerCostUsdPerVersion: 0.067,
  },
};

export interface CoverArtStyleOption {
  id: string;
  label: string;
  genreVibe: string;
  description: string;
  colorPalette: string[];
}

export const COVER_ART_STYLES: CoverArtStyleOption[] = [
  {
    id: 'afrobeats-sunset',
    label: 'Afrobeats Sunset',
    genreVibe: 'Afrobeats, Dancehall, Amapiano',
    description: 'Lagos golden hour warmth, rich saturated amber tones, electric sunlight lens flare.',
    colorPalette: ['#F86A00', '#FFB020', '#121214'],
  },
  {
    id: 'amapiano-neon',
    label: 'Amapiano Neon',
    genreVibe: 'Amapiano, Deep House, Afro Tech',
    description: 'Atmospheric club night glow, velvety indigo shadows, neon magenta and violet accents.',
    colorPalette: ['#7928CA', '#FF0080', '#0D0E15'],
  },
  {
    id: 'makossa-retro',
    label: 'Makossa Retro',
    genreVibe: 'Makossa, Highlife, Vintage Afrobeat',
    description: '1970s analog vinyl record sleeve warmth, vintage sepia, textured brass patina.',
    colorPalette: ['#D97706', '#92400E', '#292524'],
  },
  {
    id: 'bikutsi-heritage',
    label: 'Bikutsi Heritage',
    genreVibe: 'Bikutsi, Folk, Traditional Fusion',
    description: 'Equatorial forest twilight, earthy ochre, sacred red earth, raw organic percussion aura.',
    colorPalette: ['#B45309', '#78350F', '#1C1917'],
  },
  {
    id: 'gospel-light',
    label: 'Gospel Light',
    genreVibe: 'Gospel, Soul, Worship, Acoustic',
    description: 'Radiant atmospheric light beams, warm ivory and gold gradients, ethereal dignity.',
    colorPalette: ['#FFD700', '#FFF8DC', '#1C1917'],
  },
  {
    id: 'dark-trap',
    label: 'Dark Trap',
    genreVibe: 'Afro-Trap, Drill, Heavy Bass',
    description: 'High-contrast monochrome with vivid metallic sheen, gritty street lens flares.',
    colorPalette: ['#E6E6E6', '#FF8800', '#0A0A0C'],
  },
  {
    id: 'minimal-pop',
    label: 'Minimal Pop',
    genreVibe: 'Alternative, Pop, Afro-House',
    description: 'Bold negative space, stark architectural silhouettes, high-fashion editorial styling.',
    colorPalette: ['#FFFFFF', '#52525B', '#09090B'],
  },
  {
    id: 'coupe-decale-gold',
    label: 'Coupé-Décalé Gold',
    genreVibe: 'Coupé-Décalé, Afro-Pop, Party',
    description: 'Abidjan nightlife luxury, gleaming champagne gold, sparkling reflections, VIP energy.',
    colorPalette: ['#F59E0B', '#FCD34D', '#18181B'],
  },
];

export interface CoverArtFontOption {
  id: string;
  name: string;
  fontFile: string;
  description: string;
  category: 'sans' | 'serif' | 'display' | 'script';
}

export const COVER_ART_FONTS: CoverArtFontOption[] = [
  {
    id: 'bebas',
    name: 'Bebas Neue',
    fontFile: 'BebasNeue-Regular.ttf',
    description: 'Iconic tall all-caps display sans with powerful punch.',
    category: 'display',
  },
  {
    id: 'anton',
    name: 'Anton',
    fontFile: 'Anton-Regular.ttf',
    description: 'Heavy condensed grotesque with massive impact.',
    category: 'display',
  },
  {
    id: 'oswald',
    name: 'Oswald',
    fontFile: 'Oswald.ttf',
    description: 'Balanced modern condensed Gothic sans.',
    category: 'sans',
  },
  {
    id: 'montserrat',
    name: 'Montserrat ExtraBold',
    fontFile: 'Montserrat.ttf',
    description: 'Clean, geometric, contemporary modern aesthetic.',
    category: 'sans',
  },
  {
    id: 'playfair',
    name: 'Playfair Display',
    fontFile: 'PlayfairDisplay.ttf',
    description: 'Prestigious high-contrast serif for soulful classic records.',
    category: 'serif',
  },
  {
    id: 'alexbrush',
    name: 'Alex Brush',
    fontFile: 'AlexBrush-Regular.ttf',
    description: 'Elegant flowing script for artist accents.',
    category: 'script',
  },
];

export interface CoverArtLayoutOption {
  id: string;
  name: string;
  textZone: 'bottom' | 'top';
  description: string;
}

export const COVER_ART_LAYOUTS: CoverArtLayoutOption[] = [
  {
    id: 'bottom-centered',
    name: 'Bottom Centered',
    textZone: 'bottom',
    description: 'Title and artist centered at bottom with protective dark gradient scrim.',
  },
  {
    id: 'bottom-left',
    name: 'Bottom Left',
    textZone: 'bottom',
    description: 'Left-aligned title and artist stacked neatly at the bottom edge.',
  },
  {
    id: 'top-bottom-split',
    name: 'Top / Bottom Split',
    textZone: 'bottom', // primary title at bottom, artist at top
    description: 'Artist name at top header, song title commanding the bottom scrim.',
  },
  {
    id: 'top-header',
    name: 'Top Header',
    textZone: 'top',
    description: 'Title and artist positioned at top margin over protective top scrim.',
  },
];

export interface CoverArtVersionDto {
  index: number;
  imageUrl: string;
  thumbnailUrl: string;
  textlessUrl?: string;
  engine: string;
}

export interface CoverArtJobDto {
  id: string;
  idempotencyKey?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  tier: CoverArtTierId;
  title: string;
  artistName: string;
  genre: string;
  styleId: string;
  fontId: string;
  layoutId: string;
  creditCost: number;
  versions: CoverArtVersionDto[];
  selectedVersionIndex: number | null;
  selectedCoverUrl: string | null;
  errorMessage?: string;
  errorCode?: string;
  partialRefund?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoverArtOptionsResponse {
  tiers: Record<CoverArtTierId, CoverArtTierConfig>;
  styles: CoverArtStyleOption[];
  fonts: CoverArtFontOption[];
  layouts: CoverArtLayoutOption[];
  standardEngineConfigured: 'klein9b' | 'nb2lite';
  isStandardTierAvailable: boolean;
}

export interface CreateCoverArtRequest {
  title: string;
  artistName?: string;
  genre?: string;
  tonality?: string;
  tier: CoverArtTierId;
  styleId: string;
  fontId?: string;
  layoutId?: string;
  idempotencyKey?: string;
  photoDataUrl?: string | null;
  photoConsent?: boolean;
}

export interface RecompositeRequest {
  title?: string;
  artistName?: string;
  fontId?: string;
  layoutId?: string;
}
