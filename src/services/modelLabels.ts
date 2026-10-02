/**
 * src/services/modelLabels.ts
 *
 * Single source of truth for customer-facing music product labels.
 *
 * Decided mapping:
 * - `mus_lyria_3_pro` / `lyria_3_pro` -> "Sonic v4.5 (Full Studio)"
 * - `mus_suno_sonic_v5` / `suno_sonic_v5` -> "Sonic v5 (Vocalist Master)"
 * - `mus_suno_v6` / `suno_v6` -> "Suno V6 (Flagship Studio)"
 *
 * Never exposes raw internal keys like "lyria_3_pro" or legacy branding like "Google Lyria"
 * to end users.
 */

export function getMusicModelDisplayName(modelIdOrName?: string | null): string {
  const raw = String(modelIdOrName || '').trim();
  if (!raw) return 'Sonic v4.5 (Full Studio)';

  const lower = raw.toLowerCase();

  // Sunor / Suno V6
  if (lower === 'mus_suno_v6' || lower === 'suno_v6' || lower === 'suno-v6' || lower.includes('suno v6')) {
    return 'Suno V6 (Flagship Studio)';
  }

  // MusicAPI Sonic v5
  if (
    lower === 'mus_suno_sonic_v5' ||
    lower === 'suno_sonic_v5' ||
    lower === 'mus_suno_v5' ||
    lower === 'suno_v5' ||
    lower === 'sonic-v5' ||
    lower === 'sonic_v5' ||
    lower.includes('sonic v5') ||
    lower.includes('suno / sonic v5')
  ) {
    return 'Sonic v5 (Vocalist Master)';
  }

  // MusicAPI Sonic v4.5 (legacy internal id: mus_lyria_3_pro / lyria_3_pro)
  if (
    lower === 'mus_lyria_3_pro' ||
    lower === 'lyria_3_pro' ||
    lower === 'lyria_3_pro_preview' ||
    lower === 'lyria_3_clip' ||
    lower === 'mus_lyria_3_clip' ||
    lower === 'sonic-v4-5' ||
    lower === 'sonic_v4_5' ||
    lower === 'sonic-v4' ||
    lower === 'sonic_v4' ||
    lower.includes('lyria') ||
    lower.includes('sonic v4')
  ) {
    return 'Sonic v4.5 (Full Studio)';
  }

  return raw;
}

export function getMusicModelShortLabel(modelIdOrName?: string | null): string {
  const full = getMusicModelDisplayName(modelIdOrName);
  if (full.startsWith('Sonic v4.5')) return 'Sonic v4.5';
  if (full.startsWith('Sonic v5')) return 'Sonic v5';
  if (full.startsWith('Suno V6')) return 'Suno V6';
  return full;
}
