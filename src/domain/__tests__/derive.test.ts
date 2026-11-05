import { DEFAULT_DIMENSIONS, DEFAULT_ORG_SETTINGS } from '../constants';
import {
  appointmentDisplayStatus,
  appointmentLogState,
  attendanceRate,
  attendanceSummary,
  briefChips,
  buildAppointmentView,
  buildParentSnapshot,
  dedupeChips,
  detectConflicts,
  expandSeries,
  fourSessionAverage,
  goalWithStats,
  goalsByDomain,
  incidentsByWeek,
  isBriefRequired,
  isUnlogged,
  makeOccurrence,
  parentHighlightDimensions,
  parentProgress,
  periodStart,
  practiceCompletion,
  previousSessions,
  rruleToWeekdays,
  substituteImpact,
  trialRecordsForGoal,
  weekdaysToRrule,
  weeklyCompletion,
} from '../derive';
import { computeSessionMetrics } from '../metrics';
import type { Appointment, Goal, HomeTask, RatingDimension, RatingValue, SessionLog } from '../types';

const dims: RatingDimension[] = DEFAULT_DIMENSIONS.map((d, i) => ({ ...d, id: `d${i}`, organizationId: 'org' }));
const at = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

function appt(over: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a1',
    organizationId: 'org',
    childId: 'c1',
    therapistId: 't1',
    therapyTypeId: 'speech',
    startsAt: at('2026-10-28', '10:30'),
    endsAt: at('2026-10-28', '11:15'),
    status: 'scheduled',
    wasRescheduled: false,
    createdAt: at('2026-10-01', '09:00'),
    ...over,
  };
}

function session(id: string, date: string, rating: RatingValue, over: Partial<SessionLog> = {}): SessionLog {
  const ratings = Object.fromEntries(dims.map((d) => [d.key, rating])) as Record<string, RatingValue>;
  return {
    id,
    organizationId: 'org',
    appointmentId: `appt-${id}`,
    childId: 'c1',
    therapistId: 't1',
    therapistName: 'Riya Menon',
    therapyTypeId: 'speech',
    isSubstitute: false,
    date,
    actualMinutes: 45,
    startedLate: false,
    regulationState: 'regulated',
    ratings,
    goalTrials: [],
    incidents: [],
    breaksCount: 0,
    comparedToLast: 'same',
    workedTags: [],
    workedText: '',
    notWorkedTags: [],
    notWorkedText: '',
    notes: { subjective: '', objective: '', assessment: '', planNext: 'Plan', planGoalIds: [], parentSummary: 'Lovely day' },
    metrics: computeSessionMetrics({ ratings, goalTrials: [], incidents: [], dimensions: dims, previous: [] }),
    createdAt: at(date, '12:00'),
    updatedAt: at(date, '12:00'),
    lockedAt: at(date, '23:59'),
    amendmentCount: 0,
    ...over,
  };
}

const NOW = new Date(at('2026-10-28', '12:00'));

