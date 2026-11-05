import { RepoError } from '@/data/repository';
import { CONSENT_VERSION } from '@/domain/constants';
import { toISODate } from '@/lib/dates';

import { actAs, childByName, DEMO_NOW, signedIn, userByName } from '../testing';

jest.mock('../assets', () => ({ resolveDemoVideo: (path: string) => `asset:///${path}` }));

const code = (c: RepoError['code']) => expect.objectContaining({ name: 'RepoError', code: c });

describe('home practice', () => {
  it('logs idempotently and notifies the assigning therapist', async () => {
    const repo = await signedIn('parent');
    const aarav = childByName(repo, 'Aarav Sharma');
    const tasks = await repo.homePractice.listTasks({ childId: aarav, status: ['active'] });
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    const task = tasks[0];
    const notes = repo.demo.store.notifications.length;
    const input = { clientId: 'log-1', taskId: task.id, outcome: 'done' as const, difficulty: 'easy' as const, note: 'Did it before dinner!' };
    const log = await repo.homePractice.log(input);
    expect(log).toMatchObject({ childId: aarav, loggedByName: 'Priya Sharma', taskTitle: task.title });
    expect((await repo.homePractice.log(input)).id).toBe(log.id);
    expect(repo.demo.store.homeLogs.filter((l) => l.clientId === 'log-1')).toHaveLength(1);
    const fresh = repo.demo.store.notifications.slice(notes);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ userId: task.assignedBy, kind: 'home_log_submitted', route: `/practice/task/${task.id}` });
    expect((await repo.homePractice.getTask(task.id)).logs[0].id).toBe(log.id);
    expect((await repo.homePractice.getLog(log.id)).note).toBe('Did it before dinner!');
    const otherFamily = repo.demo.store.homeLogs.find((l) => l.childId === childByName(repo, 'Kavya Singh'))!;
    await expect(repo.homePractice.getLog(otherFamily.id)).rejects.toEqual(code('forbidden'));
    actAs(repo, task.assignedBy);
    expect((await repo.homePractice.getLog(log.id)).id).toBe(log.id);
    actAs(repo, userByName(repo, 'Arjun Mehta'));
    const diyaLog = repo.demo.store.homeLogs.find((l) => l.childId === childByName(repo, 'Diya Bhatia'))!;
    await expect(repo.homePractice.getLog(diyaLog.id)).rejects.toEqual(code('forbidden'));
    actAs(repo, userByName(repo, 'Priya Sharma'));
    const week = await repo.homePractice.weeklyCompletion(aarav);
    expect(week.weekStart).toBe('2026-10-26');
    expect(week.expected).toBeGreaterThan(0);
    expect(week.done).toBeGreaterThan(0);
  });

  it('respects withdrawn video consent', async () => {
    const repo = await signedIn('parent');
    const kavya = childByName(repo, 'Kavya Singh');
    actAs(repo, userByName(repo, 'Rajesh Singh'));
    const task = (await repo.homePractice.listTasks({ childId: kavya }))[0];
    const video = { localUri: 'file:///clip.mp4', durationS: 20, sizeBytes: 2_000_000 };
    await expect(repo.homePractice.log({ clientId: 'v1', taskId: task.id, outcome: 'done', difficulty: 'ok', note: '', video })).rejects.toEqual(code('consent_required'));
    await expect(repo.media.upload({ localUri: video.localUri, kind: 'video', durationS: 20, sizeBytes: 2_000_000, mimeType: 'video/mp4' })).rejects.toEqual(code('consent_required'));
    expect((await repo.homePractice.log({ clientId: 'v2', taskId: task.id, outcome: 'partly', difficulty: 'hard', note: 'Text only' })).mediaId).toBeUndefined();

    // Priya can upload until she withdraws consent herself.
    actAs(repo, userByName(repo, 'Priya Sharma'));
    const aaravTask = (await repo.homePractice.listTasks({ childId: childByName(repo, 'Aarav Sharma') }))[0];
    const progress: number[] = [];
    const media = await repo.media.upload({ localUri: video.localUri, kind: 'video', durationS: 20, sizeBytes: 2_000_000, mimeType: 'video/mp4' }, (p) => progress.push(p));
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(1);
    expect(media.uploadStatus).toBe('uploaded');
    const withVideo = await repo.homePractice.log({ clientId: 'v3', taskId: aaravTask.id, outcome: 'done', difficulty: 'ok', note: '', mediaId: media.id });
    expect(withVideo.mediaId).toBe(media.id);
    expect(await repo.media.playbackUrl(media.id)).toBe('file:///clip.mp4');
    await repo.me.recordConsent({ kind: 'video_upload', granted: false, childId: aaravTask.childId, version: CONSENT_VERSION });
    await expect(repo.homePractice.log({ clientId: 'v4', taskId: aaravTask.id, outcome: 'done', difficulty: 'ok', note: '', video })).rejects.toEqual(code('consent_required'));
    await expect(repo.media.upload({ localUri: 'file:///long.mp4', kind: 'video', durationS: 95, sizeBytes: 1, mimeType: 'video/mp4' })).rejects.toEqual(code('validation'));
  });

  it('plays seeded demo videos through the asset resolver, only for the family and staff', async () => {
    const repo = await signedIn('therapist');
    const queue = await repo.homePractice.reviewQueue();
    expect(queue.length).toBeGreaterThanOrEqual(4);
    const withVideo = queue.filter((l) => l.mediaId);
    expect(withVideo).toHaveLength(2);
    expect(await repo.media.playbackUrl(withVideo[0].mediaId!)).toMatch(/^asset:\/\/\/demo\/practice-[13]\.mp4$/);
    actAs(repo, userByName(repo, 'Neelam Singh'));
    await expect(repo.media.playbackUrl(withVideo[0].mediaId!)).rejects.toEqual(code('forbidden'));
  });

  it('reviews a log and notifies the parent', async () => {
    const repo = await signedIn('therapist');
    const queue = await repo.homePractice.reviewQueue();
    const target = queue[0];
    const notes = repo.demo.store.notifications.length;
    const reviewed = await repo.homePractice.review(target.id, { reaction: 'great_job', comment: 'Lovely! Wait 3 seconds before helping.', useInNextSession: true });
    expect(reviewed).toMatchObject({ reviewedByName: 'Riya Menon', reviewReaction: 'great_job', useInNextSession: true });
    expect(repo.demo.store.notifications.slice(notes)[0]).toMatchObject({ userId: target.loggedBy, kind: 'home_log_feedback' });
    expect((await repo.homePractice.reviewQueue()).map((l) => l.id)).not.toContain(target.id);
    const foreign = repo.demo.store.homeLogs.find((l) => l.organizationId === repo.getContext()!.organizationId && l.childId === childByName(repo, 'Diya Bhatia'))!;
    await expect(repo.homePractice.review(foreign.id, { reaction: 'good_effort' })).rejects.toEqual(code('forbidden'));
  });

  it('lets therapists assign tasks and parents see them', async () => {
    const repo = await signedIn('therapist');
    const aarav = childByName(repo, 'Aarav Sharma');
    const goal = repo.demo.store.goals.find((g) => g.childId === aarav && g.status === 'progressing')!;
    await expect(repo.homePractice.createTask({ childId: aarav, title: 'x', steps: [], frequencyPerWeek: 3, durationMinutes: 5, activeFrom: '2026-10-28', activeTo: '2026-11-28' })).rejects.toEqual(code('validation'));
    const task = await repo.homePractice.createTask({ childId: aarav, goalId: goal.id, title: 'Snack-time requests', steps: ['Hold the snack', 'Wait 5 seconds', 'Give it for any try'], frequencyPerWeek: 5, durationMinutes: 5, activeFrom: '2026-10-28', activeTo: '2026-11-28' });
    expect(repo.demo.store.notifications.some((n) => n.kind === 'home_task_assigned' && n.route === `/practice/task/${task.id}` && n.userId === userByName(repo, 'Priya Sharma'))).toBe(true);
    await expect(repo.homePractice.createTask({ childId: childByName(repo, 'Diya Bhatia'), title: 'x', steps: ['a'], frequencyPerWeek: 3, durationMinutes: 5, activeFrom: '2026-10-28', activeTo: '2026-11-28' })).rejects.toEqual(code('forbidden'));
  });
});

