/**
 * server/occasionPrompts.ts
 *
 * Dedicated occasion styling, prompt enrichment, and server-side lyric composition.
 */

import { GoogleGenAI } from '@google/genai';
import { GenerationTaskContext } from './providers/types';
import { isLiveMode } from './config/mode';

export interface OccasionInput {
  id: string;
  subId?: string;
  details: Record<string, string>;
}

export function sanitizeOccasionInput(raw: any): { ok: true; value: OccasionInput } | { ok: false; message: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'Occasion must be a valid object' };
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) {
    return { ok: false, message: 'Occasion ID is required' };
  }
  const subId = typeof raw.subId === 'string' && raw.subId.trim() ? raw.subId.trim() : undefined;
  const details: Record<string, string> = {};
  if (raw.details && typeof raw.details === 'object' && !Array.isArray(raw.details)) {
    for (const [k, v] of Object.entries(raw.details)) {
      if (typeof v === 'string') {
        details[k] = v.trim().slice(0, 200);
      }
    }
  }
  return {
    ok: true,
    value: {
      id: id.slice(0, 50),
      subId: subId ? subId.slice(0, 50) : undefined,
      details,
    },
  };
}

/**
 * Builds styling tags and negative tags for life occasions.
 */
export function buildOccasionStyle(id: string, subId?: string): { tags: string[]; negative: string[] } {
  const normId = (id || '').toLowerCase().trim();
  const normSub = (subId || '').toLowerCase().trim();

  const presets: Record<string, { tags: string[]; negative: string[] }> = {
    birthday: {
      tags: ['birthday celebration', 'happy birthday', 'joyful jubilee', 'festive cheers'],
      negative: ['sad', 'funeral', 'melancholic'],
    },
    wedding: {
      tags: ['wedding anthem', 'sacred marriage union', 'celebration of love', 'romance'],
      negative: ['heartbreak', 'breakup', 'party club trap'],
    },
    anniversary: {
      tags: ['anniversary celebration', 'lasting love', 'devotion', 'romantic milestone'],
      negative: ['sadness', 'breakup', 'angry'],
    },
    funeral: {
      tags: ['in loving memory', 'solemn tribute', 'dignified remembrance', 'peaceful farewell'],
      negative: ['party', 'club beat', 'comedic', 'upbeat', 'trap', 'edm', 'dance'],
    },
    memorial: {
      tags: ['memorial tribute', 'gentle remembrance', 'reverent choir', 'peaceful rest'],
      negative: ['party', 'club beat', 'comedic', 'upbeat', 'trap', 'edm'],
    },
    baby: {
      tags: ['gentle lullaby', 'sweet lullaby for baby', 'tender acoustic hum', 'soothing nursery melody'],
      negative: ['drums', 'heavy bass', 'loud', 'aggressive', 'rap', 'trap'],
    },
    lullaby: {
      tags: ['gentle lullaby', 'soft acoustic kalimba', 'warm hummed lullaby', 'calming bedtime'],
      negative: ['drums', 'heavy bass', 'loud', 'electronic', 'aggressive', 'rap'],
    },
    graduation: {
      tags: ['graduation triumph', 'victory anthem', 'proud achievement', 'inspirational future'],
      negative: ['mournful', 'sad', 'despair'],
    },
    worship: {
      tags: ['praise and worship', 'devotional praise', 'spiritual uplift', 'call-and-response gospel choir'],
      negative: ['explicit', 'club beat', 'profanity'],
    },
  };

  const found = presets[normId] || presets[normSub];
  if (found) {
    return found;
  }

  // Fallback for custom or unlisted occasions
  const cleanOccasion = (subId || id || '').replace(/[-_]/g, ' ').trim();
  return {
    tags: cleanOccasion ? [`${cleanOccasion} celebration`, cleanOccasion] : [],
    negative: [],
  };
}

/**
 * Builds context to pass to prompt enhancer when an occasion is present.
 */
export function buildOccasionEnhancerContext(occasion: OccasionInput): string {
  const parts: string[] = [`Occasion: ${occasion.id}${occasion.subId ? ` (${occasion.subId})` : ''}.`];
  const detailKeys = Object.keys(occasion.details || {});
  if (detailKeys.length > 0) {
    const serialized = detailKeys.map((k) => `${k}: ${occasion.details[k]}`).join(', ');
    parts.push(`Occasion details: ${serialized}.`);
  }
  parts.push('Tailor the song brief, story, and emotional tone specifically for this life occasion.');
  return parts.join(' ');
}

let genAI: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    genAI = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
  }
  return genAI;
}