describe('appointment display status and log state', () => {
  it('picks the chip in priority order', () => {
    expect(appointmentDisplayStatus(appt({ status: 'cancelled', attendance: 'cancelled_by_parent' }), NOW)).toBe('cancelled');
    expect(appointmentDisplayStatus(appt({ attendance: 'absent' }), NOW)).toBe('absent');
    expect(appointmentDisplayStatus(appt({ attendance: 'present' }), NOW)).toBe('completed');
    expect(appointmentDisplayStatus(appt({ startsAt: at('2026-10-29', '10:30'), endsAt: at('2026-10-29', '11:15'), makeupOfId: 'x' }), NOW)).toBe('makeup');
    expect(appointmentDisplayStatus(appt({ originalTherapistId: 't2', startsAt: at('2026-10-29', '10:30') }), NOW)).toBe('substitute');
    expect(appointmentDisplayStatus(appt({ wasRescheduled: true, startsAt: at('2026-10-29', '10:30') }), NOW)).toBe('rescheduled');
    expect(appointmentDisplayStatus(appt({ startsAt: at('2026-10-29', '10:30') }), NOW)).toBe('confirmed');
  });

  it('derives the therapist log state from time and session', () => {
    const later = appt({ startsAt: at('2026-10-28', '14:00'), endsAt: at('2026-10-28', '14:45') });
    expect(appointmentLogState(later, false, NOW)).toBe('upcoming');
    expect(appointmentLogState(appt({ startsAt: at('2026-10-28', '11:45'), endsAt: at('2026-10-28', '12:30') }), false, NOW)).toBe('in_progress');
    expect(appointmentLogState(appt(), false, NOW)).toBe('not_logged');
    expect(appointmentLogState(appt(), true, NOW)).toBe('logged');
    expect(appointmentLogState(appt({ attendance: 'absent' }), false, NOW)).toBe('not_applicable');
    expect(isUnlogged(appt({ attendance: 'present' }), false, NOW)).toBe(true);
    expect(isUnlogged(appt({ status: 'cancelled' }), false, NOW)).toBe(false);
  });

  it('requires the brief for substitutes and therapists new to the child', () => {
    const viewer = { userId: 't1', assignedToChild: true, hasWorkedWithChild: true };
    expect(isBriefRequired(appt(), viewer, false)).toBe(false);
    expect(isBriefRequired(appt({ originalTherapistId: 't9' }), viewer, false)).toBe(true);
    expect(isBriefRequired(appt(), { ...viewer, hasWorkedWithChild: false }, false)).toBe(true);
    expect(isBriefRequired(appt({ originalTherapistId: 't9' }), viewer, true)).toBe(false);
    expect(isBriefRequired(appt({ originalTherapistId: 't9' }), { ...viewer, userId: 'someone-else' }, false)).toBe(false);
  });

  it('builds a full view', () => {
    const v = buildAppointmentView({
      appointment: appt({ originalTherapistId: 't9', startsAt: at('2026-10-28', '14:00'), endsAt: at('2026-10-28', '14:45') }),
      child: { fullName: 'Ishaan Gupta' },
      therapist: { fullName: 'Riya Menon' },
      originalTherapist: { fullName: 'Pooja Malhotra' },
      therapyType: { name: 'Speech Therapy', color: '#C66B4E', icon: 'message-circle' },
      viewer: { userId: 't1', assignedToChild: false, hasWorkedWithChild: false },
      briefAcknowledged: false,
      hasCheckin: true,
      now: NOW,
    });
    expect(v).toMatchObject({ childName: 'Ishaan Gupta', originalTherapistName: 'Pooja Malhotra', displayStatus: 'substitute', logState: 'upcoming', isSubstitute: true, briefRequired: true, hasCheckin: true });
  });
});

