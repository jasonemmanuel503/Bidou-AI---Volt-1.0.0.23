// Shared by the server (MusicAPI tags, Gemini prompts) and the client (dropdown options).
export interface StyleDef {
  value: string;          // stored in DB / client_settings — never rename existing ones
  label: string;          // shown in the dropdown
  tags: string;           // comma-separated, English, descriptive
  negative?: string;      // things to avoid
  hidden?: boolean;       // not listed in the dropdown (set only by occasions)
}

export const GENRES: StyleDef[] = [
  { value: 'Makossa', label: 'Makossa (Cameroon Bass & Brass)',
    tags: 'makossa, Cameroonian dance groove from Douala, melodic slap bass guitar, rhythm guitar, brass section, warm live percussion',
    negative: 'EDM drop, trap hi-hats, heavy metal' },
  { value: 'Bikutsi', label: 'Bikutsi (Fast Rhythmic Central African Drive)',
    tags: 'bikutsi, Cameroonian Beti rhythm, fast driving percussion, balafon-style electric guitar, call-and-response chorus, hand claps',
    negative: 'slow ballad, EDM drop' },
  { value: 'Mbolé', label: 'Mbolé (Street Percussion & Modern Poly-rhythms)',
    tags: 'mbole, modern Cameroonian street groove, polyrhythmic percussion, punchy urban drums, deep bass, chant-style hooks',
    negative: 'orchestral, slow ballad' },
  { value: 'Amapiano', label: 'Amapiano (Log-drum Deep House Grooves)',
    tags: 'amapiano, South African deep house groove, log drum bassline, shakers, jazzy piano chords, smooth pads, about 112 BPM',
    negative: 'distorted guitars, heavy metal' },
  { value: 'Afrobeats', label: 'Afrobeats (Lagos / Global Afro-fusion)',
    tags: 'afrobeats, Lagos Afro-fusion, syncopated percussion, warm bass, bright guitar licks, catchy vocal hook, mid-tempo groove',
    negative: 'heavy metal, country' },
  { value: 'Highlife', label: 'Highlife (Warm West African Guitars)',
    tags: 'highlife, West African highlife, interlocking clean guitars, horn section, live bass, relaxed swinging groove',
    negative: 'EDM drop, trap hi-hats' },
  { value: 'African Cinematic', label: 'African Cinematic Orchestral',
    tags: 'cinematic orchestral, African percussion, sweeping strings, powerful choir, dramatic build, emotional crescendo',
    negative: 'trap hi-hats, club beat' },
  { value: 'Gospel', label: 'African Praise & Worship Gospel',
    tags: 'African gospel, praise and worship, rich choir harmonies, organ, live drums, uplifting, call-and-response',
    negative: 'explicit lyrics, trap hi-hats, club beat' },
  { value: 'Zouk', label: 'Afro-Zouk / Sensual Grooves',
    tags: 'afro-zouk, sensual slow groove, smooth bass, soft keys, warm romantic vocals, relaxed tempo',
    negative: 'aggressive, heavy metal' },
  // ---- occasion-only styles (hidden: true) ----
  { value: 'Lullaby', label: 'Gentle Lullaby', hidden: true,
    tags: 'lullaby, very gentle, soft acoustic guitar, kalimba, music box, warm hummed vocals, slow tempo around 60 BPM',
    negative: 'drums, heavy bass, loud, electronic, aggressive, rap' },
  { value: 'Solemn Hymn', label: 'Solemn Hymn & Strings', hidden: true,
    tags: 'solemn hymn, slow tempo, acoustic piano, soft strings, gentle choir, dignified, reverent',
    negative: 'EDM, rap, trap, club beat, upbeat, dance, party' },
  { value: 'Acoustic Ballad', label: 'Acoustic Ballad', hidden: true,
    tags: 'acoustic ballad, fingerstyle guitar, soft piano, warm sincere vocals, slow to mid tempo',
    negative: 'EDM drop, trap hi-hats, aggressive' },
];

export const TONALITIES: StyleDef[] = [
  { value: 'Celebratory & Energetic', label: 'Celebratory & Festive', tags: 'joyful, festive, high energy, danceable' },
  { value: 'Passionate & Romantic',   label: 'Love & Sensual',        tags: 'romantic, passionate, intimate' },
  { value: 'Spiritual & Deep',        label: 'Soulful & Uplifting',   tags: 'soulful, uplifting, spiritual, heartfelt' },
  { value: 'Street Anthem',           label: 'High-energy Club Anthem', tags: 'anthemic, hard-hitting, crowd chant, club energy' },
  { value: 'Cinematic & Melancholic', label: 'Reflective & Emotional', tags: 'reflective, emotional, bittersweet' },
  // new, used mainly by occasions (visible so the user can also pick them)
  { value: 'Solemn & Dignified',      label: 'Solemn & Dignified',    tags: 'solemn, dignified, respectful, tender', negative: 'party, upbeat, comedic' },
  { value: 'Gentle & Soothing',       label: 'Gentle & Soothing',     tags: 'gentle, soothing, calm, tender', negative: 'loud, aggressive' },
  { value: 'Hopeful & Healing',       label: 'Hopeful & Healing',     tags: 'hopeful, comforting, healing, warm' },
];

export const findGenre = (v?: string) => GENRES.find((g) => g.value === v);
export const findTonality = (v?: string) => TONALITIES.find((t) => t.value === v);

/** Dropdown options. `current` is appended if it is a hidden/occasion-only value so the control never renders blank. */
export function genreOptions(current?: string) {
  const list = GENRES.filter((g) => !g.hidden);
  const cur = GENRES.find((g) => g.value === current && g.hidden);
  return [...list, ...(cur ? [cur] : [])].map((g) => ({ value: g.value, label: g.label }));
}
export const tonalityOptions = () => TONALITIES.map((t) => ({ value: t.value, label: t.label }));

const splitTags = (s?: string) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

/** Builds the MusicAPI `tags` string (genre first, then occasion, then mood), de-duplicated and capped at a TAG boundary. */
export function composeStyle(o: {
  genre?: string; tonality?: string;
  occasionTags?: string[]; occasionNegative?: string[]; extraTags?: string[];
  maxLen?: number;
}): { tags: string; negativeTags: string } {
  const g = findGenre(o.genre), t = findTonality(o.tonality);
  const pool = [...splitTags(g?.tags), ...(o.occasionTags || []), ...splitTags(t?.tags), ...(o.extraTags || [])];
  const seen = new Set<string>(); const out: string[] = []; let len = 0; const max = o.maxLen ?? 200;
  for (const tag of pool) {
    const k = tag.toLowerCase(); if (seen.has(k)) continue;
    const add = (out.length ? 2 : 0) + tag.length;
    if (len + add > max) break;
    seen.add(k); out.push(tag); len += add;
  }
  const neg = Array.from(new Set([...splitTags(g?.negative), ...splitTags(t?.negative), ...(o.occasionNegative || [])]));
  return { tags: out.join(', '), negativeTags: neg.join(', ') };
}
