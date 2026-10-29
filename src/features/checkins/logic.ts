/**
 * Morning check-in: answers → CheckinInput. Pure, tested.
 */
import type { AppointmentView, CheckinInput, ParentCheckin, UUID } from '@/domain/types';
import { parse, toISODate } from '@/lib/dates';

export type SleepAnswer = ParentCheckin['sleep'];
export type MoodAnswer = ParentCheckin['mood'];

export const SLEEP_OPTIONS: SleepAnswer[] = ['good', 'ok', 'poor'];
export const MOOD_OPTIONS: MoodAnswer[] = ['happy', 'okay', 'upset'];
export const CHANGE_NOTE_MAX = 200;

export interface CheckinAnswers {
  sleep?: SleepAnswer;
  ateBreakfast?: boolean;
  mood?: MoodAnswer;
  changeFlag?: boolean;
  changeNote: string;
}

export const EMPTY_ANSWERS: CheckinAnswers = { changeNote: '' };

/** Number of the four questions answered (for the "3 of 4" hint). */
export function answeredCount(a: CheckinAnswers): number {
  return [a.sleep, a.ateBreakfast, a.mood, a.changeFlag].filter((v) => v !== undefined).length;
}

export function isCheckinComplete(a: CheckinAnswers): boolean {
  return answeredCount(a) === 4;
}

/** Builds the payload; returns null until all four questions are answered. */
export function buildCheckinInput(
  appointment: Pick<AppointmentView, 'id' | 'childId' | 'startsAt'>,
  a: CheckinAnswers,
  clientId: UUID,
): CheckinInput | null {
  if (!a.sleep || a.ateBreakfast === undefined || !a.mood || a.changeFlag === undefined) return null;
  return {
    clientId,
    childId: appointment.childId,
    appointmentId: appointment.id,
    date: toISODate(parse(appointment.startsAt)),
    sleep: a.sleep,
    ateBreakfast: a.ateBreakfast,
    mood: a.mood,
    changeFlag: a.changeFlag,
    // A note only makes sense when something changed.
    changeNote: a.changeFlag ? a.changeNote.trim().slice(0, CHANGE_NOTE_MAX) : '',
  };
}

export function isCheckinInput(p: unknown): p is CheckinInput {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.clientId === 'string' && typeof o.childId === 'string' && typeof o.sleep === 'string' && typeof o.mood === 'string';
}
