/**
 * server/coverArt/artDirector.ts
 *
 * Plain-language summary:
 * Art Director module for AI Cover Art v2.
 * Uses Gemini (gemini-3.8-flash) to translate music track metadata, artist info,
 * style recipe, and optional photo context into a detailed, English text prompt
 * optimized for textless image generation engines (FLUX.2 klein 9B and Nano Banana 2).
 *
 * Enforces:
 * - 100% TEXTLESS artwork (all typography will be added separately by sharp)
 * - Distinct compositions between version 1 and version 2
 * - Likeness & styling preservation when an artist reference photo is provided
 */

import { GoogleGenAI } from '@google/genai';
import { StyleRecipe } from './recipes';

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

export interface ArtDirectorParams {
  title: string;
  artistName: string;
  genre: string;
  recipe: StyleRecipe;
  hasReferencePhoto: boolean;
  versionIndex: number; // 0 or 1
}

export interface ArtDirectorResult {
  prompt: string;
  negativePrompt: string;
  conceptSummary: string;
}

export async function generateArtDirectorPrompt(
  params: ArtDirectorParams
): Promise<ArtDirectorResult> {
  const { title, artistName, genre, recipe, hasReferencePhoto, versionIndex } = params;
  const ai = getGemini();

  const variationGuidance =
    versionIndex === 0
      ? 'Variant 1: Direct, commanding focal composition. Iconic front or 3/4 hero framing with intense emotional connection and signature key lighting.'
      : 'Variant 2: Atmospheric cinematic interpretation. More dynamic angle, environmental storytelling, dramatic silhouette or evocative profile with lush background depth.';

  const referenceGuidance = hasReferencePhoto
    ? 'An artist portrait reference photo is attached. Maintain the facial features, skin tone, bone structure, and distinctive look of the subject in the reference image, restyled into this world. Do NOT copy the photo background; place the subject into the bespoke album concept.'
    : 'No reference photo provided. Create an evocative, charismatic original subject or powerful conceptual scene that embodies the genre and title.';

  const systemInstruction = `You are an elite music art director designing prestige album cover artwork for African and global artists.
Your goal is to write a prompt for an AI image generation model (FLUX.2 or Nano Banana 2) to render the raw background artwork for an album cover.

CRITICAL CONSTRAINTS:
1. THE ARTWORK MUST BE COMPLETELY TEXTLESS. Do NOT ask for the song title "${title}" or artist name "${artistName}" to be written or painted anywhere on the image. Typography will be composited in post-production.
2. DO NOT write words like "album cover with title", "words", "text overlay", "font", "letters".
3. Describe tangible visual elements: subject, pose, skin texture, wardrobe styling, lighting temperature, color grading, depth of field, and atmosphere.
4. Output strict JSON with keys: "prompt", "negativePrompt", "conceptSummary". No markdown wrappers, no backticks, no commentary.`;

  const userPrompt = `TRACK INFO:
- Title: "${title || 'Untitled'}"
- Artist: "${artistName || 'Artist'}"
- Genre: ${genre || 'Afrobeats'}
- Visual Style Recipe: ${recipe.name}
- Recipe Vibe: ${recipe.vibe}
- Lighting & Atmosphere: ${recipe.lightingAndAtmosphere}
- Color Palette: ${recipe.colorPaletteDescription}
- Camera & Framing: ${recipe.cameraAndFraming}
- Negative Space for typography: ${recipe.negativeSpaceInstruction}
- Variation Direction: ${variationGuidance}
- Subject Guidance: ${referenceGuidance}

Write the optimal English prompt for the image engine. Return valid JSON only:
{"prompt": "...", "negativePrompt": "...", "conceptSummary": "..."}`;

  if (ai && process.env.GEMINI_API_KEY) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: versionIndex === 0 ? 0.7 : 0.85,
          maxOutputTokens: 600,
        },
      });

      const rawText = response.text?.trim() || '';
      // Strip potential markdown code block markers
      const jsonClean = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/s, '').trim();
      const parsed = JSON.parse(jsonClean);

      if (parsed.prompt && typeof parsed.prompt === 'string') {
        const fullNegative = [recipe.negativePrompt, parsed.negativePrompt, 'text, letters, words, logo, typography']
          .filter(Boolean)
          .join(', ');

        return {
          prompt: parsed.prompt.trim(),
          negativePrompt: fullNegative,
          conceptSummary: parsed.conceptSummary || `${recipe.name} (Take ${versionIndex + 1})`,
        };
      }
    } catch (err: any) {
      console.warn('[CoverArt ArtDirector] Gemini generation fallback to deterministic recipe:', err?.message);
    }
  }

  // Deterministic high-quality fallback if Gemini is offline / key absent
  const fallbackSubject = hasReferencePhoto
    ? `Charismatic portrait styled with ${recipe.vibe}. The subject has expressive eyes and authentic styling.`
    : `Evocative album artwork depicting ${recipe.vibe}, inspired by the musical energy of ${genre}.`;

  const fallbackPrompt = `${fallbackSubject} ${recipe.lightingAndAtmosphere}. Palette: ${recipe.colorPaletteDescription}. ${recipe.cameraAndFraming}. ${recipe.negativeSpaceInstruction}. Ultra-clean textless photography, 8k resolution, cinematic color grading, raw depth.`;

  return {
    prompt: fallbackPrompt,
    negativePrompt: `${recipe.negativePrompt}, text, letters, typography, words, watermark`,
    conceptSummary: `${recipe.name} (Take ${versionIndex + 1})`,
  };
}
