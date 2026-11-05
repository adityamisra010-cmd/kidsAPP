/**
 * AppointmentView assembly. One select brings the appointment rows with child / therapy type /
 * therapist names embedded; a fixed number of batched queries (sessions, brief acks, check-ins,
 * open reschedule requests, therapist assignments, prior sessions) fill in the rest, regardless
 * of how many appointments are listed. No per-row queries.
 */
import type { AppointmentView, UUID } from '@/domain/types';

import type { AdapterContext } from './context';
import { displayStatus, isSubstitute, logState, type AssignmentLite } from './derive-local';
import { appointmentFromRow } from './mappers';
import { inChunks, many, selectAll, type QueryResult } from './query';
import type { AppointmentJoinedRow, ChildTherapistRow } from './rows';

/** Select list for AppointmentView rows. FK hints disambiguate the two profile references. */
export const APPOINTMENT_SELECT =
  '*, child:children(full_name,preferred_name,photo_url), therapy_type:therapy_types(name,color,icon,key), ' +
  'therapist:profiles!appointments_therapist_id_fkey(full_name,avatar_url), ' +
  'original_therapist:profiles!appointments_original_therapist_id_fkey(full_name)';

interface Extras {
  sessionByAppt: Map<UUID, UUID>;
  acked: Set<UUID>;
  checkedIn: Set<UUID>;
  rescheduleByAppt: Map<UUID, UUID>;
  assignments: AssignmentLite[];
  /** Children the current therapist has logged before. */
  knownChildren: Set<UUID>;
}

async function loadExtras(c: AdapterContext, rows: AppointmentJoinedRow[]): Promise<Extras> {
  const sb = c.sb;
  const ids = rows.map((r) => r.id);
  const childIds = [...new Set(rows.map((r) => r.child_id))];
  const uid = c.userId();
  const parent = c.isParent();

  const [sessions, acks, checkins, reschedules, assignments] = await Promise.all([
    parent
      ? Promise.resolve([] as { id: UUID; appointment_id: UUID }[])
      : inChunks(ids, (part) => many<{ id: UUID; appointment_id: UUID }>(sb.from('sessions').select('id,appointment_id').in('appointment_id', part))),
    uid && !parent
      ? inChunks(ids, (part) =>
          many<{ appointment_id: UUID }>(sb.from('brief_acknowledgements').select('appointment_id').eq('user_id', uid).in('appointment_id', part)),
        )
      : Promise.resolve([] as { appointment_id: UUID }[]),
    inChunks(ids, (part) => many<{ appointment_id: UUID }>(sb.from('parent_checkins').select('appointment_id').in('appointment_id', part))),
    inChunks(ids, (part) =>
      many<{ id: UUID; appointment_id: UUID }>(
        sb.from('reschedule_requests').select('id,appointment_id').in('appointment_id', part).in('status', ['pending', 'countered']).order('created_at', { ascending: false }),
      ),
    ),
    inChunks(childIds, (part) =>
      many<Pick<ChildTherapistRow, 'child_id' | 'user_id' | 'active_from' | 'active_to'>>(
        sb.from('child_therapists').select('child_id,user_id,active_from,active_to').in('child_id', part),
      ),
    ),
  ]);

  const sessionByAppt = new Map(sessions.map((s) => [s.appointment_id, s.id]));
  const assignmentList: AssignmentLite[] = assignments.map((a) => ({ childId: a.child_id, userId: a.user_id, activeFrom: a.active_from, activeTo: a.active_to }));

  // "New to the child" only matters for the current therapist's own, not-yet-logged sessions.
  const knownChildren = new Set<UUID>();
  if (uid && !parent) {
    const candidates = [
      ...new Set(
        rows
          .filter((r) => r.therapist_id === uid && r.status !== 'cancelled' && !sessionByAppt.has(r.id))
          .filter((r) => !isSubstitute(appointmentFromRow(r), assignmentList))
          .map((r) => r.child_id),
      ),
    ];
    if (candidates.length) {
      const prior = await inChunks(candidates, (part) =>
        selectAll<{ child_id: UUID }>((from, to) =>
          sb.from('sessions').select('child_id').eq('therapist_id', uid).in('child_id', part).order('id').range(from, to) as PromiseLike<QueryResult>,
        ),
      );
      for (const p of prior) knownChildren.add(p.child_id);
    }
  }

  return {
    sessionByAppt,
    acked: new Set(acks.map((a) => a.appointment_id)),
    checkedIn: new Set(checkins.map((x) => x.appointment_id)),
    rescheduleByAppt: new Map(reschedules.reverse().map((r) => [r.appointment_id, r.id])),
    assignments: assignmentList,
    knownChildren,
  };
}

/** Pure assembly of one view from a joined row and the batched extras. */
export function buildView(r: AppointmentJoinedRow, x: Extras, uid: UUID | null, now: Date): AppointmentView {
  const a = appointmentFromRow(r);
  const sessionId = x.sessionByAppt.get(r.id);
  const substitute = isSubstitute(a, x.assignments);
  const mine = !!uid && r.therapist_id === uid;
  const briefRequired = mine && !sessionId && r.status !== 'cancelled' && (substitute || !x.knownChildren.has(r.child_id));
  const view: AppointmentView = {
    ...a,
    childName: r.child?.full_name ?? '',
    childPhotoUrl: r.child?.photo_url ?? undefined,
    therapistName: r.therapist?.full_name ?? '',
    therapistAvatarUrl: r.therapist?.avatar_url ?? undefined,
    originalTherapistName: r.original_therapist_id ? (r.original_therapist?.full_name ?? '') : undefined,
    therapyTypeName: r.therapy_type?.name ?? '',
    therapyTypeColor: r.therapy_type?.color ?? '',
    therapyTypeIcon: r.therapy_type?.icon ?? 'circle',
    displayStatus: displayStatus(a),
    logState: logState(a, !!sessionId, now),
    sessionId,
    isSubstitute: substitute,
    briefRequired,
    briefAcknowledged: x.acked.has(r.id),
    hasCheckin: x.checkedIn.has(r.id),
    pendingRescheduleRequestId: x.rescheduleByAppt.get(r.id),
  };
  return view;
}

/** Hydrates joined appointment rows into AppointmentViews (order preserved). */
export async function hydrateAppointments(c: AdapterContext, rows: AppointmentJoinedRow[]): Promise<AppointmentView[]> {
  if (rows.length === 0) return [];
  const extras = await loadExtras(c, rows);
  const uid = c.userId();
  const now = c.now();
  return rows.map((r) => buildView(r, extras, uid, now));
}

/** Loads and hydrates appointments by id, returned in the order of `ids` (missing ids skipped). */
export async function appointmentViewsByIds(c: AdapterContext, ids: UUID[]): Promise<AppointmentView[]> {
  const rows = await inChunks(ids, (part) => many<AppointmentJoinedRow>(c.sb.from('appointments').select(APPOINTMENT_SELECT).in('id', part)));
  const views = await hydrateAppointments(c, rows);
  const byId = new Map(views.map((v) => [v.id, v]));
  return ids.map((id) => byId.get(id)).filter((v): v is AppointmentView => !!v);
}
