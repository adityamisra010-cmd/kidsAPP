/**
 * Scheduling: conflict checks, recurring series, one-off appointments, therapist unavailability
 * and substitute suggestions. Conflict rules are pure (derive-local.findConflicts); this file only
 * loads what they need in a constant number of queries.
 */
import type { Appointment, AppointmentView, Conflict, Member, SeriesInput, TherapistUnavailability, UUID } from '@/domain/types';

import { RepoError } from '../repository';
import type { AdapterContext } from './context';
import {
  addMinutes,
  buildRrule,
  chunk,
  expandSeries,
  findConflicts,
  istDate,
  istDateTime,
  istDayBounds,
  todayIST,
  type BookedSlot,
  type Occurrence,
} from './derive-local';
import { appointmentFromRow, unavailabilityFromRow } from './mappers';
import { done, inChunks, many, selectAll, single } from './query';
import { loadMembers } from './org';
import type { AppointmentJoinedRow, AppointmentRow, TherapistUnavailabilityRow } from './rows';
import { APPOINTMENT_SELECT, hydrateAppointments } from './views';

const INSERT_CHUNK = 200;

type SlotRow = Pick<AppointmentRow, 'id' | 'child_id' | 'therapist_id' | 'starts_at' | 'ends_at' | 'status'>;

function validateSeries(input: Pick<SeriesInput, 'durationMinutes' | 'startDate' | 'startTime'> & { endDate?: string; weekdays?: number[] }): void {
  if (!(input.durationMinutes > 0)) throw new RepoError('validation', 'Duration must be more than 0 minutes');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{2}:\d{2}/.test(input.startTime)) throw new RepoError('validation', 'Invalid date or time');
  if (input.endDate != null && input.endDate < input.startDate) throw new RepoError('validation', 'End date is before start date');
  if (input.weekdays && input.weekdays.length === 0) throw new RepoError('validation', 'Pick at least one weekday');
}

/** Conflicts of the given occurrences for one therapist + child (3 queries). */
export async function conflictsFor(
  c: AdapterContext,
  who: { childId: UUID; therapistId: UUID },
  occurrences: Occurrence[],
  excludeIds: UUID[] = [],
): Promise<Conflict[]> {
  if (occurrences.length === 0) return [];
  const orgId = c.requireOrg();
  const first = occurrences[0];
  const last = occurrences[occurrences.length - 1];
  const [existing, away, settings] = await Promise.all([
    selectAll<SlotRow>((from, to) =>
      c.sb
        .from('appointments')
        .select('id,child_id,therapist_id,starts_at,ends_at,status')
        .eq('organization_id', orgId)
        .neq('status', 'cancelled')
        .or(`therapist_id.eq.${who.therapistId},child_id.eq.${who.childId}`)
        .lt('starts_at', last.endsAt)
        .gt('ends_at', first.startsAt)
        .order('starts_at')
        .order('id')
        .range(from, to),
    ),
    many<TherapistUnavailabilityRow>(
      c.sb.from('therapist_unavailability').select('*').eq('organization_id', orgId).eq('user_id', who.therapistId).lte('from', last.date).gte('to', first.date),
    ),
    c.orgSettings(orgId),
  ]);
  const booked: BookedSlot[] = existing.map((r) => ({
    id: r.id,
    childId: r.child_id,
    therapistId: r.therapist_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
  }));
  return findConflicts({ occurrences, therapistId: who.therapistId, childId: who.childId, existing: booked, unavailability: away, settings, excludeIds });
}

export async function checkConflicts(c: AdapterContext, input: SeriesInput & { excludeAppointmentIds?: UUID[] }): Promise<Conflict[]> {
  validateSeries(input);
  return conflictsFor(c, input, expandSeries(input), input.excludeAppointmentIds);
}

