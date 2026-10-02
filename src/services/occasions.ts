export type OccasionGroupId = 'celebrations' | 'love' | 'remembrance' | 'faith' | 'motivation';
export type Privacy = 'force_private' | 'default_private' | 'default_public';

export interface OccasionSelection {
  id: string;
  subId?: string;
  details: Record<string, string>;
}

export interface OccasionField {
  key: string;
  label: string;
  placeholder?: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  maxLen: number;
  options?: string[];
}

export interface OccasionSub {
  id: string;
  label: string;
  fields?: string[];                // overrides the occasion's field list
  genre?: string;
  tonality?: string;
  tags?: string[];
  negative?: string[];
  rules?: string[];
}

export interface OccasionDef {
  id: string;
  group: OccasionGroupId;
  label: string;
  icon: string;
  blurb: string;
  subs?: OccasionSub[];
  fields: string[];                 // 2-4 keys of FIELD_LIBRARY
  genre: string;
  genreChoices: string[];
  tonality: string;
  tags: string[];
  negative: string[];
  rules: string[];
  titleTemplate: string;            // {recipientName} etc.; unresolved placeholders are removed
  privacy: Privacy;
}

export const GROUPS: { id: OccasionGroupId; label: string }[] = [
  { id: 'celebrations', label: 'Celebrations' },
  { id: 'love', label: 'Love' },
  { id: 'remembrance', label: 'Remembrance & care' },
  { id: 'faith', label: 'Faith & seasons' },
  { id: 'motivation', label: 'Motivation & support' },
];

export const LANGUAGES = ['English', 'French', 'Cameroonian Pidgin', 'Camfranglais'] as const;

export const FIELD_LIBRARY: Record<string, OccasionField> = {
  recipientName: { key: 'recipientName', label: 'Who is it for?', placeholder: 'e.g. Amina', type: 'text', maxLen: 60 },
  senderName:    { key: 'senderName', label: 'From (optional)', placeholder: 'e.g. Your family', type: 'text', maxLen: 60 },
  relationship:  { key: 'relationship', label: 'Your relationship', placeholder: 'e.g. my sister, my colleague', type: 'text', maxLen: 60 },
  age:           { key: 'age', label: 'Age (optional)', type: 'number', maxLen: 3 },
  memory:        { key: 'memory', label: 'A memory, quality or phrase to include', placeholder: 'One or two sentences', type: 'textarea', maxLen: 240 },
  story:         { key: 'story', label: 'Your story, goal or struggle', placeholder: 'One or two sentences', type: 'textarea', maxLen: 240 },
  coupleNames:   { key: 'coupleNames', label: 'Names of the couple', placeholder: 'e.g. Grace & Paul', type: 'text', maxLen: 100 },
  yearsTogether: { key: 'yearsTogether', label: 'Number of years', type: 'number', maxLen: 3 },
  deceasedName:  { key: 'deceasedName', label: 'Name of your loved one', type: 'text', maxLen: 80 },
  knownFor:      { key: 'knownFor', label: 'What they were known for', placeholder: 'Their character, work, faith, humour…', type: 'textarea', maxLen: 240 },
  milestone:     { key: 'milestone', label: 'The achievement or role', placeholder: 'e.g. BSc in Law; Sales Manager; 30 years of service', type: 'text', maxLen: 100 },
  businessName:  { key: 'businessName', label: 'Business / brand name', type: 'text', maxLen: 80 },
  tagline:       { key: 'tagline', label: 'Slogan or key message (optional)', type: 'text', maxLen: 100 },
  teamName:      { key: 'teamName', label: 'Team / crew name', type: 'text', maxLen: 80 },
  babyName:      { key: 'babyName', label: "Baby's name", type: 'text', maxLen: 60 },
  tradition:     { key: 'tradition', label: 'Faith tradition', type: 'select', maxLen: 40, options: ['Christian', 'Muslim', 'Interfaith / general'] },
  prayerFocus:   { key: 'prayerFocus', label: 'What is the prayer for?', placeholder: 'Healing, a journey, an exam, a family…', type: 'textarea', maxLen: 240 },
};

// Added to EVERY occasion by the UI and the validator (not counted in the 2-4):
export const UNIVERSAL_FIELDS: OccasionField[] = [
  { key: 'language', label: 'Song language', type: 'select', maxLen: 30, options: [...LANGUAGES] },
  { key: 'localPhrase', label: 'A short phrase in your own language (optional)', placeholder: 'e.g. a Duala or Ewondo greeting', type: 'text', maxLen: 120 },
];

