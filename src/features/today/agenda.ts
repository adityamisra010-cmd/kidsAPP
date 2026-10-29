/**
 * Pure helpers for the therapist "Today" agenda: ordering, current/next detection, filters and
 * which logging action each session card offers.
 */
import type { AppointmentView, ISODate, UUID } from '@/domain/types';
import { parse, toISODate } from '@/lib/dates';

/** Time order; same start time falls back to the child's name so the list never jumps around. */
export function sortAgenda(list: AppointmentView[]): AppointmentView[] {
  return [...list].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.childName.localeCompare(b.childName));
}

/** A session that will (or did) actually happen: not cancelled, child not marked absent. */
export function isHappening(a: AppointmentView): boolean {
  if (a.status === 'cancelled') return false;
  return a.attendance == null || a.attendance === 'present' || a.attendance === 'late';
}

export interface AgendaFocus {
  /** Session running right now (by clock or marked in progress). */
  currentId?: UUID;
  /** First session still to start. */
  nextId?: UUID;
}

export function findFocus(list: AppointmentView[], now: Date = new Date()): AgendaFocus {
  const t = now.getTime();
  const live = sortAgenda(list).filter(isHappening);
  const current = live.find((a) => {
    if (a.logState === 'logged') return false;
    const start = Date.parse(a.startsAt);
    const end = Date.parse(a.endsAt);
    return a.logState === 'in_progress' || (start <= t && t < end);
  });
  const next = live.find((a) => a.id !== current?.id && Date.parse(a.startsAt) > t && a.logState !== 'logged');
  return { currentId: current?.id, nextId: next?.id };
}

export type AgendaFilter = 'all' | 'not_logged';

export function filterAgenda(list: AppointmentView[], filter: AgendaFilter): AppointmentView[] {
  const sorted = sortAgenda(list);
  return filter === 'not_logged' ? sorted.filter((a) => a.logState === 'not_logged') : sorted;
}

/** What the card's main button does. `log_blocked`: substitute/new therapist must read the brief first. */
export type LogAction = 'log' | 'log_blocked' | 'view_log' | 'none';

export function logAction(a: AppointmentView): LogAction {
  if (a.logState === 'logged') return a.sessionId ? 'view_log' : 'none';
  if (!isHappening(a) || a.logState === 'not_applicable') return 'none';
  if (a.briefRequired && !a.briefAcknowledged) return 'log_blocked';
  return 'log';
}

export interface AgendaSummary {
  total: number;
  logged: number;
  /** Sessions still to run or to log today. */
  remaining: number;
}

export function agendaSummary(list: AppointmentView[]): AgendaSummary {
  const live = list.filter(isHappening);
  const logged = live.filter((a) => a.logState === 'logged').length;
  return { total: live.length, logged, remaining: live.length - logged };
}

/** Unlogged sessions from earlier days (today's are already on the agenda). */
export function earlierUnlogged(unlogged: AppointmentView[], today: ISODate): AppointmentView[] {
  return [...unlogged]
    .filter((a) => toISODate(parse(a.startsAt)) < today)
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
}
