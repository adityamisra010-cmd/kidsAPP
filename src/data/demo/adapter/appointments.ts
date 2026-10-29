/** Calendar: scoped lists, conflicts, series creation, edits (this / future), cancel, attendance. */
import type { AppointmentsRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import { detectConflicts, expandSeries, isCancelled, makeOccurrence, rruleToWeekdays, weekdaysToRrule, type Occurrence } from '@/domain/derive';
import type { Appointment, Conflict, RequestContext, SeriesInput, UUID } from '@/domain/types';
import { addDaysISO, clockTime, combineDateTime, daysBetween, formatDay, formatTime } from '@/lib/dates';
import { uuid } from '@/lib/id';

import type { DemoCore } from './core';
import { localDate } from './queries';

type CalendarPart = Pick<
  AppointmentsRepo,
  'list' | 'get' | 'upcoming' | 'checkConflicts' | 'createSeries' | 'createOne' | 'update' | 'cancel' | 'markAttendance' | 'acknowledgeBrief'
>;

const HARD: Conflict['kind'][] = ['therapist_double_booked', 'child_double_booked'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function canSeeAppointment(core: DemoCore, ctx: RequestContext, a: Appointment): boolean {
  if (ctx.role === 'platform_admin' || a.organizationId !== ctx.organizationId) return false;
  if (core.isAdmin(ctx)) return true;
  if (ctx.role === 'parent') return core.isGuardian(ctx.userId, a.childId);
  return a.therapistId === ctx.userId || a.originalTherapistId === ctx.userId || core.isAssigned(ctx.userId, a.childId);
}

export function loadVisible(core: DemoCore, id: UUID): Appointment {
  const ctx = core.requireOrg();
  const a = core.appointment(id);
  if (!canSeeAppointment(core, ctx, a)) throw new RepoError('forbidden', 'You cannot see this appointment.');
  return a;
}

/** Conflicts for occurrences of a child + therapist inside the caller's school. */
export function conflictsFor(core: DemoCore, orgId: UUID, input: { childId: UUID; therapistId: UUID }, occurrences: Occurrence[], exclude: UUID[] = []): Conflict[] {
  const st = core.db;
  return detectConflicts({
    occurrences,
    childId: input.childId,
    therapistId: input.therapistId,
    existing: st.appointments.filter((a) => a.organizationId === orgId),
    unavailability: st.unavailability.filter((u) => u.organizationId === orgId),
    settings: core.org(orgId).settings,
    excludeAppointmentIds: exclude,
    names: { therapist: core.name(input.therapistId), child: st.children.find((c) => c.id === input.childId)?.fullName },
  });
}

/** Moves one appointment to a new start (keeping its length); throws on double bookings. */
export function moveAppointment(core: DemoCore, a: Appointment, startsAt: string): void {
  const length = new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime();
  const endsAt = new Date(new Date(startsAt).getTime() + length).toISOString();
  const hard = conflictsFor(core, a.organizationId, a, [{ date: localDate(startsAt), startsAt, endsAt }], [a.id]).filter((c) => HARD.includes(c.kind));
  if (hard.length) throw new RepoError('conflict', hard[0].message, { conflicts: hard });
  a.startsAt = startsAt;
  a.endsAt = endsAt;
  a.wasRescheduled = true;
}

export function createCalendarRepo(core: DemoCore): CalendarPart {
  const st = core.db;

  const validateInput = (ctx: RequestContext, input: Omit<SeriesInput, 'weekdays' | 'endDate'> & Partial<Pick<SeriesInput, 'weekdays' | 'endDate'>>) => {
    const child = st.children.find((c) => c.id === input.childId && c.organizationId === ctx.organizationId);
    if (!child) throw new RepoError('validation', 'Choose a child from this school.');
    if (core.roleIn(input.therapistId, ctx.organizationId) !== 'therapist') throw new RepoError('validation', 'Choose a therapist from this school.');
    if (core.therapyType(input.therapyTypeId).organizationId !== ctx.organizationId) throw new RepoError('validation', 'Unknown therapy type.');
    if (!TIME.test(input.startTime) || input.durationMinutes < 10 || input.durationMinutes > 240) throw new RepoError('validation', 'Enter a start time (HH:mm) and a duration between 10 and 240 minutes.');
    if (input.weekdays && (input.weekdays.length === 0 || input.weekdays.some((d) => d < 0 || d > 6))) throw new RepoError('validation', 'Pick at least one weekday.');
    if (input.endDate && input.endDate < input.startDate) throw new RepoError('validation', 'End date is before the start date.');
  };

  const notifyChange = (a: Appointment, title: string, body: string) =>
    core.notify([...core.guardiansOf(a.childId), a.therapistId], 'appointment_changed', title, body, `/appointment/${a.id}`);

  const newAppointment = (ctx: RequestContext, input: Pick<SeriesInput, 'childId' | 'therapistId' | 'therapyTypeId' | 'room'>, o: Occurrence, extra: Partial<Appointment> = {}): Appointment => ({
    id: uuid(),
    organizationId: ctx.organizationId!,
    childId: input.childId,
    therapistId: input.therapistId,
    therapyTypeId: input.therapyTypeId,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    room: input.room,
    status: 'scheduled',
    wasRescheduled: false,
    createdAt: core.nowIso(),
    ...extra,
  });

  return {
    list: (filter) =>
      core.run(() => {
        const ctx = core.requireOrg();
        const from = new Date(filter.from).getTime();
        const to = new Date(filter.to).getTime();
        return st.appointments
          .filter((a) => {
            const t = new Date(a.startsAt).getTime();
            return (
              t >= from &&
              t < to &&
              canSeeAppointment(core, ctx, a) &&
              (!filter.therapistId || a.therapistId === filter.therapistId) &&
              (!filter.childId || a.childId === filter.childId) &&
              (!filter.therapyTypeId || a.therapyTypeId === filter.therapyTypeId) &&
              (filter.includeCancelled || !isCancelled(a))
            );
          })
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map((a) => core.appointmentView(a));
      }),
    get: (id) => core.run(() => core.appointmentView(loadVisible(core, id))),
    upcoming: (opts) =>
      core.run(() => {
        const ctx = core.requireOrg();
        if (opts?.childId) core.requireChild(opts.childId);
        const now = core.now().getTime();
        return st.appointments
          .filter(
            (a) =>
              new Date(a.endsAt).getTime() > now &&
              !isCancelled(a) &&
              (!opts?.childId || a.childId === opts.childId) &&
              (ctx.role === 'therapist' ? a.therapistId === ctx.userId : canSeeAppointment(core, ctx, a)),
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, opts?.limit ?? 5)
          .map((a) => core.appointmentView(a));
      }),
    checkConflicts: (input) =>
      core.run(() => {
        const ctx = core.requireStaff();
        validateInput(ctx, input);
        return conflictsFor(core, ctx.organizationId, input, expandSeries(input), input.excludeAppointmentIds);
      }),
    createSeries: (input, opts) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        validateInput(ctx, input);
        const occurrences = expandSeries(input);
        if (!occurrences.length) throw new RepoError('validation', 'No sessions fall on those weekdays in this date range.');
        const conflicts = conflictsFor(core, ctx.organizationId, input, occurrences);
        if (conflicts.length && !opts?.force) return { seriesId: '', created: 0, conflicts };
        const seriesId = uuid();
        st.series.push({ id: seriesId, organizationId: ctx.organizationId, childId: input.childId, therapistId: input.therapistId, therapyTypeId: input.therapyTypeId, rrule: weekdaysToRrule(input.weekdays), startTime: input.startTime, durationMinutes: input.durationMinutes, startDate: input.startDate, endDate: input.endDate, room: input.room, createdBy: ctx.userId });
        const created = occurrences.map((o) => newAppointment(ctx, input, o, { seriesId }));
        st.appointments.push(...created);
        const tt = core.therapyType(input.therapyTypeId);
        notifyChange(created[0], `New ${tt.name} schedule`, `${created.length} sessions from ${formatDay(input.startDate)} at ${formatTime(created[0].startsAt)} with ${core.name(input.therapistId)}.`);
        core.audit('series.create', 'appointment_series', seriesId, { created: created.length, forced: Boolean(conflicts.length) });
        return { seriesId, created: created.length, conflicts };
      }),
    createOne: (input, opts) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        validateInput(ctx, input);
        if (input.makeupOfId) {
          const missed = core.appointment(input.makeupOfId);
          if (missed.childId !== input.childId || !(isCancelled(missed) || missed.attendance === 'absent')) throw new RepoError('validation', 'A make-up must link to a missed session of the same child.');
        }
        const occurrence = makeOccurrence(input.startDate, input.startTime, input.durationMinutes);
        const conflicts = conflictsFor(core, ctx.organizationId, input, [occurrence]);
        if (conflicts.length && !opts?.force) return { conflicts };
        const appointment = newAppointment(ctx, input, occurrence, { makeupOfId: input.makeupOfId });
        st.appointments.push(appointment);
        notifyChange(appointment, input.makeupOfId ? 'Make-up session booked' : 'New session booked', `${formatDay(appointment.startsAt)} at ${formatTime(appointment.startsAt)} with ${core.name(appointment.therapistId)}.`);
        core.audit('appointment.create', 'appointment', appointment.id);
        return { appointment, conflicts };
      }),
    update: (id, patch, scope) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        const a = core.appointment(id);
        if (a.status !== 'scheduled' || core.sessionFor(a.id)) throw new RepoError('validation', 'Only upcoming sessions can be changed.');
        if (patch.therapistId && core.roleIn(patch.therapistId, ctx.organizationId) !== 'therapist') throw new RepoError('validation', 'Choose a therapist from this school.');
        const targets =
          scope === 'future' && a.seriesId
            ? st.appointments.filter((x) => x.seriesId === a.seriesId && x.startsAt >= a.startsAt && x.status === 'scheduled' && !isCancelled(x) && !core.sessionFor(x.id))
            : [a];
        const ms = (iso: string) => new Date(iso).getTime();
        const newStart = patch.startsAt ?? a.startsAt;
        const newEnd = patch.endsAt ?? new Date(ms(newStart) + ms(a.endsAt) - ms(a.startsAt)).toISOString();
        const length = ms(newEnd) - ms(newStart);
        if (length <= 0) throw new RepoError('validation', 'The session must end after it starts.');
        const dayShift = daysBetween(localDate(a.startsAt), localDate(newStart));
        const clock = clockTime(newStart);
        const timeChanged = Boolean(patch.startsAt || patch.endsAt);
        const planned = targets.map((t) => {
          const startsAt = timeChanged ? (t === a ? newStart : combineDateTime(addDaysISO(localDate(t.startsAt), dayShift), clock)) : t.startsAt;
          return { t, startsAt, endsAt: timeChanged ? new Date(new Date(startsAt).getTime() + length).toISOString() : t.endsAt, therapistId: patch.therapistId ?? t.therapistId };
        });
        const exclude = targets.map((t) => t.id);
        const hard = planned.flatMap((p) => conflictsFor(core, ctx.organizationId, { childId: p.t.childId, therapistId: p.therapistId }, [{ date: localDate(p.startsAt), startsAt: p.startsAt, endsAt: p.endsAt }], exclude)).filter((c) => HARD.includes(c.kind));
        if (hard.length) throw new RepoError('conflict', hard[0].message, { conflicts: hard });
        const previousTherapist = a.therapistId;
        for (const p of planned) {
          Object.assign(p.t, { startsAt: p.startsAt, endsAt: p.endsAt, therapistId: p.therapistId, room: patch.room ?? p.t.room });
          if (scope === 'this' && timeChanged) p.t.wasRescheduled = true;
        }
        const series = scope === 'future' ? st.series.find((s) => s.id === a.seriesId) : undefined;
        if (series) {
          Object.assign(series, { startTime: timeChanged ? clock : series.startTime, durationMinutes: Math.round(length / 60_000), therapistId: patch.therapistId ?? series.therapistId, room: patch.room ?? series.room });
          if (dayShift) series.rrule = weekdaysToRrule(rruleToWeekdays(series.rrule).map((d) => (((d + dayShift) % 7) + 7) % 7));
        }
        const body = scope === 'future' ? `${targets.length} upcoming sessions changed from ${formatDay(a.startsAt)}.` : `${formatDay(a.startsAt)} at ${formatTime(a.startsAt)} with ${core.name(a.therapistId)}.`;
        notifyChange(a, 'Appointment changed', body);
        if (previousTherapist !== a.therapistId) core.notify([previousTherapist], 'appointment_changed', 'Appointment reassigned', body, `/appointment/${a.id}`);
        core.audit('appointment.update', 'appointment', id, { scope, count: targets.length });
      }),
    cancel: (id, by, reason) =>
      core.run(() => {
        const ctx = core.requireOrg();
        const a = loadVisible(core, id);
        if (ctx.role === 'parent' && by !== 'parent') throw new RepoError('forbidden', 'Parents can only cancel as the parent.');
        if (ctx.role === 'therapist' && a.therapistId !== ctx.userId) throw new RepoError('forbidden', 'You can only cancel your own sessions.');
        if (!reason.trim()) throw new RepoError('validation', 'Please give a reason.');
        if (isCancelled(a) || a.status === 'completed') throw new RepoError('validation', 'This session can no longer be cancelled.');
        a.status = 'cancelled';
        a.attendance = by === 'parent' ? 'cancelled_by_parent' : 'cancelled_by_school';
        a.cancelReason = reason.trim();
        const child = st.children.find((c) => c.id === a.childId)!;
        const recipients = by === 'parent' ? [a.therapistId, ...core.orgUsers(a.organizationId, ['coordinator'])] : [...core.guardiansOf(a.childId), a.therapistId];
        core.notify(recipients, 'appointment_changed', 'Session cancelled', `${child.preferredName ?? child.fullName} · ${formatDay(a.startsAt)} ${formatTime(a.startsAt)} — ${reason.trim()}`, `/appointment/${a.id}`);
        core.audit('appointment.cancel', 'appointment', id, { by });
      }),
    markAttendance: (id, attendance, lateMinutes) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const a = core.appointment(id);
        if (!core.isAdmin(ctx) && a.therapistId !== ctx.userId) throw new RepoError('forbidden', 'Only the session therapist can mark attendance.');
        const cancelling = attendance === 'cancelled_by_parent' || attendance === 'cancelled_by_school';
        if (!cancelling && new Date(a.startsAt).getTime() - core.now().getTime() > 60 * 60_000) throw new RepoError('validation', 'Attendance can be marked from an hour before the session.');
        if (attendance === 'late' && !(lateMinutes && lateMinutes > 0)) throw new RepoError('validation', 'How many minutes late?');
        a.attendance = attendance;
        a.lateMinutes = attendance === 'late' ? lateMinutes : undefined;
        a.status = cancelling ? 'cancelled' : core.sessionFor(a.id) ? 'completed' : 'scheduled';
        core.audit('appointment.attendance', 'appointment', id, { attendance });
      }),
    acknowledgeBrief: (id) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const a = core.appointment(id);
        if (a.therapistId !== ctx.userId && !core.isAdmin(ctx)) throw new RepoError('forbidden', 'This brief is for the session therapist.');
        if (!st.briefAcks.some((k) => k.appointmentId === id && k.userId === ctx.userId)) st.briefAcks.push({ appointmentId: id, userId: ctx.userId, at: core.nowIso() });
      }),
  };
}
