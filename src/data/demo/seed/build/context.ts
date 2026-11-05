/** Shared state and stable-id helpers for the seed build steps. */
import type { ISODate, ISODateTime, UUID } from '@/domain/types';
import { addDaysISO, combineDateTime, toISODate } from '@/lib/dates';
import { stableId } from '@/lib/id';

import type { DemoStore } from '../../store';
import type { ChildSeed, SchoolSeed, TherapyKey } from '../content/types';

export type SchoolKey = SchoolSeed['key'];

export const ids = {
  org: (s: SchoolKey) => stableId(`org:${s}`),
  staff: (s: SchoolKey, key: string) => stableId(`${s}:staff:${key}`),
  parent: (s: SchoolKey, key: string) => stableId(`${s}:parent:${key}`),
  child: (s: SchoolKey, key: string) => stableId(`${s}:child:${key}`),
  therapyType: (s: SchoolKey, key: string) => stableId(`${s}:tt:${key}`),
  dimension: (s: SchoolKey | 'global', key: string) => stableId(`${s}:dim:${key}`),
  goal: (s: SchoolKey, child: string, bank: string) => stableId(`goal:${s}:${child}:${bank}`),
  bank: (key: string) => stableId(`goalbank:${key}`),
  series: (s: SchoolKey, child: string, type: string) => stableId(`series:${s}:${child}:${type}`),
  appointment: (seriesOrTag: string, date: ISODate) => stableId(`appt:${seriesOrTag}:${date}`),
  session: (appointmentId: UUID) => stableId(`session:${appointmentId}`),
  platformAdmin: () => stableId('platform:kabir'),
};

/** Scenario facts later build steps (sessions, messages, notifications) refer to. */
export interface SeedMeta {
  /** Attended appointments deliberately left without a session log. */
  unlogged: Set<UUID>;
  substituteToday?: UUID;
  makeupToday?: UUID;
  missedForMakeup?: UUID;
  needsSubstitute: UUID[];
  poojaLeaveTo?: ISODate;
  rescheduled?: { requestId: UUID; appointmentId: UUID };
  pendingRequest?: { requestId: UUID; appointmentId: UUID };
  counteredRequest?: { requestId: UUID; appointmentId: UUID };
}

export interface Build {
  now: Date;
  today: ISODate;
  store: DemoStore;
  schools: SchoolSeed[];
  meta: SeedMeta;
}

export const at = (b: Build, offsetDays: number, time: string): ISODateTime => combineDateTime(addDaysISO(b.today, offsetDays), time);
export const dayOffset = (b: Build, offsetDays: number): ISODate => addDaysISO(b.today, offsetDays);
export const minutesAgo = (b: Build, minutes: number): ISODateTime => new Date(b.now.getTime() - minutes * 60_000).toISOString();
/** Clamp a timestamp so seeded "past" events never land after now. */
export const notAfterNow = (b: Build, iso: ISODateTime): ISODateTime =>
  new Date(iso).getTime() > b.now.getTime() - 60_000 ? minutesAgo(b, 1) : iso;
export const todayISO = (now: Date) => toISODate(now);

/** Whole days from `a` to `b` (yyyy-MM-dd strings); a fast stand-in for daysBetween in hot loops. */
export function dayDiff(a: ISODate, b: ISODate): number {
  const utc = (d: ISODate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export function school(b: Build, key: SchoolKey): SchoolSeed {
  return b.schools.find((s) => s.key === key)!;
}

export function childSeed(b: Build, s: SchoolKey, key: string): ChildSeed {
  return school(b, s).children.find((c) => c.key === key)!;
}

/** The therapist seed key delivering `type` to a child. */
export function therapistFor(c: ChildSeed, type: TherapyKey): string | undefined {
  return c.therapies.find((t) => t.type === type)?.therapist;
}

export function profileName(b: Build, userId: UUID): string {
  return b.store.profiles.find((p) => p.id === userId)?.fullName ?? '';
}

/** "Ms. Riya" / "Mr. Arjun" style short name used in messages to parents. */
export function courtesyName(fullName: string, gender: 'female' | 'male'): string {
  const parts = fullName.replace(/^Dr\.\s*/, '').split(' ');
  if (fullName.startsWith('Dr.')) return `Dr. ${parts[parts.length - 1]}`;
  return `${gender === 'female' ? 'Ms.' : 'Mr.'} ${parts[0]}`;
}
