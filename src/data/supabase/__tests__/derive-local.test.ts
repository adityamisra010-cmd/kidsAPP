import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';

import {
  attendanceSummary,
  buildRrule,
  completionPercent,
  displayStatus,
  expandSeries,
  findConflicts,
  fourSessionAverage,
  goalStats,
  incidentsByWeek,
  isSubstitute,
  istDate,
  istDateTime,
  istTime,
  logState,
  normalizePhone,
  rangeCompletion,
  rruleWeekdays,
  substituteImpact,
  weekStartOf,
  weeklyCompletion,
} from '../derive-local';

describe('IST dates', () => {
  it('converts timestamps to school-local date and time', () => {
    expect(istDate('2026-10-28T19:00:00Z')).toBe('2026-10-29'); // 00:30 IST next day
    expect(istTime('2026-10-29T05:00:00Z')).toBe('10:30');
    expect(Date.parse(istDateTime('2026-10-29', '10:30'))).toBe(Date.parse('2026-10-29T05:00:00Z'));
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26'); // Sunday → Monday before
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26');
  });
});

describe('series', () => {
  it('builds and parses RRULEs Monday-first', () => {
    expect(buildRrule([5, 1, 3, 1])).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(buildRrule([0, 6])).toBe('FREQ=WEEKLY;BYDAY=SA,SU');
    expect(rruleWeekdays('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toEqual([1, 3, 5]);
    expect(rruleWeekdays('FREQ=DAILY')).toEqual([]);
  });

  it('expands occurrences on the chosen weekdays at the IST start time', () => {
    const occ = expandSeries({ weekdays: [1, 3], startDate: '2026-10-26', endDate: '2026-11-04', startTime: '10:30', durationMinutes: 45 });
    expect(occ.map((o) => o.date)).toEqual(['2026-10-26', '2026-10-28', '2026-11-02', '2026-11-04']);
    expect(Date.parse(occ[0].startsAt)).toBe(Date.parse('2026-10-26T05:00:00Z'));
    expect(Date.parse(occ[0].endsAt)).toBe(Date.parse('2026-10-26T05:45:00Z'));
  });
});

describe('findConflicts', () => {
  const occ = expandSeries({ weekdays: [1], startDate: '2026-10-26', endDate: '2026-11-02', startTime: '10:30', durationMinutes: 45 });
  const base = {
    occurrences: occ,
    therapistId: 't1',
    childId: 'c1',
    unavailability: [] as { from: string; to: string; reason: string }[],
    settings: { holidays: DEFAULT_ORG_SETTINGS.holidays, workingHours: DEFAULT_ORG_SETTINGS.workingHours },
  };

  it('reports therapist and child double bookings, ignoring cancelled and excluded ones', () => {
    const existing = [
      { id: 'a1', childId: 'c9', therapistId: 't1', startsAt: '2026-10-26T05:15:00Z', endsAt: '2026-10-26T06:00:00Z', status: 'scheduled' as const },
      { id: 'a2', childId: 'c1', therapistId: 't9', startsAt: '2026-11-02T05:00:00Z', endsAt: '2026-11-02T05:30:00Z', status: 'scheduled' as const },
      { id: 'a3', childId: 'c1', therapistId: 't1', startsAt: '2026-10-26T05:00:00Z', endsAt: '2026-10-26T05:45:00Z', status: 'cancelled' as const },
      { id: 'a4', childId: 'c1', therapistId: 't1', startsAt: '2026-11-02T05:00:00Z', endsAt: '2026-11-02T05:45:00Z', status: 'scheduled' as const },
    ];
    const out = findConflicts({ ...base, existing, excludeIds: ['a4'] });
    expect(out.map((c) => [c.kind, c.date, c.appointmentId])).toEqual([
      ['therapist_double_booked', '2026-10-26', 'a1'],
      ['child_double_booked', '2026-11-02', 'a2'],
    ]);
  });

  it('reports holidays, unavailability and working hours', () => {
    const out = findConflicts({
      ...base,
      occurrences: expandSeries({ weekdays: [1, 0], startDate: '2026-10-25', endDate: '2026-10-26', startTime: '17:00', durationMinutes: 45 }),
      existing: [],
      unavailability: [{ from: '2026-10-26', to: '2026-10-27', reason: 'Leave' }],
      settings: { ...base.settings, holidays: [{ date: '2026-10-26', label: 'Diwali' }] },
    });
    expect(out.map((c) => `${c.date}:${c.kind}`)).toEqual([
      '2026-10-25:outside_hours', // Sunday is not a working day
      '2026-10-26:holiday',
      '2026-10-26:outside_hours', // ends 17:45 > 17:30
      '2026-10-26:therapist_unavailable',
    ]);
  });
});

describe('appointment status', () => {
  const a = { status: 'scheduled' as const, therapistId: 't1', wasRescheduled: false };
  it('picks the most important chip', () => {
    expect(displayStatus(a)).toBe('confirmed');
    expect(displayStatus({ ...a, wasRescheduled: true })).toBe('rescheduled');
    expect(displayStatus({ ...a, makeupOfId: 'x' })).toBe('makeup');
    expect(displayStatus({ ...a, originalTherapistId: 't0', wasRescheduled: true })).toBe('substitute');
    expect(displayStatus({ ...a, status: 'completed', originalTherapistId: 't0' })).toBe('completed');
    expect(displayStatus({ ...a, status: 'completed', attendance: 'absent' })).toBe('absent');
    expect(displayStatus({ ...a, attendance: 'cancelled_by_parent' })).toBe('cancelled');
  });

  it('derives the logging state', () => {
    const appt = { status: 'scheduled' as const, startsAt: '2026-10-29T05:00:00Z', endsAt: '2026-10-29T05:45:00Z' };
    expect(logState(appt, false, new Date('2026-10-29T04:00:00Z'))).toBe('upcoming');
    expect(logState(appt, false, new Date('2026-10-29T05:10:00Z'))).toBe('in_progress');
    expect(logState(appt, false, new Date('2026-10-29T07:00:00Z'))).toBe('not_logged');
    expect(logState(appt, true, new Date('2026-10-29T07:00:00Z'))).toBe('logged');
    expect(logState({ ...appt, attendance: 'absent' }, false, new Date('2026-10-29T07:00:00Z'))).toBe('not_applicable');
  });

  it('mirrors app.is_substitute_for', () => {
    const appt = { childId: 'c1', therapistId: 't1', startsAt: '2026-10-29T05:00:00Z' };
    const assigned = [{ childId: 'c1', userId: 't1', activeFrom: '2026-01-01', activeTo: null }];
    expect(isSubstitute(appt, assigned)).toBe(false);
    expect(isSubstitute({ ...appt, originalTherapistId: 't0' }, assigned)).toBe(true);
    expect(isSubstitute(appt, [{ ...assigned[0], activeTo: '2026-10-28' }])).toBe(true);
    expect(isSubstitute(appt, [])).toBe(true);
  });
});

describe('aggregates', () => {
  it('summarises attendance', () => {
    expect(
      attendanceSummary([
        { status: 'completed', attendance: 'present' },
        { status: 'completed' },
        { status: 'scheduled', attendance: 'late' },
        { status: 'completed', attendance: 'absent' },
        { status: 'cancelled', attendance: 'cancelled_by_parent' },
        { status: 'cancelled' },
      ]),
    ).toEqual({ scheduled: 6, attended: 3, late: 1, absent: 1, cancelledBySchool: 1, cancelledByParent: 1 });
  });

  it('computes goal stats with the mastery rule', () => {
    const rule = { accuracy: 80, consecutiveSessions: 3 };
    const trials = [
      { attempted: 10, successful: 5, promptLevel: 2 as const },
      { attempted: 0, successful: 0, promptLevel: 3 as const },
      { attempted: 10, successful: 8, promptLevel: 3 as const },
      { attempted: 10, successful: 9, promptLevel: 4 as const },
      { attempted: 5, successful: 4, promptLevel: 4 as const },
    ];
    expect(goalStats({ status: 'progressing', masteryRule: rule }, trials)).toEqual({
      lastAccuracy: 80,
      lastPromptLevel: 4,
      sessionsTracked: 4,
      masterySuggested: true,
    });
    expect(goalStats({ status: 'mastered', masteryRule: rule }, trials).masterySuggested).toBe(false);
    expect(goalStats({ status: 'emerging', masteryRule: rule }, [])).toEqual({ sessionsTracked: 0, masterySuggested: false });
  });

  it('averages the 4 sessions before the latest', () => {
    const s = (v: number) => ({ ratings: { focus: v as 1 | 2 | 3 | 4 | 5 } });
    expect(fourSessionAverage([s(1), s(2), s(3), s(4), s(5), s(1)])).toEqual({ focus: 3.5 });
    expect(fourSessionAverage([s(3)])).toEqual({});
  });

  it('groups incidents by week and compares substitute sessions', () => {
    expect(
      incidentsByWeek([
        { date: '2026-10-27', incidentCount: 1 },
        { date: '2026-10-29', incidentCount: 2 },
        { date: '2026-11-03', incidentCount: 0 },
      ]),
    ).toEqual([
      { weekStart: '2026-10-26', count: 3 },
      { weekStart: '2026-11-02', count: 0 },
    ]);
    expect(substituteImpact([{ isSubstitute: false, sessionScore: 60 }])).toBeUndefined();
    expect(
      substituteImpact([
        { isSubstitute: false, sessionScore: 60 },
        { isSubstitute: false, sessionScore: 70 },
        { isSubstitute: true, sessionScore: 50 },
      ]),
    ).toEqual({ regularAvg: 65, substituteAvg: 50, substituteCount: 1 });
  });

  it('computes home practice completion', () => {
    expect(completionPercent(0, 3, 0)).toBe(0);
    expect(completionPercent(5, 2, 1)).toBe(50);
    expect(completionPercent(2, 5, 0)).toBe(100);
    const tasks = [{ frequencyPerWeek: 4, activeFrom: '2026-10-01', activeTo: '2026-12-01', status: 'active' }];
    const logs = [
      { outcome: 'done', createdAt: '2026-10-26T04:00:00Z' },
      { outcome: 'partly', createdAt: '2026-10-28T04:00:00Z' },
      { outcome: 'done', createdAt: '2026-11-02T04:00:00Z' }, // next week
    ];
    expect(weeklyCompletion('c1', '2026-10-26', tasks, logs)).toEqual({ childId: 'c1', weekStart: '2026-10-26', expected: 4, done: 1, partly: 1, percent: 38 });
    expect(rangeCompletion('2026-10-26', '2026-11-08', tasks, logs)).toBe(31); // 2.5 of 8
  });

  it('normalises Indian phone numbers like app.normalize_phone', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('098765 43210')).toBe('+919876543210');
    expect(normalizePhone('')).toBeUndefined();
  });
});
