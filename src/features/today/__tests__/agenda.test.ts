import type { AppointmentView } from '@/domain/types';
import { makeAppointment } from '@/features/home/testing';

import { agendaSummary, earlierUnlogged, filterAgenda, findFocus, logAction, sortAgenda } from '../agenda';

const day = (h: number, m = 0) => new Date(2026, 9, 29, h, m).toISOString();
const a = (id: string, h: number, extra: Partial<AppointmentView> = {}) => makeAppointment({ id, startsAt: day(h), endsAt: day(h, 45), ...extra });

describe('sortAgenda', () => {
  it('orders by start time, then child name', () => {
    const list = [a('c', 11), a('b', 9, { childName: 'Zoya' }), a('a', 9, { childName: 'Aarav' })];
    expect(sortAgenda(list).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('findFocus', () => {
  const list = [a('s1', 9, { logState: 'logged', sessionId: 'x' }), a('s2', 10), a('s3', 11), a('s4', 12, { status: 'cancelled' })];

  it('finds the running session and the next one', () => {
    expect(findFocus(list, new Date(2026, 9, 29, 10, 15))).toEqual({ currentId: 's2', nextId: 's3' });
  });

  it('between sessions there is only a next one', () => {
    expect(findFocus(list, new Date(2026, 9, 29, 9, 50))).toEqual({ currentId: undefined, nextId: 's2' });
  });

  it('a session marked in progress is current even if the clock says otherwise', () => {
    const l = [a('p', 8, { logState: 'in_progress' }), a('q', 13)];
    expect(findFocus(l, new Date(2026, 9, 29, 9, 30))).toEqual({ currentId: 'p', nextId: 'q' });
  });

  it('skips cancelled and absent sessions; nothing left at the end of the day', () => {
    const l = [a('x', 9, { attendance: 'absent' }), a('y', 10, { status: 'cancelled' })];
    expect(findFocus(l, new Date(2026, 9, 29, 8, 0))).toEqual({ currentId: undefined, nextId: undefined });
    expect(findFocus(list, new Date(2026, 9, 29, 18, 0))).toEqual({ currentId: undefined, nextId: undefined });
  });
});

describe('logAction', () => {
  it('maps log state and brief rules to the main button', () => {
    expect(logAction(a('1', 9, { logState: 'logged', sessionId: 's' }))).toBe('view_log');
    expect(logAction(a('2', 9, { logState: 'not_logged' }))).toBe('log');
    expect(logAction(a('3', 9, { briefRequired: true, briefAcknowledged: false }))).toBe('log_blocked');
    expect(logAction(a('4', 9, { briefRequired: true, briefAcknowledged: true }))).toBe('log');
    expect(logAction(a('5', 9, { status: 'cancelled', logState: 'not_applicable' }))).toBe('none');
    expect(logAction(a('6', 9, { attendance: 'absent' }))).toBe('none');
  });
});

describe('filters and summary', () => {
  const list = [a('1', 9, { logState: 'logged' }), a('2', 10, { logState: 'not_logged' }), a('3', 11), a('4', 12, { status: 'cancelled' })];

  it('filters to not logged', () => {
    expect(filterAgenda(list, 'not_logged').map((x) => x.id)).toEqual(['2']);
    expect(filterAgenda(list, 'all')).toHaveLength(4);
  });

  it('summarises only sessions that happen', () => {
    expect(agendaSummary(list)).toEqual({ total: 3, logged: 1, remaining: 2 });
  });

  it('keeps only unlogged sessions from earlier days, newest first', () => {
    const earlier = [
      makeAppointment({ id: 'old', startsAt: new Date(2026, 9, 27, 10).toISOString() }),
      makeAppointment({ id: 'yday', startsAt: new Date(2026, 9, 28, 10).toISOString() }),
      makeAppointment({ id: 'today', startsAt: new Date(2026, 9, 29, 8).toISOString() }),
    ];
    expect(earlierUnlogged(earlier, '2026-10-29').map((x) => x.id)).toEqual(['yday', 'old']);
  });
});
