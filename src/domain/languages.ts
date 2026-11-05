/**
 * App languages: English + the 22 languages of the Eighth Schedule of the Constitution of India.
 * `native` is shown in its own script so people can find their language whatever the app is in.
 * `fallback` = where a missing translation is taken from, in order (English is always last).
 * Translations other than English are machine-drafted and need review by native speakers.
 */
export const LANGUAGES = [
  { code: 'en', native: 'English', english: 'English', script: 'Latin', rtl: false, fallback: [] },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', script: 'Devanagari', rtl: false, fallback: [] },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', script: 'Bengali', rtl: false, fallback: [] },
  { code: 'mr', native: 'मराठी', english: 'Marathi', script: 'Devanagari', rtl: false, fallback: ['hi'] },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', script: 'Telugu', rtl: false, fallback: [] },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', script: 'Tamil', rtl: false, fallback: [] },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', script: 'Gujarati', rtl: false, fallback: ['hi'] },
  { code: 'ur', native: 'اُردُو', english: 'Urdu', script: 'Perso-Arabic', rtl: true, fallback: [] },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', script: 'Kannada', rtl: false, fallback: [] },
  { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia', script: 'Odia', rtl: false, fallback: ['hi'] },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam', script: 'Malayalam', rtl: false, fallback: [] },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi', script: 'Gurmukhi', rtl: false, fallback: ['hi'] },
  { code: 'as', native: 'অসমীয়া', english: 'Assamese', script: 'Bengali-Assamese', rtl: false, fallback: ['bn'] },
  { code: 'mai', native: 'मैथिली', english: 'Maithili', script: 'Devanagari', rtl: false, fallback: ['hi'] },
  { code: 'sat', native: 'ᱥᱟᱱᱛᱟᱲᱤ', english: 'Santali', script: 'Ol Chiki', rtl: false, fallback: ['hi'] },
  { code: 'ks', native: 'كٲشُر', english: 'Kashmiri', script: 'Perso-Arabic', rtl: true, fallback: ['ur'] },
  { code: 'ne', native: 'नेपाली', english: 'Nepali', script: 'Devanagari', rtl: false, fallback: ['hi'] },
  { code: 'sd', native: 'سنڌي', english: 'Sindhi', script: 'Perso-Arabic', rtl: true, fallback: ['ur'] },
  { code: 'doi', native: 'डोगरी', english: 'Dogri', script: 'Devanagari', rtl: false, fallback: ['hi'] },
  { code: 'kok', native: 'कोंकणी', english: 'Konkani', script: 'Devanagari', rtl: false, fallback: ['mr', 'hi'] },
  { code: 'mni', native: 'মৈতৈলোন্', english: 'Manipuri (Meitei)', script: 'Bengali', rtl: false, fallback: ['bn'] },
  { code: 'brx', native: 'बड़ो', english: 'Bodo', script: 'Devanagari', rtl: false, fallback: ['as', 'hi'] },
  { code: 'sa', native: 'संस्कृतम्', english: 'Sanskrit', script: 'Devanagari', rtl: false, fallback: ['hi'] },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];
export type LanguageInfo = (typeof LANGUAGES)[number];

export const LANGUAGE_CODES: readonly Language[] = LANGUAGES.map((l) => l.code);

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function languageInfo(code: Language): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** Full lookup order for a language, e.g. kok → kok, mr, hi, en. */
export function fallbackChain(code: Language): Language[] {
  const out: Language[] = [];
  const visit = (c: Language) => {
    if (out.includes(c)) return;
    out.push(c);
    for (const f of languageInfo(c).fallback) visit(f);
  };
  visit(code);
  if (!out.includes('en')) out.push('en');
  return out;
}
