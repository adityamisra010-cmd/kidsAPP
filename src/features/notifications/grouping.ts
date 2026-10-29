/**
 * Pure helpers for the in-app notifications inbox ("Updates").
 */
import type { AppNotification } from '@/domain/types';
import { parse, sameDay } from '@/lib/dates';

export interface NotificationGroup {
  key: 'today' | 'earlier';
  items: AppNotification[];
}

/** Newest first, split into Today / Earlier. Empty groups are dropped. */
export function groupNotifications(list: AppNotification[], now: Date = new Date()): NotificationGroup[] {
  const sorted = [...list].sort((a, b) => parse(b.createdAt).getTime() - parse(a.createdAt).getTime());
  const today = sorted.filter((n) => sameDay(n.createdAt, now));
  const earlier = sorted.filter((n) => !sameDay(n.createdAt, now));
  const groups: NotificationGroup[] = [];
  if (today.length) groups.push({ key: 'today', items: today });
  if (earlier.length) groups.push({ key: 'earlier', items: earlier });
  return groups;
}

export function countUnread(list: AppNotification[]): number {
  return list.filter((n) => !n.readAt).length;
}

/** Marks one (or all) notifications read in a cached list, for optimistic updates. */
export function markReadLocally(list: AppNotification[], id: string | 'all', at: string): AppNotification[] {
  return list.map((n) => (n.readAt || (id !== 'all' && n.id !== id) ? n : { ...n, readAt: at }));
}

/**
 * Only follow in-app routes we know how to open. Anything else (external links, typos) stays on
 * the inbox instead of crashing navigation.
 */
export function safeRoute(route: string | undefined): string | null {
  if (!route) return null;
  const r = route.trim();
  return r.startsWith('/') && !r.startsWith('//') ? r : null;
}
