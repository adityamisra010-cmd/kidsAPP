/**
 * Local reminder planning (pure). Works without a server: from the user's upcoming appointments
 * and the school's settings we compute exactly which notifications should exist on this phone.
 *
 * - Parents: a reminder per session at each `reminderHoursBefore` (default 24 h and 1 h).
 * - Therapists: one calm morning agenda per working day, plus a reminder before sessions where
 *   they must read the Handover Brief (substitute or new to the child). Per-session reminders for
 *   a full caseload would mean 15+ pings a day, so the agenda replaces them.
 * - Quiet hours are respected (reminders move to 8 AM or to the evening before).
 */
import type { AppointmentView, NotificationKind, OrgSettings, Role } from '@/domain/types';
import { parse, toISODate } from '@/lib/dates';

import { adjustForQuietHours, clockToMinutes } from './quietHours';

export type ReminderAppointment = Pick<
  AppointmentView,
  'id' | 'startsAt' | 'status' | 'childName' | 'therapyTypeName' | 'therapistName' | 'briefRequired' | 'briefAcknowledged' | 'isSubstitute'
>;

interface Base {
  /** Stable identifier, also used as the OS notification identifier. */
  id: string;
  fireAt: Date;
  /** Route opened when the notification is tapped. */
  route: string;
  /** Which user setting can silence it. */
  muteKind: NotificationKind;
}

export interface SessionReminder extends Base {
  type: 'session';
  appointmentId: string;
  hoursBefore: number;
  startsAt: Date;
  childName: string;
  therapyTypeName: string;
  therapistName: string;
}

export interface BriefReminder extends Base {
  type: 'brief';
  appointmentId: string;
  startsAt: Date;
  childName: string;
  therapyTypeName: string;
  isSubstitute: boolean;
}

export interface AgendaReminder extends Base {
  type: 'agenda';
  date: string;
  count: number;
  firstAt: Date;
  firstChildName: string;
}

export type PlannedReminder = SessionReminder | BriefReminder | AgendaReminder;

export interface PlanInput {
  appointments: ReminderAppointment[];
  role: Role;
  settings: Pick<OrgSettings, 'reminderHoursBefore' | 'dailyAgendaTime' | 'quietHours'>;
  muted: NotificationKind[];
  now: Date;
  /** How far ahead to schedule (default 7 days). */
  horizonHours?: number;
}

/** iOS keeps at most 64 pending local notifications; stay well under on every platform. */
export const MAX_SCHEDULED = 60;
/** Two reminders for one session closer than this are merged (keep the later one). */
const MERGE_WINDOW_MS = 30 * 60_000;
export const ID_PREFIX = 'mkt.';

const HOUR = 3_600_000;

function upcomingWithin(appts: ReminderAppointment[], now: Date, horizonHours: number): ReminderAppointment[] {
  const end = now.getTime() + horizonHours * HOUR;
  return appts
    .filter((a) => a.status !== 'cancelled')
    .filter((a) => {
      const t = parse(a.startsAt).getTime();
      return t > now.getTime() && t <= end;
    })
    .sort((a, b) => parse(a.startsAt).getTime() - parse(b.startsAt).getTime());
}

function sessionReminders(a: ReminderAppointment, input: PlanInput): SessionReminder[] {
  const startsAt = parse(a.startsAt);
  const hours = Array.from(new Set(input.settings.reminderHoursBefore.filter((h) => h > 0)));
  const candidates: SessionReminder[] = [];
  for (const h of hours) {
    const fireAt = adjustForQuietHours(new Date(startsAt.getTime() - h * HOUR), input.settings.quietHours, startsAt);
    if (!fireAt || fireAt.getTime() <= input.now.getTime() || fireAt.getTime() >= startsAt.getTime()) continue;
    candidates.push({
      type: 'session',
      id: `${ID_PREFIX}session.${a.id}.${h}`,
      fireAt,
      route: `/appointment/${a.id}`,
      muteKind: 'appointment_reminder',
      appointmentId: a.id,
      hoursBefore: h,
      startsAt,
      childName: a.childName,
      therapyTypeName: a.therapyTypeName,
      therapistName: a.therapistName,
    });
  }
  candidates.sort((x, y) => x.fireAt.getTime() - y.fireAt.getTime());
  const out: SessionReminder[] = [];
  for (const c of candidates) {
    const prev = out[out.length - 1];
    // Two reminders landing close together (often after a quiet-hours move): keep the later one.
    if (prev && c.fireAt.getTime() - prev.fireAt.getTime() < MERGE_WINDOW_MS) out.pop();
    out.push(c);
  }
  return out;
}