export async function createSeries(
  c: AdapterContext,
  input: SeriesInput,
  opts?: { force?: boolean },
): Promise<{ seriesId: UUID; created: number; conflicts: Conflict[] }> {
  validateSeries(input);
  const orgId = c.requireOrg();
  const occurrences = expandSeries(input);
  if (occurrences.length === 0) throw new RepoError('validation', 'No dates match the chosen weekdays');
  const conflicts = await conflictsFor(c, input, occurrences);
  if (conflicts.length && !opts?.force) return { seriesId: '', created: 0, conflicts };

  // Holidays block the calendar even when saving despite other conflicts.
  const holidays = new Set((await c.orgSettings(orgId)).holidays.map((h) => h.date));
  const toCreate = occurrences.filter((o) => !holidays.has(o.date));
  const series = await single<{ id: UUID }>(
    c.sb
      .from('appointment_series')
      .insert({
        organization_id: orgId,
        child_id: input.childId,
        therapist_id: input.therapistId,
        therapy_type_id: input.therapyTypeId,
        rrule: buildRrule(input.weekdays),
        start_time: input.startTime,
        duration_minutes: input.durationMinutes,
        start_date: input.startDate,
        end_date: input.endDate,
        room: input.room || null,
      })
      .select('id'),
    'series',
  );
  let created = 0;
  try {
    for (const part of chunk(toCreate, INSERT_CHUNK)) {
      const rows = await many<{ id: UUID }>(
        c.sb
          .from('appointments')
          .insert(
            part.map((o) => ({
              organization_id: orgId,
              series_id: series.id,
              child_id: input.childId,
              therapist_id: input.therapistId,
              therapy_type_id: input.therapyTypeId,
              starts_at: o.startsAt,
              ends_at: o.endsAt,
              room: input.room || null,
            })),
          )
          .select('id'),
      );
      created += rows.length;
    }
  } catch (e) {
    // Don't leave half a series behind (appointments.series_id is ON DELETE SET NULL).
    try {
      await done(c.sb.from('appointments').delete().eq('series_id', series.id));
      await done(c.sb.from('appointment_series').delete().eq('id', series.id));
    } catch {
      // the original error is the useful one
    }
    throw e;
  }
  return { seriesId: series.id, created, conflicts };
}

export async function createOne(
  c: AdapterContext,
  input: Omit<SeriesInput, 'weekdays' | 'endDate'> & { makeupOfId?: UUID },
  opts?: { force?: boolean },
): Promise<{ appointment?: Appointment; conflicts: Conflict[] }> {
  validateSeries(input);
  const startsAt = istDateTime(input.startDate, input.startTime);
  const occurrence: Occurrence = { date: input.startDate, startsAt, endsAt: addMinutes(startsAt, input.durationMinutes) };
  const conflicts = await conflictsFor(c, input, [occurrence]);
  if (conflicts.length && !opts?.force) return { conflicts };
  const row = await single<AppointmentRow>(
    c.sb
      .from('appointments')
      .insert({
        organization_id: c.requireOrg(),
        child_id: input.childId,
        therapist_id: input.therapistId,
        therapy_type_id: input.therapyTypeId,
        starts_at: occurrence.startsAt,
        ends_at: occurrence.endsAt,
        room: input.room || null,
        makeup_of_id: input.makeupOfId ?? null,
      })
      .select('*'),
    'appointment',
  );
  return { appointment: appointmentFromRow(row), conflicts };
}

// ---------------------------------------------------------------------------
// Availability & substitution
// ---------------------------------------------------------------------------
export async function listUnavailability(
  c: AdapterContext,
  filter?: { userId?: UUID; from?: string; to?: string },
): Promise<TherapistUnavailability[]> {
  let q = c.sb.from('therapist_unavailability').select('*').eq('organization_id', c.requireOrg());
  if (filter?.userId) q = q.eq('user_id', filter.userId);
  if (filter?.to) q = q.lte('from', filter.to);
  if (filter?.from) q = q.gte('to', filter.from);
  return (await many<TherapistUnavailabilityRow>(q.order('from'))).map(unavailabilityFromRow);
}

/** Scheduled appointments of `userId` inside [from, to] (IST dates) that still need a substitute. */
async function affectedBy(c: AdapterContext, ranges: { userId: UUID; from: string; to: string }[]): Promise<AppointmentView[]> {
  if (ranges.length === 0) return [];
  const nowIso = c.now().toISOString();
  const rows = (
    await Promise.all(
      chunk(ranges, 25).map((part) =>
        many<AppointmentJoinedRow>(
          c.sb
            .from('appointments')
            .select(APPOINTMENT_SELECT)
            .eq('organization_id', c.requireOrg())
            .eq('status', 'scheduled')
            .is('original_therapist_id', null)
            .gte('starts_at', nowIso)
            .or(
              part
                // Timestamps contain ':' (reserved in PostgREST logic trees), so they are quoted.
                .map((r) => `and(therapist_id.eq.${r.userId},starts_at.gte."${istDayBounds(r.from).start}",starts_at.lt."${istDayBounds(r.to).end}")`)
                .join(','),
            )
            .order('starts_at'),
        ),
      ),
    )
  ).flat();
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return hydrateAppointments(c, unique);
}

