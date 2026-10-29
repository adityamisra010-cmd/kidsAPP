import type { AppNotification } from '@/domain/types';

import { countUnread, groupNotifications, markReadLocally, safeRoute } from '../grouping';

const n = (id: string, createdAt: Date, readAt?: string): AppNotification => ({
  id,
  userId: 'u',
  kind: 'appointment_reminder',
  title: id,
  body: '',
  createdAt: createdAt.toISOString(),
  readAt,
});

const now = new Date(2026, 9, 29, 15, 0);

describe('groupNotifications', () => {
  it('splits into Today and Earlier, newest first', () => {
    const groups = groupNotifications(
      [n('old', new Date(2026, 9, 20, 9)), n('am', new Date(2026, 9, 29, 9)), n('pm', new Date(2026, 9, 29, 14)), n('yday', new Date(2026, 9, 28, 22))],
      now,
    );
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['today', ['pm', 'am']],
      ['earlier', ['yday', 'old']],
    ]);
  });

  it('drops empty groups', () => {
    expect(groupNotifications([n('old', new Date(2026, 9, 1))], now).map((g) => g.key)).toEqual(['earlier']);
    expect(groupNotifications([], now)).toEqual([]);
  });
});

describe('read state', () => {
  const list = [n('a', now), n('b', now, '2026-10-29T10:00:00Z'), n('c', now)];

  it('counts unread', () => {
    expect(countUnread(list)).toBe(2);
  });

  it('marks one or all read without touching already-read items', () => {
    expect(countUnread(markReadLocally(list, 'a', 'x'))).toBe(1);
    const all = markReadLocally(list, 'all', 'x');
    expect(countUnread(all)).toBe(0);
    expect(all[1].readAt).toBe('2026-10-29T10:00:00Z');
  });
});

describe('safeRoute', () => {
  it('only follows in-app paths', () => {
    expect(safeRoute('/appointment/123')).toBe('/appointment/123');
    expect(safeRoute(undefined)).toBeNull();
    expect(safeRoute('https://example.com')).toBeNull();
    expect(safeRoute('//evil.example')).toBeNull();
  });
});
