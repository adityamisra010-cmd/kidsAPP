import { GOAL_DOMAINS } from '@/domain/constants';
import { compareSessions, goalWithStats, isAttended, isCancelled, trialRecordsForGoal } from '@/domain/derive';
import { computeSessionMetrics } from '@/domain/metrics';
import type { NotificationKind } from '@/domain/types';
import { toISODate } from '@/lib/dates';

import { DEMO_PERSONAS } from '../index';
import { buildDemoDataset } from '../seed';
import type { DemoStore } from '../store';
import { DEMO_NOW } from '../testing';

const ALL_KINDS: NotificationKind[] = [
  'appointment_reminder',
  'appointment_changed',
  'substitute_assigned',
  'reschedule_request',
  'reschedule_response',
  'session_summary',
  'home_task_assigned',
  'home_log_submitted',
  'home_log_feedback',
  'unlogged_session',
  'child_alert',
  'new_message',
  'announcement',
  'daily_agenda',
];

const NOWS: [string, Date][] = [
  ['Wed noon', DEMO_NOW],
  ['Sunday morning', new Date(2026, 10, 1, 10, 0)],
  ['Saturday afternoon', new Date(2026, 9, 31, 15, 10)],
  ['Monday early', new Date(2027, 1, 1, 8, 5)],
  ['Thursday evening', new Date(2026, 11, 24, 18, 30)],
];

const local = (iso: string) => toISODate(new Date(iso));

