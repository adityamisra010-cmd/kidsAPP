import type { AppointmentView } from '@/domain/types';

import { appointmentActions, startsIn } from '../lib/actions';
import { dayHeading, groupByDay, itemsOnDay, splitUpcomingPast } from '../lib/grouping';
import { buildMarkedDates, dotsByDay, holidayOn } from '../lib/marking';
import { listRange, monthGridRange, rangeForView, shiftMonth, weekDays, weekRange } from '../lib/ranges';
import {
  countOccurrences,
  formatWeekdayList,
  inferSeriesWeekdays,
  occurrenceDates,
  weekdaysFromRRule,
  weekdaysToRRule,
} from '../lib/recurrence';
import { latestRequestFor, partitionRequests } from '../lib/requests';
import { emptySchedule, isCheckable, scheduleSchema, toSeriesInput } from '../lib/schedule';
import { isoToSlot, latestStart, slotToISO, validateSlot, validateSlots } from '../lib/slots';

/** Local time helper: at(2026, 11, 3, 10, 30) = 3 Nov 2026 10:30 device time. */
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (y: number, m: number, d: number, h = 0, min = 0) => at(y, m, d, h, min).toISOString();

// Thursday 29 Oct 2026, 9:00 AM
const NOW = at(2026, 10, 29, 9, 0);

function appt(over: Partial<AppointmentView> = {}): AppointmentView {
  return {
    id: 'a1',
    organizationId: 'o1',
    childId: 'c1',
    therapistId: 't1',
    therapyTypeId: 'speech',
    startsAt: iso(2026, 10, 29, 10, 30),
    endsAt: iso(2026, 10, 29, 11, 15),
    status: 'scheduled',
    wasRescheduled: false,
    createdAt: iso(2026, 10, 1),
    childName: 'Aarav Sharma',
    therapistName: 'Ms. Riya Kapoor',
    therapyTypeName: 'Speech Therapy',
    therapyTypeColor: '#C66B4E',
    therapyTypeIcon: 'message-circle',
    displayStatus: 'confirmed',
    logState: 'upcoming',
    isSubstitute: false,
    briefRequired: false,
    briefAcknowledged: false,
    hasCheckin: false,
    ...over,
  };
}

