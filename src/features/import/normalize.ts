/**
 * Pure parsers for messy school spreadsheets: names, Indian mobile numbers, dates, times,
 * weekday lists, roles. Every parser returns a result object instead of throwing so the
 * validator can explain problems in plain language.
 */

import { cleanText, fail, normalizeHeader, ok, type Parsed } from './text';

export * from './datetime';
export * from './text';

// ---------------------------------------------------------------------------
// Phone (Indian mobile numbers)
// ---------------------------------------------------------------------------

/**
 * Accepts "+91 98765 43210", "098765-43210", "91 9876543210", "(+91) 98765 43210", "9876543210".
 * Returns E.164 "+919876543210". Several numbers in one cell: the first is used (with a warning).
 */
export function parsePhone(raw: string): Parsed<string> {
  const text = cleanText(raw);
  if (!text || !/\d/.test(text)) return fail('required');
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(text.replace(/\s/g, ''))) return fail('phone_shortened');

  // Several numbers in one cell ("98765 43210 / 91234 56780").
  const parts = text.split(/\s*(?:[,;/|\n]|\bor\b)\s*/i).filter((p) => /\d/.test(p));
  const first = parts[0] ?? text;
  const multiple = parts.length > 1;

  const plus = first.trim().startsWith('+');
  let digits = first.replace(/\.0+$/, '').replace(/\D/g, '');
  if (plus) {
    if (!digits.startsWith('91')) return fail('phone_foreign');
    digits = digits.slice(2);
  } else if (digits.length === 14 && digits.startsWith('0091')) {
    digits = digits.slice(4);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith('091')) {
    digits = digits.slice(3);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) {
    if (/^0?[1-5]/.test(first.replace(/\D/g, '')) && digits.length >= 8 && digits.length <= 11) return fail('phone_landline');
    return fail('phone_invalid');
  }
  if (!/^[6-9]/.test(digits)) return fail('phone_landline');
  return ok(`+91${digits}`, multiple ? 'phone_multiple' : undefined);
}

/** "+91 98765 43210" for display. */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
// ---------------------------------------------------------------------------
// Small vocabularies
// ---------------------------------------------------------------------------

export type StaffRole = 'therapist' | 'coordinator' | 'school_admin';

export function parseRole(raw: string): StaffRole | null {
  const text = normalizeHeader(raw);
  if (!text) return null;
  if (/\b(admin|administrator|principal|director|owner|management|founder|centre head|center head|school head|head of school|headmistress|headmaster|head mistress|head master)\b/.test(text))
    return 'school_admin';
  if (/\b(coordinator|co ordinator|lead|supervisor|head|hod|incharge|in charge|manager)\b/.test(text)) return 'coordinator';
  if (/\b(therapist|therapy|educator|teacher|trainer|slp|ot|pt|bcba|aba|counsellor|counselor|psychologist|audiologist|physio|physiotherapist|special)\b/.test(text))
    return 'therapist';
  return null;
}

export function parseGender(raw: string): 'male' | 'female' | 'other' | null {
  const t = normalizeHeader(raw);
  if (['m', 'male', 'boy', 'b', 'man', 'लड़का', 'पुरुष'].includes(t)) return 'male';
  if (['f', 'female', 'girl', 'g', 'woman', 'लड़की', 'महिला'].includes(t)) return 'female';
  if (['o', 'other', 'others', 'non binary', 'nonbinary', 'transgender', 'अन्य'].includes(t)) return 'other';
  return null;
}

export function parseYesNo(raw: string): boolean | null {
  const t = normalizeHeader(raw);
  if (['y', 'yes', 'true', '1', 'primary', 'हाँ', 'हां', 'x'].includes(t)) return true;
  if (['n', 'no', 'false', '0', 'नहीं'].includes(t)) return false;
  return null;
}

const RELATIONS: Record<string, string> = {
  mother: 'Mother',
  mom: 'Mother',
  mum: 'Mother',
  mummy: 'Mother',
  mommy: 'Mother',
  maa: 'Mother',
  ma: 'Mother',
  amma: 'Mother',
  माँ: 'Mother',
  मां: 'Mother',
  father: 'Father',
  dad: 'Father',
  daddy: 'Father',
  papa: 'Father',
  pita: 'Father',
  appa: 'Father',
  पिता: 'Father',
  grandmother: 'Grandmother',
  grandma: 'Grandmother',
  nani: 'Grandmother',
  dadi: 'Grandmother',
  grandfather: 'Grandfather',
  grandpa: 'Grandfather',
  nana: 'Grandfather',
  dada: 'Grandfather',
  guardian: 'Guardian',
  'legal guardian': 'Guardian',
  aunt: 'Aunt',
  aunty: 'Aunt',
  uncle: 'Uncle',
  brother: 'Sibling',
  sister: 'Sibling',
  sibling: 'Sibling',
  parent: 'Parent',
};

/** Standard relation word, or the typed text in Title Case. Empty → "Parent". */
export function normalizeRelation(raw: string): string {
  const t = normalizeHeader(raw);
  if (!t) return 'Parent';
  if (RELATIONS[t]) return RELATIONS[t];
  return cleanText(raw).replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
// ---------------------------------------------------------------------------
// Fuzzy matching ("Did you mean …?")
// ---------------------------------------------------------------------------

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Words too common to suggest a match on their own ("Dance Therapy" ↛ "Speech Therapy"). */
const GENERIC_WORDS = new Set(['therapy', 'therapist', 'support', 'education', 'and', 'the', 'kumar', 'kumari', 'devi']);

export interface Candidate {
  id: string;
  label: string;
  /** Comparison forms (normalised name, aliases). */
  forms: string[];
}

/** Up to `limit` candidates that look like the typed value, best first. */
export function suggest(normalized: string, candidates: Candidate[], limit = 3): { id: string; label: string }[] {
  if (!normalized) return [];
  const words = normalized.split(' ');
  const scored = candidates
    .map((c) => {
      let best = Infinity;
      for (const f of c.forms) {
        if (!f) continue;
        const d = levenshtein(normalized, f);
        const tolerance = Math.max(2, Math.floor(Math.max(normalized.length, f.length) * 0.3));
        if (d <= tolerance) best = Math.min(best, d);
        const fw = f.split(' ');
        // Same first name or surname ("Priya" ↔ "Priya Nair"), or one contains the other.
        if (words.some((w) => w.length > 2 && !GENERIC_WORDS.has(w) && fw.includes(w))) best = Math.min(best, 3 + Math.abs(fw.length - words.length));
        if (f.includes(normalized) || normalized.includes(f)) best = Math.min(best, 2);
      }
      return { c, best };
    })
    .filter((s) => s.best !== Infinity)
    .sort((a, b) => a.best - b.best || a.c.label.localeCompare(b.c.label));
  // A close spelling beats loose word overlaps: don't pad the list with weak guesses.
  const cutoff = scored.length ? Math.max(scored[0].best + 1, 2) : 0;
  return scored
    .filter((s) => s.best <= cutoff || s.best <= 2)
    .slice(0, limit)
    .map((s) => ({ id: s.c.id, label: s.c.label }));
}
