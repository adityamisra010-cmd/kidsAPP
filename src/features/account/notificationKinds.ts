/**
 * Which notification kinds each role can receive, how they are grouped on the settings screen,
 * and the mute rules (pure). Schedule changes can never be muted.
 */
import { UNMUTABLE_NOTIFICATION_KINDS, type NotificationKind, type Role } from '@/domain/types';

export type NotificationGroupKey = 'schedule' | 'sessions' | 'practice' | 'messages' | 'announcements';

const STAFF: Role[] = ['school_admin', 'coordinator', 'therapist'];
const ADMINS: Role[] = ['school_admin', 'coordinator'];
const EVERYONE_IN_SCHOOL: Role[] = ['parent', ...STAFF];

const GROUPS: { key: NotificationGroupKey; kinds: { kind: NotificationKind; roles: Role[] }[] }[] = [
  {
    key: 'schedule',
    kinds: [
      { kind: 'appointment_reminder', roles: ['parent', 'therapist'] },
      { kind: 'daily_agenda', roles: ['therapist'] },
      { kind: 'appointment_changed', roles: EVERYONE_IN_SCHOOL },
      { kind: 'substitute_assigned', roles: EVERYONE_IN_SCHOOL },
      { kind: 'reschedule_request', roles: ADMINS },
      { kind: 'reschedule_response', roles: ['parent'] },
    ],
  },
  {
    key: 'sessions',
    kinds: [
      { kind: 'session_summary', roles: ['parent'] },
      { kind: 'unlogged_session', roles: STAFF },
      { kind: 'child_alert', roles: ADMINS },
    ],
  },
  {
    key: 'practice',
    kinds: [
      { kind: 'home_task_assigned', roles: ['parent'] },
      { kind: 'home_log_submitted', roles: ['therapist'] },
      { kind: 'home_log_feedback', roles: ['parent'] },
    ],
  },
  { key: 'messages', kinds: [{ kind: 'new_message', roles: EVERYONE_IN_SCHOOL }] },
  { key: 'announcements', kinds: [{ kind: 'announcement', roles: EVERYONE_IN_SCHOOL }] },
];

export interface NotificationGroup {
  key: NotificationGroupKey;
  kinds: NotificationKind[];
}

/** Groups (in display order) with only the kinds this role receives; empty groups are dropped. */
export function notificationGroupsFor(role: Role): NotificationGroup[] {
  return GROUPS.map((g) => ({ key: g.key, kinds: g.kinds.filter((k) => k.roles.includes(role)).map((k) => k.kind) })).filter(
    (g) => g.kinds.length > 0,
  );
}

export function isLockedKind(kind: NotificationKind): boolean {
  return UNMUTABLE_NOTIFICATION_KINDS.includes(kind);
}

/** Removes duplicates and kinds that can't be muted. */
export function sanitizeMuted(muted: NotificationKind[]): NotificationKind[] {
  return Array.from(new Set(muted)).filter((k) => !isLockedKind(k));
}

/** Next muted list after flipping one switch. Locked kinds always stay on. */
export function setKindEnabled(muted: NotificationKind[], kind: NotificationKind, enabled: boolean): NotificationKind[] {
  const clean = sanitizeMuted(muted);
  if (isLockedKind(kind)) return clean;
  if (enabled) return clean.filter((k) => k !== kind);
  return clean.includes(kind) ? clean : [...clean, kind];
}

export function isKindEnabled(muted: NotificationKind[], kind: NotificationKind): boolean {
  return isLockedKind(kind) || !muted.includes(kind);
}
