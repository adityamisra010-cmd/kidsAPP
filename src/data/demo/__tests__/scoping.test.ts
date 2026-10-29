import { RepoError } from '@/data/repository';
import { isCancelled } from '@/domain/derive';

import { createDemoRepository } from '../index';
import { actAs, childByName, demoRepo, DEMO_NOW, signedIn, userByName } from '../testing';

const code = (c: RepoError['code']) => expect.objectContaining({ name: 'RepoError', code: c });
const RANGE = { from: new Date(2026, 8, 1).toISOString(), to: new Date(2026, 11, 31).toISOString() };

describe('auth', () => {
  it('signs in every persona and sets the request context', async () => {
    const repo = demoRepo();
    const parent = await repo.auth.signInDemo('parent');
    expect(parent.profile.fullName).toBe('Priya Sharma');
    expect(parent.childIds).toHaveLength(2);
    expect(parent.demoPersona).toBe('parent');
    expect(repo.getContext()).toMatchObject({ role: 'parent', organizationId: parent.organizations[0].id });
    const admin = await repo.auth.signInDemo('platform_admin');
    expect(admin.memberships[0]).toMatchObject({ role: 'platform_admin', organizationId: null });
  });

  it('accepts OTP 123456 for persona phones and the staff password', async () => {
    const repo = demoRepo();
    await repo.auth.requestOtp('98000 00002');
    expect((await repo.auth.verifyOtp('+91 98000 00002', '123456')).profile.fullName).toBe('Riya Menon');
    await expect(repo.auth.verifyOtp('9800000002', '000000')).rejects.toEqual(code('otp_invalid'));
    await expect(repo.auth.requestOtp('12345')).rejects.toEqual(code('validation'));
    await expect(repo.auth.verifyOtp('9876501234', '123456')).rejects.toEqual(code('no_membership'));
    expect((await repo.auth.signInWithPassword('Meera@Anvaya.demo', 'Demo@1234')).profile.fullName).toBe('Dr. Meera Iyer');
    await expect(repo.auth.signInWithPassword('meera@anvaya.demo', 'wrong')).rejects.toEqual(code('not_authenticated'));
  });

  it('accepts a pending invite on first OTP login and links the child', async () => {
    const repo = demoRepo();
    const invite = repo.demo.store.invites.find((i) => i.fullName === 'Gaurav Kapoor')!;
    const user = await repo.auth.verifyOtp(invite.phone!, '123456');
    expect(user.memberships[0].role).toBe('parent');
    expect(user.childIds).toEqual([childByName(repo, 'Myra Kapoor')]);
    expect(repo.demo.store.invites.find((i) => i.id === invite.id)!.status).toBe('accepted');
  });

  it('restores the last session and signs out', async () => {
    const repo = await signedIn('therapist');
    expect((await repo.auth.restore())?.profile.fullName).toBe('Riya Menon');
    const fresh = createDemoRepository({ now: DEMO_NOW, latencyMs: 0 });
    expect((await fresh.auth.restore())?.profile.fullName).toBe('Riya Menon');
    await fresh.auth.signOut();
    expect(fresh.getContext()).toBeNull();
    await expect(fresh.children.list()).rejects.toEqual(code('not_authenticated'));
    expect(await createDemoRepository({ now: DEMO_NOW, latencyMs: 0 }).auth.restore()).toBeNull();
  });
});