function briefReminder(a: ReminderAppointment, input: PlanInput): BriefReminder | null {
  if (!a.briefRequired || a.briefAcknowledged) return null;
  const startsAt = parse(a.startsAt);
  const lead = Math.min(...input.settings.reminderHoursBefore.filter((h) => h > 0), 1);
  const fireAt = adjustForQuietHours(new Date(startsAt.getTime() - lead * HOUR), input.settings.quietHours, startsAt);
  if (!fireAt || fireAt.getTime() <= input.now.getTime() || fireAt.getTime() >= startsAt.getTime()) return null;
  return {
    type: 'brief',
    id: `${ID_PREFIX}brief.${a.id}`,
    fireAt,
    route: `/brief/${a.id}`,
    muteKind: 'appointment_reminder',
    appointmentId: a.id,
    startsAt,
    childName: a.childName,
    therapyTypeName: a.therapyTypeName,
    isSubstitute: a.isSubstitute,
  };
}

function agendaReminders(appts: ReminderAppointment[], input: PlanInput): AgendaReminder[] {
  const agendaMinutes = clockToMinutes(input.settings.dailyAgendaTime) ?? 8 * 60;
  const byDay = new Map<string, ReminderAppointment[]>();
  for (const a of appts) {
    const day = toISODate(parse(a.startsAt));
    byDay.set(day, [...(byDay.get(day) ?? []), a]);
  }
  const out: AgendaReminder[] = [];
  for (const [date, list] of byDay) {
    const at = parse(date);
    at.setHours(Math.floor(agendaMinutes / 60), agendaMinutes % 60, 0, 0);
    const fireAt = adjustForQuietHours(at, input.settings.quietHours);
    if (!fireAt || fireAt.getTime() <= input.now.getTime()) continue;
    const first = list[0];
    out.push({
      type: 'agenda',
      id: `${ID_PREFIX}agenda.${date}`,
      fireAt,
      route: '/therapist/today',
      muteKind: 'daily_agenda',
      date,
      count: list.length,
      firstAt: parse(first.startsAt),
      firstChildName: first.childName,
    });
  }
  return out;
}

export function planReminders(input: PlanInput): PlannedReminder[] {
  const appts = upcomingWithin(input.appointments, input.now, input.horizonHours ?? 7 * 24);
  let plan: PlannedReminder[] = [];
  if (input.role === 'parent') {
    plan = appts.flatMap((a) => sessionReminders(a, input));
  } else if (input.role === 'therapist') {
    plan = [...agendaReminders(appts, input), ...appts.map((a) => briefReminder(a, input)).filter((r): r is BriefReminder => !!r)];
  }
  return plan
    .filter((r) => !input.muted.includes(r.muteKind))
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, MAX_SCHEDULED);
}

/**
 * What to change on the device to go from the previously scheduled set to the new one.
 * `previous` maps identifier → signature (fire time + text), so unchanged reminders are left alone.
 */
export function diffSchedule(
  previous: Record<string, string>,
  next: { id: string; signature: string }[],
): { cancel: string[]; schedule: string[] } {
  const nextMap = new Map(next.map((n) => [n.id, n.signature]));
  const cancel = Object.keys(previous).filter((id) => nextMap.get(id) !== previous[id]);
  const schedule = next.filter((n) => previous[n.id] !== n.signature).map((n) => n.id);
  return { cancel, schedule };
}
