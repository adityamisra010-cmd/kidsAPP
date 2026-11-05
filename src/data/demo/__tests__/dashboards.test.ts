import { RepoError } from '@/data/repository';

import { createDemoRepository } from '../index';
import { actAs, childByName, DEMO_NOW, signedIn, userByName } from '../testing';

const code = (c: RepoError['code']) => expect.objectContaining({ name: 'RepoError', code: c });

describe('dashboards', () => {
  it("shows Riya's Today with statuses, counters and the mandatory brief", async () => {
    const repo = await signedIn('therapist');
    const today = await repo.dashboards.therapistToday();
    expect(today.date).toBe('2026-10-28');
    expect(today.appointments).toHaveLength(6);
    const states = today.appointments.map((a) => a.logState);
    expect(states).toEqual(expect.arrayContaining(['logged', 'not_logged', 'in_progress', 'upcoming']));
    const sub = today.appointments.find((a) => a.isSubstitute)!;
    expect(sub).toMatchObject({ briefRequired: true, briefAcknowledged: false, originalTherapistName: 'Pooja Malhotra', hasCheckin: true, displayStatus: 'substitute' });
    expect(today.appointments.some((a) => a.displayStatus === 'makeup')).toBe(true);
    expect(today.pendingReviews).toBeGreaterThanOrEqual(4);
    expect(today.unreadMessages).toBeGreaterThanOrEqual(1);
    expect(today.unloggedCount).toBe(1);
    expect((await repo.appointments.upcoming({ limit: 2 }))[0].therapistId).toBe(userByName(repo, 'Riya Menon'));
  });

  it('gives the coordinator the whole-school picture', async () => {
    const repo = await signedIn('coordinator');
    const d = await repo.dashboards.admin();
    expect(d.today.scheduled).toBeGreaterThanOrEqual(10);
    expect(d.today.logged).toBeGreaterThan(0);
    expect(d.today.unlogged).toBeGreaterThanOrEqual(1);
    expect(d.today.cancelled).toBeGreaterThanOrEqual(0);
    expect(d.week.attendanceRate).toBeGreaterThan(70);
    expect(d.week.homePracticeRate).toBeGreaterThan(30);
    expect(d.week.loggingCompliance).toHaveLength(4);
    expect(d.childrenNeedingAttention.map((c) => c.child.fullName)).toEqual(expect.arrayContaining(['Vihaan Agarwal', 'Advik Yadav']));
    expect(d.childrenNeedingAttention.find((c) => c.child.fullName === 'Vihaan Agarwal')).toMatchObject({ trend: 'down', alertId: expect.any(String) });
    expect(d.unloggedSessions.length).toBeGreaterThanOrEqual(3);
    expect(d.needsSubstitute).toHaveLength(2);
    expect(d.upcomingSubstitutions.length).toBeGreaterThanOrEqual(1);
    expect(d.pendingReschedules).toHaveLength(1);
    expect(d.workload.map((w) => w.name)).toEqual(expect.arrayContaining(['Riya Menon', 'Neha Verma', 'Arjun Mehta', 'Pooja Malhotra']));
    await expect((await signedIn('parent')).dashboards.admin()).rejects.toEqual(code('forbidden'));
  });

  it('resolves alerts', async () => {
    const repo = await signedIn('coordinator');
    const open = await repo.alerts.list({ status: ['open'] });
    expect(open.length).toBeGreaterThanOrEqual(2);
    await repo.alerts.acknowledge(open[0].id);
    await repo.alerts.resolve(open[0].id);
    expect((await repo.alerts.list({ status: ['open', 'acknowledged'] })).map((a) => a.id)).not.toContain(open[0].id);
    actAs(repo, userByName(repo, 'Riya Menon'));
    const vihaan = (await repo.alerts.list()).find((a) => a.childName === 'Vihaan Agarwal');
    expect(vihaan).toBeDefined();
    await expect(repo.alerts.resolve(vihaan!.id)).rejects.toEqual(code('forbidden'));
  });
});