describe('sessions', () => {
  it('orders previous sessions newest first and excludes later ones', () => {
    const all = [session('s1', '2026-10-01', 3), session('s3', '2026-10-10', 3), session('s2', '2026-10-05', 3), { ...session('x', '2026-10-05', 3), therapyTypeId: 'ot' }];
    expect(previousSessions(all, { childId: 'c1', therapyTypeId: 'speech', date: '2026-10-10', createdAt: at('2026-10-10', '12:00') }).map((s) => s.id)).toEqual(['s2', 's1']);
    expect(previousSessions(all, { childId: 'c1', therapyTypeId: 'speech', date: '2026-10-10' }).map((s) => s.id)).toEqual(['s3', 's2', 's1']);
  });

  it('builds a parent snapshot in words, hiding the score unless allowed', () => {
    const prev = session('p', '2026-10-01', 3);
    const ratings = { ...prev.ratings, attention: 4 as RatingValue, mood: 2 as RatingValue };
    const metrics = computeSessionMetrics({ ratings, goalTrials: [{ attempted: 10, successful: 7 }], incidents: [], dimensions: dims, previous: [{ sessionScore: prev.metrics.sessionScore, ratings: prev.ratings }] });
    const s = session('s', '2026-10-03', 3, { ratings, metrics, goalTrials: [{ goalId: 'g1', attempted: 10, successful: 7, promptLevel: 4 }] });
    const snap = buildParentSnapshot({ session: s, dimensions: dims, settings: DEFAULT_ORG_SETTINGS, therapyType: { name: 'Speech Therapy', color: '#000', key: 'speech' }, goals: [{ id: 'g1', parentText: 'Asks with two words' }] });
    expect(snap.highlights.map((h) => [h.key, h.change])).toEqual([
      ['attention', 'better'],
      ['mood', 'harder'],
      ['engagement', 'same'],
      ['communication', 'same'],
    ]);
    expect(snap.sessionScore).toBeUndefined();
    expect(snap.therapyTypeKey).toBe('speech');
    expect(snap.goalsWorkedOn).toEqual([{ goalId: 'g1', parentText: 'Asks with two words' }]);
    expect(buildParentSnapshot({ session: s, dimensions: dims, settings: { parentsSeeNumericScore: true }, therapyType: { name: 'x', color: '#000', key: 'speech' }, goals: [] }).sessionScore).toBe(s.metrics.sessionScore);
  });

  it('tops highlights up to 3 when preferred dimensions are disabled', () => {
    const limited = dims.map((d) => (['attention', 'mood', 'communication'].includes(d.key) ? { ...d, enabled: false } : d));
    expect(parentHighlightDimensions(limited).map((d) => d.key)).toEqual(['engagement', 'regulation', 'cooperation']);
  });

  it('dedupes chips across the last sessions', () => {
    expect(dedupeChips([['timer', 'first_then'], ['Timer ', 'song_cue'], ['quiet_room']], 3)).toEqual(['timer', 'first_then', 'song_cue']);
    const chips = briefChips([
      { workedTags: ['timer'], notWorkedTags: ['noisy_room'] },
      { workedTags: ['timer', 'modelling'], notWorkedTags: [] },
      { workedTags: ['song_cue'], notWorkedTags: ['long_tasks'] },
      { workedTags: ['ignored'], notWorkedTags: ['ignored'] },
    ]);
    expect(chips).toEqual({ whatWorked: ['timer', 'modelling', 'song_cue'], whatDidnt: ['noisy_room', 'long_tasks'] });
  });

  it('computes staff progress helpers', () => {
    const list = [session('a', '2026-10-01', 2), session('b', '2026-10-02', 3), session('c', '2026-10-05', 3), session('d', '2026-10-06', 4, { isSubstitute: true })];
    expect(fourSessionAverage(list).engagement).toBe(2.7);
    expect(incidentsByWeek([{ ...list[0], metrics: { ...list[0].metrics, incidentCount: 2 } }, list[2]])).toEqual([
      { weekStart: '2026-09-28', count: 2 },
      { weekStart: '2026-10-05', count: 0 },
    ]);
    expect(substituteImpact(list)).toEqual({ regularAvg: 41.7, substituteAvg: 75, substituteCount: 1 });
    expect(substituteImpact(list.slice(0, 2))).toBeUndefined();
  });
});