export async function addUnavailability(
  c: AdapterContext,
  input: Omit<TherapistUnavailability, 'id' | 'organizationId' | 'createdAt'>,
): Promise<{ unavailability: TherapistUnavailability; affected: AppointmentView[] }> {
  if (input.to < input.from) throw new RepoError('validation', 'End date is before start date');
  const row = await single<TherapistUnavailabilityRow>(
    c.sb
      .from('therapist_unavailability')
      .insert({ organization_id: c.requireOrg(), user_id: input.userId, from: input.from, to: input.to, reason: input.reason ?? '' })
      .select('*'),
    'unavailability',
  );
  const affected = await affectedBy(c, [{ userId: row.user_id, from: row.from, to: row.to }]);
  return { unavailability: unavailabilityFromRow(row), affected };
}

export async function removeUnavailability(c: AdapterContext, id: UUID): Promise<void> {
  await single(c.sb.from('therapist_unavailability').delete().eq('id', id).select('id'), 'unavailability');
}

export async function needingSubstitute(c: AdapterContext): Promise<AppointmentView[]> {
  const today = todayIST(c.now());
  const rows = await many<TherapistUnavailabilityRow>(
    c.sb.from('therapist_unavailability').select('*').eq('organization_id', c.requireOrg()).gte('to', today),
  );
  return affectedBy(c, rows.map((r) => ({ userId: r.user_id, from: r.from < today ? today : r.from, to: r.to })));
}

export async function substituteCandidates(
  c: AdapterContext,
  appointmentId: UUID,
): Promise<(Member & { freeAtTime: boolean; knowsChild: boolean })[]> {
  const appt = await single<AppointmentRow>(c.sb.from('appointments').select('*').eq('id', appointmentId), 'appointment');
  const members = (await loadMembers(c, appt.organization_id, ['therapist', 'coordinator', 'school_admin'])).filter(
    (m) => m.membership.status === 'active' && m.profile.id !== appt.therapist_id && m.therapyTypeIds.includes(appt.therapy_type_id),
  );
  const ids = members.map((m) => m.profile.id);
  if (ids.length === 0) return [];
  const day = istDate(appt.starts_at);
  const [busy, away, assigned, worked] = await Promise.all([
    inChunks(ids, (part) =>
      many<{ therapist_id: UUID }>(
        c.sb.from('appointments').select('therapist_id').in('therapist_id', part).neq('status', 'cancelled').neq('id', appt.id).lt('starts_at', appt.ends_at).gt('ends_at', appt.starts_at),
      ),
    ),
    inChunks(ids, (part) =>
      many<{ user_id: UUID }>(c.sb.from('therapist_unavailability').select('user_id').in('user_id', part).lte('from', day).gte('to', day)),
    ),
    inChunks(ids, (part) => many<{ user_id: UUID }>(c.sb.from('child_therapists').select('user_id').eq('child_id', appt.child_id).in('user_id', part))),
    inChunks(ids, (part) =>
      many<{ therapist_id: UUID }>(c.sb.from('sessions').select('therapist_id').eq('child_id', appt.child_id).in('therapist_id', part).limit(1000)),
    ),
  ]);
  const notFree = new Set([...busy.map((b) => b.therapist_id), ...away.map((a) => a.user_id)]);
  const knows = new Set([...assigned.map((a) => a.user_id), ...worked.map((w) => w.therapist_id)]);
  return members
    .map((m) => ({ ...m, freeAtTime: !notFree.has(m.profile.id), knowsChild: knows.has(m.profile.id) }))
    .sort(
      (a, b) =>
        Number(b.freeAtTime) - Number(a.freeAtTime) ||
        Number(b.knowsChild) - Number(a.knowsChild) ||
        Number(a.membership.role !== 'therapist') - Number(b.membership.role !== 'therapist') ||
        a.profile.fullName.localeCompare(b.profile.fullName),
    );
}
