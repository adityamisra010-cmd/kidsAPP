import type { Announcement, Message, ThreadSummary } from '@/domain/types';

import { buildChatItems, dayLabel, readReceipt } from '../grouping';
import { filterThreads, isPinned, membersSummary, sortAnnouncements, threadTimeLabel, totalUnread } from '../threads';

const msg = (id: string, senderId: string, at: Date, readBy: string[] = []): Message => ({
  id,
  threadId: 't',
  senderId,
  senderName: senderId === 'me' ? 'Priya Sharma' : 'Ms. Riya',
  senderRole: senderId === 'me' ? 'parent' : 'therapist',
  body: id,
  attachments: [],
  createdAt: at.toISOString(),
  readBy,
});

describe('buildChatItems', () => {
  const items = buildChatItems(
    [
      msg('m3', 'riya', new Date(2026, 9, 29, 10, 2)),
      msg('m1', 'me', new Date(2026, 9, 28, 18, 0)),
      msg('m2', 'riya', new Date(2026, 9, 29, 10, 0)),
      msg('m4', 'me', new Date(2026, 9, 29, 11, 0), ['Ms. Riya']),
      msg('m5', 'riya', new Date(2026, 9, 29, 11, 30)),
    ],
    'me',
  );

  it('sorts oldest first with a separator per day', () => {
    expect(items.map((i) => (i.type === 'day' ? `day:${i.date}` : i.key))).toEqual(['day:2026-10-28', 'm1', 'day:2026-10-29', 'm2', 'm3', 'm4', 'm5']);
  });

  it('groups consecutive bubbles from the same sender', () => {
    const byKey = Object.fromEntries(items.filter((i) => i.type === 'message').map((i) => [i.key, i]));
    expect(byKey.m2).toMatchObject({ firstInGroup: true, lastInGroup: false, mine: false });
    expect(byKey.m3).toMatchObject({ firstInGroup: false, lastInGroup: true });
    expect(byKey.m4).toMatchObject({ firstInGroup: true, lastInGroup: true, mine: true });
  });

  it('shows the receipt only on my latest message', () => {
    const receipts = items.filter((i) => i.type === 'message' && i.showReceipt).map((i) => i.key);
    expect(receipts).toEqual(['m4']);
  });

  it('does not join messages more than 5 minutes apart', () => {
    const list = buildChatItems([msg('a', 'x', new Date(2026, 9, 29, 9, 0)), msg('b', 'x', new Date(2026, 9, 29, 9, 6))], 'me');
    expect(list.filter((i) => i.type === 'message').every((i) => i.type === 'message' && i.firstInGroup)).toBe(true);
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 9, 29, 12);
  it('says today / yesterday / date', () => {
    expect(dayLabel('2026-10-29', now)).toEqual({ kind: 'today' });
    expect(dayLabel('2026-10-28', now)).toEqual({ kind: 'yesterday' });
    expect(dayLabel('2026-10-20', now)).toEqual({ kind: 'date', date: '2026-10-20' });
  });
});

describe('readReceipt', () => {
  it('says sent when nobody else has read it', () => {
    expect(readReceipt([], 'Priya Sharma')).toEqual({ kind: 'sent' });
    expect(readReceipt(['Priya Sharma'], 'Priya Sharma')).toEqual({ kind: 'sent' });
  });

  it('lists up to two names and counts the rest, without duplicates', () => {
    expect(readReceipt(['Ms. Riya', 'Priya Sharma'], 'Priya Sharma')).toEqual({ kind: 'seen', names: ['Ms. Riya'], more: 0 });
    expect(readReceipt(['Ms. Riya', 'Mr. Arjun', 'Ms. Neha', 'Ms. Riya'], 'Priya Sharma')).toEqual({
      kind: 'seen',
      names: ['Ms. Riya', 'Mr. Arjun'],
      more: 1,
    });
  });
});

const thread = (id: string, kind: ThreadSummary['kind'], last?: Date, unread = 0): ThreadSummary => ({
  id,
  organizationId: 'org',
  kind,
  title: id,
  createdAt: new Date(2026, 9, 1).toISOString(),
  memberNames: [],
  unreadCount: unread,
  lastMessage: last ? { body: 'hi', senderName: 'X', createdAt: last.toISOString() } : undefined,
});

describe('threads', () => {
  const list = [
    thread('care-old', 'care_team', new Date(2026, 9, 20)),
    thread('staff', 'staff_only', new Date(2026, 9, 28), 2),
    thread('care-new', 'care_team', new Date(2026, 9, 29), 1),
    thread('empty', 'direct'),
  ];

  it('filters by segment, most recent first', () => {
    expect(filterThreads(list, 'all').map((t) => t.id)).toEqual(['care-new', 'staff', 'care-old', 'empty']);
    expect(filterThreads(list, 'care_team').map((t) => t.id)).toEqual(['care-new', 'care-old']);
    expect(filterThreads(list, 'staff_only').map((t) => t.id)).toEqual(['staff']);
  });

  it('totals unread', () => {
    expect(totalUnread(list)).toBe(3);
  });

  it('summarises members without the viewer', () => {
    expect(membersSummary(['Priya Sharma', 'Ms. Riya', 'Mr. Arjun', 'Ms. Neha', 'Dr. Kavya'], 'Priya Sharma')).toEqual({
      names: ['Ms. Riya', 'Mr. Arjun', 'Ms. Neha'],
      more: 1,
    });
  });

  it('labels times relative to today', () => {
    const now = new Date(2026, 9, 29, 12);
    expect(threadTimeLabel(new Date(2026, 9, 29, 9).toISOString(), now).kind).toBe('time');
    expect(threadTimeLabel(new Date(2026, 9, 28, 9).toISOString(), now).kind).toBe('yesterday');
    expect(threadTimeLabel(new Date(2026, 9, 2, 9).toISOString(), now).kind).toBe('day');
  });
});

const ann = (id: string, at: Date, urgent = false): Announcement => ({
  id,
  organizationId: 'org',
  title: id,
  body: '',
  audience: 'everyone',
  urgent,
  createdBy: 'u',
  createdByName: 'Admin',
  createdAt: at.toISOString(),
});

describe('sortAnnouncements', () => {
  const now = new Date(2026, 9, 29, 12);
  it('pins recent urgent notices, then newest first; old urgent ones are not pinned', () => {
    const list = [
      ann('old-urgent', new Date(2026, 8, 1), true),
      ann('new', new Date(2026, 9, 29, 9)),
      ann('urgent', new Date(2026, 9, 27), true),
      ann('mid', new Date(2026, 9, 25)),
    ];
    expect(sortAnnouncements(list, now).map((a) => a.id)).toEqual(['urgent', 'new', 'mid', 'old-urgent']);
    expect(isPinned(list[0], now)).toBe(false);
    expect(isPinned(list[2], now)).toBe(true);
  });
});