describe('goals', () => {
  const goal: Goal = {
    id: 'g1',
    organizationId: 'org',
    childId: 'c1',
    therapyTypeId: 'speech',
    domain: 'communication',
    staffText: 'Requests with 2 words',
    parentText: 'Asks with two words',
    baseline: '',
    masteryRule: { accuracy: 80, consecutiveSessions: 3 },
    status: 'progressing',
    startDate: '2026-09-01',
    createdBy: 't1',
    createdAt: at('2026-09-01', '10:00'),
  };
  const withTrial = (id: string, date: string, successful: number) => session(id, date, 3, { goalTrials: [{ goalId: 'g1', attempted: 10, successful, promptLevel: 4 }] });

  it('suggests mastery when the rule is met and the goal is still open', () => {
    const sessions = [withTrial('1', '2026-10-01', 6), withTrial('2', '2026-10-03', 8), withTrial('3', '2026-10-05', 9), withTrial('4', '2026-10-07', 8)];
    const stats = goalWithStats(goal, trialRecordsForGoal('g1', sessions));
    expect(stats).toMatchObject({ lastAccuracy: 80, lastPromptLevel: 4, sessionsTracked: 4, masterySuggested: true });
    expect(goalWithStats({ ...goal, status: 'mastered' }, trialRecordsForGoal('g1', sessions)).masterySuggested).toBe(false);
    expect(goalWithStats(goal, trialRecordsForGoal('g1', sessions.slice(0, 3))).masterySuggested).toBe(false);
  });

  it('summarises goals by domain for parents', () => {
    expect(goalsByDomain([{ domain: 'communication', status: 'mastered' }, { domain: 'communication', status: 'progressing' }, { domain: 'behaviour', status: 'paused' }])).toEqual([
      { domain: 'communication', achieved: 1, inProgress: 1 },
      { domain: 'behaviour', achieved: 0, inProgress: 0 },
    ]);
  });
});

describe('attendance and home practice', () => {
  it('counts only appointments that have started', () => {
    const list = [
      appt({ id: '1', attendance: 'present' }),
      appt({ id: '2', attendance: 'late', lateMinutes: 10 }),
      appt({ id: '3', attendance: 'absent' }),
      appt({ id: '4', status: 'cancelled', attendance: 'cancelled_by_school' }),
      appt({ id: '5', status: 'cancelled', attendance: 'cancelled_by_parent' }),
      appt({ id: '6', startsAt: at('2026-11-01', '10:00') }),
    ];
    const s = attendanceSummary(list, NOW);
    expect(s).toEqual({ scheduled: 5, attended: 2, late: 1, absent: 1, cancelledBySchool: 1, cancelledByParent: 1 });
    expect(attendanceRate(s)).toBe(50);
  });

  it('computes completion with per-task caps and pro-rating', () => {
    const task = (id: string, freq: number, from = '2026-10-01'): HomeTask => ({ id, organizationId: 'org', childId: 'c1', assignedBy: 't1', assignedByName: 'Riya', title: id, steps: ['x'], frequencyPerWeek: freq, durationMinutes: 5, activeFrom: from, activeTo: '2026-12-01', status: 'active', createdAt: at(from, '10:00') });
    const log = (taskId: string, date: string, outcome: 'done' | 'partly' | 'could_not') => ({ taskId, outcome, createdAt: at(date, '18:00') });
    const tasks = [task('a', 2), task('b', 3)];
    const logs = [log('a', '2026-10-26', 'done'), log('a', '2026-10-27', 'done'), log('a', '2026-10-28', 'done'), log('b', '2026-10-27', 'partly'), log('b', '2026-10-28', 'could_not')];
    expect(weeklyCompletion('c1', tasks, logs, '2026-10-26')).toEqual({ childId: 'c1', weekStart: '2026-10-26', expected: 5, done: 2, partly: 1, percent: 50 });
    expect(practiceCompletion([task('late', 7, '2026-10-29')], [], '2026-10-26', '2026-11-01').expected).toBe(4);
    expect(practiceCompletion([], [], '2026-10-26', '2026-11-01').percent).toBe(0);
  });
});

