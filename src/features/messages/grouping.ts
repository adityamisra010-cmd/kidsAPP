/**
 * Pure helpers for a conversation: day grouping, bubble grouping and read-receipt text.
 */
import type { ISODate, Message, UUID } from '@/domain/types';
import { addDaysISO, parse, toISODate } from '@/lib/dates';

/** Messages from the same sender within this gap are drawn as one group (name shown once). */
const GROUP_GAP_MS = 5 * 60_000;

export type ChatItem =
  | { type: 'day'; key: string; date: ISODate }
  | {
      type: 'message';
      key: string;
      message: Message;
      mine: boolean;
      /** First bubble of a run from the same sender: show name + role. */
      firstInGroup: boolean;
      /** Last bubble of a run: show the time. */
      lastInGroup: boolean;
      /** My latest message: show "Seen by …". */
      showReceipt: boolean;
    };

export function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => parse(a.createdAt).getTime() - parse(b.createdAt).getTime());
}

/** Oldest → newest, with a day separator before the first message of each day. */
export function buildChatItems(messages: Message[], myId: UUID): ChatItem[] {
  const sorted = sortMessages(messages);
  const lastMine = [...sorted].reverse().find((m) => m.senderId === myId);
  const items: ChatItem[] = [];
  let prevDay: string | null = null;

  sorted.forEach((m, i) => {
    const day = toISODate(parse(m.createdAt));
    if (day !== prevDay) {
      items.push({ type: 'day', key: `day-${day}`, date: day });
      prevDay = day;
    }
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const joinsPrev = !!prev && sameRun(prev, m);
    const joinsNext = !!next && sameRun(m, next);
    items.push({
      type: 'message',
      key: m.id,
      message: m,
      mine: m.senderId === myId,
      firstInGroup: !joinsPrev,
      lastInGroup: !joinsNext,
      showReceipt: lastMine?.id === m.id,
    });
  });
  return items;
}

function sameRun(a: Message, b: Message): boolean {
  if (a.senderId !== b.senderId) return false;
  const ta = parse(a.createdAt);
  const tb = parse(b.createdAt);
  return toISODate(ta) === toISODate(tb) && tb.getTime() - ta.getTime() <= GROUP_GAP_MS;
}

export type DayLabel = { kind: 'today' } | { kind: 'yesterday' } | { kind: 'date'; date: ISODate };

export function dayLabel(date: ISODate, now: Date = new Date()): DayLabel {
  const today = toISODate(now);
  if (date === today) return { kind: 'today' };
  if (date === addDaysISO(today, -1)) return { kind: 'yesterday' };
  return { kind: 'date', date };
}

export type Receipt = { kind: 'sent' } | { kind: 'seen'; names: string[]; more: number };

/**
 * "Seen by Ms. Riya" / "Seen by Ms. Riya and Priya" / "Seen by Ms. Riya, Priya and 2 more".
 * The sender's own name is never listed.
 */
export function readReceipt(readBy: string[], myName: string, maxNames = 2): Receipt {
  const me = myName.trim().toLowerCase();
  const others = [...new Set(readBy.map((n) => n.trim()).filter((n) => n && n.toLowerCase() !== me))];
  if (others.length === 0) return { kind: 'sent' };
  const names = others.slice(0, maxNames);
  return { kind: 'seen', names, more: others.length - names.length };
}
