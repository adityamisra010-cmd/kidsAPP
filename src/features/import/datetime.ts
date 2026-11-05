/** Dates (Indian day-first), Excel serials, clock times, durations and weekday lists. */
import { cleanText, fail, ok, pad2, type Parsed } from './text';

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isoDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Two-digit years: up to this year's two digits → 20xx, otherwise 19xx. */
function expandYear(y: number, today: Date): number {
  if (y >= 100) return y;
  const cutoff = (today.getFullYear() % 100) + 1;
  return y <= cutoff ? 2000 + y : 1900 + y;
}

/** Excel serial date (1900 date system) → yyyy-MM-dd. */
export function excelSerialToISODate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial >= 2958466) return null;
  let days = Math.floor(serial);
  if (days === 60) return '1900-02-28'; // Excel's fictional 29 Feb 1900
  if (days < 60) days += 1;
  const d = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Fraction of a day (Excel time) → HH:mm. */
export function excelFractionToClock(value: number): string {
  const frac = value - Math.floor(value);
  const total = Math.round(frac * 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/**
 * Indian convention first: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, "12 Mar 2019", "12-Mar-19",
 * "March 12, 2019", ISO yyyy-mm-dd, and Excel serial numbers. "03/25/2019" can only be US order,
 * so it is accepted with a warning.
 */
export function parseDate(raw: string, today: Date = new Date()): Parsed<string> {
  const text = cleanText(raw).toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
  if (!text) return fail('required');

  // ISO, optionally with a time part.
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ t].*)?$/.exec(text);
  if (m) {
    const v = isoDate(+m[1], +m[2], +m[3]);
    return v ? ok(v) : fail('date_invalid');
  }

  // Excel serial typed into CSV ("43536" or "43536.0").
  m = /^(\d{5})(?:\.\d+)?$/.exec(text);
  if (m) {
    const n = Number(text);
    if (n >= 10_000 && n <= 80_000) {
      const v = excelSerialToISODate(n);
      return v ? ok(v) : fail('date_invalid');
    }
    return fail('date_invalid');
  }

  // Numeric day-month-year.
  m = /^(\d{1,2})\s*[-/.\s]\s*(\d{1,2})\s*[-/.\s]\s*(\d{2}|\d{4})(?:\s+\d{1,2}[:.]\d{2}.*)?$/.exec(text);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = expandYear(+m[3], today);
    if (b > 12 && a <= 12) {
      const v = isoDate(y, a, b);
      return v ? ok(v, 'date_us_order') : fail('date_invalid');
    }
    const v = isoDate(y, b, a);
    return v ? ok(v) : fail('date_invalid');
  }

  // Day + month name + year: "12 Mar 2019", "12-Mar-19", "12 march, 2019".
  m = /^(\d{1,2})[\s\-/.,]*([a-z]+)\.?[\s\-/.,]*(\d{2}|\d{4})$/.exec(text);
  if (m && MONTHS[m[2]]) {
    const v = isoDate(expandYear(+m[3], today), MONTHS[m[2]], +m[1]);
    return v ? ok(v) : fail('date_invalid');
  }

  // Month name + day + year: "March 12, 2019", "Mar 12 2019".
  m = /^([a-z]+)\.?[\s\-/.,]*(\d{1,2})[\s\-/.,]+(\d{2}|\d{4})$/.exec(text);
  if (m && MONTHS[m[1]]) {
    const v = isoDate(expandYear(+m[3], today), MONTHS[m[1]], +m[2]);
    return v ? ok(v) : fail('date_invalid');
  }

  return fail('date_invalid');
}

/** Today's date as yyyy-MM-dd in local time. */
export function todayISO(today: Date = new Date()): string {
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
}