describe('recurrence and conflicts', () => {
  it('expands weekdays between dates and skips holidays', () => {
    const occ = expandSeries({ weekdays: [1, 3, 5], startTime: '10:30', durationMinutes: 45, startDate: '2026-10-26', endDate: '2026-11-08' }, new Set(['2026-10-28']));
    expect(occ.map((o) => o.date)).toEqual(['2026-10-26', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06']);
    expect(new Date(occ[0].endsAt).getTime() - new Date(occ[0].startsAt).getTime()).toBe(45 * 60_000);
  });

  it('round-trips weekdays through an RRULE', () => {
    expect(weekdaysToRrule([5, 1, 3])).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(weekdaysToRrule([0, 6])).toBe('FREQ=WEEKLY;BYDAY=SA,SU');
    expect(rruleToWeekdays('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toEqual([1, 3, 5]);
  });

  it('detects every conflict kind', () => {
    const existing = [
      appt({ id: 'busy-therapist', childId: 'other' }),
      appt({ id: 'busy-child', therapistId: 'other', startsAt: at('2026-10-30', '10:45'), endsAt: at('2026-10-30', '11:30') }),
      appt({ id: 'cancelled', status: 'cancelled', startsAt: at('2026-11-02', '10:30'), endsAt: at('2026-11-02', '11:15') }),
    ];
    const conflicts = detectConflicts({
      occurrences: [
        makeOccurrence('2026-10-28', '10:30', 45),
        makeOccurrence('2026-10-30', '10:30', 45),
        makeOccurrence('2026-11-01', '10:30', 45),
        makeOccurrence('2026-11-02', '10:30', 45),
        makeOccurrence('2026-11-03', '17:00', 45),
        makeOccurrence('2026-11-09', '10:30', 45),
        makeOccurrence('2026-11-11', '10:30', 45),
      ],
      childId: 'c1',
      therapistId: 't1',
      existing,
      unavailability: [{ userId: 't1', from: '2026-11-11', to: '2026-11-12', reason: 'Leave' }],
      settings: { workingHours: DEFAULT_ORG_SETTINGS.workingHours, holidays: [{ date: '2026-11-09', label: 'Diwali break' }] },
    });
    expect(conflicts.map((c) => [c.kind, c.date])).toEqual([
      ['therapist_double_booked', '2026-10-28'],
      ['child_double_booked', '2026-10-30'],
      ['outside_hours', '2026-11-01'],
      ['outside_hours', '2026-11-03'],
      ['holiday', '2026-11-09'],
      ['therapist_unavailable', '2026-11-11'],
    ]);
    expect(detectConflicts({ occurrences: [makeOccurrence('2026-10-28', '10:30', 45)], childId: 'c1', therapistId: 't1', existing, unavailability: [], settings: DEFAULT_ORG_SETTINGS, excludeAppointmentIds: ['busy-therapist'] })).toEqual([]);
  });
});

describe('parent progress', () => {
  it('reports words + arrows per dimension per therapy in the period', () => {
    const now = new Date(at('2026-10-28', '18:00'));
    const list = [session('old', '2026-08-01', 1), session('a', '2026-10-20', 2), session('b', '2026-10-22', 3), session('c', '2026-10-27', 4)];
    const p = parentProgress({
      childId: 'c1',
      period: 'month',
      now,
      sessions: list,
      dimensions: dims,
      therapyTypes: [{ id: 'speech', name: 'Speech Therapy', color: '#000' }, { id: 'ot', name: 'OT', color: '#111' }],
      goals: [{ domain: 'communication', status: 'mastered' }],
      attendance: { scheduled: 3, attended: 3, late: 0, absent: 0, cancelledBySchool: 0, cancelledByParent: 0 },
      homePracticeCompletion: 70,
    });
    expect(periodStart('week', now)).toBe('2026-10-22');
    expect(p.byTherapy).toHaveLength(1);
    expect(p.byTherapy[0].sessionsCount).toBe(3);
    expect(p.byTherapy[0].dimensions[0]).toEqual({ key: 'engagement', label: 'Engagement', icon: 'sparkles', trend: 'up', recent: [2, 3, 4] });
    expect(p.goalsSummary).toEqual([{ domain: 'communication', achieved: 1, inProgress: 0 }]);
    expect(p.homePracticeCompletion).toBe(70);
  });
});
