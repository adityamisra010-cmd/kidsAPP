/**
 * Which actions an appointment offers, per role (PROMPT.md §3 + §4.4).
 * Pure so the rules are tested once and every screen shows the same buttons.
 */
import { endOfDay, isSameDay } from 'date-fns';

import { ADMIN_ROLES, type AppointmentView, type Role, type UUID } from '@/domain/types';
import { parse } from '@/lib/dates';

import { isCancelled } from './marking';

export type AppointmentAction =
  // parent
  | 'checkin'
  | 'request_change'
  | 'cant_make_it'
  | 'view_summary'
  // therapist (and admins)
  | 'open_brief'
  | 'log_session'
  | 'view_log'
  | 'mark_attendance'
  // coordinator / school admin
  | 'change_time'
  | 'assign_substitute'
  | 'cancel_by_school'
  | 'book_makeup';

export interface ActionState {
  id: AppointmentAction;
  /** Present when the action is shown but cannot be used yet. */
  disabledReason?: 'brief_first';
}

export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isMissed(a: Pick<AppointmentView, 'status' | 'attendance'>): boolean {
  return isCancelled(a) || a.attendance === 'absent';
}

/** Still on the books and not finished. */
export function isOpen(a: AppointmentView, now: Date): boolean {
  return a.status === 'scheduled' && !isMissed(a) && parse(a.endsAt).getTime() > now.getTime();
}

export function appointmentActions(role: Role, a: AppointmentView, userId: UUID, now: Date): ActionState[] {
  const out: ActionState[] = [];
  const starts = parse(a.startsAt);
  const notStarted = starts.getTime() > now.getTime();
  const open = isOpen(a, now);
  const missed = isMissed(a);
  const startedByEndOfToday = starts.getTime() <= endOfDay(now).getTime();

  if (role === 'parent') {
    if (open && isSameDay(starts, now) && !a.hasCheckin) out.push({ id: 'checkin' });
    if (a.sessionId) out.push({ id: 'view_summary' });
    if (open && notStarted && !a.pendingRescheduleRequestId) out.push({ id: 'request_change' });
    if (open && notStarted) out.push({ id: 'cant_make_it' });
    return out;
  }

  if (role !== 'therapist' && !isAdminRole(role)) return out;
  const admin = isAdminRole(role);
  const mine = a.therapistId === userId;

  if (!missed && !a.sessionId) out.push({ id: 'open_brief' });
  if (a.sessionId) out.push({ id: 'view_log' });
  else if (mine && !missed && startedByEndOfToday) {
    out.push(a.briefRequired && !a.briefAcknowledged ? { id: 'log_session', disabledReason: 'brief_first' } : { id: 'log_session' });
  }
  if ((mine || admin) && a.status !== 'cancelled' && startedByEndOfToday) out.push({ id: 'mark_attendance' });

  if (admin) {
    if (open) out.push({ id: 'change_time' }, { id: 'assign_substitute' }, { id: 'cancel_by_school' });
    if (missed) out.push({ id: 'book_makeup' });
  }
  return out;
}

export type StartsIn = { kind: 'now' } | { kind: 'minutes'; value: number } | { kind: 'hours'; value: number } | null;

/** "Starts in 2 hrs" on the day of the session; "Happening now" while it runs; otherwise null. */
export function startsIn(a: Pick<AppointmentView, 'startsAt' | 'endsAt'>, now: Date): StartsIn {
  const start = parse(a.startsAt);
  const end = parse(a.endsAt);
  if (now >= start && now < end) return { kind: 'now' };
  if (start <= now || !isSameDay(start, now)) return null;
  const minutes = Math.ceil((start.getTime() - now.getTime()) / 60_000);
  if (minutes < 60) return { kind: 'minutes', value: Math.max(1, minutes) };
  return { kind: 'hours', value: Math.round(minutes / 60) };
}
