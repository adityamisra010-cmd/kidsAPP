/** Recurring series (8 weeks back, 4 ahead), their occurrences, past attendance and unlogged picks. */
import { expandSeries, isCancelled, weekdaysToRrule } from '@/domain/derive';
import type { Appointment } from '@/domain/types';

import { rng } from '../../rng';
import { apptDate, onDate } from './apptOps';
import { at, dayOffset, ids, type Build } from './context';
import { anvayaScenarios, sahajScenarios } from './scenarios';

export const PAST_DAYS = 56;
export const FUTURE_DAYS = 27;

const ABSENT_REASONS = ['Fever', 'Cold and cough', 'Doctor’s appointment', 'Stomach upset'];
const PARENT_CANCEL_REASONS = ['Travelling out of town', 'Family function', 'Exam at school', 'Car broke down'];

export function buildSchedule(b: Build): void {
  for (const s of b.schools) {
    const org = b.store.organizations.find((o) => o.id === ids.org(s.key))!;
    const holidays = new Set(org.settings.holidays.map((h) => h.date));
    const coordinator = s.staff.find((p) => p.role === 'coordinator')!;
    for (const c of s.children) {
      for (const t of c.therapies) {
        const seriesId = ids.series(s.key, c.key, t.type);
        const series = {
          id: seriesId,
          organizationId: org.id,
          childId: ids.child(s.key, c.key),
          therapistId: ids.staff(s.key, t.therapist),
          therapyTypeId: ids.therapyType(s.key, t.type),
          rrule: weekdaysToRrule(t.days),
          startTime: t.time,
          durationMinutes: 45,
          startDate: dayOffset(b, -PAST_DAYS),
          endDate: dayOffset(b, FUTURE_DAYS),
          room: t.room,
          createdBy: ids.staff(s.key, coordinator.key),
        };
        b.store.series.push(series);
        for (const occ of expandSeries({ ...series, weekdays: t.days }, holidays)) {
          b.store.appointments.push({
            id: ids.appointment(seriesId, occ.date),
            organizationId: org.id,
            seriesId,
            childId: series.childId,
            therapistId: series.therapistId,
            therapyTypeId: series.therapyTypeId,
            startsAt: occ.startsAt,
            endsAt: occ.endsAt,
            room: t.room,
            status: 'scheduled',
            wasRescheduled: false,
            createdAt: at(b, -PAST_DAYS - 4, '09:00'),
          });
        }
      }
    }
  }
  anvayaScenarios(b);
  sahajScenarios(b);
  markPastAttendance(b);
  pickUnlogged(b);
}

const PERSONA_CHILDREN = new Set([ids.child('anvaya', 'aarav'), ids.child('anvaya', 'anaya')]);

/** ~88% attended (some late); a few absent / cancelled. Today's sessions so far are all attended. */
function markPastAttendance(b: Build): void {
  const now = b.now.getTime();
  for (const a of b.store.appointments) {
    if (a.attendance || isCancelled(a) || new Date(a.startsAt).getTime() > now) continue;
    const r = rng(`attendance:${a.id}`);
    const isToday = apptDate(a) === b.today;
    const scale = PERSONA_CHILDREN.has(a.childId) ? 0.5 : 1;
    const roll = r.next();
    if (!isToday && roll < 0.045 * scale) {
      a.attendance = 'absent';
      a.cancelReason = r.pick(ABSENT_REASONS);
    } else if (!isToday && roll < 0.075 * scale) {
      a.status = 'cancelled';
      a.attendance = 'cancelled_by_parent';
      a.cancelReason = r.pick(PARENT_CANCEL_REASONS);
    } else if (!isToday && roll < 0.088 * scale) {
      a.status = 'cancelled';
      a.attendance = 'cancelled_by_school';
      a.cancelReason = 'Centre closed early (power maintenance)';
    } else if (r.chance(0.07)) {
      a.attendance = 'late';
      a.lateMinutes = r.int(5, 15);
    } else {
      a.attendance = 'present';
    }
  }
}

/** Two attended sessions from the last couple of days (plus one at Sahaj) and Riya's latest finished one today stay unlogged. */
function pickUnlogged(b: Build): void {
  const attended = (a: Appointment) => a.attendance === 'present' || a.attendance === 'late';
  const pick = (school: 'anvaya' | 'sahaj', staffKeys: string[]) => {
    for (const key of staffKeys) {
      const therapistId = ids.staff(school, key);
      for (let o = -1; o >= -4; o--) {
        const found = onDate(b, dayOffset(b, o), (a) => a.therapistId === therapistId && attended(a) && !a.originalTherapistId && !PERSONA_CHILDREN.has(a.childId));
        if (found.length) {
          b.meta.unlogged.add(found[found.length - 1].id);
          break;
        }
      }
    }
  };
  pick('anvaya', ['neha', 'arjun']);
  pick('sahaj', ['rohan']);

  const riya = ids.staff('anvaya', 'riya');
  const endedToday = onDate(b, b.today, (a) => a.therapistId === riya && attended(a) && new Date(a.endsAt).getTime() <= b.now.getTime());
  const ordered = [...endedToday].reverse().filter((a) => a.id !== b.meta.substituteToday);
  const candidate = ordered.find((a) => !PERSONA_CHILDREN.has(a.childId)) ?? ordered[0];
  if (candidate) b.meta.unlogged.add(candidate.id);
}
