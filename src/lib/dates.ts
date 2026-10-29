import {
  addDays,
  differenceInCalendarDays,
  differenceInMonths,
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isToday,
  isTomorrow,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { hi as hiLocale } from 'date-fns/locale/hi';
import { enIN } from 'date-fns/locale/en-IN';

import type { ISODate, ISODateTime, Language } from '@/domain/types';

const locales = { en: enIN, hi: hiLocale };

let currentLanguage: Language = 'en';
/** Called by i18n when the language changes, so date formatting follows. */
export function setDateLanguage(lang: Language) {
  currentLanguage = lang;
}
const locale = () => locales[currentLanguage];

export function toISODate(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd');
}

export function parse(value: ISODate | ISODateTime | Date): Date {
  return value instanceof Date ? value : parseISO(value);
}

/** Week starts Monday (Indian schools). */
export function weekStart(d: Date | ISODate = new Date()): ISODate {
  return toISODate(startOfWeek(parse(d), { weekStartsOn: 1 }));
}

/** "8 yrs 4 mo" (or "3 yrs" / "11 mo"). Uses i18n-free compact form; screens may wrap it. */
export function ageParts(dob: ISODate, at: Date = new Date()): { years: number; months: number } {
  const total = differenceInMonths(at, parse(dob));
  return { years: Math.floor(total / 12), months: total % 12 };
}

export function ageLabel(dob: ISODate, at: Date = new Date()): string {
  const { years, months } = ageParts(dob, at);
  if (currentLanguage === 'hi') {
    if (years === 0) return `${months} महीने`;
    return months ? `${years} वर्ष ${months} महीने` : `${years} वर्ष`;
  }
  if (years === 0) return `${months} mo`;
  return months ? `${years} yrs ${months} mo` : `${years} yrs`;
}

/** "Mon, 24 May" */
export function formatDay(value: ISODate | ISODateTime | Date): string {
  return format(parse(value), 'EEE, d MMM', { locale: locale() });
}

/** "24 May 2026" */
export function formatDate(value: ISODate | ISODateTime | Date): string {
  return format(parse(value), 'd MMM yyyy', { locale: locale() });
}

/** "10:30 AM" */
export function formatTime(value: ISODateTime | Date): string {
  return format(parse(value), 'h:mm a', { locale: locale() });
}

/** "10:30 – 11:15 AM" */
export function formatTimeRange(start: ISODateTime, end: ISODateTime): string {
  return `${format(parse(start), 'h:mm', { locale: locale() })} – ${formatTime(end)}`;
}

/** "Today", "Tomorrow", or "Mon, 24 May". Pass translated words for today/tomorrow. */
export function relativeDay(value: ISODate | ISODateTime | Date, words: { today: string; tomorrow: string }): string {
  const d = parse(value);
  if (isToday(d)) return words.today;
  if (isTomorrow(d)) return words.tomorrow;
  return formatDay(d);
}

/** "3 hours ago" style. */
export function timeAgo(value: ISODateTime): string {
  return formatDistanceToNowStrict(parse(value), { addSuffix: true, locale: locale() });
}

export function daysBetween(a: ISODate | Date, b: ISODate | Date): number {
  return differenceInCalendarDays(parse(b), parse(a));
}

export function addDaysISO(d: ISODate, n: number): ISODate {
  return toISODate(addDays(parse(d), n));
}

export function sameDay(a: ISODate | ISODateTime | Date, b: ISODate | ISODateTime | Date): boolean {
  return isSameDay(parse(a), parse(b));
}

/** Combine a local date and HH:mm into an ISO timestamp (device timezone, India in practice). */
export function combineDateTime(date: ISODate, time: string): ISODateTime {
  const [h, m] = time.split(':').map(Number);
  const d = parse(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function clockTime(value: ISODateTime | Date): string {
  return format(parse(value), 'HH:mm');
}