describe.each(NOWS)('demo dataset (%s)', (_label, now) => {
  let st: DemoStore;
  beforeAll(() => {
    st = buildDemoDataset(now);
  });
  const byName = (name: string) => st.profiles.find((p) => p.fullName === name)!.id;
  const child = (name: string) => st.children.find((c) => c.fullName === name)!;
  const today = toISODate(now);

  it('has the expected people per school', () => {
    expect(st.organizations.map((o) => o.name).sort()).toEqual(['Anvaya Child Development Centre', 'Sahaj Therapy & Learning Centre']);
    for (const org of st.organizations) {
      const roles = st.memberships.filter((m) => m.organizationId === org.id).map((m) => m.role);
      expect(roles.filter((r) => r === 'school_admin')).toHaveLength(1);
      expect(roles.filter((r) => r === 'coordinator')).toHaveLength(1);
      expect(roles.filter((r) => r === 'therapist')).toHaveLength(4);
      expect(roles.filter((r) => r === 'parent')).toHaveLength(15);
      expect(st.children.filter((c) => c.organizationId === org.id)).toHaveLength(12);
      expect(org.settings.holidays.length).toBeGreaterThanOrEqual(2);
      const types = new Set(st.qualifications.filter((q) => q.organizationId === org.id).map((q) => st.therapyTypes.find((t) => t.id === q.therapyTypeId)!.key));
      for (const key of ['speech', 'occupational', 'behaviour', 'special_ed']) expect(types).toContain(key);
      expect(types.has('physio') || types.has('audiology')).toBe(true);
    }
    expect(st.memberships.filter((m) => m.role === 'platform_admin')).toHaveLength(1);
    const phones = st.profiles.map((p) => p.phone).filter(Boolean);
    expect(new Set(phones).size).toBe(phones.length);
    expect(phones.every((p) => /^\+919[0-9]{9}$/.test(p!))).toBe(true);
  });

  it('resolves every foreign key', () => {
    const ids = <T extends { id: string }>(rows: T[]) => new Set(rows.map((r) => r.id));
    const profiles = ids(st.profiles);
    const children = ids(st.children);
    const orgs = ids(st.organizations);
    const types = ids(st.therapyTypes);
    const appts = ids(st.appointments);
    const goals = ids(st.goals);
    const tasks = ids(st.homeTasks);
    const media = ids(st.media);
    const threads = ids(st.threads);
    const series = ids(st.series);
    const sessions = ids(st.sessions);
    const orgOf = new Map(st.children.map((c) => [c.id, c.organizationId]));
    for (const m of st.memberships) expect(profiles.has(m.userId) && (m.organizationId === null || orgs.has(m.organizationId))).toBe(true);
    for (const p of st.childProfiles) expect(children.has(p.childId)).toBe(true);
    expect(st.childProfiles).toHaveLength(st.children.length);
    for (const g of st.guardians) expect(children.has(g.childId) && profiles.has(g.userId)).toBe(true);
    for (const t of st.childTherapists) expect(children.has(t.childId) && profiles.has(t.userId) && types.has(t.therapyTypeId)).toBe(true);
    for (const g of st.goals) expect(children.has(g.childId) && types.has(g.therapyTypeId) && profiles.has(g.createdBy) && orgOf.get(g.childId) === g.organizationId).toBe(true);
    for (const a of st.appointments) {
      expect(children.has(a.childId) && profiles.has(a.therapistId) && types.has(a.therapyTypeId)).toBe(true);
      expect(orgOf.get(a.childId)).toBe(a.organizationId);
      if (a.originalTherapistId) expect(profiles.has(a.originalTherapistId)).toBe(true);
      if (a.seriesId) expect(series.has(a.seriesId)).toBe(true);
      if (a.makeupOfId) expect(appts.has(a.makeupOfId)).toBe(true);
    }
    for (const s of st.sessions) {
      const a = st.appointments.find((x) => x.id === s.appointmentId)!;
      expect(a).toBeDefined();
      expect([s.childId, s.therapistId, s.therapyTypeId, s.organizationId]).toEqual([a.childId, a.therapistId, a.therapyTypeId, a.organizationId]);
      for (const t of s.goalTrials) expect(st.goals.find((g) => g.id === t.goalId)?.childId).toBe(s.childId);
    }
    for (const c of st.checkins) expect(children.has(c.childId) && (!c.appointmentId || appts.has(c.appointmentId))).toBe(true);
    for (const t of st.homeTasks) expect(children.has(t.childId) && (!t.goalId || goals.has(t.goalId)) && profiles.has(t.assignedBy)).toBe(true);
    for (const l of st.homeLogs) {
      expect(tasks.has(l.taskId) && (!l.mediaId || media.has(l.mediaId))).toBe(true);
      expect(st.guardians.some((g) => g.childId === l.childId && g.userId === l.loggedBy)).toBe(true);
    }
    for (const s of st.resourceShares) expect(ids(st.resources).has(s.resourceId) && (!s.childId || children.has(s.childId))).toBe(true);
    for (const m of st.threadMembers) expect(threads.has(m.threadId) && profiles.has(m.userId)).toBe(true);
    for (const m of st.messages) expect(st.threadMembers.some((x) => x.threadId === m.threadId && x.userId === m.senderId)).toBe(true);
    for (const a of st.alerts) expect(children.has(a.childId)).toBe(true);
    for (const n of st.notifications) expect(profiles.has(n.userId)).toBe(true);
    for (const c of st.consents) expect(profiles.has(c.userId) && (!c.childId || children.has(c.childId))).toBe(true);
    for (const r of st.rescheduleRequests) expect(appts.has(r.appointmentId) && profiles.has(r.requestedBy)).toBe(true);
    for (const u of st.unavailability) expect(profiles.has(u.userId)).toBe(true);
    for (const k of st.briefAcks) expect(appts.has(k.appointmentId)).toBe(true);
    for (const x of st.amendments) expect(sessions.has(x.sessionId)).toBe(true);
    expect(new Set(st.appointments.map((a) => a.id)).size).toBe(st.appointments.length);
  });

  it('never double-books a therapist or a child', () => {
    const live = st.appointments.filter((a) => !isCancelled(a)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (const key of ['therapistId', 'childId'] as const) {
      const lastEnd = new Map<string, string>();
      for (const a of live) {
        const prev = lastEnd.get(a[key]);
        if (prev) expect(new Date(a.startsAt).getTime()).toBeGreaterThanOrEqual(new Date(prev).getTime());
        lastEnd.set(a[key], a.endsAt);
      }
    }
  });

  it('has complete About Me profiles and 2–4 goals per child', () => {
    for (const p of st.childProfiles) {
      expect(p.commTools.length && p.reinforcers.length && p.triggers.length && p.calming.length).toBeTruthy();
      expect(p.sensoryNotes && p.commNotes).toBeTruthy();
      expect(p.dos.length).toBeGreaterThanOrEqual(2);
      expect(p.donts.length).toBeGreaterThanOrEqual(2);
      expect(p.clinical?.diagnosis.length).toBeGreaterThan(0);
    }
    const diagnoses = st.childProfiles.flatMap((p) => p.clinical!.diagnosis).join(' ');
    for (const d of ['Autism', 'ADHD', 'Global Developmental Delay', 'Cerebral palsy', 'Down syndrome', 'learning disability', 'hearing loss']) expect(diagnoses).toContain(d);
    for (const c of st.children) {
      const n = st.goals.filter((g) => g.childId === c.id).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
    expect(st.goalBank.length).toBeGreaterThanOrEqual(40);
    expect(new Set(st.goalBank.map((g) => g.domain))).toEqual(new Set(GOAL_DOMAINS));
    expect(new Set(st.goalBank.map((g) => g.therapyTypeKey))).toEqual(new Set(['speech', 'occupational', 'behaviour', 'special_ed', 'physio', 'audiology']));
    for (const g of st.goalBank) expect(g.staffText && g.parentText).toBeTruthy();
  });

  it('has wins and a mastery suggestion in each school', () => {
    for (const org of st.organizations) {
      const goals = st.goals.filter((g) => g.organizationId === org.id);
      expect(goals.filter((g) => g.status === 'mastered' || g.status === 'maintenance').length).toBeGreaterThanOrEqual(2);
      expect(goals.every((g) => (g.status === 'mastered') === Boolean(g.masteredAt) || g.status === 'maintenance')).toBe(true);
      const suggested = goals.filter((g) => goalWithStats(g, trialRecordsForGoal(g.id, st.sessions.filter((s) => s.childId === g.childId))).masterySuggested);
      expect(suggested.length).toBe(1);
    }
  });

  it('logs every attended past session with full, consistent metrics', () => {
    const ended = st.appointments.filter((a) => isAttended(a) && new Date(a.endsAt) <= now);
    const unlogged = ended.filter((a) => !st.sessions.some((s) => s.appointmentId === a.id));
    expect(unlogged.length).toBeGreaterThanOrEqual(2);
    expect(unlogged.length).toBeLessThanOrEqual(5);
    const past = st.appointments.filter((a) => new Date(a.endsAt) <= now && local(a.startsAt) < today);
    const attendedRate = past.filter(isAttended).length / past.length;
    expect(attendedRate).toBeGreaterThan(0.82);
    expect(attendedRate).toBeLessThan(0.95);
    expect(past.some((a) => a.attendance === 'late')).toBe(true);
    expect(past.some((a) => a.attendance === 'cancelled_by_parent')).toBe(true);
    expect(past.some((a) => a.attendance === 'cancelled_by_school')).toBe(true);
    for (const s of st.sessions) {
      expect(Object.keys(s.ratings)).toHaveLength(8);
      expect(s.goalTrials.length).toBeGreaterThanOrEqual(1);
      expect(s.goalTrials.length).toBeLessThanOrEqual(3);
      expect(s.notes.planNext && s.notes.parentSummary && s.notes.objective).toBeTruthy();
      expect(new Date(s.lockedAt).getTime() - new Date(s.createdAt).getTime()).toBe(24 * 3_600_000);
    }
    // Recompute metrics chronologically per child + therapy: identical to what is stored.
    const dims = (orgId: string) => st.dimensions.filter((d) => d.organizationId === orgId);
    const groups = new Map<string, typeof st.sessions>();
    for (const s of [...st.sessions].sort(compareSessions)) groups.set(`${s.childId}|${s.therapyTypeId}`, [...(groups.get(`${s.childId}|${s.therapyTypeId}`) ?? []), s]);
    for (const list of groups.values()) {
      list.forEach((s, i) => {
        const previous = list.slice(0, i).reverse().map((p) => ({ sessionScore: p.metrics.sessionScore, ratings: p.ratings, deltaRolling: p.metrics.deltaRolling }));
        expect(computeSessionMetrics({ ratings: s.ratings, goalTrials: s.goalTrials, incidents: s.incidents, dimensions: dims(s.organizationId), previous })).toEqual(s.metrics);
      });
    }
  });

  it('tells the believable stories: improving, declining, incidents, substitutes', () => {
    const sessionsOf = (childName: string, typeKey: string) => {
      const c = child(childName);
      const tt = st.therapyTypes.find((t) => t.organizationId === c.organizationId && t.key === typeKey)!;
      return st.sessions.filter((s) => s.childId === c.id && s.therapyTypeId === tt.id).sort(compareSessions);
    };
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const aarav = sessionsOf('Aarav Sharma', 'speech').map((s) => s.metrics.sessionScore);
    expect(avg(aarav.slice(-4)) - avg(aarav.slice(0, 4))).toBeGreaterThan(12);
    const vihaan = sessionsOf('Vihaan Agarwal', 'behaviour');
    expect(vihaan.slice(-3).every((s) => s.metrics.sessionScore < avg(vihaan.slice(0, -3).map((x) => x.metrics.sessionScore)) - 15)).toBe(true);
    const open = st.alerts.filter((a) => a.status === 'open');
    expect(open.some((a) => a.kind === 'score_drop' && a.childName === 'Vihaan Agarwal')).toBe(true);
    expect(open.some((a) => a.kind === 'incident_spike' && a.childName === 'Advik Yadav')).toBe(true);
    const subs = st.sessions.filter((s) => s.isSubstitute);
    expect(subs.length).toBeGreaterThanOrEqual(3);
    const makeup = st.appointments.find((a) => a.makeupOfId)!;
    const missed = st.appointments.find((a) => a.id === makeup.makeupOfId)!;
    expect(missed.childId).toBe(makeup.childId);
    expect(missed.attendance).toBe('absent');
  });

  it("gives Riya a busy today with a substitute session and a parent's check-ins", () => {
    const riya = byName('Riya Menon');
    const todays = st.appointments.filter((a) => a.therapistId === riya && local(a.startsAt) === today && !isCancelled(a));
    expect(todays.length).toBeGreaterThanOrEqual(5);
    expect(todays.length).toBeLessThanOrEqual(6);
    const sub = todays.find((a) => a.originalTherapistId === byName('Pooja Malhotra'))!;
    expect(sub).toBeDefined();
    expect(st.childTherapists.some((t) => t.childId === sub.childId && t.userId === riya)).toBe(false);
    if (new Date(sub.endsAt) > now) expect(st.briefAcks.some((k) => k.appointmentId === sub.id)).toBe(false);
    expect(st.checkins.some((c) => c.date === today)).toBe(true);
    const anvaya = st.organizations.find((o) => o.shortName === 'Anvaya CDC')!;
    const pooja = byName('Pooja Malhotra');
    const leave = st.unavailability.find((u) => u.userId === pooja && u.from === today)!;
    const needing = st.appointments.filter((a) => a.organizationId === anvaya.id && a.therapistId === pooja && !a.originalTherapistId && !isCancelled(a) && local(a.startsAt) > today && local(a.startsAt) <= leave.to);
    expect(needing).toHaveLength(2);
    expect(st.rescheduleRequests.map((r) => r.status).sort()).toEqual(['approved', 'countered', 'pending']);
  });

  it('keeps the parent home full: upcoming, latest session, tasks this week', () => {
    const priya = byName('Priya Sharma');
    const kids = st.guardians.filter((g) => g.userId === priya).map((g) => g.childId);
    expect(kids.map((id) => st.children.find((c) => c.id === id)!.fullName).sort()).toEqual(['Aarav Sharma', 'Anaya Sharma']);
    const aarav = child('Aarav Sharma');
    const next = st.appointments.filter((a) => a.childId === aarav.id && !isCancelled(a) && new Date(a.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    expect(local(next.startsAt) <= toISODate(new Date(now.getTime() + 2 * 86_400_000))).toBe(true);
    for (const id of kids) {
      expect(st.sessions.some((s) => s.childId === id)).toBe(true);
      expect(st.homeTasks.filter((t) => t.childId === id && t.status === 'active').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('seeds home practice, videos, resources, messages and notifications', () => {
    for (const c of st.children) {
      const active = st.homeTasks.filter((t) => t.childId === c.id && t.status === 'active');
      expect(active.length).toBeGreaterThanOrEqual(2);
      expect(active.length).toBeLessThanOrEqual(3);
      expect(active.every((t) => t.steps.length >= 3 && t.goalId)).toBe(true);
    }
    expect(st.homeLogs.filter((l) => l.mediaId)).toHaveLength(3);
    expect(st.media.map((m) => m.bucketPath).sort()).toEqual(['demo/practice-1.mp4', 'demo/practice-2.mp4', 'demo/practice-3.mp4']);
    expect(st.homeLogs.filter((l) => l.reviewedAt).length / st.homeLogs.length).toBeGreaterThan(0.6);
    const riya = byName('Riya Menon');
    const queue = st.homeLogs.filter((l) => !l.reviewedAt && st.homeTasks.find((t) => t.id === l.taskId)!.assignedBy === riya);
    expect(queue.length).toBeGreaterThanOrEqual(4);
    expect(st.resources.length).toBeGreaterThanOrEqual(12);
    expect(st.resources.some((r) => r.organizationId === null) && st.resourceShares.length >= 3).toBe(true);
    expect(st.announcements.some((a) => a.urgent)).toBe(true);
    expect(st.messages.length).toBeGreaterThanOrEqual(20);
    const kinds = new Set(st.notifications.map((n) => n.kind));
    for (const k of ALL_KINDS) if (k !== 'unlogged_session' || st.notifications.some((n) => n.kind === k)) expect(kinds).toContain(k);
    for (const persona of DEMO_PERSONAS) {
      const userId = byName(persona.name);
      const mine = st.notifications.filter((n) => n.userId === userId);
      expect(mine.some((n) => n.readAt) && mine.some((n) => !n.readAt)).toBe(true);
      expect(mine.every((n) => !n.route || /^\/(appointment|session|practice\/task|messages|child|announcements|today|platform)/.test(n.route))).toBe(true);
    }
    expect(st.consents.some((c) => c.kind === 'video_upload' && !c.granted)).toBe(true);
    expect(st.invites.filter((i) => i.status === 'pending').length).toBeGreaterThanOrEqual(2);
  });
});

describe('determinism', () => {
  it('builds identical data and ids for the same clock', () => {
    expect(JSON.stringify(buildDemoDataset(DEMO_NOW))).toEqual(JSON.stringify(buildDemoDataset(new Date(DEMO_NOW))));
  });

  it('keeps entity ids stable across days', () => {
    const a = buildDemoDataset(DEMO_NOW);
    const b = buildDemoDataset(new Date(2026, 10, 3, 11, 0));
    expect(a.children.map((c) => c.id)).toEqual(b.children.map((c) => c.id));
    expect(a.goals.map((g) => g.id)).toEqual(b.goals.map((g) => g.id));
    expect(a.profiles.map((p) => p.id)).toEqual(b.profiles.map((p) => p.id));
  });
});