describe('parent scoping', () => {
  it('sees only linked children, without clinical details or alerts', async () => {
    const repo = await signedIn('parent');
    const list = await repo.children.list();
    expect(list.map((c) => c.child.fullName)).toEqual(['Aarav Sharma', 'Anaya Sharma']);
    expect(list.every((c) => c.openAlerts === 0 && c.nextAppointment)).toBe(true);
    const aarav = await repo.children.get(childByName(repo, 'Aarav Sharma'));
    expect(aarav.access).toBe('parent');
    expect(aarav.profile.clinical).toBeUndefined();
    expect(aarav.profile.dos.length).toBeGreaterThan(0);
    await expect(repo.children.get(childByName(repo, 'Kavya Singh'))).rejects.toEqual(code('forbidden'));
    await expect(repo.goals.listForChild(childByName(repo, 'Kavya Singh'))).rejects.toEqual(code('forbidden'));
    await expect(repo.children.get(childByName(repo, 'Aditya Rao'))).rejects.toEqual(code('not_found'));
    await expect(repo.alerts.list()).rejects.toEqual(code('forbidden'));
  });

  it('never receives internal notes or staff-only threads', async () => {
    const repo = await signedIn('parent');
    const aarav = childByName(repo, 'Aarav Sharma');
    const session = repo.demo.store.sessions.filter((s) => s.childId === aarav).slice(-1)[0];
    await expect(repo.sessions.get(session.id)).rejects.toEqual(code('forbidden'));
    await expect(repo.sessions.listForChild(aarav)).rejects.toEqual(code('forbidden'));
    await expect(repo.sessions.brief(session.appointmentId)).rejects.toEqual(code('forbidden'));
    const snapshot = await repo.sessions.parentSnapshot(session.id);
    expect(snapshot.parentSummary).toBe(session.notes.parentSummary);
    expect(snapshot.therapyTypeKey).toBe(repo.demo.store.therapyTypes.find((t) => t.id === session.therapyTypeId)!.key);
    const json = JSON.stringify(await repo.sessions.parentSnapshots(aarav));
    for (const internal of ['planNext', 'assessment', 'objective', 'subjective', session.notes.assessment]) expect(json).not.toContain(internal);
    expect(snapshot.sessionScore).toBeUndefined();
    const threads = await repo.messaging.listThreads();
    expect(threads.length).toBeGreaterThan(0);
    expect(threads.every((t) => t.kind === 'care_team')).toBe(true);
    const staffOnly = repo.demo.store.threads.find((t) => t.childId === aarav && t.kind === 'staff_only')!;
    await expect(repo.messaging.getThread(staffOnly.id)).rejects.toEqual(code('forbidden'));
    await expect(repo.messaging.listMessages(staffOnly.id)).rejects.toEqual(code('forbidden'));
    await expect(repo.reports.childReport(aarav, { from: '2026-09-01', to: '2026-10-28', audience: 'staff' })).rejects.toEqual(code('forbidden'));
  });

  it('only lists own appointments, tasks and parent-visible resources', async () => {
    const repo = await signedIn('parent');
    const kids = new Set([childByName(repo, 'Aarav Sharma'), childByName(repo, 'Anaya Sharma')]);
    const appts = await repo.appointments.list(RANGE);
    expect(appts.length).toBeGreaterThan(50);
    expect(appts.every((a) => kids.has(a.childId))).toBe(true);
    expect((await repo.homePractice.listTasks({})).every((t) => kids.has(t.childId))).toBe(true);
    expect((await repo.resources.list()).every((r) => r.audience !== 'staff')).toBe(true);
    const members = await repo.org.listMembers(repo.getContext()!.organizationId!);
    expect(members.every((m) => m.membership.role !== 'parent')).toBe(true);
  });
});

describe('therapist scoping', () => {
  it('has full access to the caseload and brief-only access around a substitute session', async () => {
    const repo = await signedIn('therapist');
    const caseload = (await repo.children.list()).map((c) => c.child.fullName);
    expect(caseload).toContain('Aarav Sharma');
    expect(caseload).not.toContain('Ishaan Gupta');
    expect((await repo.children.get(childByName(repo, 'Aarav Sharma'))).profile.clinical).toBeDefined();
    const aaravAppt = repo.demo.store.appointments.find((a) => a.childId === childByName(repo, 'Aarav Sharma') && a.therapistId === userByName(repo, 'Riya Menon'))!;
    expect((await repo.sessions.brief(aaravAppt.id)).access).toBe('full');

    const sub = repo.demo.store.appointments.find((a) => a.originalTherapistId === userByName(repo, 'Pooja Malhotra') && a.therapistId === userByName(repo, 'Riya Menon') && new Date(a.startsAt).toDateString() === DEMO_NOW.toDateString())!;
    const detail = await repo.children.get(sub.childId);
    expect(detail.access).toBe('brief_only');
    expect(detail.profile.clinical).toBeUndefined();
    await expect(repo.progress.staff(sub.childId)).rejects.toEqual(code('forbidden'));
    expect((await repo.goals.listForChild(sub.childId)).length).toBeGreaterThan(0);

    const brief = await repo.sessions.brief(sub.id);
    expect(brief).toMatchObject({ access: 'brief_only', mustAcknowledge: true, acknowledged: false });
    expect(brief.planForToday?.text).toBeTruthy();
    expect(brief.recentSessions.length).toBe(3);
    expect(brief.profile.clinical).toBeUndefined();
    await repo.appointments.acknowledgeBrief(sub.id);
    expect((await repo.sessions.brief(sub.id)).acknowledged).toBe(true);
    expect((await repo.appointments.get(sub.id)).briefAcknowledged).toBe(true);

    repo.demo.setNow(new Date(DEMO_NOW.getTime() + 3 * 86_400_000));
    await expect(repo.children.get(sub.childId)).rejects.toEqual(code('forbidden'));
    await expect(repo.sessions.brief(sub.id)).rejects.toEqual(code('forbidden'));
  });

  it('is forbidden on unassigned children outside the substitute window', async () => {
    const repo = await signedIn('therapist');
    const diya = childByName(repo, 'Diya Bhatia');
    await expect(repo.children.get(diya)).rejects.toEqual(code('forbidden'));
    await expect(repo.sessions.listForChild(diya)).rejects.toEqual(code('forbidden'));
    const diyaAppt = repo.demo.store.appointments.find((a) => a.childId === diya)!;
    await expect(repo.sessions.brief(diyaAppt.id)).rejects.toEqual(code('forbidden'));
    await expect(repo.appointments.get(diyaAppt.id)).rejects.toEqual(code('forbidden'));
    await expect(repo.children.get(childByName(repo, 'Rahul Hegde'))).rejects.toEqual(code('not_found'));
  });
});