describe('parent check-ins', () => {
  it('prompts on session days, submits idempotently and feeds the brief', async () => {
    const morning = new Date(2026, 9, 28, 8, 30);
    const repo = await signedIn('parent', morning);
    const pending = await repo.checkins.pendingForToday();
    expect(pending.map((a) => a.childName)).toEqual(['Aarav Sharma']);
    const input = { clientId: 'ci-1', childId: pending[0].childId, appointmentId: pending[0].id, date: toISODate(morning), sleep: 'poor' as const, ateBreakfast: true, mood: 'okay' as const, changeFlag: true, changeNote: 'Cousins visiting, slept late.' };
    const checkin = await repo.checkins.submit(input);
    expect((await repo.checkins.submit(input)).id).toBe(checkin.id);
    expect(await repo.checkins.pendingForToday()).toEqual([]);
    expect((await repo.checkins.forAppointment(pending[0].id))?.changeNote).toBe('Cousins visiting, slept late.');
    await expect(repo.checkins.submit({ ...input, clientId: 'ci-2', childId: childByName(repo, 'Kavya Singh') })).rejects.toEqual(code('forbidden'));
    actAs(repo, userByName(repo, 'Riya Menon'));
    const brief = await repo.sessions.brief(pending[0].id);
    expect(brief.todaysCheckin?.sleep).toBe('poor');
    expect(brief.mustAcknowledge).toBe(false);
    expect(brief.whatWorked.length).toBeGreaterThan(0);
    expect(brief.openHomeTasks.length).toBeGreaterThanOrEqual(2);
    expect(DEMO_NOW.getDate()).toBe(28);
  });
});
