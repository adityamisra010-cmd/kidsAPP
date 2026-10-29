/** Calendar reads (AppointmentView), edits, attendance, brief acknowledgements and reschedules. */
import type { Appointment, AppointmentView, ISODateTime, RescheduleRequest, UUID } from '@/domain/types';

import { RepoError, type AppointmentFilter, type AppointmentsRepo } from '../repository';
import type { AdapterContext } from './context';
import { buildRrule, chunk, istDate, istTime, rruleWeekdays } from './derive-local';
import { rescheduleFromJson } from './mappers-rpc';
import { rescheduleFromRow } from './mappers';
import { done, inChunks, many, rpc, selectAll, single } from './query';
import type { AppointmentJoinedRow, AppointmentRow, AppointmentSeriesRow, RescheduleJson, RescheduleRequestRow } from './rows';
import * as scheduling from './scheduling';
import { APPOINTMENT_SELECT, appointmentViewsByIds, hydrateAppointments } from './views';

const DAY_MS = 86_400_000;

/** Columns written back when moving future occurrences of a series (upsert on id). */
function writableRow(r: AppointmentRow): Omit<AppointmentRow, 'created_at'> {
  const { created_at: _created, ...rest } = r;
  return rest;
}

export async function listAppointments(c: AdapterContext, filter: AppointmentFilter): Promise<AppointmentView[]> {
  const parent = c.isParent();
  const childIds = parent ? (filter.childId ? [filter.childId] : await c.guardianChildIds()) : null;
  if (childIds && childIds.length === 0) return [];
  const org = c.orgOrNull();
  const build = (from: number, to: number, part?: UUID[]) => {
    let q = c.sb.from('appointments').select(APPOINTMENT_SELECT).gte('starts_at', filter.from).lt('starts_at', filter.to);
    if (part) q = q.in('child_id', part);
    if (org) q = q.eq('organization_id', org);
    else if (!part) throw new RepoError('forbidden', 'No school selected');
    if (filter.therapistId) q = q.eq('therapist_id', filter.therapistId);
    if (filter.childId && !part) q = q.eq('child_id', filter.childId);
    if (filter.therapyTypeId) q = q.eq('therapy_type_id', filter.therapyTypeId);
    if (!filter.includeCancelled) q = q.neq('status', 'cancelled');
    return q.order('starts_at').order('id').range(from, to);
  };
  const rows = childIds
    ? await inChunks(childIds, (part) => selectAll<AppointmentJoinedRow>((from, to) => build(from, to, part)))
    : await selectAll<AppointmentJoinedRow>((from, to) => build(from, to));
  rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return hydrateAppointments(c, rows);
}

export async function rescheduleRequests(
  c: AdapterContext,
  filter?: { status?: RescheduleRequest['status'][]; childId?: UUID; ids?: UUID[] },
): Promise<(RescheduleRequest & { appointment: AppointmentView })[]> {
  let q = c.sb.from('reschedule_requests').select(filter?.childId ? '*, appointment:appointments!inner(child_id)' : '*');
  const org = c.orgOrNull();
  if (org) q = q.eq('organization_id', org);
  if (filter?.ids) q = q.in('id', filter.ids);
  if (filter?.status?.length) q = q.in('status', filter.status);
  if (filter?.childId) q = q.eq('appointment.child_id', filter.childId);
  const rows = await many<RescheduleRequestRow>(q.order('created_at', { ascending: false }).limit(200));
  const [names, views] = await Promise.all([c.names(rows.map((r) => r.requested_by)), appointmentViewsByIds(c, rows.map((r) => r.appointment_id))]);
  const byId = new Map(views.map((v) => [v.id, v]));
  return rows
    .filter((r) => byId.has(r.appointment_id))
    .map((r) => ({ ...rescheduleFromRow(r, names.get(r.requested_by) ?? ''), appointment: byId.get(r.appointment_id)! }));
}

