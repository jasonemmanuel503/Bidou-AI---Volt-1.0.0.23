import { GenerationJob, GenerationJobVariant } from '../types';
import { formatApiError } from './errorMapping';
import { formatAudioTime } from './audioPlayback';
import { getMusicModelShortLabel } from '../services/modelLabels';

/**
 * Pure metadata, title derivation, formatting, and failure-grouping helpers for the Music Canvas.
 */

export type MusicContainerTier = 'wide' | 'medium' | 'compact';

export function getMusicContainerTier(containerWidth: number): MusicContainerTier {
  if (containerWidth >= 900) return 'wide';
  if (containerWidth >= 560) return 'medium';
  return 'compact';
}

/**
 * Formats a raw model_name or model_id into a clean human-readable studio label.
 */
export function formatMusicModelName(modelName?: string | null, modelId?: string | null): string {
  const raw = (modelName || modelId || '').trim();
  return getMusicModelShortLabel(raw);
}

/**
 * Resolves cover art URL from either the variant thumbnail or job cover_art_url / thumbnail_url,
 * ignoring audio file extensions (.mp3/.wav).
 */
export function resolveCoverArtUrl(
  job?: GenerationJob | null,
  variant?: GenerationJobVariant | null
): string | undefined {
  const candidates = [variant?.thumbnail_url, job?.cover_art_url, job?.thumbnail_url];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0 && !/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(c.trim())) {
      return c.trim();
    }
  }
  return undefined;
}

/**
 * Resolves track duration in seconds, ignoring the legacy 8-second video default on full music tracks.
 */
export function resolveTrackDuration(
  job?: GenerationJob | null,
  liveDuration?: number | null
): number {
  if (typeof liveDuration === 'number' && Number.isFinite(liveDuration) && liveDuration > 0) {
    return liveDuration;
  }
  const jobDur = job?.duration_seconds;
  if (typeof jobDur === 'number' && Number.isFinite(jobDur) && jobDur > 15) {
    return jobDur;
  }
  const modelKey = `${job?.model_id || ''} ${job?.model_name || ''}`.toLowerCase();
  if (modelKey.includes('clip')) {
    return 30;
  }
  return 130;
}

/**
 * Checks whether a job's genre/tonality are just the untouched 'Makossa' / 'Celebratory & Energetic'
 * studio defaults on a prompt that describes a different musical style.
 */
function hasUntouchedDefaultGenre(job: GenerationJob): boolean {
  const genre = (job.genre || '').trim();
  const prompt = (job.prompt || '').trim().toLowerCase();
  if (!prompt) return false;
  if (genre.toLowerCase() === 'makossa' && !prompt.includes('makossa')) {
    return true;
  }
  return false;
}

/**
 * Extracts concise style/genre/tempo chips from a descriptive music prompt.
 */
