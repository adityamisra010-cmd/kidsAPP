/** Appointment status chips, therapist log state, brief requirement and the joined view. */
import type {
  Appointment,
  AppointmentDisplayStatus,
  AppointmentView,
  Child,
  ISODateTime,
  LogState,
  Profile,
  TherapyType,
  UUID,
} from '../types';

type ApptState = Pick<Appointment, 'status' | 'attendance'>;

export function isCancelled(a: ApptState): boolean {
  return a.status === 'cancelled' || a.attendance === 'cancelled_by_school' || a.attendance === 'cancelled_by_parent';
}

export function isAttended(a: ApptState): boolean {
  return a.attendance === 'present' || a.attendance === 'late';
}

/** Cancelled or absent: no session can be logged. */
export function isMissed(a: ApptState): boolean {
  return isCancelled(a) || a.attendance === 'absent';
}

/** Epoch ms of a full ISO timestamp (native parsing; these always carry an offset). */

/** Epoch ms of a full ISO timestamp (native parsing; these always carry an offset). */
const ms = (iso: ISODateTime) => Date.parse(iso);

export function appointmentDisplayStatus(a: Appointment, now: Date): AppointmentDisplayStatus {
  if (isCancelled(a)) return 'cancelled';
  if (a.attendance === 'absent') return 'absent';
  if (a.status === 'completed' || (isAttended(a) && ms(a.endsAt) <= now.getTime())) return 'completed';
  if (a.makeupOfId) return 'makeup';
  if (a.originalTherapistId) return 'substitute';
  if (a.wasRescheduled) return 'rescheduled';
  return 'confirmed';
}

export function appointmentLogState(a: Appointment, hasSession: boolean, now: Date): LogState {
  if (isMissed(a)) return 'not_applicable';
  if (hasSession) return 'logged';
  const t = now.getTime();
  if (t < ms(a.startsAt)) return 'upcoming';
  if (t < ms(a.endsAt)) return 'in_progress';
  return 'not_logged';
}

/** Attended (or unmarked) and ended without a log. */
export function isUnlogged(a: Appointment, hasSession: boolean, now: Date): boolean {
  return !hasSession && !isMissed(a) && a.status !== 'completed' && ms(a.endsAt) <= now.getTime();
}

export interface BriefViewer {
  userId: UUID;
  /** Viewer is an active assigned therapist of the child for this therapy type. */
  assignedToChild: boolean;
  /** Viewer has logged at least one earlier session with the child. */
  hasWorkedWithChild: boolean;
}

/** The brief is mandatory for the appointment's therapist when they are a substitute or new to the child. */
export function isBriefRequired(a: Appointment, viewer: BriefViewer, hasSession: boolean): boolean {
  if (a.therapistId !== viewer.userId || hasSession || isMissed(a)) return false;
  return Boolean(a.originalTherapistId) || !viewer.assignedToChild || !viewer.hasWorkedWithChild;
}

export interface AppointmentViewInput {
  appointment: Appointment;
  child: Pick<Child, 'fullName' | 'photoUrl'>;
  therapist: Pick<Profile, 'fullName' | 'avatarUrl'>;
  originalTherapist?: Pick<Profile, 'fullName'>;
  therapyType: Pick<TherapyType, 'name' | 'color' | 'icon'>;
  sessionId?: UUID;
  viewer: BriefViewer;
  briefAcknowledged: boolean;
  hasCheckin: boolean;
  pendingRescheduleRequestId?: UUID;
  now: Date;
}

export function buildAppointmentView(i: AppointmentViewInput): AppointmentView {
  const a = i.appointment;
  const hasSession = Boolean(i.sessionId);
  return {
    ...a,
    childName: i.child.fullName,
    childPhotoUrl: i.child.photoUrl,
    therapistName: i.therapist.fullName,
    therapistAvatarUrl: i.therapist.avatarUrl,
    originalTherapistName: i.originalTherapist?.fullName,
    therapyTypeName: i.therapyType.name,
    therapyTypeColor: i.therapyType.color,
    therapyTypeIcon: i.therapyType.icon,
    displayStatus: appointmentDisplayStatus(a, i.now),
    logState: appointmentLogState(a, hasSession, i.now),
    sessionId: i.sessionId,
    isSubstitute: Boolean(a.originalTherapistId),
    briefRequired: isBriefRequired(a, i.viewer, hasSession),
    briefAcknowledged: i.briefAcknowledged,
    hasCheckin: i.hasCheckin,
    pendingRescheduleRequestId: i.pendingRescheduleRequestId,
  };
}
