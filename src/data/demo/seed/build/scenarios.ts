/**
 * Hand-made schedule stories on top of the recurring series: past substitute days, a sick day,
 * a therapist on leave this week, Riya's busy "today" (substitute + make-up), and reschedule requests.
 */
import { makeOccurrence } from '@/domain/derive';
import type { Appointment, RescheduleRequest, UUID } from '@/domain/types';
import { stableId } from '@/lib/id';

import { addLeave, apptDate, cancelBySchool, isFree, onDate, oneOff, reassign, staffIds, weekdayOnOrBefore } from './apptOps';
import { at, dayDiff, dayOffset, ids, minutesAgo, type Build } from './context';

const A = 'anvaya' as const;
const S = 'sahaj' as const;

export function anvayaScenarios(b: Build): void {
  const riya = ids.staff(A, 'riya');
  const pooja = ids.staff(A, 'pooja');
  const speech = ids.therapyType(A, 'speech');

  // Riya at a conference ~3.5 weeks ago: Pooja covered her sessions (substitute sessions in history).
  const conf = weekdayOnOrBefore(b, -22, 3);
  addLeave(b, A, 'riya', dayOffset(b, conf), dayOffset(b, conf), 'Speech & hearing conference, Mysuru');
  for (const a of onDate(b, dayOffset(b, conf), (x) => x.therapistId === riya)) {
    if (!reassign(b, a, [pooja])) cancelBySchool(a, 'Therapist at a conference');
  }

  // Neha unwell one Tuesday ~2 weeks ago: no other OT, so sessions were cancelled by the centre.
  const sick = weekdayOnOrBefore(b, -12, 2);
  addLeave(b, A, 'neha', dayOffset(b, sick), dayOffset(b, sick), 'Sick leave');
  for (const a of onDate(b, dayOffset(b, sick), (x) => x.therapistId === ids.staff(A, 'neha'))) cancelBySchool(a, 'Therapist unwell — make-up offered');

  poojaLeave(b, riya, pooja, speech);
  makeupToday(b, riya);
  topUpRiyasDay(b, riya);
  reschedules(b, riya);
}

/** Pooja is on leave from today: today's speech session goes to Riya, two later ones still need a substitute. */
function poojaLeave(b: Build, riya: UUID, pooja: UUID, speech: UUID): void {
  let todays = onDate(b, b.today, (a) => a.therapistId === pooja);
  if (!todays.some((a) => a.therapyTypeId === speech)) {
    oneOff(b, A, { child: 'ishaan', therapist: 'pooja', type: 'speech', date: b.today, time: '14:00', tag: 'extra', room: 'Speech Room 2' });
    todays = onDate(b, b.today, (a) => a.therapistId === pooja);
  }
  const future = b.store.appointments
    .filter((a) => a.therapistId === pooja && apptDate(a) > b.today)
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  const leaveTo = future[1] ? apptDate(future[1]) : dayOffset(b, 2);
  b.meta.poojaLeaveTo = leaveTo;
  addLeave(b, A, 'pooja', b.today, leaveTo, 'Personal leave (family function)');

  const sub = todays.find((a) => a.therapyTypeId === speech)!;
  sub.originalTherapistId = pooja;
  sub.therapistId = riya;
  b.meta.substituteToday = sub.id;

  const colleagues = staffIds(b, A, ['arjun', 'neha', 'riya']);
  for (const a of todays) if (a !== sub && !reassign(b, a, colleagues)) cancelBySchool(a, 'Therapist on leave');
  future
    .filter((a) => apptDate(a) <= leaveTo)
    .forEach((a, i) => {
      if (i < 2) b.meta.needsSubstitute.push(a.id);
      else if (!reassign(b, a, colleagues)) cancelBySchool(a, 'Therapist on leave');
    });
}

const CASELOAD_PREFERENCE = ['kavya', 'tara', 'myra', 'reyansh', 'saanvi', 'vihaan', 'anaya', 'aarav'];

