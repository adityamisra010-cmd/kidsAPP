/** Home practice (tasks, idempotent parent logs, review queue) and demo media upload/playback. */
import type { HomePracticeRepo, MediaRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import { VIDEO_LIMITS } from '@/domain/constants';
import { weeklyCompletion } from '@/domain/derive';
import type { HomeTask, HomeTaskInput, Media, UUID } from '@/domain/types';
import { weekStart } from '@/lib/dates';
import { uuid } from '@/lib/id';

import { resolveDemoVideo } from '../assets';
import type { StoredHomeLog } from '../store';
import type { DemoCore } from './core';

/** Latest video-upload consent of a parent for a child (child-specific rows win over general ones). */
export function hasVideoConsent(core: DemoCore, userId: UUID, childId?: UUID): boolean {
  const rows = core.store.consents
    .filter((c) => c.userId === userId && c.kind === 'video_upload' && (!childId || !c.childId || c.childId === childId))
    .sort((a, b) => b.at.localeCompare(a.at));
  return rows[0]?.granted ?? false;
}

export function createHomePracticeRepo(core: DemoCore): HomePracticeRepo {
  const st = core.db;
  const loadTask = (taskId: UUID, staffOnly = false): HomeTask => {
    const task = core.sameOrg(st.homeTasks.find((t) => t.id === taskId), 'Task');
    core.requireChild(task.childId, staffOnly ? ['full'] : ['full', 'brief_only', 'parent']);
    return task;
  };
  const validate = (t: Partial<HomeTaskInput>) => {
    if (t.title != null && !t.title.trim()) throw new RepoError('validation', 'Give the task a title.');
    if (t.steps != null && (t.steps.length === 0 || t.steps.some((s) => !s.trim()))) throw new RepoError('validation', 'Add at least one step.');
    if (t.frequencyPerWeek != null && (t.frequencyPerWeek < 1 || t.frequencyPerWeek > 7)) throw new RepoError('validation', 'Frequency must be 1–7 times a week.');
    if (t.durationMinutes != null && t.durationMinutes <= 0) throw new RepoError('validation', 'Enter how many minutes it takes.');
    if (t.activeFrom && t.activeTo && t.activeTo < t.activeFrom) throw new RepoError('validation', 'The end date is before the start date.');
  };
  /** Therapists review logs for tasks they set, or for their own caseload; coordinators/admins see all. */
  const reviewable = (log: StoredHomeLog, userId: UUID, admin: boolean) => {
    if (admin) return true;
    const task = st.homeTasks.find((t) => t.id === log.taskId);
    return task?.assignedBy === userId || core.isAssigned(userId, log.childId);
  };

  return {
    listTasks: (filter) =>
      core.run(() => {
        const ctx = core.requireOrg();
        if (filter.childId) core.requireChild(filter.childId);
        return st.homeTasks
          .filter((t) => {
            if (t.organizationId !== ctx.organizationId) return false;
            if (ctx.role === 'parent' && !core.isGuardian(ctx.userId, t.childId)) return false;
            if (ctx.role === 'therapist' && !filter.childId && t.assignedBy !== ctx.userId && !core.isAssigned(ctx.userId, t.childId)) return false;
            return (!filter.childId || t.childId === filter.childId) && (!filter.assignedBy || t.assignedBy === filter.assignedBy) && (!filter.status || filter.status.includes(t.status));
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }),
    getTask: (taskId) =>
      core.run(() => {
        const task = loadTask(taskId);
        return { ...task, logs: st.homeLogs.filter((l) => l.taskId === taskId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
      }),
    createTask: (input) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const { child } = core.requireChild(input.childId, ['full']);
        validate(input);
        if (!input.title || !input.steps?.length) throw new RepoError('validation', 'Title and steps are required.');
        if (input.goalId && !st.goals.some((g) => g.id === input.goalId && g.childId === child.id)) throw new RepoError('validation', 'That goal belongs to another child.');
        const task: HomeTask = { ...input, id: uuid(), organizationId: child.organizationId, assignedBy: ctx.userId, assignedByName: core.name(ctx.userId), status: 'active', createdAt: core.nowIso() };
        st.homeTasks.push(task);
        core.notify(core.guardiansOf(child.id), 'home_task_assigned', `New home activity for ${child.preferredName ?? child.fullName}`, `${task.title} · ${task.frequencyPerWeek}× a week, ${task.durationMinutes} min`, `/practice/task/${task.id}`);
        return task;
      }),
    updateTask: (taskId, patch) =>
      core.run(() => {
        core.requireStaff();
        const task = loadTask(taskId, true);
        validate({ ...task, ...patch });
        return Object.assign(task, patch);
      }),
    log: (input) =>
      core.run(() => {
        const ctx = core.requireOrg(['parent']);
        const done = st.homeLogs.find((l) => l.clientId === input.clientId);
        if (done) return done;
        const task = loadTask(input.taskId);
        if (!core.isGuardian(ctx.userId, task.childId)) throw new RepoError('forbidden', 'This task is for another child.');
        let mediaId = input.mediaId;
        if ((input.video || mediaId) && !hasVideoConsent(core, ctx.userId, task.childId)) {
          throw new RepoError('consent_required', 'Video sharing is turned off. Turn on video consent in Consent & Privacy to attach videos.');
        }
        if (mediaId) core.sameOrg(st.media.find((m) => m.id === mediaId), 'Video');
        if (input.video && !mediaId) {
          if (input.video.durationS > VIDEO_LIMITS.maxDurationS || input.video.sizeBytes > VIDEO_LIMITS.maxSizeBytes) throw new RepoError('validation', 'Videos must be 60 seconds or shorter.');
          const media: Media = { id: uuid(), organizationId: task.organizationId, ownerId: ctx.userId, bucketPath: `uploads/${task.organizationId}/${uuid()}.mp4`, kind: 'video', durationS: input.video.durationS, sizeBytes: input.video.sizeBytes, localUri: input.video.localUri, uploadStatus: 'uploaded', createdAt: core.nowIso() };
          st.media.push(media);
          mediaId = media.id;
        }
        const child = st.children.find((c) => c.id === task.childId)!;
        const log: StoredHomeLog = {
          id: uuid(),
          clientId: input.clientId,
          organizationId: task.organizationId,
          taskId: task.id,
          taskTitle: task.title,
          childId: task.childId,
          childName: child.fullName,
          loggedBy: ctx.userId,
          loggedByName: core.name(ctx.userId),
          outcome: input.outcome,
          difficulty: input.difficulty,
          note: input.note.trim(),
          mediaId,
          createdAt: core.nowIso(),
          useInNextSession: false,
        };
        st.homeLogs.push(log);
        core.notify([task.assignedBy], 'home_log_submitted', `${log.loggedByName} logged "${task.title}"${mediaId ? ' with a video' : ''}`, `${child.preferredName ?? child.fullName}: ${input.outcome.replace('_', ' ')}${log.note ? ` — ${log.note}` : ''}`, `/practice/task/${task.id}`);
        return log;
      }),
    listLogs: (filter) =>
      core.run(() => {
        const ctx = core.requireOrg();
        if (filter.childId) core.requireChild(filter.childId);
        if (filter.taskId) loadTask(filter.taskId);
        return st.homeLogs
          .filter(
            (l) =>
              l.organizationId === ctx.organizationId &&
              (!filter.childId || l.childId === filter.childId) &&
              (!filter.taskId || l.taskId === filter.taskId) &&
              (ctx.role !== 'parent' || core.isGuardian(ctx.userId, l.childId)) &&
              (ctx.role !== 'therapist' || core.childAccess(l.childId) !== 'none'),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, filter.limit ?? 100);
      }),
    getLog: (logId) =>
      core.run(() => {
        const ctx = core.requireOrg();
        const log = core.sameOrg(st.homeLogs.find((l) => l.id === logId), 'Log');
        const allowed = ctx.role === 'parent' ? core.isGuardian(ctx.userId, log.childId) : reviewable(log, ctx.userId, core.isAdmin(ctx));
        if (!allowed) throw new RepoError('forbidden', 'You cannot see this practice log.');
        return log;
      }),
    reviewQueue: () =>
      core.run(() => {
        const ctx = core.requireStaff();
        const admin = core.isAdmin(ctx);
        return st.homeLogs
          .filter((l) => l.organizationId === ctx.organizationId && !l.reviewedAt && reviewable(l, ctx.userId, admin))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }),
    review: (logId, input) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const log = core.sameOrg(st.homeLogs.find((l) => l.id === logId), 'Log');
        if (!reviewable(log, ctx.userId, core.isAdmin(ctx))) throw new RepoError('forbidden', 'This log is not in your review queue.');
        Object.assign(log, { reviewedBy: ctx.userId, reviewedByName: core.name(ctx.userId), reviewReaction: input.reaction, reviewComment: input.comment?.trim() || undefined, reviewedAt: core.nowIso(), useInNextSession: Boolean(input.useInNextSession) });
        core.notify([log.loggedBy], 'home_log_feedback', `${log.reviewedByName} replied to your practice log`, log.reviewComment ?? input.reaction.replace(/_/g, ' '), `/practice/task/${log.taskId}`);
        return log;
      }),
    weeklyCompletion: (childId, start) =>
      core.run(() => {
        core.requireChild(childId);
        return weeklyCompletion(childId, st.homeTasks, st.homeLogs, start ?? weekStart(core.now()));
      }),
  };
}

export function createMediaRepo(core: DemoCore): MediaRepo {
  const st = core.db;
  const load = (mediaId: UUID): Media => {
    const ctx = core.requireOrg();
    const media = core.sameOrg(st.media.find((m) => m.id === mediaId), 'Video');
    if (ctx.role === 'parent' && media.ownerId !== ctx.userId) {
      const log = st.homeLogs.find((l) => l.mediaId === mediaId);
      const task = st.homeTasks.find((t) => t.demoMediaId === mediaId);
      const childId = log?.childId ?? task?.childId;
      if (!childId || !core.isGuardian(ctx.userId, childId)) throw new RepoError('forbidden', 'You cannot view this video.');
    }
    return media;
  };
  return {
    upload: async (input, onProgress) => {
      await core.delay();
      const ctx = core.requireOrg();
      if (input.kind === 'video' && ((input.durationS ?? 0) > VIDEO_LIMITS.maxDurationS || input.sizeBytes > VIDEO_LIMITS.maxSizeBytes)) {
        throw new RepoError('validation', 'Videos must be 60 seconds or shorter and under 25 MB.');
      }
      if (ctx.role === 'parent' && input.kind === 'video') {
        const kids = st.guardians.filter((g) => g.userId === ctx.userId).map((g) => g.childId);
        if (!kids.some((childId) => hasVideoConsent(core, ctx.userId, childId))) throw new RepoError('consent_required', 'Video sharing is turned off in Consent & Privacy.');
      }
      for (const p of [0, 0.25, 0.5, 0.75]) {
        onProgress?.(p);
        await core.delay(Math.min(60, Math.floor(core.latencyHint() / 4)));
      }
      const retention = core.org(ctx.organizationId).settings.videoRetentionDays;
      const media: Media = {
        id: uuid(),
        organizationId: ctx.organizationId,
        ownerId: ctx.userId,
        bucketPath: `uploads/${ctx.organizationId}/${uuid()}.${input.mimeType.split('/')[1] ?? 'bin'}`,
        kind: input.kind,
        durationS: input.durationS,
        sizeBytes: input.sizeBytes,
        expiresAt: input.kind === 'video' ? new Date(core.now().getTime() + retention * 86_400_000).toISOString() : undefined,
        localUri: input.localUri,
        uploadStatus: 'uploaded',
        createdAt: core.nowIso(),
      };
      st.media.push(media);
      onProgress?.(1);
      return { ...media };
    },
    playbackUrl: (mediaId) =>
      core.run(() => {
        const media = load(mediaId);
        const url = media.bucketPath.startsWith('demo/') ? resolveDemoVideo(media.bucketPath) : media.localUri;
        if (!url) throw new RepoError('not_found', 'This video is no longer available.');
        return url;
      }),
    get: (mediaId) => core.run(() => load(mediaId)),
  };
}
