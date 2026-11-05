/** New schedule form: validation schema and mapping to the repository's SeriesInput. */
import { z } from 'zod';

import type { SeriesInput } from '@/domain/types';

import { weekdayOf } from './slots';

export const DURATIONS = [30, 45, 60] as const;

/** Error messages are i18n keys (FormTextField / screen translate them). */
export const scheduleSchema = z
  .object({
    childId: z.string().min(1, 'calendar:new.errors.child'),
    therapyTypeId: z.string().min(1, 'calendar:new.errors.therapyType'),
    therapistId: z.string().min(1, 'calendar:new.errors.therapist'),
    repeats: z.boolean(),
    weekdays: z.array(z.number().int().min(0).max(6)),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'calendar:new.errors.time'),
    durationMinutes: z.number().int().positive(),
    startDate: z.string().min(1, 'calendar:new.errors.startDate'),
    endDate: z.string(),
    room: z.string().max(40),
  })
  .superRefine((v, ctx) => {
    if (!v.repeats) return;
    if (v.weekdays.length === 0) ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'calendar:new.errors.weekdays' });
    if (!v.endDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'calendar:new.errors.endDate' });
    else if (v.startDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'calendar:new.errors.endBeforeStart' });
    }
  });

export type ScheduleValues = z.infer<typeof scheduleSchema>;

export const emptySchedule = (overrides: Partial<ScheduleValues> = {}): ScheduleValues => ({
  childId: '',
  therapyTypeId: '',
  therapistId: '',
  repeats: true,
  weekdays: [],
  startTime: '',
  durationMinutes: 45,
  startDate: '',
  endDate: '',
  room: '',
  ...overrides,
});

/** A one-off session is a series of one day. */
export function toSeriesInput(v: ScheduleValues): SeriesInput {
  const room = v.room.trim() || undefined;
  return {
    childId: v.childId,
    therapistId: v.therapistId,
    therapyTypeId: v.therapyTypeId,
    weekdays: v.repeats ? v.weekdays : [weekdayOf(v.startDate)],
    startTime: v.startTime,
    durationMinutes: v.durationMinutes,
    startDate: v.startDate,
    endDate: v.repeats ? v.endDate : v.startDate,
    room,
  };
}

/** Enough is filled in to ask the repository about clashes. */
export function isCheckable(v: ScheduleValues): boolean {
  return scheduleSchema.safeParse(v).success;
}