/** Whole years between dob and today. */
export function ageInYears(dob: string, today: Date = new Date()): number {
  const [y, m, d] = dob.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

/** Indian academic year ends on 31 March. */
export function academicYearEnd(fromISO: string): string {
  const [y, m] = fromISO.split('-').map(Number);
  return `${m >= 4 ? y + 1 : y}-03-31`;
}
// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

function parseClock(raw: string): Parsed<string> {
  const text = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return fail('required');
  if (text === 'noon' || text === '12 noon') return ok('12:00');

  // Excel time fraction typed into a CSV ("0.4375").
  if (/^0?\.\d+$/.test(text)) return ok(excelFractionToClock(Number(text)));

  const m = /^(\d{1,2})(?:\s*[:.]\s*(\d{2}))?(?:\s*[:.]\s*\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?|hrs?|hours)?$/.exec(text);
  const compact = /^(\d{1,2})(\d{2})\s*(a\.?m\.?|p\.?m\.?|hrs?)?$/.exec(text);
  const hit = m ?? compact;
  if (!hit) return fail('time_invalid');
  let h = +hit[1];
  const min = hit[2] ? +hit[2] : 0;
  const suffix = (hit[3] ?? '').replace(/[.\s]/g, '');
  if (min > 59) return fail('time_invalid');
  if (suffix === 'am' || suffix === 'pm') {
    if (h < 1 || h > 12) return fail('time_invalid');
    if (suffix === 'pm' && h !== 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
    return ok(`${pad2(h)}:${pad2(min)}`);
  }
  if (h > 23) return fail('time_invalid');
  // School sessions don't run at 2 a.m.: 1:00–6:59 without AM/PM means afternoon.
  if (h >= 1 && h <= 6 && !suffix.startsWith('h')) return ok(`${pad2(h + 12)}:${pad2(min)}`, 'time_assumed_pm');
  return ok(`${pad2(h)}:${pad2(min)}`);
}

/** "10:30", "10:30 AM", "10.30 am", "2 pm", "14:00", "10:30 - 11:15" (range gives an end time). */
export function parseTime(raw: string): Parsed<{ start: string; end?: string }> {
  const text = cleanText(raw);
  if (!text) return fail('required');
  const range = text.split(/\s*(?:-|–|—|\bto\b)\s*/i);
  if (range.length === 2 && range[0] && range[1]) {
    // "10:30 - 11:15 AM": the suffix on the end applies to the start when the start has none.
    const endSuffix = /([ap]\.?\s?m\.?)$/i.exec(range[1])?.[1];
    const e = parseClock(range[1]);
    if (!e.ok) return fail(e.code);
    const tries = endSuffix && !/[ap]\.?\s?m\.?$/i.test(range[0]) ? [`${range[0]} ${endSuffix}`, range[0]] : [range[0]];
    for (const attempt of tries) {
      const s = parseClock(attempt);
      if (!s.ok) return fail(s.code);
      if (toMinutes(e.value) > toMinutes(s.value)) return ok({ start: s.value, end: e.value }, s.warning);
    }
    return fail('time_invalid');
  }
  const s = parseClock(text);
  return s.ok ? ok({ start: s.value }, s.warning) : fail(s.code);
}

export function toMinutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

/** "45", "45 min", "1 hr", "1.5 hours", "1 hr 30 min", "1:30". */
export function parseDuration(raw: string): Parsed<number> {
  const text = cleanText(raw).toLowerCase();
  if (!text) return fail('required');
  let minutes: number | null = null;
  let warning: string | undefined;
  let m = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)?$/.exec(text);
  if (m) {
    minutes = Number(m[1]);
    // A bare "1" or "1.5" means hours, not minutes.
    if (!m[2] && minutes > 0 && minutes <= 4) {
      minutes *= 60;
      warning = 'duration_hours_assumed';
    }
  }
  m = minutes == null ? /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)(?:\s*(?:and\s*)?(\d+)\s*(m|min|mins|minutes)?)?$/.exec(text) : null;
  if (m) minutes = Number(m[1]) * 60 + (m[3] ? Number(m[3]) : 0);
  m = minutes == null ? /^(\d{1,2}):(\d{2})$/.exec(text) : null;
  if (m) minutes = Number(m[1]) * 60 + Number(m[2]);
  if (minutes == null || !Number.isFinite(minutes)) return fail('duration_invalid');
  minutes = Math.round(minutes);
  if (minutes < 10 || minutes > 240) return fail('duration_invalid');
  return ok(minutes, warning);
}
// ---------------------------------------------------------------------------
// Weekdays (0 = Sunday … 6 = Saturday)
// ---------------------------------------------------------------------------