function extractPromptStyleChips(prompt: string): string[] {
  if (!prompt || !prompt.trim()) return [];
  const cleaned = prompt
    .replace(/\.\s*Exclude styles:.*$/i, '')
    .replace(/Settings:.*$/i, '')
    .trim();

  const clauses = cleaned
    .split(/[,.;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 38 && !/^(instrumentation|vocals|production|exclude|settings):/i.test(s));

  const chips: string[] = [];
  if (clauses.length > 0) {
    chips.push(clauses[0]);
  }
  // Prefer a BPM or key or concise style descriptor as the second chip
  const bpmOrMood = clauses.slice(1).find((c) => /\b\d{2,3}\s*bpm\b/i.test(c) || /\b(minor|major|afro|r&b|soul|drill|pop|folk|jazz|trap|acoustic|melancholic|romantic|uplifting)\b/i.test(c));
  if (bpmOrMood && !chips.some(( existing ) => existing.toLowerCase() === bpmOrMood.toLowerCase())) {
    chips.push(bpmOrMood);
  } else if (clauses.length > 1) {
    chips.push(clauses[1]);
  }
  return chips;
}

/**
 * Derives a clean track title in strict order (Section 4.6):
 * 1. Explicit title field if present (job.title, job.client_settings.musicTitle, or job.client_settings.title)
 * 2. A title parsed from `lyrics` only if a real title line exists
 * 3. `genre` + short prompt excerpt (first ~6 words) — omitting default genre if prompt describes another style
 * 4. "Untitled track"
 */
export function deriveTrackTitle(job: GenerationJob): string {
  // 1. Explicit title field
  const rawJob = job as GenerationJob & { title?: string };
  const settings = job.client_settings as Record<string, unknown> | undefined;
  const explicitTitle =
    typeof rawJob.title === 'string' && rawJob.title.trim().length > 0
      ? rawJob.title.trim()
      : typeof settings?.musicTitle === 'string' && settings.musicTitle.trim().length > 0
      ? settings.musicTitle.trim()
      : typeof settings?.title === 'string' && settings.title.trim().length > 0
      ? settings.title.trim()
      : '';

  if (explicitTitle) {
    return explicitTitle;
  }

  // 2. Title parsed from `lyrics` only if a real title line exists
  if (typeof job.lyrics === 'string' && job.lyrics.trim().length > 0) {
    const parsedFromLyrics = parseTitleFromLyrics(job.lyrics);
    if (parsedFromLyrics) {
      return parsedFromLyrics;
    }
  }

  // 3. `genre` + short prompt excerpt (first ~6 words)
  const genre = typeof job.genre === 'string' ? job.genre.trim() : '';
  const prompt = typeof job.prompt === 'string' ? job.prompt.trim() : '';
  const ignoreDefaultGenre = hasUntouchedDefaultGenre(job);

  if (prompt) {
    const words = prompt.split(/\s+/).filter(Boolean);
    const excerptWords = words.slice(0, 6);
    const excerpt = excerptWords.join(' ').replace(/[,.;:]+$/, '') + (words.length > 6 ? '…' : '');

    if (genre && !ignoreDefaultGenre) {
      // Avoid repeating genre if the prompt already begins with the genre word
      if (excerpt.toLowerCase().startsWith(genre.toLowerCase())) {
        return excerpt;
      }
      return `${genre} · ${excerpt}`;
    }
    return excerpt;
  }

  if (genre) {
    return genre;
  }

  // 4. Fallback
  return 'Untitled track';
}

/**
 * Extracts a title from lyrics only when a genuine title line is present:
 * - "Title: Song Name" or "# Song Name" on the first non-empty line, OR
 * - A standalone short heading line (<= 48 chars) before a blank line + [Verse/Chorus/Intro] section tag.
 */
export function parseTitleFromLyrics(lyrics: string): string | null {
  const lines = lyrics.split(/\r?\n/).map((l) => l.trim());
  const firstNonEmptyIdx = lines.findIndex((l) => l.length > 0);
  if (firstNonEmptyIdx === -1) return null;

  const firstLine = lines[firstNonEmptyIdx];

  // Pattern A: Explicit "Title: ..." or Markdown "# ..."
  const explicitMatch = firstLine.match(/^(?:title\s*:\s*|#+\s+)(.+)$/i);
  if (explicitMatch && explicitMatch[1]) {
    const cleaned = explicitMatch[1].trim().replace(/^["']|["']$/g, '');
    if (cleaned.length > 0 && cleaned.length <= 64) {
      return cleaned;
    }
  }

  // Pattern B: Short heading line followed by a blank line and a [Section] marker
  if (
    !firstLine.startsWith('[') &&
    !firstLine.endsWith(',') &&
    !firstLine.endsWith('.') &&
    firstLine.length >= 2 &&
    firstLine.length <= 48
  ) {
    const nextLine = lines[firstNonEmptyIdx + 1];
    const thirdLine = lines[firstNonEmptyIdx + 2];
    if (nextLine === '' && typeof thirdLine === 'string' && /^\[(verse|chorus|intro|hook|bridge)/i.test(thirdLine)) {
      return firstLine.replace(/^["']|["']$/g, '');
    }
  }

  return null;
}

/**
 * Formats duration in seconds to m:ss.
 */
export function formatDuration(seconds?: number | null): string {
  return formatAudioTime(seconds);
}

/**
 * Extracts up to 2 visible style/genre/tonality chips and an overflow count.
 */
export function deriveStyleChips(job: GenerationJob): {
  visible: string[];
  overflowCount: number;
  all: string[];
} {
  const candidates: string[] = [];
  const pushUnique = (val?: unknown) => {
    if (typeof val !== 'string') return;
    const trimmed = val.trim();
    if (!trimmed) return;
    if (!candidates.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      candidates.push(trimmed);
    }
  };

  if (hasUntouchedDefaultGenre(job)) {
    const fromPrompt = extractPromptStyleChips(job.prompt || '');
    for (const chip of fromPrompt) {
      pushUnique(chip);
    }
  } else {
    pushUnique(job.genre);
    pushUnique(job.tonality);
  }

  if (job.client_settings) {
    pushUnique(job.client_settings.mood);
    pushUnique(job.client_settings.style);
    pushUnique(job.client_settings.tempo);
  }

  return {
    visible: candidates.slice(0, 2),
    overflowCount: Math.max(0, candidates.length - 2),
    all: candidates,
  };
}

/**
 * Formats an ISO timestamp into a concise relative time string (e.g., "Just now", "4m ago", "2h ago").
 */
export function formatRelativeTime(isoDate?: string): string {
  if (!isoDate) return 'Just now';
  const time = new Date(isoDate).getTime();
  if (!Number.isFinite(time)) return 'Just now';

  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  try {
    return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return `${diffDays}d ago`;
  }
}

/**
 * Generates a deterministic studio cover gradient using only existing brand palette tokens
 * (#F86A00, #FF8800, #FFB020 and warm dark studio tones).
 */
export function getDeterministicCoverGradient(seed: string): string {
  let hash = 0;
  const str = seed || 'bidou-music';
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const abs = Math.abs(hash);
  const angle = 115 + (abs % 90);

  const palettes = [
    ['#F86A00', '#FF8800', '#261405'],
    ['#FF8800', '#FFB020', '#2D1606'],
    ['#1F1610', '#F86A00', '#FFB020'],
    ['#F86A00', '#331A08', '#FF8800'],
    ['#FFB020', '#F86A00', '#1C140D'],
  ];

  const [c1, c2, c3] = palettes[abs % palettes.length];
  return `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 52%, ${c3} 100%)`;
}

export interface MusicBatchItem {
  job: GenerationJob;
  variants: GenerationJobVariant[];
}

export type MusicDisplayGroup =
  | {
      kind: 'job';
      batch: MusicBatchItem;
    }
  | {
      kind: 'collapsed_failures';
      id: string;
      mappedError: string;
      shortReason: string;
      batches: MusicBatchItem[];
    };

export function isBatchFailed(batch: MusicBatchItem): boolean {
  if (batch.job.status === 'failed') return true;
  if (batch.variants.length > 0 && batch.variants.every((v) => v.status === 'failed')) {
    return true;
  }
  return false;
}

export function getBatchMappedError(batch: MusicBatchItem): string {
  const variantErr = batch.variants.find((v) => v.error_message)?.error_message;
  const raw = variantErr || batch.job.error_message;
  return formatApiError(raw);
}

export function getShortFailureReason(mappedError: string): string {
  const lower = mappedError.toLowerCase();
  if (lower.includes('moderation') || lower.includes('safety')) return 'content moderation';
  if (lower.includes('invalid') && (lower.includes('input') || lower.includes('format'))) return 'invalid input';
  if (lower.includes('timed out') || lower.includes('timeout')) return 'timed out';
  if (lower.includes('provider') && lower.includes('offline')) return 'provider offline';
  if (lower.includes('temporarily unavailable')) return 'provider unavailable';
  if (lower.includes('provider key')) return 'provider unconfigured';
  if (lower.includes('rate') || lower.includes('too many requests')) return 'rate limited';
  if (lower.includes('network') || lower.includes('connection')) return 'network error';
  if (lower.includes('session') || lower.includes('sign in')) return 'session expired';
  return 'generation failed';
}

/**
 * Section 4.4 Failure grouping:
 * When 2+ consecutive failed jobs share the same mapped error message,
 * keeps the newest failed job shown in full (with Retry) and collapses the
 * remaining consecutive identical failures into one summary row below it.
 */
export function groupMusicBatches(batches: MusicBatchItem[]): MusicDisplayGroup[] {
  const result: MusicDisplayGroup[] = [];
  let i = 0;

  while (i < batches.length) {
    const current = batches[i];
    if (!isBatchFailed(current)) {
      result.push({ kind: 'job', batch: current });
      i++;
      continue;
    }

    const mappedError = getBatchMappedError(current);
    const run: MusicBatchItem[] = [current];
    let j = i + 1;
    while (j < batches.length && isBatchFailed(batches[j]) && getBatchMappedError(batches[j]) === mappedError) {
      run.push(batches[j]);
      j++;
    }

    // Always show the newest failed job in full (with Retry)
    result.push({ kind: 'job', batch: run[0] });

    // If 2+ consecutive failed jobs share the same mapped error, collapse the earlier ones
    if (run.length >= 2) {
      const earlier = run.slice(1);
      result.push({
        kind: 'collapsed_failures',
        id: `failed-group-${earlier[0].job.id}`,
        mappedError,
        shortReason: getShortFailureReason(mappedError),
        batches: earlier,
      });
    }

    i = j;
  }

  return result;
}