describe('ranges', () => {
  it('covers the full Monday-first month grid', () => {
    const r = monthGridRange('2026-11-01');
    // 1 Nov 2026 is a Sunday → grid starts Mon 26 Oct and ends Sun 6 Dec.
    expect(new Date(r.from)).toEqual(at(2026, 10, 26));
    expect(new Date(r.to).getDate()).toBe(6);
    expect(new Date(r.to).getMonth()).toBe(11);
  });

  it('gives Monday to Sunday for a week', () => {
    expect(weekDays('2026-10-29')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(new Date(weekRange('2026-11-01').from)).toEqual(at(2026, 10, 26));
  });

  it('builds list windows from today forward and back to now', () => {
    const up = listRange('upcoming', NOW, 4);
    expect(new Date(up.from)).toEqual(at(2026, 10, 29));
    expect(new Date(up.to).getDate()).toBe(26);
    const past = listRange('past', NOW, 2);
    expect(new Date(past.from)).toEqual(at(2026, 10, 15));
    expect(past.to).toBe(NOW.toISOString());
  });

  it('picks the range for the active view', () => {
    const base = { month: '2026-10-01', selectedDay: '2026-10-29', tab: 'upcoming' as const, listWeeks: 4 };
    expect(rangeForView({ ...base, view: 'month' }, NOW)).toEqual(monthGridRange('2026-10-01'));
    expect(rangeForView({ ...base, view: 'week' }, NOW)).toEqual(weekRange('2026-10-29'));
    expect(rangeForView({ ...base, view: 'list' }, NOW)).toEqual(listRange('upcoming', NOW, 4));
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
  });
});

describe('grouping', () => {
  const items = [
    appt({ id: 'b', startsAt: iso(2026, 10, 30, 12), endsAt: iso(2026, 10, 30, 13) }),
    appt({ id: 'a', startsAt: iso(2026, 10, 30, 9), endsAt: iso(2026, 10, 30, 10) }),
    appt({ id: 'c', startsAt: iso(2026, 10, 29, 8), endsAt: iso(2026, 10, 29, 8, 45) }),
  ];

  it('groups by local day ascending with sessions in time order', () => {
    const g = groupByDay(items);
    expect(g.map((x) => x.date)).toEqual(['2026-10-29', '2026-10-30']);
    expect(g[1].items.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('puts the most recent day first for past lists', () => {
    expect(groupByDay(items, 'desc').map((x) => x.date)).toEqual(['2026-10-30', '2026-10-29']);
  });

  it('filters one day and splits upcoming/past by end time', () => {
    expect(itemsOnDay(items, '2026-10-30').map((x) => x.id)).toEqual(['a', 'b']);
    const inProgress = appt({ id: 'now', startsAt: iso(2026, 10, 29, 8, 30), endsAt: iso(2026, 10, 29, 9, 15) });
    const { upcoming, past } = splitUpcomingPast([...items, inProgress], NOW);
    expect(upcoming.map((x) => x.id).sort()).toEqual(['a', 'b', 'now']);
    expect(past.map((x) => x.id)).toEqual(['c']);
  });

  it('labels today, tomorrow and yesterday', () => {
    const words = { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday' };
    expect(dayHeading('2026-10-29', NOW, words)).toBe('Today');
    expect(dayHeading('2026-10-30', NOW, words)).toBe('Tomorrow');
    expect(dayHeading('2026-10-28', NOW, words)).toBe('Yesterday');
    expect(dayHeading('2026-11-02', NOW, words)).toBe('Mon, 2 Nov');
  });
});

describe('marking', () => {
  const day = (h: number, type: string, color: string, over: Partial<AppointmentView> = {}) =>
    appt({ therapyTypeId: type, therapyTypeColor: color, startsAt: iso(2026, 11, 2, h), endsAt: iso(2026, 11, 2, h, 45), ...over });

  it('adds one dot per therapy type, max three, skipping cancelled sessions', () => {
    const dots = dotsByDay([
      day(9, 'speech', '#1'),
      day(10, 'speech', '#1'),
      day(11, 'ot', '#2'),
      day(12, 'aba', '#3', { status: 'cancelled' }),
      day(13, 'physio', '#4'),
      day(14, 'sped', '#5'),
      day(15, 'audio', '#6'),
    ]).get('2026-11-02');
    expect(dots?.map((d) => d.key)).toEqual(['speech', 'ot', 'physio']);
  });

  it('mutes holidays, keeps them tappable and highlights the selected day', () => {
    const marked = buildMarkedDates({
      appointments: [day(9, 'speech', '#1')],
      holidays: [{ date: '2026-11-08', label: 'Diwali' }],
      selected: '2026-11-02',
      selectedColor: 'P',
      selectedTextColor: 'W',
      selectedDotColor: 'D',
    });
    expect(marked['2026-11-08']).toEqual({ disabled: true, disableTouchEvent: false });
    expect(marked['2026-11-02']).toMatchObject({ selected: true, selectedColor: 'P', dots: [{ key: 'speech', selectedDotColor: 'D' }] });
    expect(holidayOn('2026-11-08', [{ date: '2026-11-08', label: 'Diwali' }])).toBe('Diwali');
  });
});

describe('slots', () => {
  const opts = {
    now: NOW,
    workingHours: { start: '08:30', end: '17:30', days: [1, 2, 3, 4, 5, 6] },
    holidays: [{ date: '2026-11-09', label: 'Diwali' }],
    durationMinutes: 45,
  };

  it('accepts a future slot on a school day within hours', () => {
    expect(validateSlot({ date: '2026-11-02', time: '10:30' }, opts)).toBeNull();
  });

  it('rejects missing, past, holiday, closed-day and out-of-hours slots', () => {
    expect(validateSlot({ date: '2026-11-02' }, opts)).toBe('missing');
    expect(validateSlot({ date: '2026-10-29', time: '08:45' }, opts)).toBe('past');
    expect(validateSlot({ date: '2026-11-09', time: '10:00' }, opts)).toBe('holiday');
    expect(validateSlot({ date: '2026-11-01', time: '10:00' }, opts)).toBe('closed_day');
    expect(validateSlot({ date: '2026-11-02', time: '08:00' }, opts)).toBe('outside_hours');
    expect(validateSlot({ date: '2026-11-02', time: '17:00' }, opts)).toBe('outside_hours');
  });

  it('flags a second slot identical to the first', () => {
    expect(validateSlots([{ date: '2026-11-02', time: '10:30' }, { date: '2026-11-02', time: '10:30' }], opts)).toEqual([null, 'duplicate']);
  });

  it('offers start times that still end within working hours', () => {
    expect(latestStart(opts.workingHours, 45)).toBe('16:45');
    expect(latestStart(opts.workingHours, 60)).toBe('16:30');
  });

  it('round-trips slots and ISO timestamps', () => {
    expect(isoToSlot(slotToISO({ date: '2026-11-02', time: '10:30' }))).toEqual({ date: '2026-11-02', time: '10:30' });
  });
});

describe('recurrence', () => {
  it('parses and writes weekly BYDAY rules', () => {
    expect(weekdaysFromRRule('FREQ=WEEKLY;BYDAY=FR,MO,WE')).toEqual([1, 3, 5]);
    expect(weekdaysFromRRule('FREQ=WEEKLY')).toEqual([]);
    expect(weekdaysToRRule([5, 1, 3])).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('infers series weekdays from sibling occurrences', () => {
    const list = [
      { seriesId: 's1', startsAt: iso(2026, 11, 2, 10) },
      { seriesId: 's1', startsAt: iso(2026, 11, 4, 10) },
      { seriesId: 's2', startsAt: iso(2026, 11, 3, 10) },
      { seriesId: 's1', startsAt: iso(2026, 11, 9, 10) },
    ];
    expect(inferSeriesWeekdays(list, 's1')).toEqual([1, 3]);
  });

  it('formats a Monday-first weekday list with Sunday last', () => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    expect(formatWeekdayList([5, 0, 1, 3], names)).toBe('Mon · Wed · Fri · Sun');
  });

  it('counts occurrences in a date range', () => {
    expect(occurrenceDates([1, 3], '2026-11-02', '2026-11-11')).toEqual(['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']);
    // Mon/Wed/Fri from 3 Jun to 31 Aug 2026 = 39 sessions.
    expect(countOccurrences([1, 3, 5], '2026-06-03', '2026-08-31')).toBe(39);
    expect(countOccurrences([1], '2026-11-10', '2026-11-01')).toBe(0);
  });
});

describe('appointment actions', () => {
  const ids = (role: Parameters<typeof appointmentActions>[0], a: AppointmentView, user = 't1') =>
    appointmentActions(role, a, user, NOW).map((x) => (x.disabledReason ? `${x.id}:${x.disabledReason}` : x.id));

  it('offers parents check-in today, request change and cancel for upcoming sessions', () => {
    expect(ids('parent', appt())).toEqual(['checkin', 'request_change', 'cant_make_it']);
    expect(ids('parent', appt({ hasCheckin: true, pendingRescheduleRequestId: 'r1' }))).toEqual(['cant_make_it']);
    expect(ids('parent', appt({ sessionId: 's1', status: 'completed', startsAt: iso(2026, 10, 27, 10), endsAt: iso(2026, 10, 27, 11) }))).toEqual([
      'view_summary',
    ]);
  });

  it('blocks logging until the brief is acknowledged when required', () => {
    expect(ids('therapist', appt({ briefRequired: true }))).toEqual(['open_brief', 'log_session:brief_first', 'mark_attendance']);
    expect(ids('therapist', appt({ briefRequired: true, briefAcknowledged: true }))).toContain('log_session');
  });

  it('does not let therapists log other people’s or future-day sessions', () => {
    expect(ids('therapist', appt(), 'someone-else')).toEqual(['open_brief']);
    const nextWeek = appt({ startsAt: iso(2026, 11, 5, 10), endsAt: iso(2026, 11, 5, 11) });
    expect(ids('therapist', nextWeek)).toEqual(['open_brief']);
  });

  it('gives coordinators management actions and make-up for missed sessions', () => {
    expect(ids('coordinator', appt(), 'admin')).toEqual(['open_brief', 'mark_attendance', 'change_time', 'assign_substitute', 'cancel_by_school']);
    const absent = appt({ attendance: 'absent', startsAt: iso(2026, 10, 27, 10), endsAt: iso(2026, 10, 27, 11) });
    expect(ids('school_admin', absent, 'admin')).toEqual(['mark_attendance', 'book_makeup']);
    expect(ids('coordinator', appt({ status: 'cancelled' }), 'admin')).toEqual(['book_makeup']);
  });

  it('describes when a session starts', () => {
    expect(startsIn(appt(), NOW)).toEqual({ kind: 'hours', value: 2 });
    expect(startsIn(appt({ startsAt: iso(2026, 10, 29, 9, 20) }), NOW)).toEqual({ kind: 'minutes', value: 20 });
    expect(startsIn(appt({ startsAt: iso(2026, 10, 29, 8, 30), endsAt: iso(2026, 10, 29, 9, 15) }), NOW)).toEqual({ kind: 'now' });
    expect(startsIn(appt({ startsAt: iso(2026, 10, 30, 10), endsAt: iso(2026, 10, 30, 11) }), NOW)).toBeNull();
  });
});

describe('reschedule requests', () => {
  const r = (id: string, status: 'pending' | 'approved' | 'declined' | 'countered', createdAt: string, appointmentId = 'a1') => ({
    id,
    appointmentId,
    status,
    createdAt,
    resolvedAt: status === 'approved' || status === 'declined' ? createdAt : undefined,
  });

  it('puts the longest-waiting pending request first and newest history first', () => {
    const p = partitionRequests([
      r('1', 'pending', '2026-10-20'),
      r('2', 'approved', '2026-10-10'),
      r('3', 'pending', '2026-10-18'),
      r('4', 'declined', '2026-10-15'),
      r('5', 'countered', '2026-10-19'),
    ]);
    expect(p.pending.map((x) => x.id)).toEqual(['3', '1']);
    expect(p.countered.map((x) => x.id)).toEqual(['5']);
    expect(p.resolved.map((x) => x.id)).toEqual(['4', '2']);
  });

  it('finds the newest request for an appointment', () => {
    const list = [r('1', 'declined', '2026-10-10'), r('2', 'pending', '2026-10-12'), r('3', 'pending', '2026-10-13', 'other')];
    expect(latestRequestFor(list, 'a1')?.id).toBe('2');
    expect(latestRequestFor(list, 'none')).toBeUndefined();
  });
});

describe('schedule form', () => {
  const valid = emptySchedule({
    childId: 'c1',
    therapyTypeId: 'speech',
    therapistId: 't1',
    weekdays: [1, 3, 5],
    startTime: '10:30',
    startDate: '2026-11-02',
    endDate: '2027-01-29',
  });

  it('accepts a complete weekly schedule and maps it to SeriesInput', () => {
    expect(isCheckable(valid)).toBe(true);
    expect(toSeriesInput({ ...valid, room: '  ' })).toEqual({
      childId: 'c1',
      therapistId: 't1',
      therapyTypeId: 'speech',
      weekdays: [1, 3, 5],
      startTime: '10:30',
      durationMinutes: 45,
      startDate: '2026-11-02',
      endDate: '2027-01-29',
      room: undefined,
    });
  });

  it('requires weekdays and an end date after the start for weekly schedules', () => {
    const res = scheduleSchema.safeParse({ ...valid, weekdays: [], endDate: '2026-10-01' });
    expect(res.success).toBe(false);
    const messages = res.success ? [] : res.error.issues.map((i) => i.message);
    expect(messages).toEqual(expect.arrayContaining(['calendar:new.errors.weekdays', 'calendar:new.errors.endBeforeStart']));
  });

  it('turns a one-off session into a single-day series', () => {
    const one = { ...valid, repeats: false, weekdays: [], endDate: '' };
    expect(isCheckable(one)).toBe(true);
    expect(toSeriesInput(one)).toMatchObject({ weekdays: [1], startDate: '2026-11-02', endDate: '2026-11-02' });
  });
});
