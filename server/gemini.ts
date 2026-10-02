import { GoogleGenAI } from '@google/genai';

let genAI: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set. Using fallback simulation for prompt enhancement.');
    }
    genAI = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
  }
  return genAI;
}
