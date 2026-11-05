/** TanStack hooks for the calendar feature (thin wrappers over `repo.appointments`). */
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useRepo } from '@/data';
import { useOrg } from '@/data/hooks';
import { invalidate, key, type KeyRoot } from '@/data/queryClient';
import type { AppointmentFilter } from '@/data/repository';
import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { AppointmentView, OrgSettings, RescheduleRequest, SeriesInput, UUID } from '@/domain/types';
import { useActive } from '@/state/session';

import { addMinutesISO } from './lib/slots';

/** Every area an appointment write can change (lists, home cards, dashboards, attendance stats). */
export const AFFECTED_BY_SCHEDULE: KeyRoot[] = ['appointments', 'dashboards', 'notifications', 'children', 'progress', 'checkins'];

export function useOrgSettings(): OrgSettings {
  const org = useOrg();
  const active = useActive();
  return org.data?.settings ?? active?.organization?.settings ?? DEFAULT_ORG_SETTINGS;
}

export function useDebouncedValue<T>(value: T, ms = 450): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useAppointmentList(filter: AppointmentFilter | null) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('appointments', 'list', filter),
    queryFn: () => repo.appointments.list(filter!),
    enabled: !!filter,
    placeholderData: keepPreviousData,
  });
}

/** Occurrences around an appointment, used to describe its series ("Every Mon · Wed"). */
export function useSeriesSiblings(a: AppointmentView | undefined) {
  const repo = useRepo();
  const filter: AppointmentFilter | null = a?.seriesId
    ? { from: addMinutesISO(a.startsAt, -28 * 24 * 60), to: addMinutesISO(a.startsAt, 28 * 24 * 60), childId: a.childId }
    : null;
  return useQuery({
    queryKey: key('appointments', 'list', filter),
    queryFn: () => repo.appointments.list(filter!),
    enabled: !!filter,
    select: (list) => list.filter((x) => x.seriesId === a?.seriesId),
  });
}

export function useRescheduleRequests(filter?: { status?: RescheduleRequest['status'][]; childId?: UUID }, enabled = true) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('appointments', 'reschedule', filter ?? {}),
    queryFn: () => repo.appointments.listRescheduleRequests(filter),
    enabled,
  });
}

export function useNeedingSubstitute(enabled = true) {
  const repo = useRepo();
  return useQuery({ queryKey: key('appointments', 'needingSubstitute'), queryFn: () => repo.appointments.needingSubstitute(), enabled });
}

export function useSubstituteCandidates(appointmentId: UUID | null) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('appointments', 'candidates', appointmentId),
    queryFn: () => repo.appointments.substituteCandidates(appointmentId!),
    enabled: !!appointmentId,
  });
}

export function useUnavailability(filter: { userId?: UUID; from?: string; to?: string } | null) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('appointments', 'unavailability', filter),
    queryFn: () => repo.appointments.listUnavailability(filter ?? undefined),
    enabled: !!filter,
  });
}

/** Live clash check; pass null until the form has enough to check. Debounce the input upstream. */
export function useConflicts(input: (SeriesInput & { excludeAppointmentIds?: UUID[] }) | null) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('appointments', 'conflicts', input),
    queryFn: () => repo.appointments.checkConflicts(input!),
    enabled: !!input,
    staleTime: 10_000,
  });
}

type ConflictInput = SeriesInput & { excludeAppointmentIds?: UUID[] };

/**
 * Debounced live clash check. Keyed on the serialised input so a new-but-equal object each render
 * never restarts the timer. `checking` is true while typing settles or the request runs.
 */
export function useLiveConflicts(input: ConflictInput | null) {
  const serial = input ? JSON.stringify(input) : null;
  const settled = useDebouncedValue(serial);
  const parsed = useMemo(() => (settled ? (JSON.parse(settled) as ConflictInput) : null), [settled]);
  const q = useConflicts(parsed);
  const current = !!serial && serial === settled;
  return { conflicts: current ? q.data : undefined, checking: !!serial && (!current || q.isFetching), error: q.error };
}

/** Mutation that refreshes every schedule-related screen on success. */
export function useScheduleMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  return useMutation({
    mutationFn: fn,
    // Not awaited: the screen confirms at once and lists refresh in the background.
    onSuccess: () => {
      void invalidate(...AFFECTED_BY_SCHEDULE);
    },
  });
}
