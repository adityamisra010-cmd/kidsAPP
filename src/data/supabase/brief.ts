/**
 * Handover Brief: handover_brief() (authorisation, profile without clinical for substitutes,
 * plan, goals with stats, last 3 sessions, chips, check-in, home practice, alerts) plus the
 * hydrated AppointmentView and the caller's ChildAccess, fetched concurrently.
 */
import { ageLabel } from '@/lib/dates';
import type { AppointmentView, ChildAccess, HandoverBrief, UUID } from '@/domain/types';

import { RepoError } from '../repository';
import type { AdapterContext } from './context';
import { displayStatus, logState } from './derive-local';
import {
  alertFromCamel,
  appointmentFromCamel,
  checkinFromCamel,
  childFromCamel,
  childProfileFromCamel,
  goalWithStatsFromJson,
  homeLogFromCamel,
  homeTaskFromCamel,
  sessionSummaryFromJson,
} from './mappers-rpc';
import { arr } from './mappers';
import { rpc } from './query';
import type { CamelRow, HandoverBriefJson } from './rows';
import { appointmentViewsByIds } from './views';


function str(o: CamelRow, k: string): string | undefined {
  const v = o[k];
  return typeof v === 'string' && v ? v : undefined;
}

/** View from the brief's own appointment payload when the calendar row is not readable. */
function viewFromBrief(j: HandoverBriefJson, now: Date): AppointmentView {
  const a = appointmentFromCamel(j.appointment);
  return {
    ...a,
    childName: str(j.appointment, 'childName') ?? '',
    childPhotoUrl: str(j.appointment, 'childPhotoUrl'),
    therapistName: str(j.appointment, 'therapistName') ?? '',
    originalTherapistName: str(j.appointment, 'originalTherapistName'),
    therapyTypeName: str(j.appointment, 'therapyTypeName') ?? '',
    therapyTypeColor: str(j.appointment, 'therapyTypeColor') ?? '',
    therapyTypeIcon: str(j.appointment, 'therapyTypeIcon') ?? 'circle',
    displayStatus: displayStatus(a),
    logState: logState(a, false, now),
    isSubstitute: j.appointment.isSubstitute === true,
    briefRequired: j.mustAcknowledge,
    briefAcknowledged: j.acknowledged,
    hasCheckin: !!j.todaysCheckin,
  };
}

/** Pure mapping of the RPC payload (exported for tests). */
export function briefFromJson(j: HandoverBriefJson, view: AppointmentView, access: ChildAccess): HandoverBrief {
  const child = childFromCamel(j.child);
  const childName = child.preferredName || child.fullName;
  return {
    appointment: { ...view, briefRequired: j.mustAcknowledge, briefAcknowledged: j.acknowledged },
    child,
    ageLabel: child.dob ? ageLabel(child.dob) : '',
    profile: childProfileFromCamel(j.profile ?? {}, child.id),
    planForToday: j.planForToday
      ? { text: j.planForToday.text ?? '', goalIds: arr(j.planForToday.goalIds), byName: j.planForToday.byName ?? '', date: j.planForToday.date }
      : undefined,
    goals: arr(j.goals).map(goalWithStatsFromJson),
    recentSessions: arr(j.recentSessions).map(sessionSummaryFromJson),
    whatWorked: arr(j.whatWorked),
    whatDidnt: arr(j.whatDidnt),
    todaysCheckin: j.todaysCheckin ? checkinFromCamel(j.todaysCheckin) : undefined,
    openHomeTasks: arr(j.openHomeTasks).map(homeTaskFromCamel),
    latestParentFeedback: j.latestParentFeedback ? homeLogFromCamel(j.latestParentFeedback, childName) : undefined,
    activeAlerts: arr(j.activeAlerts).map((a) => alertFromCamel(a, childName)),
    mustAcknowledge: j.mustAcknowledge,
    acknowledged: j.acknowledged,
    access,
  };
}

export async function loadBrief(c: AdapterContext, appointmentId: UUID): Promise<HandoverBrief> {
  if (c.isParent()) throw new RepoError('forbidden', 'The Handover Brief is for staff');
  const briefP = rpc<HandoverBriefJson | null>(c.sb, 'handover_brief', { appointment_id: appointmentId });
  const viewsP = appointmentViewsByIds(c, [appointmentId]);
  // child_access needs the child id; start it as soon as the appointment row is in.
  const accessP = viewsP.then((v) => (v[0] ? rpc<ChildAccess | null>(c.sb, 'child_access', { child_id: v[0].childId }) : null));
  const [j, views, access] = await Promise.all([briefP, viewsP, accessP]);
  if (!j) throw new RepoError('not_found', 'appointment not found');
  const resolvedAccess: ChildAccess =
    access ?? (await rpc<ChildAccess | null>(c.sb, 'child_access', { child_id: String(j.child.id ?? '') })) ?? 'brief_only';
  return briefFromJson(j, views[0] ?? viewFromBrief(j, c.now()), resolvedAccess);
}