describe('organisation isolation', () => {
  it('keeps each school invisible to the other', async () => {
    const repo = await signedIn('coordinator');
    const anvaya = repo.getContext()!.organizationId!;
    expect(await repo.children.list()).toHaveLength(12);
    const sahajSession = repo.demo.store.sessions.find((s) => s.organizationId !== anvaya)!;
    await expect(repo.sessions.get(sahajSession.id)).rejects.toEqual(code('not_found'));
    await expect(repo.appointments.get(sahajSession.appointmentId)).rejects.toEqual(code('not_found'));
    await expect(repo.org.get(sahajSession.organizationId)).rejects.toEqual(code('not_found'));
    const appts = await repo.appointments.list({ ...RANGE, includeCancelled: true });
    expect(appts.every((a) => a.organizationId === anvaya)).toBe(true);
    expect((await repo.alerts.list()).every((a) => a.organizationId === anvaya)).toBe(true);
    expect((await repo.homePractice.reviewQueue()).every((l) => l.organizationId === anvaya)).toBe(true);
    expect((await repo.messaging.listThreads()).every((t) => t.organizationId === anvaya)).toBe(true);
    const other = repo.demo.store.threads.find((t) => t.organizationId !== anvaya)!;
    await expect(repo.messaging.getThread(other.id)).rejects.toEqual(code('not_found'));

    actAs(repo, userByName(repo, 'Dr. Shalini Rao'));
    expect((await repo.children.list()).map((c) => c.child.organizationId)).not.toContain(anvaya);
    expect(await repo.sessions.get(sahajSession.id)).toBeTruthy();
  });

  it('limits the platform admin to school summaries and templates', async () => {
    const repo = await signedIn('platform_admin');
    const schools = await repo.platform.listSchools();
    expect(schools).toHaveLength(2);
    for (const s of schools) {
      expect(s.activeChildren).toBe(12);
      expect(s.staffCount).toBe(6);
      expect(s.sessionsThisMonth).toBeGreaterThan(50);
      expect(s.activeParentsPercent).toBeGreaterThan(50);
      expect(s.lastActivityAt).toBeTruthy();
    }
    await expect(repo.children.list()).rejects.toEqual(code('forbidden'));
    await expect(repo.appointments.list(RANGE)).rejects.toEqual(code('forbidden'));
    expect((await repo.platform.listGlobalGoalBank()).length).toBeGreaterThanOrEqual(40);
    const { organization, invite } = await repo.platform.createSchool({ name: 'Udaan Therapy Centre', shortName: 'Udaan', city: 'Pune', address: 'Kothrud, Pune', phone: '+912012345678', adminName: 'Asha Kulkarni', adminPhone: '98220 11111' });
    expect(invite).toMatchObject({ role: 'school_admin', organizationId: organization.id, phone: '+919822011111' });
    expect((await repo.platform.listSchools()).length).toBe(3);
    const asAdmin = await signedIn('school_admin');
    await expect(asAdmin.platform.listSchools()).rejects.toEqual(code('forbidden'));
  });

  it('every listed appointment respects the cancelled filter', async () => {
    const repo = await signedIn('coordinator');
    const all = await repo.appointments.list({ ...RANGE, includeCancelled: true });
    const live = await repo.appointments.list(RANGE);
    expect(all.length).toBeGreaterThan(live.length);
    expect(live.some(isCancelled)).toBe(false);
  });
});
