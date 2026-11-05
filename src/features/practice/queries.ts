/**
 * TanStack hooks for the home-practice loop. Keys start with 'homePractice' (or 'media' / 'me').
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { useOutbox } from '@/data/outbox';
import { invalidate, key } from '@/data/queryClient';
import { RepoError } from '@/data/repository';
import type { HomeLog, HomeTask, HomeTaskInput, ReviewReaction, UUID } from '@/domain/types';

import { HOME_LOG_KIND, isHomeLogPayload, type HomeLogPayload } from './outboxLogic';

export function useActiveTasks(childId: UUID | null | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('homePractice', 'tasks', childId, 'active'),
    queryFn: () => repo.homePractice.listTasks({ childId: childId!, status: ['active'] }),
    enabled: !!childId,
  });
}

export function useTask(taskId: UUID | null | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: key('homePractice', 'task', taskId), queryFn: () => repo.homePractice.getTask(taskId!), enabled: !!taskId });
}

export function useWeeklyCompletion(childId: UUID | null | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('homePractice', 'weekly', childId),
    queryFn: () => repo.homePractice.weeklyCompletion(childId!),
    enabled: !!childId,
  });
}

export function useChildLogs(childId: UUID | null | undefined, limit = 50) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('homePractice', 'logs', childId, limit),
    queryFn: () => repo.homePractice.listLogs({ childId: childId!, limit }),
    enabled: !!childId,
  });
}

export function useReviewQueue(enabled = true) {
  const repo = useRepo();
  return useQuery({ queryKey: key('homePractice', 'reviewQueue'), queryFn: () => repo.homePractice.reviewQueue(), enabled });
}

/**
 * One log by id. The repository has no `getLog`, so look in the review queue first (where staff
 * come from), then in recent logs (narrowed by task when known).
 */
export function useHomeLog(logId: UUID | null | undefined, taskId?: UUID) {
  const repo = useRepo();
  const qc = useQueryClient();
  return useQuery({
    queryKey: key('homePractice', 'log', logId),
    enabled: !!logId,
    queryFn: async (): Promise<HomeLog> => {
      const cachedQueue = qc.getQueryData<HomeLog[]>(key('homePractice', 'reviewQueue'));
      const fromCache = cachedQueue?.find((l) => l.id === logId);
      if (fromCache) return fromCache;
      const recent = await repo.homePractice.listLogs(taskId ? { taskId, limit: 200 } : { limit: 200 });
      const found = recent.find((l) => l.id === logId);
      if (found) return found;
      const queue = await repo.homePractice.reviewQueue().catch(() => [] as HomeLog[]);
      const inQueue = queue.find((l) => l.id === logId);
      if (inQueue) return inQueue;
      throw new RepoError('not_found');
    },
  });
}

export function useReviewLog() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (v: { logId: UUID; reaction: ReviewReaction; comment?: string; useInNextSession?: boolean }) =>
      repo.homePractice.review(v.logId, { reaction: v.reaction, comment: v.comment, useInNextSession: v.useInNextSession }),
    onSuccess: () => invalidate('homePractice', 'dashboards', 'notifications', 'sessions'),
  });
}

export function useSaveTask() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (v: { taskId?: UUID; input: HomeTaskInput }) =>
      v.taskId ? repo.homePractice.updateTask(v.taskId, v.input) : repo.homePractice.createTask(v.input),
    onSuccess: () => invalidate('homePractice', 'dashboards', 'notifications', 'sessions'),
  });
}

export function useSetTaskStatus() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (v: { taskId: UUID; status: HomeTask['status'] }) => repo.homePractice.updateTask(v.taskId, { status: v.status }),
    onSuccess: () => invalidate('homePractice', 'dashboards', 'sessions'),
  });
}

/** Signed, short-lived playback URL. Refetched often so it never expires mid-review. */
export function usePlaybackUrl(mediaId: UUID | null | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('media', 'playback', mediaId),
    queryFn: () => repo.media.playbackUrl(mediaId!),
    enabled: !!mediaId,
    staleTime: 60_000,
    gcTime: 4 * 60_000,
  });
}

export function useConsents() {
  const repo = useRepo();
  return useQuery({ queryKey: key('me', 'consents'), queryFn: () => repo.me.listConsents() });
}

/** Home logs still on this phone (offline or uploading), optionally for one task. */
export function usePendingHomeLogs(taskId?: UUID): { id: string; payload: HomeLogPayload; failed: boolean; createdAt: string }[] {
  const { items } = useOutbox();
  return items
    .filter((i) => i.kind === HOME_LOG_KIND && isHomeLogPayload(i.payload) && (!taskId || i.payload.taskId === taskId))
    .map((i) => ({ id: i.id, payload: i.payload as HomeLogPayload, failed: i.status === 'failed', createdAt: i.createdAt }));
}