export const PERSONAL_NAME_KEYS = ['recipientName', 'babyName', 'deceasedName', 'coupleNames'];

const FAMILY_SAFE = 'Use warm, family-safe language. No profanity or explicit content.';

export const OCCASIONS: OccasionDef[] = [
  // ───────────── CELEBRATIONS ─────────────
  { id: 'birthday', group: 'celebrations', label: 'Birthday', icon: 'Cake', blurb: 'A song for someone special',
    subs: [
      { id: 'adult', label: 'Adult' },
      { id: 'child', label: 'Child', genre: 'Afrobeats', tags: ['playful', 'sing-along', 'simple melody', 'hand claps'], negative: ['explicit', 'aggressive', 'club'],
        rules: ['Very simple, repetitive, easy-to-sing lines suitable for a child.', 'Imagery: cake, friends, dancing, growing up.'] },
    ],
    fields: ['recipientName', 'age', 'relationship', 'memory'],
    genre: 'Afrobeats', genreChoices: ['Afrobeats', 'Makossa', 'Amapiano', 'Highlife', 'Gospel'], tonality: 'Celebratory & Energetic',
    tags: ['birthday celebration', 'sing-along chorus'], negative: [],
    rules: ['Say the person\'s name in the chorus.', 'Mention the age only if it was provided.', 'Include a wish or blessing for the year ahead.', FAMILY_SAFE],
    titleTemplate: 'Happy Birthday, {recipientName}', privacy: 'default_private' },

  { id: 'anniversary', group: 'celebrations', label: 'Anniversary', icon: 'HeartHandshake', blurb: 'Years together, years of work',
    subs: [
      { id: 'couple', label: 'Couple', fields: ['coupleNames', 'yearsTogether', 'memory'], genre: 'Zouk', tonality: 'Passionate & Romantic' },
      { id: 'work_business', label: 'Work / business', fields: ['businessName', 'yearsTogether', 'memory'], genre: 'Highlife', tonality: 'Celebratory & Energetic' },
    ],
    fields: ['coupleNames', 'yearsTogether', 'memory'],
    genre: 'Zouk', genreChoices: ['Zouk', 'Highlife', 'Afrobeats', 'Gospel'], tonality: 'Passionate & Romantic',
    tags: ['anniversary'], negative: [],
    rules: ['Celebrate the number of years only if provided.', 'Mention gratitude and what has been built together.', FAMILY_SAFE],
    titleTemplate: 'Happy Anniversary {coupleNames}{businessName}', privacy: 'default_private' },

  { id: 'graduation_exam', group: 'celebrations', label: 'Graduation / Exam success', icon: 'GraduationCap', blurb: 'Celebrate the hard work',
    subs: [{ id: 'graduation', label: 'Graduation' }, { id: 'exam_success', label: 'Exam success' }],
    fields: ['recipientName', 'milestone', 'senderName', 'memory'],
    genre: 'Afrobeats', genreChoices: ['Afrobeats', 'Amapiano', 'Makossa', 'Highlife', 'Gospel'], tonality: 'Celebratory & Energetic',
    tags: ['triumphant', 'proud'], negative: [],
    rules: ['Name the achievement only as written in the details.', 'Celebrate effort, perseverance and family support.', FAMILY_SAFE],
    titleTemplate: 'Congratulations {recipientName}', privacy: 'default_private' },

  { id: 'promotion_job', group: 'celebrations', label: 'Promotion / New job', icon: 'Briefcase', blurb: 'A new chapter at work',
    subs: [{ id: 'promotion', label: 'Promotion' }, { id: 'new_job', label: 'New job' }],
    fields: ['recipientName', 'milestone', 'memory'],
    genre: 'Afrobeats', genreChoices: ['Afrobeats', 'Amapiano', 'Highlife', 'Makossa', 'Gospel'], tonality: 'Celebratory & Energetic',
    tags: ['success anthem', 'confident'], negative: [],
    rules: ['Use the role/title exactly as written; do not invent a company or salary.', 'Themes: hard work paying off, new beginnings, gratitude.', FAMILY_SAFE],
    titleTemplate: 'Well Done {recipientName}', privacy: 'default_private' },

  { id: 'business_launch', group: 'celebrations', label: 'Business launch', icon: 'Rocket', blurb: 'An anthem for your opening',
    fields: ['businessName', 'tagline', 'memory'],
    genre: 'Afrobeats', genreChoices: ['Afrobeats', 'Amapiano', 'Makossa', 'Mbolé', 'Highlife'], tonality: 'Celebratory & Energetic',
    tags: ['launch anthem', 'catchy hook'], negative: [],
    rules: ['Say the business name clearly and repeat it in the chorus.', 'Do not invent prices, discounts, addresses, phone numbers or claims.', FAMILY_SAFE],
    titleTemplate: '{businessName} Launch Song', privacy: 'default_public' },

  { id: 'jingle', group: 'celebrations', label: 'Jingle', icon: 'Megaphone', blurb: 'A short, catchy brand song',
    subs: [{ id: 'product_brand', label: 'Product / brand' }, { id: 'event_campaign', label: 'Event / campaign' }],
    fields: ['businessName', 'tagline', 'memory'],
    genre: 'Afrobeats', genreChoices: ['Afrobeats', 'Amapiano', 'Makossa', 'Mbolé', 'Highlife', 'Bikutsi'], tonality: 'Celebratory & Energetic',
    tags: ['jingle', 'catchy hook', 'commercial'], negative: ['long intro'],
    rules: ['Hook first. Structure: [Hook] [Verse] [Hook] — keep it short.', 'Repeat the brand name at least three times.', 'Include the slogan exactly as written, if provided.', 'Do not invent prices, discounts, addresses or phone numbers.', FAMILY_SAFE],
    titleTemplate: '{businessName} Jingle', privacy: 'default_public' },

  { id: 'baby_naming_baptism', group: 'celebrations', label: 'Baby naming / Baptism', icon: 'Baby', blurb: 'Bless a new life',
    subs: [
      { id: 'baby_naming', label: 'Baby naming', genre: 'Highlife' },
      { id: 'baptism', label: 'Baptism', genre: 'Gospel', tonality: 'Spiritual & Deep' },
    ],
    fields: ['babyName', 'senderName', 'memory'],
    genre: 'Highlife', genreChoices: ['Highlife', 'Gospel', 'Afrobeats', 'Acoustic Ballad'], tonality: 'Spiritual & Deep',
    tags: ['blessing', 'tender', 'family celebration'], negative: ['explicit', 'aggressive'],
    rules: ['Say the child\'s name in the chorus.', 'Blessings, gratitude, hopes for the child\'s future.', 'Do not state age, health or parents\' names unless provided.', FAMILY_SAFE],
    titleTemplate: 'Welcome {babyName}', privacy: 'force_private' },

  // ───────────── LOVE ─────────────
  { id: 'wedding_engagement', group: 'love', label: 'Wedding / Engagement', icon: 'Gem', blurb: 'For the happy couple',
    subs: [{ id: 'wedding', label: 'Wedding' }, { id: 'engagement', label: 'Engagement' }],
    fields: ['coupleNames', 'memory', 'senderName'],
    genre: 'Zouk', genreChoices: ['Zouk', 'Highlife', 'Afrobeats', 'Gospel', 'African Cinematic'], tonality: 'Passionate & Romantic',
    tags: ['wedding', 'romantic', 'joyful'], negative: [],
    rules: ['Use both names in the chorus.', 'Include blessings, love and a promise for the future.', 'Use "how we met" only if provided.', FAMILY_SAFE],
    titleTemplate: '{coupleNames}', privacy: 'default_private' },

  { id: 'traditional_marriage', group: 'love', label: 'Traditional marriage', icon: 'Users', blurb: 'Honour two families',
    fields: ['coupleNames', 'memory', 'senderName'],
    genre: 'Highlife', genreChoices: ['Highlife', 'Makossa', 'Bikutsi', 'Gospel'], tonality: 'Celebratory & Energetic',
    tags: ['traditional wedding', 'community celebration', 'warm'], negative: [],
    rules: ['Show respect for both families and the elders.', 'Mention only customs, family names and places that appear in the details. Do NOT invent rituals or traditions.', 'Include blessings and a community call-and-response chorus.', FAMILY_SAFE],
    titleTemplate: '{coupleNames} — Our Union', privacy: 'default_private' },

  { id: 'valentine_proposal', group: 'love', label: 'Valentine / Proposal', icon: 'Heart', blurb: 'Say it with a song',
    subs: [
      { id: 'valentine', label: 'Valentine' },
      { id: 'proposal', label: 'Proposal', rules: ['Build toward the question "Will you marry me?" in the final chorus.'] },
    ],
    fields: ['recipientName', 'senderName', 'memory'],
    genre: 'Zouk', genreChoices: ['Zouk', 'Afrobeats', 'Highlife', 'Acoustic Ballad'], tonality: 'Passionate & Romantic',
    tags: ['love song', 'intimate'], negative: ['explicit'],
    rules: ['Address the loved one by name.', 'Romantic, tender, sincere. No explicit content.', FAMILY_SAFE],
    titleTemplate: 'For You, {recipientName}', privacy: 'default_private' },

  { id: 'apology', group: 'love', label: 'Apology', icon: 'HandHeart', blurb: 'Say sorry, sincerely',
    fields: ['recipientName', 'memory', 'senderName'],
    genre: 'Acoustic Ballad', genreChoices: ['Acoustic Ballad', 'Zouk', 'Gospel'], tonality: 'Cinematic & Melancholic',
    tags: ['sincere', 'apologetic', 'vulnerable'], negative: ['aggressive', 'club beat', 'comedic'],
    rules: ['Sincere and humble. Take responsibility; do not blame the other person.', 'No pressure, guilt-tripping, threats or manipulation.', 'Refer to what happened only as the user described it.', FAMILY_SAFE],
    titleTemplate: "I'm Sorry, {recipientName}", privacy: 'force_private' },

  // ───────────── REMEMBRANCE & CARE ─────────────
  { id: 'funeral', group: 'remembrance', label: 'Funeral tribute / Celebration of life', icon: 'Flower2', blurb: 'Honour a life with dignity',
    subs: [
      { id: 'tribute', label: 'Tribute (mourning)', genre: 'Solemn Hymn', tonality: 'Solemn & Dignified',
        tags: ['slow tempo', 'reverent'], negative: ['upbeat', 'dance', 'party'] },
      { id: 'celebration_of_life', label: 'Celebration of life', genre: 'Gospel', tonality: 'Hopeful & Healing',
        tags: ['warm', 'comforting', 'moderate tempo', 'gentle choir'], negative: ['club beat', 'party'] },
    ],
    fields: ['deceasedName', 'relationship', 'knownFor'],
    genre: 'Solemn Hymn', genreChoices: ['Solemn Hymn', 'Gospel', 'Highlife', 'Acoustic Ballad', 'African Cinematic'], tonality: 'Solemn & Dignified',
    tags: ['tribute', 'respectful'], negative: ['EDM', 'rap', 'trap', 'party', 'comedic', 'explicit'],
    rules: ['Dignified, respectful and comforting. Absolutely no party or humorous language.', 'Use the person\'s name. Do NOT describe the cause or circumstances of death unless the user wrote it.', 'Speak of memory, love, legacy and peace; draw on "what they were known for" exactly as written.', 'Do not add religious content that the user did not indicate.', FAMILY_SAFE],
    titleTemplate: 'In Loving Memory of {deceasedName}', privacy: 'force_private' },

  { id: 'get_well', group: 'remembrance', label: 'Get well', icon: 'Sparkles', blurb: 'Encouragement for someone unwell',
    fields: ['recipientName', 'senderName', 'memory'],
    genre: 'Acoustic Ballad', genreChoices: ['Acoustic Ballad', 'Highlife', 'Gospel', 'Zouk'], tonality: 'Hopeful & Healing',
    tags: ['encouraging', 'warm', 'comforting'], negative: ['aggressive', 'club beat'],
    rules: ['Encouraging and gentle. Do not name any illness unless the user did.', 'Never promise a cure or give medical claims.', 'Themes: strength, rest, being loved, brighter days.', FAMILY_SAFE],
    titleTemplate: 'Get Well Soon, {recipientName}', privacy: 'force_private' },

  { id: 'prayer_intercession', group: 'remembrance', label: 'Prayer / Intercession', icon: 'Church', blurb: 'A sung prayer',
    fields: ['tradition', 'prayerFocus', 'recipientName'],
    genre: 'Gospel', genreChoices: ['Gospel', 'Solemn Hymn', 'African Cinematic', 'Acoustic Ballad'], tonality: 'Spiritual & Deep',
    tags: ['prayer', 'reverent', 'devotional'], negative: ['party', 'rap', 'club beat'],
    rules: ['Reverent and humble, in the stated faith tradition ("Interfaith / general" = neutral wording that fits any faith).', 'Do NOT quote or misquote sacred texts; paraphrase themes only.', 'Pray for what the user described; do not add extra requests.', FAMILY_SAFE],
    titleTemplate: 'A Prayer for {recipientName}', privacy: 'force_private' },

  // ───────────── FAITH & SEASONS ─────────────
  { id: 'thanksgiving_worship', group: 'faith', label: 'Thanksgiving / Worship', icon: 'Church', blurb: 'Praise and gratitude',
    subs: [{ id: 'thanksgiving', label: 'Thanksgiving' }, { id: 'worship', label: 'Worship', tonality: 'Spiritual & Deep' }],
    fields: ['tradition', 'memory', 'senderName'],
    genre: 'Gospel', genreChoices: ['Gospel', 'Highlife', 'African Cinematic', 'Afrobeats'], tonality: 'Spiritual & Deep',
    tags: ['praise and worship', 'congregational chorus'], negative: ['explicit', 'club beat'],
    rules: ['Follow the stated faith tradition; for "Interfaith / general" use neutral wording.', 'Congregational, easy-to-sing chorus; gratitude for what the user described.', 'Do NOT quote or misquote sacred texts; paraphrase themes only.', FAMILY_SAFE],
    titleTemplate: 'Song of Thanksgiving', privacy: 'default_public' },

  { id: 'christmas', group: 'faith', label: 'Christmas', icon: 'TreePine', blurb: 'Festive family cheer',
    fields: ['recipientName', 'senderName', 'memory'],
    genre: 'Highlife', genreChoices: ['Highlife', 'Gospel', 'Afrobeats', 'African Cinematic'], tonality: 'Celebratory & Energetic',
    tags: ['Christmas', 'festive', 'family gathering'], negative: ['explicit'],
    rules: ['Warm, festive and family-oriented.', 'Mention the recipient or sender only if provided.', FAMILY_SAFE],
    titleTemplate: 'Christmas for {recipientName}', privacy: 'default_public' },

  { id: 'eid', group: 'faith', label: 'Eid', icon: 'Moon', blurb: 'Joyful Eid greetings',
    subs: [{ id: 'eid_al_fitr', label: 'Eid al-Fitr' }, { id: 'eid_al_adha', label: 'Eid al-Adha' }],
    fields: ['recipientName', 'senderName', 'memory'],
    genre: 'Afrobeats', genreChoices: ['Afrobeats', 'Highlife', 'Zouk', 'African Cinematic'], tonality: 'Celebratory & Energetic',
    tags: ['Eid celebration', 'family', 'joyful'], negative: ['explicit'],
    rules: ['Respectful and joyful: greetings such as "Eid Mubarak", family, generosity, gratitude.', 'Do not state religious rulings or quote sacred texts.', FAMILY_SAFE],
    titleTemplate: 'Eid Mubarak {recipientName}', privacy: 'default_public' },

  { id: 'new_year', group: 'faith', label: 'New Year', icon: 'PartyPopper', blurb: 'Welcome the year ahead',
    fields: ['recipientName', 'senderName', 'memory'],
    genre: 'Amapiano', genreChoices: ['Amapiano', 'Afrobeats', 'Makossa', 'Gospel', 'Highlife'], tonality: 'Celebratory & Energetic',
    tags: ['New Year countdown feel', 'hopeful', 'celebration'], negative: [],
    rules: ['Themes: gratitude for the past year, hope, resolutions, togetherness.', FAMILY_SAFE],
    titleTemplate: 'Happy New Year {recipientName}', privacy: 'default_public' },

  { id: 'parents_day', group: 'faith', label: "Mother's / Father's Day", icon: 'Heart', blurb: 'Thank the ones who raised you',
    subs: [{ id: 'mothers_day', label: "Mother's Day" }, { id: 'fathers_day', label: "Father's Day" }],
    fields: ['recipientName', 'relationship', 'memory', 'senderName'],
    genre: 'Highlife', genreChoices: ['Highlife', 'Gospel', 'Zouk', 'Afrobeats', 'Acoustic Ballad'], tonality: 'Spiritual & Deep',
    tags: ['gratitude', 'heartfelt', 'family'], negative: ['aggressive'],
    rules: ['Heartfelt thanks for sacrifice, love and guidance.', 'Use only memories the user wrote.', FAMILY_SAFE],
    titleTemplate: 'Thank You, {recipientName}', privacy: 'default_private' },

  // ───────────── MOTIVATION & SUPPORT ─────────────
  { id: 'farewell_retirement', group: 'motivation', label: 'Farewell / Retirement', icon: 'Handshake', blurb: 'Send them off warmly',
    subs: [{ id: 'farewell', label: 'Farewell' }, { id: 'retirement', label: 'Retirement' }],
    fields: ['recipientName', 'milestone', 'memory', 'senderName'],
    genre: 'Highlife', genreChoices: ['Highlife', 'Afrobeats', 'Gospel', 'Acoustic Ballad'], tonality: 'Hopeful & Healing',
    tags: ['farewell', 'warm', 'appreciative'], negative: ['aggressive'],
    rules: ['Appreciation for service and friendship; wish them well for what comes next.', 'Use role/years exactly as provided.', FAMILY_SAFE],
    titleTemplate: 'Farewell {recipientName}', privacy: 'default_private' },

  { id: 'team_anthem', group: 'motivation', label: 'Team / Football anthem', icon: 'Trophy', blurb: 'A chant for your supporters',
    subs: [{ id: 'sports_team', label: 'Sports / football team' }, { id: 'crew_company', label: 'Crew / company' }],
    fields: ['teamName', 'tagline', 'memory'],
    genre: 'Mbolé', genreChoices: ['Mbolé', 'Afrobeats', 'Bikutsi', 'Amapiano', 'Makossa'], tonality: 'Street Anthem',
    tags: ['stadium chant', 'crowd call-and-response', 'anthemic'], negative: [],
    rules: ['Short, chantable, repeated hook with call-and-response. Say the team name often.', 'Pride and unity only: no insults to other teams, no hate, no violence.', FAMILY_SAFE],
    titleTemplate: '{teamName} Anthem', privacy: 'default_public' },

  { id: 'hustle_motivation', group: 'motivation', label: 'Hustle motivation', icon: 'Flame', blurb: 'Fuel for the grind',
    fields: ['story', 'tagline', 'recipientName'],
    genre: 'Mbolé', genreChoices: ['Mbolé', 'Afrobeats', 'Amapiano', 'Makossa', 'African Cinematic'], tonality: 'Street Anthem',
    tags: ['motivational', 'determined', 'driving'], negative: [],
    rules: ['Themes: perseverance, discipline, faith in the process.', 'No get-rich-quick promises and no financial advice.', FAMILY_SAFE],
    titleTemplate: 'Keep Going', privacy: 'default_public' },

  { id: 'lullaby', group: 'motivation', label: 'Lullaby', icon: 'Moon', blurb: 'A gentle sleep song',
    fields: ['babyName', 'senderName', 'memory'],
    genre: 'Lullaby', genreChoices: ['Lullaby', 'Acoustic Ballad', 'Highlife'], tonality: 'Gentle & Soothing',
    tags: ['lullaby', 'sleepy'], negative: ['drums', 'heavy bass', 'loud', 'electronic', 'rap'],
    rules: ['Very gentle, short, repetitive lines; sleepy imagery (stars, moon, quiet night).', 'Use the child\'s name softly. No scary imagery.', FAMILY_SAFE],
    titleTemplate: 'Sleep Well, {babyName}', privacy: 'force_private' },
];