const DAY_WORDS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  su: 0,
  mon: 1,
  monday: 1,
  m: 1,
  mo: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  tu: 2,
  t: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  w: 3,
  we: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  th: 4,
  fri: 5,
  friday: 5,
  f: 5,
  fr: 5,
  sat: 6,
  saturday: 6,
  sa: 6,
  s: 6,
  // Hindi
  रवि: 0,
  रविवार: 0,
  सोम: 1,
  सोमवार: 1,
  मंगल: 2,
  मंगलवार: 2,
  बुध: 3,
  बुधवार: 3,
  गुरु: 4,
  गुरुवार: 4,
  बृहस्पतिवार: 4,
  शुक्र: 5,
  शुक्रवार: 5,
  शनि: 6,
  शनिवार: 6,
};

const ALL_WEEK = [1, 2, 3, 4, 5, 6];

function dayRange(a: number, b: number): number[] {
  const out: number[] = [];
  for (let d = a; ; d = (d + 1) % 7) {
    out.push(d);
    if (d === b || out.length > 7) break;
  }
  return out;
}

/**
 * "Mon/Wed/Fri", "M W F", "MWF", "Monday, Wednesday", "Mon-Fri", "Mon to Sat", "Tue & Thu",
 * "Daily" (Mon–Sat), "Weekdays" (Mon–Fri), Hindi day names. Returns sorted unique day numbers.
 */
export function parseWeekdays(raw: string): Parsed<number[]> {
  const text = cleanText(raw).toLowerCase().replace(/\./g, '');
  if (!text) return fail('required');
  if (/^(daily|every ?day|all days|all working days|रोज़?)$/.test(text)) return ok(ALL_WEEK, 'days_assumed_daily');
  if (/^(weekdays|week days)$/.test(text)) return ok([1, 2, 3, 4, 5]);

  const found = new Set<number>();
  const tokens = text.split(/\s*(?:[,;/|&+\n]|\band\b|\s)\s*/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    // Ranges: "mon-fri", or "mon to fri" spread over tokens.
    const r = /^([^-–]+)[-–]([^-–]+)$/.exec(tok);
    if (r && DAY_WORDS[r[1]] != null && DAY_WORDS[r[2]] != null) {
      dayRange(DAY_WORDS[r[1]], DAY_WORDS[r[2]]).forEach((d) => found.add(d));
      continue;
    }
    if ((tokens[i + 1] === 'to' || tokens[i + 1] === '-' || tokens[i + 1] === '–') && DAY_WORDS[tok] != null && DAY_WORDS[tokens[i + 2]] != null) {
      dayRange(DAY_WORDS[tok], DAY_WORDS[tokens[i + 2]]).forEach((d) => found.add(d));
      i += 2;
      continue;
    }
    if (DAY_WORDS[tok] != null) {
      found.add(DAY_WORDS[tok]);
      continue;
    }
    // Run-together letters: "mwf", "tth", "mtwthf".
    const letters = tok.match(/th|tu|su|sa|[mtwfs]/g);
    if (letters && letters.join('') === tok) {
      letters.forEach((l) => found.add(DAY_WORDS[l]));
      continue;
    }
    return fail('days_invalid');
  }
  if (found.size === 0) return fail('days_invalid');
  return ok([...found].sort((a, b) => a - b));
}
