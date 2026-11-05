/**
 * TanStack Query hooks for the session feature (logger, handover brief, session detail).
 * All keys start with a KeyRoot so cross-feature invalidation works.
 */
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { invalidate, key } from '@/data/queryClient';
import type {
  AppointmentView,
  GoalProgressPoint,
  HandoverBrief,
  ISODate,
  ISODateTime,
  SessionInput,
  UUID,
} from '@/domain/types';

export function useSessionLog(sessionId: UUID | null | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('sessions', 'detail', sessionId),
    queryFn: () => repo.sessions.get(sessionId!),
    enabled: !!sessionId,
  });
}

/** Recent sessions of one child + therapy type (newest first after sorting by the caller). */
export function useRecentSessions(childId: UUID | undefined, therapyTypeId: UUID | undefined, limit = 8) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('sessions', 'list', childId, { therapyTypeId, limit }),
    queryFn: () => repo.sessions.listForChild(childId!, { therapyTypeId, limit }),
    enabled: !!childId && !!therapyTypeId,
  });
}

export interface PreviousPlan {
  sessionId: UUID;
  date: ISODate;
  therapistName: string;
  planNext: string;
  planGoalIds: UUID[];
}

/** The "P" of the previous session of this child + therapy type (drives "planned for today"). */
export function usePreviousPlan(
  childId: UUID | undefined,
  therapyTypeId: UUID | undefined,
  before: ISODateTime | undefined,
) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('sessions', 'previousPlan', childId, therapyTypeId, before),
    enabled: !!childId && !!therapyTypeId,
    queryFn: async (): Promise<PreviousPlan | null> => {
      const prev = await repo.sessions.previous(childId!, therapyTypeId!, before);
      if (!prev) return null;
      const log = await repo.sessions.get(prev.id);
      return {
        sessionId: prev.id,
        date: prev.date,
        therapistName: log.therapistName,
        planNext: log.notes.planNext,
        planGoalIds: log.notes.planGoalIds,
      };
    },
  });
}

export function useCheckin(appointmentId: UUID | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('checkins', 'appointment', appointmentId),
    queryFn: () => repo.checkins.forAppointment(appointmentId!),
    enabled: !!appointmentId,
  });
}

export function useBrief(appointmentId: UUID | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('sessions', 'brief', appointmentId),
    queryFn: () => repo.sessions.brief(appointmentId!),
    enabled: !!appointmentId,
  });
}

export function useParentSnapshot(sessionId: UUID | undefined, enabled = true) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('sessions', 'parentSnapshot', sessionId),
    queryFn: () => repo.sessions.parentSnapshot(sessionId!),
    enabled: !!sessionId && enabled,
  });
}

export function useAmendments(sessionId: UUID | undefined, enabled = true) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('sessions', 'amendments', sessionId),
    queryFn: () => repo.sessions.amendments(sessionId!),
    enabled: !!sessionId && enabled,
  });
}

/** Accuracy history per goal (for local mastery suggestions on save). */
export function useGoalHistories(goalIds: UUID[]): Record<UUID, GoalProgressPoint[] | undefined> {
  const repo = useRepo();
  const results = useQueries({
    queries: goalIds.map((id) => ({
      queryKey: key('goals', 'progress', id),
      queryFn: () => repo.goals.progress(id),
      staleTime: 5 * 60_000,
    })),
  });
  const out: Record<UUID, GoalProgressPoint[] | undefined> = {};
  goalIds.forEach((id, i) => {
    out[id] = results[i]?.data;
  });
  return out;
}

export function useAcknowledgeBrief(appointmentId: UUID) {
  const repo = useRepo();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => repo.appointments.acknowledgeBrief(appointmentId),
    onSuccess: () => {
      // Update caches first so the logger opens straight away (no flash of the "read the brief" gate).
      client.setQueryData<AppointmentView>(key('appointments', 'detail', appointmentId), (a) =>
        a ? { ...a, briefAcknowledged: true } : a,
      );
      client.setQueryData<HandoverBrief>(key('sessions', 'brief', appointmentId), (b) =>
        b ? { ...b, acknowledged: true, appointment: { ...b.appointment, briefAcknowledged: true } } : b,
      );
      return invalidate('appointments', 'sessions', 'dashboards');
    },
  });
}

export function useAmendSession(sessionId: UUID) {
  const repo = useRepo();
  return useMutation({
    mutationFn: (args: { changes: Partial<Omit<SessionInput, 'clientId' | 'appointmentId'>>; reason: string }) =>
      repo.sessions.amend(sessionId, args.changes, args.reason),
    onSuccess: () => invalidate('sessions', 'dashboards', 'progress', 'alerts', 'goals'),
  });
}
