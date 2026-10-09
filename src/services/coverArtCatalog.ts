/**
 * src/services/coverArtCatalog.ts
 *
 * Plain-language summary:
 * Shared catalog and configuration for Bidou AI Cover Art v2.
 * Pure data and type definitions safe to bundle for the browser:
 * - Commercial pricing: Standard 240 credits, Pro 500 credits (both deliver 2 versions)
 * - Curated African & global music style presets
 * - Typography fonts & layout definitions
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
    id: 'afrobeats-vibrant',
    label: 'Afrobeats Vibrant',
    genreVibe: 'Afrobeats, Dancehall, Amapiano',
    description: 'Lagos golden hour warmth, rich saturated sunset tones, electric amber highlights.',
    colorPalette: ['#F86A00', '#FFB020', '#121214'],
  },
  {
    id: 'amapiano-night',
    label: 'Amapiano Night',
    genreVibe: 'Amapiano, Deep House, Afro Tech',
    description: 'Deep club atmospheric glow, velvety indigo shadows, neon magenta and violet accents.',
    colorPalette: ['#7928CA', '#FF0080', '#0D0E15'],
  },
  {
    id: 'afrotrap-street',
    label: 'Afro-Trap & Drill',
    genreVibe: 'Afro-Trap, Drill, Hip-Hop',
    description: 'High-contrast monochrome with vivid metallic sheen, gritty street lens flares.',
    colorPalette: ['#E6E6E6', '#FF8800', '#0A0A0C'],
  },
  {
    id: 'gospel-divine',
    label: 'Gospel & Worship',
    genreVibe: 'Gospel, Soul, Acoustic',
    description: 'Radiant atmospheric light beams, warm ivory and gold gradients, ethereal dignity.',
    colorPalette: ['#FFD700', '#FFF8DC', '#1C1917'],
  },
  {
    id: 'rnb-velvet',
    label: 'Afro R&B Dusk',
    genreVibe: 'R&B, Neo-Soul, Kizomba',
    description: 'Intimate velvet shadows, creamy soft bokeh, warm vintage film grain.',
    colorPalette: ['#E11D48', '#831843', '#111827'],
  },
  {
    id: 'highlife-vintage',
    label: 'Highlife Heritage',
    genreVibe: 'Highlife, Makossa, Coupé-Décalé',
    description: '1970s analog vinyl cover aesthetics, warm sepia, retro brass and textured patina.',
    colorPalette: ['#D97706', '#92400E', '#292524'],
  },
  {
    id: 'cinematic-legend',
    label: 'Cinematic Epic',
    genreVibe: 'Afro-Fusion, Soundtrack, Folk',
    description: 'Heroic wide-angle composition, sweeping savannah skyline, dramatic mythic aura.',
    colorPalette: ['#EA580C', '#C2410C', '#18181B'],
  },
  {
    id: 'minimalist-clean',
    label: 'Minimalist Luxury',
    genreVibe: 'Alternative, Afro-House, Pop',
    description: 'Bold negative space, stark architectural silhouettes, high-fashion editorial styling.',
    colorPalette: ['#FFFFFF', '#52525B', '#09090B'],
  },
];

export interface CoverArtFontOption {
  id: string;
  name: string;
  family: string;
  description: string;
  category: 'sans' | 'serif' | 'display' | 'mono';
}

export const COVER_ART_FONTS: CoverArtFontOption[] = [
  {
    id: 'urban-bold',
    name: 'Urban Bold',
    family: 'Liberation Sans, system-ui, sans-serif',
    description: 'Heavy, impactful uppercase typography for high energy tracks.',
    category: 'sans',
  },
  {
    id: 'editorial-serif',
    name: 'Editorial Serif',
    family: 'Liberation Serif, Georgia, serif',
    description: 'Refined, prestigious serif styling for soulful and classic records.',
    category: 'serif',
  },
  {
    id: 'modern-grotesk',
    name: 'Modern Grotesk',
    family: 'FreeSans, Arial, sans-serif',
    description: 'Clean, balanced, contemporary geometric aesthetic.',
    category: 'sans',
  },
  {
    id: 'heritage-mono',
    name: 'Heritage Mono',
    family: 'FreeMono, monospace',
    description: 'Industrial, raw vinyl stamp aesthetic with retro spacing.',
    category: 'mono',
  },
];

export interface CoverArtLayoutOption {
  id: string;
  name: string;
  description: string;
}

export const COVER_ART_LAYOUTS: CoverArtLayoutOption[] = [
  {
    id: 'bottom-centered',
    name: 'Bottom Centered',
    description: 'Title and artist centered at bottom with protective dark gradient scrim.',
  },
  {
    id: 'bottom-left',
    name: 'Bottom Left',
    description: 'Left-aligned title and artist stacked neatly at the bottom edge.',
  },
  {
    id: 'top-bottom-split',
    name: 'Top / Bottom Split',
    description: 'Artist name at top header, song title commanding the bottom scrim.',
  },
  {
    id: 'center-framed',
    name: 'Center Framed',
    description: 'Centralized title presentation with subtle ambient scrim contrast.',
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
  tier: CoverArtTierId;
  styleId: string;
  fontId?: string;
  layoutId?: string;
  photoDataUrl?: string | null;
  photoConsent?: boolean;
}

export interface RecompositeRequest {
  title?: string;
  artistName?: string;
  fontId?: string;
  layoutId?: string;
}