export interface ComposeLyricsParams {
  title?: string;
  genre?: string;
  tonality?: string;
  instructions?: string;
  description?: string;
  language?: string;
  occasion?: OccasionInput | null;
}

/**
 * Composes lyrics using Gemini Flash.
 */
export async function composeLyrics(params: ComposeLyricsParams): Promise<{ lyrics: string; title: string; extraTags?: string[] }> {
  const { title, genre = 'Afrobeats', tonality = 'Celebratory & Energetic', instructions, description, language, occasion } = params;

  if (!process.env.GEMINI_API_KEY) {
    if (isLiveMode()) {
      throw new Error('GEMINI_API_KEY is missing in live mode');
    }
    const demoLyrics = `[Verse 1]\nSun is rising over Douala bay,\nMusic in the air we start our day.\nFrom Yaoundé to Lagos streets,\nHeart and soul in African beats.\n\n[Chorus]\nSing it loud, let the rhythm flow,\nFeel the fire in the spirit glow!\nTogether as one under the sun,\nThe joy of our journey has just begun.\n\n[Verse 2]\nHand in hand we dance tonight,\nUnderneath the starlit light.\nGenerations side by side,\nCarrying our heritage and pride.\n\n[Outro]\nSinging forever, shining so bright.`;
    return {
      lyrics: demoLyrics,
      title: title || 'Song of Africa',
      extraTags: [],
    };
  }

  const ai = getGemini();
  const occasionSummary = occasion
    ? `Occasion: ${occasion.id}${occasion.subId ? ` (${occasion.subId})` : ''}. Details: ${JSON.stringify(occasion.details)}.`
    : '';

  const systemInstruction = `You are an elite lyricist and songwriter for contemporary African and international music on Bidou AI.
Write authentic, poetic, rhythmic song lyrics with clear section headers ([Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Chorus], [Outro]).

RULES:
1. Always format with section markers like [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Outro].
2. Use authentic cadence, natural rhyme, and emotional depth matching the requested genre and tonality.
3. Language / Dialect: ${language || 'Culturally authentic multilingual phrasing where appropriate (English, French, Cameroonian Pidgin, or Camfranglais)'}.
4. If an occasion is specified, deeply personalize the narrative, names, and emotional touchpoints.
5. Provide a catchy, memorable title if not already given.
6. Return output in this exact format:
TITLE: <song title>
LYRICS:
<lyrics with section markers>
`;

  const userPrompt = `Song brief & story:
${description || 'A vibrant song celebrating life and music'}

Musical Genre: ${genre}
Mood / Tonality: ${tonality}
Provided Title: ${title || 'None (please propose one)'}
${instructions ? `Special Structure Instructions: ${instructions}` : ''}
${occasionSummary}
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: userPrompt,
    config: {
      systemInstruction,
      temperature: 0.8,
      maxOutputTokens: 1200,
    },
  });

  const text = (response.text || '').trim();
  if (!text) {
    throw new Error('Gemini returned an empty lyrics response');
  }

  let resolvedTitle = title || 'Untitled';
  let resolvedLyrics = text;

  const titleMatch = text.match(/^TITLE:\s*(.+)$/im);
  if (titleMatch) {
    resolvedTitle = titleMatch[1].trim().replace(/^["'`]|["'`]$/g, '');
  }

  const lyricsMatch = text.match(/LYRICS:\s*([\s\S]+)$/i);
  if (lyricsMatch) {
    resolvedLyrics = lyricsMatch[1].trim();
  } else if (titleMatch) {
    resolvedLyrics = text.replace(/^TITLE:\s*.+$/im, '').trim();
  }

  return {
    lyrics: resolvedLyrics,
    title: resolvedTitle.slice(0, 80),
    extraTags: [],
  };
}

/**
 * Ensures real lyrics exist on GenerationTaskContext before calling music providers.
 * If lyrics are absent, writes them using the prompt/description as the song brief.
 */
export async function ensureLyrics(ctx: GenerationTaskContext): Promise<{ lyrics: string; title?: string; extraTags?: string[] }> {
  if (ctx.lyrics && ctx.lyrics.trim()) {
    return {
      lyrics: ctx.lyrics.trim(),
      title: ctx.title,
    };
  }

  const written = await composeLyrics({
    title: ctx.title,
    genre: ctx.genre,
    tonality: ctx.tonality,
    description: ctx.prompt,
    occasion: ctx.occasion ? { id: ctx.occasion.id, subId: ctx.occasion.subId, details: ctx.occasion.details } : null,
  });

  if (!ctx.title && written.title) {
    ctx.title = written.title;
  }

  return written;
}