export const getOccasion = (id?: string) => OCCASIONS.find((o) => o.id === id);
export const getSub = (o: OccasionDef | undefined, subId?: string) => o?.subs?.find((s) => s.id === subId);
export const fieldsFor = (o: OccasionDef, subId?: string): OccasionField[] =>
  [...(getSub(o, subId)?.fields ?? o.fields).map((k) => FIELD_LIBRARY[k]).filter(Boolean), ...UNIVERSAL_FIELDS];

export function fillTitle(o: OccasionDef, details: Record<string, string>): string {
  const t = o.titleTemplate.replace(/\{(\w+)\}/g, (_m, k) => (details[k] || '').trim())
    .replace(/\s+/g, ' ').replace(/\s+([,.—-])/g, '$1').replace(/[,—-]\s*$/, '').trim();
  return (t || o.label).slice(0, 80);
}

export function hasPersonalNames(o: OccasionDef, subId: string | undefined, details: Record<string, string>): boolean {
  return PERSONAL_NAME_KEYS.some((k) => (getSub(o, subId)?.fields ?? o.fields).includes(k) && (details[k] || '').trim().length > 0);
}

export function buildCardPrompt(id: string, details: Record<string, string>): string {
  const d = getOccasion(id);
  if (!d) return '';
  const who = details.recipientName || details.coupleNames || details.babyName || details.businessName || details.teamName || details.deceasedName || '';
  const tone = ['remembrance'].includes(d.group) ? 'soft, respectful, muted warm palette, no party elements' : 'warm, vibrant, celebratory, African-inspired patterns';
  return `Greeting card illustration for ${d.label}${who ? ` for ${who}` : ''}, ${tone}, space for a short text at the top, no text rendered in the image`;
}
