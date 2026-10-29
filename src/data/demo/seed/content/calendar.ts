/**
 * Indian centre holidays. Fixed-date holidays are generated for any year; festival dates come from
 * a small table (2026–2029). The demo picks those near "now" so the calendar always looks current.
 */
import type { ISODate } from '@/domain/types';
import { addDaysISO } from '@/lib/dates';

interface Holiday {
  date: ISODate;
  label: string;
}

const FESTIVALS: Holiday[] = [
  { date: '2026-03-04', label: 'Holi' },
  { date: '2026-10-20', label: 'Dussehra' },
  { date: '2026-11-08', label: 'Diwali' },
  { date: '2026-11-09', label: 'Diwali break (Govardhan Puja)' },
  { date: '2027-03-22', label: 'Holi' },
  { date: '2027-10-09', label: 'Dussehra' },
  { date: '2027-10-29', label: 'Diwali' },
  { date: '2027-10-30', label: 'Diwali break (Govardhan Puja)' },
  { date: '2028-03-11', label: 'Holi' },
  { date: '2028-09-27', label: 'Dussehra' },
  { date: '2028-10-17', label: 'Diwali' },
  { date: '2028-10-18', label: 'Diwali break (Govardhan Puja)' },
  { date: '2029-03-01', label: 'Holi' },
  { date: '2029-10-16', label: 'Dussehra' },
  { date: '2029-11-05', label: 'Diwali' },
  { date: '2029-11-06', label: 'Diwali break (Govardhan Puja)' },
];

function fixedFor(year: number, region: 'north' | 'south'): Holiday[] {
  const out: Holiday[] = [
    { date: `${year}-01-26`, label: 'Republic Day' },
    { date: `${year}-08-15`, label: 'Independence Day' },
    { date: `${year}-10-02`, label: 'Gandhi Jayanti' },
    { date: `${year}-12-25`, label: 'Christmas' },
  ];
  if (region === 'south') out.push({ date: `${year}-11-01`, label: 'Kannada Rajyotsava' });
  return out;
}

/**
 * Holidays from 8 weeks back to ~4 months ahead: up to `pastMax` recent ones and `futureMax`
 * upcoming ones.
 */
export function holidaysAround(today: ISODate, region: 'north' | 'south', pastMax = 1, futureMax = 3): Holiday[] {
  const year = Number(today.slice(0, 4));
  const all = [...FESTIVALS, ...fixedFor(year - 1, region), ...fixedFor(year, region), ...fixedFor(year + 1, region)]
    .sort((a, b) => a.date.localeCompare(b.date));
  const back = addDaysISO(today, -56);
  const ahead = addDaysISO(today, 130);
  const past = all.filter((h) => h.date >= back && h.date < today).slice(-pastMax);
  const future = all.filter((h) => h.date > today && h.date <= ahead).slice(0, futureMax);
  return [...past, ...future];
}