describe('messaging and notifications', () => {
  it('tracks unread counts, receipts and notifies other members', async () => {
    const repo = await signedIn('parent');
    expect(await repo.messaging.unreadCount()).toBeGreaterThanOrEqual(1);
    const thread = (await repo.messaging.threadsForChild(childByName(repo, 'Aarav Sharma'))).find((t) => t.kind === 'care_team')!;
    expect(thread.unreadCount).toBe(1);
    expect(thread.memberNames).toEqual(expect.arrayContaining(['Priya Sharma', 'Riya Menon', 'Dr. Meera Iyer']));
    const messages = await repo.messaging.listMessages(thread.id);
    expect(messages.length).toBeGreaterThanOrEqual(8);
    expect(messages[0].readBy).toContain('Riya Menon');
    await repo.messaging.markRead(thread.id);
    expect((await repo.messaging.getThread(thread.id)).unreadCount).toBe(0);

    const notes = repo.demo.store.notifications.length;
    const sent = await repo.messaging.send(thread.id, 'Thank you, Meera ma’am!');
    expect(sent.senderRole).toBe('parent');
    const fresh = repo.demo.store.notifications.slice(notes);
    expect(fresh.every((n) => n.kind === 'new_message' && n.route === `/messages/${thread.id}`)).toBe(true);
    expect(fresh.map((n) => n.userId)).toContain(userByName(repo, 'Riya Menon'));
    expect(fresh.map((n) => n.userId)).not.toContain(userByName(repo, 'Priya Sharma'));
    await expect(repo.messaging.send(thread.id, '   ')).rejects.toEqual(code('validation'));
  });

  it('filters announcements by audience and broadcasts new ones', async () => {
    const repo = await signedIn('parent');
    const seen = await repo.messaging.listAnnouncements();
    expect(seen.some((a) => a.urgent)).toBe(true);
    expect(seen.some((a) => a.audience === 'all_staff')).toBe(false);
    actAs(repo, userByName(repo, 'Sunita Bansal'));
    const notes = repo.demo.store.notifications.length;
    await repo.messaging.createAnnouncement({ title: 'Annual day', body: 'Join us on Saturday at 10 AM.', audience: 'all_parents', urgent: false });
    const recipients = new Set(repo.demo.store.notifications.slice(notes).map((n) => n.userId));
    expect(recipients.size).toBe(15);
    expect(recipients.has(userByName(repo, 'Riya Menon'))).toBe(false);
  });

  it('lists the inbox and marks everything read', async () => {
    const repo = await signedIn('therapist');
    const list = await repo.notifications.list();
    expect(list[0].createdAt >= list[list.length - 1].createdAt).toBe(true);
    expect(await repo.notifications.unreadCount()).toBeGreaterThan(0);
    await repo.notifications.markRead(list[0].id);
    await repo.notifications.markRead('all');
    expect(await repo.notifications.unreadCount()).toBe(0);
    await expect(repo.notifications.markRead('nope')).rejects.toEqual(code('not_found'));
  });
});

describe('progress and reports', () => {
  it('builds staff and parent progress', async () => {
    const repo = await signedIn('therapist');
    const aarav = childByName(repo, 'Aarav Sharma');
    const staff = await repo.progress.staff(aarav);
    expect(staff.sessions.length).toBeGreaterThan(30);
    expect(Object.keys(staff.fourSessionAverage)).toHaveLength(8);
    expect(staff.goals.every((g) => Array.isArray(g.points))).toBe(true);
    expect(staff.attendance.attended).toBeGreaterThan(30);
    const parent = await signedIn('parent');
    const p = await parent.progress.parent(aarav, 'month');
    expect(p.byTherapy.map((t) => t.therapyTypeName)).toContain('Speech Therapy');
    expect(p.byTherapy[0].dimensions[0].recent.length).toBeGreaterThan(0);
    expect(p.goalsSummary.some((g) => g.achieved > 0)).toBe(true);
    expect(p.homePracticeCompletion).toBeGreaterThan(30);
  });

  it('produces staff and parent reports and admin exports', async () => {
    const repo = await signedIn('school_admin');
    const aarav = childByName(repo, 'Aarav Sharma');
    const range = { from: '2026-09-01', to: '2026-10-28' };
    const staff = await repo.reports.childReport(aarav, { ...range, audience: 'staff' });
    expect(staff.byTherapy).toHaveLength(3);
    expect(staff.byTherapy[0].averageScore).toBeGreaterThan(0);
    expect(staff.wins.length).toBeGreaterThan(0);
    expect(staff.therapistSummary).toContain('Speech Therapy');
    const parent = await repo.reports.childReport(aarav, { ...range, audience: 'parent' });
    expect(parent.byTherapy.every((t) => t.sessions.length === 0 && t.averageScore === undefined)).toBe(true);
    const sessions = await repo.reports.exportSessions({ ...range, childId: aarav });
    expect(sessions.length).toBe(staff.byTherapy.reduce((n, t) => n + t.sessions.length, 0));
    expect(Object.keys(sessions[0])).toEqual(expect.arrayContaining(['Date', 'Child', 'Therapist', 'Session score', 'Substitute']));
    const attendance = await repo.reports.exportAttendance(range);
    expect(attendance.some((r) => r.Attendance === 'absent')).toBe(true);
    await expect(repo.reports.exportSessions({ from: '2026-10-28', to: '2026-10-01' })).rejects.toEqual(code('validation'));
  });
});

describe('latency', () => {
  it('waits between 80 and 200 ms by default', async () => {
    const repo = createDemoRepository({ now: DEMO_NOW });
    await repo.auth.signInDemo('parent');
    const started = Date.now();
    await repo.notifications.unreadCount();
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(75);
    expect(took).toBeLessThan(400);
  });
});