/** A make-up at 16:30 today for a child of Riya's who missed a session last week. */
function makeupToday(b: Build, riya: UUID): void {
  const slot = makeOccurrence(b.today, '16:30', 45);
  for (const key of CASELOAD_PREFERENCE) {
    const childId = ids.child(A, key);
    if (onDate(b, b.today, (a) => a.childId === childId && a.therapistId === riya).length) continue;
    if (!isFree(b, { childId, therapistId: riya }, slot.startsAt, slot.endsAt)) continue;
    const missed = b.store.appointments
      .filter((a) => a.childId === childId && a.therapistId === riya && apptDate(a) >= dayOffset(b, -10) && apptDate(a) <= dayOffset(b, -3))
      .sort((x, y) => y.startsAt.localeCompare(x.startsAt))[0];
    if (!missed) continue;
    missed.status = 'scheduled';
    missed.attendance = 'absent';
    missed.cancelReason = 'Fever — mother informed in the morning';
    const makeup = oneOff(b, A, { child: key, therapist: 'riya', type: 'speech', date: b.today, time: '16:30', tag: 'makeup', room: 'Speech Room 1', makeupOfId: missed.id });
    b.meta.makeupToday = makeup.id;
    b.meta.missedForMakeup = missed.id;
    return;
  }
}

/** Sundays/holidays have no regular series, so make sure Riya's agenda always has 5+ sessions. */
function topUpRiyasDay(b: Build, riya: UUID): void {
  const live = () => onDate(b, b.today, (a) => a.therapistId === riya && a.status !== 'cancelled');
  for (const time of ['09:30', '10:30', '12:00', '15:30', '11:15']) {
    if (live().length >= 5) return;
    const slot = makeOccurrence(b.today, time, 45);
    for (const key of CASELOAD_PREFERENCE) {
      const childId = ids.child(A, key);
      if (onDate(b, b.today, (a) => a.childId === childId).length) continue;
      if (!isFree(b, { childId, therapistId: riya }, slot.startsAt, slot.endsAt)) continue;
      oneOff(b, A, { child: key, therapist: 'riya', type: 'speech', date: b.today, time, tag: 'extra', room: 'Speech Room 1' });
      break;
    }
  }
}

function request(b: Build, a: Appointment, input: Partial<RescheduleRequest> & Pick<RescheduleRequest, 'proposedSlots' | 'reason' | 'status' | 'createdAt'>): RescheduleRequest {
  const req: RescheduleRequest = {
    id: stableId(`reschedule:${a.id}`),
    organizationId: a.organizationId,
    appointmentId: a.id,
    requestedBy: ids.parent(A, 'priya'),
    requestedByName: 'Priya Sharma',
    ...input,
  };
  b.store.rescheduleRequests.push(req);
  return req;
}

