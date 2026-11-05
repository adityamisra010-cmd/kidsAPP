import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import i18n, { initI18n } from '@/i18n';

import { diffSchedule, MAX_SCHEDULED, planReminders, type PlanInput, type ReminderAppointment } from '../plan';
import { adjustForQuietHours, clockToMinutes, isQuietTime } from '../quietHours';
import { reminderSignature, reminderText } from '../text';

// Local-time constructors keep these tests independent of the machine's timezone.
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m, 0, 0); // November 2026
const QUIET = { start: '21:00', end: '08:00' };

let seq = 0;
function appt(start: Date, over: Partial<ReminderAppointment> = {}): ReminderAppointment {
  seq += 1;
  return {
    id: `a${seq}`,
    startsAt: start.toISOString(),
    status: 'scheduled',
    childName: 'Aarav',
    therapyTypeName: 'Speech Therapy',
    therapistName: 'Riya Menon',
    briefRequired: false,
    briefAcknowledged: false,
    isSubstitute: false,
    ...over,
  };
}

function input(over: Partial<PlanInput>): PlanInput {
  return {
    appointments: [],
    role: 'parent',
    settings: { reminderHoursBefore: [24, 1], dailyAgendaTime: '08:00', quietHours: QUIET },
    muted: [],
    now: at(2, 9),
    ...over,
  };
}

describe('quiet hours', () => {
  it('parses clock times', () => {
    expect(clockToMinutes('21:30')).toBe(1290);
    expect(clockToMinutes('8:05')).toBe(485);
    expect(clockToMinutes('25:00')).toBeNull();
    expect(clockToMinutes('nope')).toBeNull();
  });

  it('handles overnight windows (start inclusive, end exclusive)', () => {
    expect(isQuietTime(at(3, 21, 0), QUIET)).toBe(true);
    expect(isQuietTime(at(3, 23, 30), QUIET)).toBe(true);
    expect(isQuietTime(at(3, 7, 59), QUIET)).toBe(true);
    expect(isQuietTime(at(3, 8, 0), QUIET)).toBe(false);
    expect(isQuietTime(at(3, 20, 59), QUIET)).toBe(false);
    expect(isQuietTime(at(3, 13, 0), { start: '13:00', end: '14:00' })).toBe(true);
    expect(isQuietTime(at(3, 3, 0), { start: '00:00', end: '00:00' })).toBe(false);
  });

  it('moves a morning reminder to the end of quiet hours when there is time', () => {
    // Session 8:30 → 1 h reminder 7:30 is quiet → 8:00 (30 min before).
    expect(adjustForQuietHours(at(3, 7, 30), QUIET, at(3, 8, 30))).toEqual(at(3, 8, 0));
  });

  it('moves it to the evening before when 8 AM would be too late', () => {
    // Session 8:00 → 1 h reminder 7:00 → 8:00 is not 15 min before → 8:30 PM the evening before.
    expect(adjustForQuietHours(at(3, 7, 0), QUIET, at(3, 8, 0))).toEqual(at(2, 20, 30));
    // Late-evening session: 9:15 PM reminder for a 10:15 PM session → same evening 8:30 PM.
    expect(adjustForQuietHours(at(3, 21, 15), QUIET, at(3, 22, 15))).toEqual(at(3, 20, 30));
  });

  it('leaves non-quiet times alone and moves deadline-free items to the morning', () => {
    expect(adjustForQuietHours(at(3, 10, 0), QUIET, at(3, 11, 0))).toEqual(at(3, 10, 0));
    expect(adjustForQuietHours(at(3, 22, 0), QUIET)).toEqual(at(4, 8, 0));
    expect(adjustForQuietHours(at(3, 6, 0), QUIET)).toEqual(at(3, 8, 0));
  });
});

