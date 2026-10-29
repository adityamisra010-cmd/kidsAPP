/**
 * Builds `markedDates` for react-native-calendars (`markingType="multi-dot"`):
 * one muted dot per therapy type on that day (max 3), holidays visually muted, selected day.
 */
import type { AppointmentView, ISODate, OrgSettings } from '@/domain/types';

import { localDate } from './grouping';

export interface DayDot {
  key: string;
  color: string;
  selectedDotColor?: string;
}

export interface DayMarking {
  dots?: DayDot[];
  selected?: boolean;
  selectedColor?: string;
  selectedTextColor?: string;
  /** Muted text (holidays). Touch stays enabled so the day still shows its note. */
  disabled?: boolean;
  disableTouchEvent?: boolean;
}

export type MarkedDays = Record<ISODate, DayMarking>;

export const MAX_DOTS = 3;

type Markable = Pick<AppointmentView, 'startsAt' | 'therapyTypeId' | 'therapyTypeColor' | 'status' | 'attendance'>;

export function isCancelled(a: Pick<AppointmentView, 'status' | 'attendance'>): boolean {
  return a.status === 'cancelled' || a.attendance === 'cancelled_by_school' || a.attendance === 'cancelled_by_parent';
}

/** Distinct therapy-type dots per day, in the order sessions happen. Cancelled sessions get no dot. */
export function dotsByDay(appointments: Markable[], maxDots = MAX_DOTS): Map<ISODate, DayDot[]> {
  const out = new Map<ISODate, DayDot[]>();
  const sorted = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (const a of sorted) {
    if (isCancelled(a)) continue;
    const day = localDate(a.startsAt);
    const dots = out.get(day) ?? [];
    if (dots.length < maxDots && !dots.some((d) => d.key === a.therapyTypeId)) {
      dots.push({ key: a.therapyTypeId, color: a.therapyTypeColor });
    }
    out.set(day, dots);
  }
  return out;
}

export function buildMarkedDates(input: {
  appointments: Markable[];
  selected?: ISODate;
  holidays?: OrgSettings['holidays'];
  selectedColor: string;
  selectedTextColor: string;
  /** Dot colour on the selected (filled) day so dots stay visible. */
  selectedDotColor: string;
  maxDots?: number;
}): MarkedDays {
  const marked: MarkedDays = {};
  for (const [day, dots] of dotsByDay(input.appointments, input.maxDots)) {
    if (dots.length) marked[day] = { dots };
  }
  for (const h of input.holidays ?? []) {
    marked[h.date] = { ...marked[h.date], disabled: true, disableTouchEvent: false };
  }
  if (input.selected) {
    const prev = marked[input.selected];
    marked[input.selected] = {
      ...prev,
      dots: prev?.dots?.map((d) => ({ ...d, selectedDotColor: input.selectedDotColor })),
      selected: true,
      selectedColor: input.selectedColor,
      selectedTextColor: input.selectedTextColor,
    };
  }
  return marked;
}

/** Holiday label for a day, if any. */
export function holidayOn(day: ISODate, holidays: OrgSettings['holidays'] | undefined): string | undefined {
  return holidays?.find((h) => h.date === day)?.label;
}
