/**
 * Quiet hours (pure). Default 9 PM – 8 AM: no reminders then, except schedule changes (which are
 * server pushes and never pass through here). Times are device-local (India in practice).
 */
import type { ClockTime } from '@/domain/types';

export interface QuietHours {
  start: ClockTime;
  end: ClockTime;
}

/** "21:30" → 1290 minutes after midnight. Invalid input → null. */
export function clockToMinutes(clock: ClockTime): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function atMinutes(day: Date, minutes: number, dayOffset = 0): Date {
  const d = new Date(day);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/** True when `d` falls inside quiet hours. Start is inclusive, end exclusive; start = end means none. */
export function isQuietTime(d: Date, quiet: QuietHours): boolean {
  const start = clockToMinutes(quiet.start);
  const end = clockToMinutes(quiet.end);
  if (start == null || end == null || start === end) return false;
  const m = minutesOfDay(d);
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** How long before the quiet start an evening reminder is sent instead (e.g. 8:30 PM). */
export const EVENING_LEAD_MINUTES = 30;
/** A reminder moved later must still arrive at least this long before the session. */
export const MIN_NOTICE_MINUTES = 15;

/**
 * Moves a notification out of quiet hours.
 * - Prefer the end of quiet hours (8 AM) if that is still at least 15 min before `deadline`.
 * - Otherwise send it the evening before quiet hours start (8:30 PM).
 * Returns the time unchanged when it isn't quiet, or null when there is no sensible slot.
 */
export function adjustForQuietHours(fireAt: Date, quiet: QuietHours, deadline?: Date): Date | null {
  if (!isQuietTime(fireAt, quiet)) return fireAt;
  const start = clockToMinutes(quiet.start)!;
  const end = clockToMinutes(quiet.end)!;
  const m = minutesOfDay(fireAt);
  const overnight = start > end;

  // End of this quiet window: later today, or tomorrow morning when we're in the evening part.
  const later = atMinutes(fireAt, end, overnight && m >= start ? 1 : 0);
  if (!deadline || later.getTime() <= deadline.getTime() - MIN_NOTICE_MINUTES * 60_000) return later;

  // Start of this quiet window: earlier today, or yesterday evening when we're in the morning part.
  const windowStart = atMinutes(fireAt, start, overnight && m < end ? -1 : 0);
  const earlier = new Date(windowStart.getTime() - EVENING_LEAD_MINUTES * 60_000);
  return earlier.getTime() < fireAt.getTime() ? earlier : null;
}