export function createAppointmentsRepo(c: AdapterContext): AppointmentsRepo {
  const sb = c.sb;

  async function moveFuture(current: AppointmentRow, patch: Partial<Pick<Appointment, 'startsAt' | 'endsAt' | 'therapistId' | 'room'>>): Promise<void> {
    const rows = await selectAll<AppointmentRow>((from, to) =>
      sb
        .from('appointments')
        .select('*')
        .eq('series_id', current.series_id!)
        .eq('status', 'scheduled')
        .gte('starts_at', current.starts_at)
        .order('starts_at')
        .order('id')
        .range(from, to),
    );
    const newStart = patch.startsAt ?? current.starts_at;
    const shift = Date.parse(newStart) - Date.parse(current.starts_at);
    const newDuration = patch.endsAt ? Date.parse(patch.endsAt) - Date.parse(newStart) : null;
    if (newDuration != null && newDuration <= 0) throw new RepoError('validation', 'End time must be after the start time');
    const updated = rows.map((r) => {
      const starts = Date.parse(r.starts_at) + shift;
      const ends = newDuration != null ? starts + newDuration : Date.parse(r.ends_at) + shift;
      return {
        ...writableRow(r),
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
        therapist_id: patch.therapistId ?? r.therapist_id,
        room: patch.room === undefined ? r.room : patch.room || null,
      };
    });
    for (const part of chunk(updated, 200)) await done(sb.from('appointments').upsert(part, { onConflict: 'id' }));

    // Keep the series template in step so later expansions / imports match.
    const series = await single<AppointmentSeriesRow>(sb.from('appointment_series').select('*').eq('id', current.series_id!), 'series');
    const dayShift = Math.round((Date.parse(`${istDate(newStart)}T00:00:00Z`) - Date.parse(`${istDate(current.starts_at)}T00:00:00Z`)) / DAY_MS);
    const durationMinutes = newDuration != null ? Math.round(newDuration / 60_000) : series.duration_minutes;
    await done(
      sb
        .from('appointment_series')
        .update({
          start_time: istTime(newStart),
          duration_minutes: durationMinutes,
          therapist_id: patch.therapistId ?? series.therapist_id,
          room: patch.room === undefined ? series.room : patch.room || null,
          rrule: dayShift ? buildRrule(rruleWeekdays(series.rrule).map((d) => (((d + dayShift) % 7) + 7) % 7)) : series.rrule,
        })
        .eq('id', series.id),
    );
  }

  return {
    list: (filter) => listAppointments(c, filter),

    async get(id) {
      const [view] = await appointmentViewsByIds(c, [id]);
      if (!view) throw new RepoError('not_found', 'appointment not found');
      return view;
    },

    async upcoming(opts) {
      const limit = Math.min(Math.max(opts?.limit ?? 5, 1), 50);
      let q = sb.from('appointments').select(APPOINTMENT_SELECT).eq('status', 'scheduled').gt('ends_at', c.now().toISOString());
      if (c.isParent()) {
        const ids = opts?.childId ? [opts.childId] : await c.guardianChildIds();
        if (ids.length === 0) return [];
        q = q.in('child_id', ids);
      } else {
        q = q.eq('organization_id', c.requireOrg());
        q = opts?.childId ? q.eq('child_id', opts.childId) : q.eq('therapist_id', c.requireUserId());
      }
      return hydrateAppointments(c, await many<AppointmentJoinedRow>(q.order('starts_at').limit(limit)));
    },

    checkConflicts: (input) => scheduling.checkConflicts(c, input),
    createSeries: (input, opts) => scheduling.createSeries(c, input, opts),
    createOne: (input, opts) => scheduling.createOne(c, input, opts),

    async update(id, patch, scope) {
      const current = await single<AppointmentRow>(sb.from('appointments').select('*').eq('id', id), 'appointment');
      if (scope === 'future' && current.series_id) return moveFuture(current, patch);
      const values: Record<string, unknown> = {};
      if (patch.startsAt && patch.startsAt !== current.starts_at) values.starts_at = patch.startsAt;
      if (patch.endsAt && patch.endsAt !== current.ends_at) values.ends_at = patch.endsAt;
      if ('starts_at' in values || 'ends_at' in values) values.was_rescheduled = true;
      if (patch.therapistId) values.therapist_id = patch.therapistId;
      if (patch.room !== undefined) values.room = patch.room || null;
      if (Object.keys(values).length) await single(sb.from('appointments').update(values).eq('id', id).select('id'), 'appointment');
    },

    async cancel(id, by, reason) {
      await single(
        sb
          .from('appointments')
          .update({ status: 'cancelled', attendance: by === 'school' ? 'cancelled_by_school' : 'cancelled_by_parent', cancel_reason: reason.trim() || null })
          .eq('id', id)
          .select('id'),
        'appointment',
      );
    },

    async markAttendance(id, attendance, lateMinutes) {
      const values: Record<string, unknown> = {
        attendance,
        late_minutes: attendance === 'late' ? Math.max(0, Math.round(lateMinutes ?? 0)) : null,
      };
      if (attendance === 'absent') values.status = 'completed';
      // Only coordinators/admins may cancel; a therapist's guard allows attendance + completion.
      if ((attendance === 'cancelled_by_school' || attendance === 'cancelled_by_parent') && c.isOrgAdmin()) values.status = 'cancelled';
      await single(sb.from('appointments').update(values).eq('id', id).select('id'), 'appointment');
    },

    async acknowledgeBrief(id) {
      await done(
        sb
          .from('brief_acknowledgements')
          .upsert({ user_id: c.requireUserId(), appointment_id: id }, { onConflict: 'user_id,appointment_id', ignoreDuplicates: true }),
      );
    },

    async requestReschedule(appointmentId, proposedSlots, reason) {
      const r = await rpc<RescheduleJson>(sb, 'request_reschedule', { appointment_id: appointmentId, proposed_slots: proposedSlots, reason });
      return rescheduleFromJson(r);
    },

    listRescheduleRequests: (filter) => rescheduleRequests(c, filter),

    async resolveRescheduleRequest(id, action) {
      return rescheduleFromJson(await rpc<RescheduleJson>(sb, 'resolve_reschedule', { request_id: id, action }));
    },

    async acceptCounter(id, slot: ISODateTime) {
      return rescheduleFromJson(await rpc<RescheduleJson>(sb, 'resolve_reschedule', { request_id: id, action: { type: 'accept_counter', slot } }));
    },

    listUnavailability: (filter) => scheduling.listUnavailability(c, filter),
    addUnavailability: (input) => scheduling.addUnavailability(c, input),
    removeUnavailability: (id) => scheduling.removeUnavailability(c, id),
    needingSubstitute: () => scheduling.needingSubstitute(c),
    substituteCandidates: (appointmentId) => scheduling.substituteCandidates(c, appointmentId),

    async assignSubstitute(appointmentId, therapistId) {
      await rpc(sb, 'assign_substitute', { appointment_id: appointmentId, therapist_id: therapistId });
    },
  };
}
