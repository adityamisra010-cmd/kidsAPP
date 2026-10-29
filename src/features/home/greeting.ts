/**
 * Pure helpers for the home screens' headers and the parent Home sections.
 */
import type { AppointmentView, UUID } from '@/domain/types';

export type DayPeriod = 'morning' | 'afternoon' | 'evening';

/** Morning 4:00–11:59, afternoon 12:00–16:59, evening otherwise (late-night openers get "evening"). */
export function dayPeriod(at: Date = new Date()): DayPeriod {
  const h = at.getHours();
  if (h >= 4 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

const HONORIFIC = /^(ms|mr|mrs|miss|dr|smt|shri|sri|prof)\.?$/i;

/** "Priya Sharma" → "Priya", "Ms. Riya Menon" → "Riya". Falls back to the trimmed full name. */
export function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const named = parts.filter((p, i) => !(i < parts.length - 1 && HONORIFIC.test(p)));
  return named[0] ?? fullName.trim();
}

/**
 * Check-in prompts for today: one per child (their earliest session), the active child first.
 * A parent fills one check-in per child per morning, not one per session.
 */
export function pickCheckinPrompts(pending: AppointmentView[], activeChildId: UUID | null): AppointmentView[] {
  const byChild = new Map<UUID, AppointmentView>();
  for (const a of [...pending].sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt))) {
    if (a.status === 'cancelled' || a.hasCheckin) continue;
    if (!byChild.has(a.childId)) byChild.set(a.childId, a);
  }
  return [...byChild.values()].sort((x, y) => {
    if (x.childId === activeChildId) return -1;
    if (y.childId === activeChildId) return 1;
    return Date.parse(x.startsAt) - Date.parse(y.startsAt);
  });
}