/** Priya's requests: one approved (moved), one pending, one countered by the coordinator. */
function reschedules(b: Build, riya: UUID): void {
  const meera = ids.staff(A, 'meera');
  const aarav = ids.child(A, 'aarav');
  const anaya = ids.child(A, 'anaya');
  const firstIn = (childId: UUID, type: string, from: number, to: number) =>
    b.store.appointments
      .filter((a) => a.childId === childId && a.therapyTypeId === ids.therapyType(A, type) && a.status === 'scheduled' && apptDate(a) >= dayOffset(b, from) && apptDate(a) <= dayOffset(b, to))
      .sort((x, y) => x.startsAt.localeCompare(y.startsAt))[0];

  const moved = firstIn(aarav, 'speech', 2, 8);
  if (moved) {
    const slot = makeOccurrence(apptDate(moved), '16:30', 45);
    if (isFree(b, { childId: aarav, therapistId: riya }, slot.startsAt, slot.endsAt, moved.id)) {
      const req = request(b, moved, {
        proposedSlots: [slot.startsAt, makeOccurrence(apptDate(moved), '15:30', 45).startsAt],
        reason: 'Aarav has a dental check-up that morning.',
        status: 'approved',
        createdAt: at(b, -3, '19:40'),
        resolution: { chosenSlot: slot.startsAt, note: 'Moved to 4:30 PM with Ms. Riya.' },
        resolvedBy: meera,
        resolvedAt: at(b, -2, '10:15'),
      });
      moved.startsAt = slot.startsAt;
      moved.endsAt = slot.endsAt;
      moved.wasRescheduled = true;
      b.meta.rescheduled = { requestId: req.id, appointmentId: moved.id };
    }
  }

  const ot = firstIn(aarav, 'occupational', 5, 12);
  if (ot) {
    const req = request(b, ot, {
      proposedSlots: [makeOccurrence(apptDate(ot), '16:00', 45).startsAt, at(b, dayDiff(b.today, apptDate(ot)) + 2, '11:00')],
      reason: 'Family wedding in Agra — we will be travelling that morning.',
      status: 'pending',
      createdAt: minutesAgo(b, 60 * 17),
    });
    b.meta.pendingRequest = { requestId: req.id, appointmentId: ot.id };
  }

  const anayaSpeech = firstIn(anaya, 'speech', 6, 14);
  if (anayaSpeech) {
    const d = apptDate(anayaSpeech);
    const req = request(b, anayaSpeech, {
      proposedSlots: [makeOccurrence(d, '12:00', 45).startsAt],
      reason: "Anaya's annual day rehearsal at school that morning.",
      status: 'countered',
      createdAt: at(b, -2, '20:30'),
      resolution: { counterSlots: [makeOccurrence(d, '14:00', 45).startsAt, makeOccurrence(d, '16:30', 45).startsAt], note: 'Ms. Riya is free at these times on the same day. Please pick one.' },
      resolvedBy: meera,
      resolvedAt: at(b, -1, '11:20'),
    });
    b.meta.counteredRequest = { requestId: req.id, appointmentId: anayaSpeech.id };
  }
}

export function sahajScenarios(b: Build): void {
  const deepa = ids.staff(S, 'deepa');
  const kavitha = ids.staff(S, 'kavitha');
  // Deepa off one Wednesday ~2 weeks ago: Kavitha (also OT-qualified) covered what she could.
  const off = weekdayOnOrBefore(b, -15, 3);
  addLeave(b, S, 'deepa', dayOffset(b, off), dayOffset(b, off), 'Personal leave');
  for (const a of onDate(b, dayOffset(b, off), (x) => x.therapistId === deepa)) if (!reassign(b, a, [kavitha])) cancelBySchool(a, 'Therapist on leave');

  // Lakshmi at a hearing-aid fitting workshop ~5 weeks ago: speech sessions cancelled.
  const workshop = weekdayOnOrBefore(b, -33, 4);
  addLeave(b, S, 'lakshmi', dayOffset(b, workshop), dayOffset(b, workshop), 'Hearing-aid fitting workshop');
  for (const a of onDate(b, dayOffset(b, workshop), (x) => x.therapistId === ids.staff(S, 'lakshmi'))) cancelBySchool(a, 'Therapist at a workshop');

  // Rohan on leave for two days next week: special-ed covered by Deepa where free, behaviour still open.
  const from = weekdayOnOrBefore(b, 9, 2);
  addLeave(b, S, 'rohan', dayOffset(b, from), dayOffset(b, from + 1), 'Attending a family wedding in Mangaluru');
  for (const o of [from, from + 1]) {
    for (const a of onDate(b, dayOffset(b, o), (x) => x.therapistId === ids.staff(S, 'rohan'))) {
      if (!reassign(b, a, [deepa])) b.meta.needsSubstitute.push(a.id);
    }
  }

  // One upcoming parent cancellation.
  const fatima = b.store.appointments
    .filter((a) => a.childId === ids.child(S, 'fatima') && apptDate(a) >= dayOffset(b, 3) && apptDate(a) <= dayOffset(b, 9))
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt))[0];
  if (fatima) {
    fatima.status = 'cancelled';
    fatima.attendance = 'cancelled_by_parent';
    fatima.cancelReason = 'Travelling to Mysuru for a family function';
  }
}