describe('planReminders (parent)', () => {
  it('schedules 24 h and 1 h reminders for each session', () => {
    const a = appt(at(4, 10, 30));
    const plan = planReminders(input({ appointments: [a] }));
    expect(plan.map((r) => [r.id, r.fireAt])).toEqual([
      [`mkt.session.${a.id}.24`, at(3, 10, 30)],
      [`mkt.session.${a.id}.1`, at(4, 9, 30)],
    ]);
    expect(plan[0].route).toBe(`/appointment/${a.id}`);
  });

  it('skips past reminders, cancelled sessions and anything beyond the horizon', () => {
    const soon = appt(at(2, 20, 0)); // 24 h reminder is in the past, 1 h is 7 PM today
    const cancelled = appt(at(4, 11, 0), { status: 'cancelled' });
    const far = appt(at(20, 11, 0));
    const plan = planReminders(input({ appointments: [soon, cancelled, far] }));
    expect(plan.map((r) => r.id)).toEqual([`mkt.session.${soon.id}.1`]);
  });

  it('respects quiet hours and merges reminders that land together', () => {
    // 8:00 session: 24 h → 8:00 the day before; 1 h → 7:00 (quiet) → 8:30 PM the day before.
    const early = appt(at(5, 8, 0));
    const plan = planReminders(input({ appointments: [early] }));
    expect(plan.map((r) => r.fireAt)).toEqual([at(4, 8, 0), at(4, 20, 30)]);
    // [2, 1] for an 8:30 session: 6:30 → 8:00 and 7:30 → 8:00 collapse into one.
    const merged = planReminders(input({ appointments: [appt(at(5, 8, 30))], settings: { ...DEFAULT_ORG_SETTINGS, reminderHoursBefore: [2, 1] } }));
    expect(merged.map((r) => r.fireAt)).toEqual([at(5, 8, 0)]);
  });

  it('leaves out muted reminders', () => {
    const plan = planReminders(input({ appointments: [appt(at(4, 10, 30))], muted: ['appointment_reminder'] }));
    expect(plan).toEqual([]);
  });

  it('shortens the demo horizon to a day', () => {
    const tomorrow = appt(at(3, 8, 30));
    const later = appt(at(5, 11, 0));
    const plan = planReminders(input({ appointments: [tomorrow, later], horizonHours: 24 }));
    expect(new Set(plan.map((r) => (r.type === 'session' ? r.appointmentId : '')))).toEqual(new Set([tomorrow.id]));
  });

  it('caps the number of scheduled notifications', () => {
    const many = Array.from({ length: 80 }, (_, i) => appt(at(3 + (i % 5), 9 + (i % 8), 0)));
    expect(planReminders(input({ appointments: many })).length).toBe(MAX_SCHEDULED);
  });
});

describe('planReminders (therapist)', () => {
  it('sends one morning agenda per working day instead of per-session reminders', () => {
    const list = [appt(at(3, 9, 30), { childName: 'Ishaan' }), appt(at(3, 11, 0)), appt(at(4, 10, 0))];
    const plan = planReminders(input({ role: 'therapist', appointments: list }));
    expect(plan.map((r) => r.type)).toEqual(['agenda', 'agenda']);
    const first = plan[0];
    expect(first.type === 'agenda' && [first.date, first.count, first.firstChildName, first.fireAt]).toEqual(['2026-11-03', 2, 'Ishaan', at(3, 8, 0)]);
    expect(first.route).toBe('/therapist/today');
  });

  it('adds a brief reminder when covering or new to the child, until it is read', () => {
    const cover = appt(at(3, 11, 0), { briefRequired: true, isSubstitute: true });
    const read = appt(at(3, 12, 0), { briefRequired: true, briefAcknowledged: true });
    const plan = planReminders(input({ role: 'therapist', appointments: [cover, read] }));
    const briefs = plan.filter((r) => r.type === 'brief');
    expect(briefs.map((r) => [r.id, r.fireAt, r.route])).toEqual([[`mkt.brief.${cover.id}`, at(3, 10, 0), `/brief/${cover.id}`]]);
  });

  it('can mute the agenda separately', () => {
    const plan = planReminders(input({ role: 'therapist', appointments: [appt(at(3, 11, 0))], muted: ['daily_agenda'] }));
    expect(plan).toEqual([]);
  });

  it('plans nothing for admins', () => {
    expect(planReminders(input({ role: 'school_admin', appointments: [appt(at(3, 11, 0))] }))).toEqual([]);
  });
});

describe('diffSchedule', () => {
  it('cancels removed/changed and schedules new/changed only', () => {
    const prev = { a: 's1', b: 's2', c: 's3' };
    const next = [
      { id: 'a', signature: 's1' },
      { id: 'b', signature: 's2-new' },
      { id: 'd', signature: 's4' },
    ];
    expect(diffSchedule(prev, next)).toEqual({ cancel: ['b', 'c'], schedule: ['b', 'd'] });
    expect(diffSchedule(prev, [])).toEqual({ cancel: ['a', 'b', 'c'], schedule: [] });
    expect(diffSchedule({}, next).schedule).toEqual(['a', 'b', 'd']);
  });
});

describe('reminder wording', () => {
  beforeAll(() => {
    initI18n('en');
  });
  afterAll(() => {
    initI18n('en');
  });

  it('reads naturally for parents and therapists', () => {
    const [dayBefore, hourBefore] = planReminders(input({ appointments: [appt(at(4, 10, 30))] }));
    expect(reminderText(i18n.t, dayBefore)).toEqual({ title: "Aarav's session tomorrow", body: 'Speech Therapy at 10:30 AM with Riya Menon' });
    expect(reminderText(i18n.t, hourBefore).title).toBe("Aarav's session today");
    const [agenda] = planReminders(input({ role: 'therapist', appointments: [appt(at(3, 9, 30)), appt(at(3, 11, 0))] }));
    expect(reminderText(i18n.t, agenda)).toEqual({ title: 'Today: 2 sessions', body: 'First at 9:30 AM with Aarav.' });
  });

  it('changes the signature when the text changes', () => {
    const [r] = planReminders(input({ appointments: [appt(at(4, 10, 30))] }));
    const en = reminderSignature(r, reminderText(i18n.t, r));
    initI18n('hi');
    const hi = reminderSignature(r, reminderText(i18n.t, r));
    expect(hi).not.toBe(en);
    expect(reminderText(i18n.t, r).title).toBe('Aarav का सेशन कल');
  });
});
