// Country dial codes and phone number auto-routing parser
export interface CountryDialCode {
  iso2: string; // 'CM'
  name: string; // 'Cameroon'
  dialCode: string; // '+237'
  flag: string; // '🇨🇲' — Unicode regional indicator emoji, needs no image asset
  nationalNumberLength: number; // for basic validation, e.g. 9 for Cameroon
}

// Prioritise Bidou's core markets (Cameroon first, then wider CEMAC/West Africa),
// then the rest of the world alphabetically. This ordering also drives the
// default dropdown order — do not alphabetize Cameroon out of first place.
export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { iso2: 'CM', name: 'Cameroon', dialCode: '+237', flag: '🇨🇲', nationalNumberLength: 9 },
  { iso2: 'SN', name: 'Senegal', dialCode: '+221', flag: '🇸🇳', nationalNumberLength: 9 },
  { iso2: 'CI', name: "Côte d'Ivoire", dialCode: '+225', flag: '🇨🇮', nationalNumberLength: 10 },
  { iso2: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬', nationalNumberLength: 10 },
  { iso2: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭', nationalNumberLength: 9 },
  { iso2: 'GA', name: 'Gabon', dialCode: '+241', flag: '🇬🇦', nationalNumberLength: 8 },
  { iso2: 'TD', name: 'Chad', dialCode: '+235', flag: '🇹🇩', nationalNumberLength: 8 },
  { iso2: 'CF', name: 'Central African Republic', dialCode: '+236', flag: '🇨🇫', nationalNumberLength: 8 },
  { iso2: 'CG', name: 'Congo-Brazzaville', dialCode: '+242', flag: '🇨🇬', nationalNumberLength: 9 },
  { iso2: 'CD', name: 'DR Congo', dialCode: '+243', flag: '🇨🇩', nationalNumberLength: 9 },
  { iso2: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', nationalNumberLength: 9 },
  { iso2: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', nationalNumberLength: 10 },
  { iso2: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', nationalNumberLength: 10 },
];

export const DEFAULT_COUNTRY = COUNTRY_DIAL_CODES[0]; // Cameroon

/**
 * Gmail-style auto-routing: given whatever the user typed into a single
 * free-text field (e.g. "+237677123456", "237 677 123 456", "677123456"),
 * work out which country it belongs to and split it into
 * { country, nationalNumber }. Longest-dial-code-match-first so that e.g.
 * '+1' (US) doesn't shadow a longer code that also starts with '1'.
 */
export function parsePhoneInput(
  raw: string,
  fallbackCountry: CountryDialCode = DEFAULT_COUNTRY
): { country: CountryDialCode; nationalNumber: string } {
  const cleaned = raw.replace(/[\s\-().]/g, '');

  if (cleaned.startsWith('+')) {
    const sortedByLength = [...COUNTRY_DIAL_CODES].sort(
      (a, b) => b.dialCode.length - a.dialCode.length
    );
    const match = sortedByLength.find((c) => cleaned.startsWith(c.dialCode));
    if (match) {
      return { country: match, nationalNumber: cleaned.slice(match.dialCode.length) };
    }
  }

  // Also check if user typed dial code without '+' (e.g. "237677123456")
  const sortedByLength = [...COUNTRY_DIAL_CODES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length
  );
  const matchWithoutPlus = sortedByLength.find(
    (c) => cleaned.startsWith(c.dialCode.replace('+', '')) && cleaned.length > c.dialCode.length
  );
  if (matchWithoutPlus) {
    const prefix = matchWithoutPlus.dialCode.replace('+', '');
    return { country: matchWithoutPlus, nationalNumber: cleaned.slice(prefix.length) };
  }

  // No recognisable '+' prefix — treat as a national number under whichever
  // country is currently selected in the dropdown (fallbackCountry).
  return { country: fallbackCountry, nationalNumber: cleaned.replace(/^0+/, '') };
}

export function getCountryByIso2(iso2: string): CountryDialCode {
  const match = COUNTRY_DIAL_CODES.find((c) => c.iso2.toUpperCase() === iso2.toUpperCase());
  return match || DEFAULT_COUNTRY;
}

export function getCountryByDialCode(dialCode: string): CountryDialCode {
  const match = COUNTRY_DIAL_CODES.find((c) => c.dialCode === dialCode);
  return match || DEFAULT_COUNTRY;
}
