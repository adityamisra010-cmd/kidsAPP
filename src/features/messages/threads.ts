/**
 * Pure helpers for the threads list and announcements.
 */
import type { Announcement, ISODateTime, ThreadSummary } from '@/domain/types';
import { addDaysISO, parse, toISODate } from '@/lib/dates';

export type ThreadSegment = 'all' | 'care_team' | 'staff_only';

export function threadActivityAt(t: ThreadSummary): number {
  return parse(t.lastMessage?.createdAt ?? t.createdAt).getTime();
}

/** Most recent conversation first, filtered by segment. */
export function filterThreads(list: ThreadSummary[], segment: ThreadSegment): ThreadSummary[] {
  return list
    .filter((t) => segment === 'all' || t.kind === segment)
    .sort((a, b) => threadActivityAt(b) - threadActivityAt(a));
}

/** Other members' names (never the viewer), first few + "+N". */
export function membersSummary(memberNames: string[], myName: string, max = 3): { names: string[]; more: number } {
  const me = myName.trim().toLowerCase();
  const others = memberNames.filter((n) => n.trim().toLowerCase() !== me);
  return { names: others.slice(0, max), more: Math.max(0, others.length - max) };
}

export type TimeLabel = { kind: 'time'; at: ISODateTime } | { kind: 'yesterday' } | { kind: 'day'; at: ISODateTime };

/** Today → clock time, yesterday → "Yesterday", older → "Mon, 24 May". */
export function threadTimeLabel(at: ISODateTime, now: Date = new Date()): TimeLabel {
  const day = toISODate(parse(at));
  const today = toISODate(now);
  if (day === today) return { kind: 'time', at };
  if (day === addDaysISO(today, -1)) return { kind: 'yesterday' };
  return { kind: 'day', at };
}

export function totalUnread(list: ThreadSummary[]): number {
  return list.reduce((sum, t) => sum + Math.max(0, t.unreadCount), 0);
}

/** Urgent notices stay pinned on top for this many days, then fall into date order. */
export const URGENT_PIN_DAYS = 7;

/** Recent urgent notices first (newest first), then everything else newest first. */
export function sortAnnouncements(list: Announcement[], now: Date = new Date(), pinDays = URGENT_PIN_DAYS): Announcement[] {
  return [...list].sort((a, b) => {
    const pa = isPinned(a, now, pinDays);
    const pb = isPinned(b, now, pinDays);
    if (pa !== pb) return pa ? -1 : 1;
    return parse(b.createdAt).getTime() - parse(a.createdAt).getTime();
  });
}

export function isPinned(a: Announcement, now: Date = new Date(), pinDays = URGENT_PIN_DAYS): boolean {
  return a.urgent && parse(a.createdAt).getTime() >= now.getTime() - pinDays * 24 * 60 * 60_000;
}
