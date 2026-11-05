/** Reschedule requests (request → approve/decline/counter → accept), leave and substitution. */
import type { AppointmentsRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import { isCancelled } from '@/domain/derive';
import type { Appointment, RescheduleRequest } from '@/domain/types';
import { formatDay, formatTime } from '@/lib/dates';
import { uuid } from '@/lib/id';

import { canSeeAppointment, conflictsFor, loadVisible, moveAppointment } from './appointments';
import type { DemoCore } from './core';
import { localDate } from './queries';

type FlowPart = Omit<
  AppointmentsRepo,
  'list' | 'get' | 'upcoming' | 'checkConflicts' | 'createSeries' | 'createOne' | 'update' | 'cancel' | 'markAttendance' | 'acknowledgeBrief'
>;

export function createSubstitutionRepo(core: DemoCore): FlowPart {
  const st = core.db;
  const future = (iso: string) => new Date(iso).getTime() > core.now().getTime();
  const childName = (a: Appointment) => {
    const c = st.children.find((x) => x.id === a.childId)!;
    return c.preferredName ?? c.fullName;
  };
  const loadRequest = (id: string): RescheduleRequest => core.sameOrg(st.rescheduleRequests.find((r) => r.id === id), 'Request');
  const resolve = (req: RescheduleRequest, status: RescheduleRequest['status'], resolution: RescheduleRequest['resolution']) => {
    req.status = status;
    req.resolution = { ...req.resolution, ...resolution };
    req.resolvedBy = core.requireCtx().userId;
    req.resolvedAt = core.nowIso();
  };
  const isOnLeave = (userId: string, a: Appointment) => {
    const d = localDate(a.startsAt);
    return st.unavailability.some((u) => u.userId === userId && u.from <= d && u.to >= d);
  };

  return {
    requestReschedule: (appointmentId, proposedSlots, reason) =>
      core.run(() => {
        const ctx = core.requireOrg(['parent']);
        const a = loadVisible(core, appointmentId);
        if (isCancelled(a) || !future(a.startsAt)) throw new RepoError('validation', 'Only upcoming sessions can be moved.');
        if (proposedSlots.length < 1 || proposedSlots.length > 2 || proposedSlots.some((s) => !future(s))) throw new RepoError('validation', 'Suggest one or two future times.');
        if (!reason.trim()) throw new RepoError('validation', 'Please add a short reason.');
        if (st.rescheduleRequests.some((r) => r.appointmentId === appointmentId && (r.status === 'pending' || r.status === 'countered'))) {
          throw new RepoError('conflict', 'There is already an open request for this session.');
        }
        const req: RescheduleRequest = { id: uuid(), organizationId: a.organizationId, appointmentId, requestedBy: ctx.userId, requestedByName: core.name(ctx.userId), proposedSlots, reason: reason.trim(), status: 'pending', createdAt: core.nowIso() };
        st.rescheduleRequests.push(req);
        core.notify(core.orgUsers(a.organizationId, ['coordinator', 'school_admin']), 'reschedule_request', `Change request from ${req.requestedByName}`, `${childName(a)} · ${formatDay(a.startsAt)} ${formatTime(a.startsAt)} — ${req.reason}`, `/appointment/${a.id}`);
        return req;
      }),
    listRescheduleRequests: (filter) =>
      core.run(() => {
        const ctx = core.requireOrg();
        return st.rescheduleRequests
          .filter((r) => {
            const a = st.appointments.find((x) => x.id === r.appointmentId)!;
            return canSeeAppointment(core, ctx, a) && (!filter?.status || filter.status.includes(r.status)) && (!filter?.childId || a.childId === filter.childId);
          })
          .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
          .map((r) => ({ ...r, appointment: core.appointmentView(st.appointments.find((x) => x.id === r.appointmentId)!) }));
      }),
    resolveRescheduleRequest: (id, action) =>
      core.run(() => {
        core.requireAdmin();
        const req = loadRequest(id);
        const a = core.appointment(req.appointmentId);
        const parents = core.guardiansOf(a.childId);
        if (action.type === 'counter') {
          if (req.status !== 'pending') throw new RepoError('validation', 'Only pending requests can be countered.');
          if (!action.slots.length || action.slots.length > 2 || action.slots.some((s) => !future(s))) throw new RepoError('validation', 'Suggest one or two future times.');
          resolve(req, 'countered', { counterSlots: action.slots, note: action.note });
          core.notify(parents, 'reschedule_response', `New times suggested for ${childName(a)}`, action.note ?? 'Tap to choose one of the suggested times.', `/appointment/${a.id}`);
          return req;
        }
        if (req.status !== 'pending' && req.status !== 'countered') throw new RepoError('validation', 'This request is already closed.');
        if (action.type === 'decline') {
          resolve(req, 'declined', { note: action.note });
          core.notify(parents, 'reschedule_response', 'Change request declined', action.note, `/appointment/${a.id}`);
          return req;
        }
        if (!future(action.slot)) throw new RepoError('validation', 'Pick a future time.');
        moveAppointment(core, a, action.slot);
        resolve(req, 'approved', { chosenSlot: action.slot });
        const when = `${formatDay(a.startsAt)} at ${formatTime(a.startsAt)}`;
        core.notify(parents, 'reschedule_response', 'Change request approved', `${childName(a)}'s session is now on ${when}.`, `/appointment/${a.id}`);
        core.notify([a.therapistId], 'appointment_changed', 'Session moved', `${childName(a)} · now ${when}.`, `/appointment/${a.id}`);
        core.audit('reschedule.approve', 'appointment', a.id);
        return req;
      }),
    acceptCounter: (id, slot) =>
      core.run(() => {
        const ctx = core.requireOrg(['parent']);
        const req = loadRequest(id);
        const a = core.appointment(req.appointmentId);
        if (!core.isGuardian(ctx.userId, a.childId)) throw new RepoError('forbidden', 'This request is not for your child.');
        if (req.status !== 'countered' || !req.resolution?.counterSlots?.includes(slot)) throw new RepoError('validation', 'Pick one of the suggested times.');
        moveAppointment(core, a, slot);
        req.status = 'approved';
        req.resolution = { ...req.resolution, chosenSlot: slot };
        const when = `${formatDay(a.startsAt)} at ${formatTime(a.startsAt)}`;
        core.notify(core.orgUsers(a.organizationId, ['coordinator']), 'reschedule_response', `${core.name(ctx.userId)} accepted a new time`, `${childName(a)} · ${when}`, `/appointment/${a.id}`);
        core.notify([a.therapistId], 'appointment_changed', 'Session moved', `${childName(a)} · now ${when}.`, `/appointment/${a.id}`);
        return req;
      }),
    listUnavailability: (filter) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const userId = ctx.role === 'therapist' ? ctx.userId : filter?.userId;
        return st.unavailability
          .filter((u) => u.organizationId === ctx.organizationId && (!userId || u.userId === userId) && (!filter?.from || u.to >= filter.from) && (!filter?.to || u.from <= filter.to))
          .sort((a, b) => a.from.localeCompare(b.from));
      }),
    addUnavailability: (input) =>
      core.run(() => {
        const ctx = core.requireStaff();
        if (!core.isAdmin(ctx) && input.userId !== ctx.userId) throw new RepoError('forbidden', 'You can only add your own leave.');
        if (core.roleIn(input.userId, ctx.organizationId) !== 'therapist') throw new RepoError('validation', 'Leave can be added for therapists only.');
        if (input.to < input.from) throw new RepoError('validation', 'The end date is before the start date.');
        const unavailability = { ...input, id: uuid(), organizationId: ctx.organizationId, createdAt: core.nowIso() };
        st.unavailability.push(unavailability);
        const affected = st.appointments
          .filter((a) => a.therapistId === input.userId && !isCancelled(a) && future(a.endsAt) && localDate(a.startsAt) >= input.from && localDate(a.startsAt) <= input.to)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        core.audit('unavailability.add', 'therapist_unavailability', unavailability.id, { affected: affected.length });
        return { unavailability, affected: affected.map((a) => core.appointmentView(a)) };
      }),
    removeUnavailability: (id) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const u = core.sameOrg(st.unavailability.find((x) => x.id === id), 'Leave');
        if (!core.isAdmin(ctx) && u.userId !== ctx.userId) throw new RepoError('forbidden', 'You can only remove your own leave.');
        st.unavailability = st.unavailability.filter((x) => x.id !== id);
      }),
    needingSubstitute: () =>
      core.run(() => {
        const ctx = core.requireAdmin();
        return st.appointments
          .filter((a) => a.organizationId === ctx.organizationId && !isCancelled(a) && !a.originalTherapistId && future(a.endsAt) && isOnLeave(a.therapistId, a))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map((a) => core.appointmentView(a));
      }),
    substituteCandidates: (appointmentId) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        const a = core.appointment(appointmentId);
        return st.memberships
          .filter((m) => m.organizationId === ctx.organizationId && m.role === 'therapist' && m.status === 'active' && m.userId !== a.therapistId)
          .filter((m) => st.qualifications.some((q) => q.userId === m.userId && q.therapyTypeId === a.therapyTypeId) && !isOnLeave(m.userId, a))
          .map((m) => {
            const conflicts = conflictsFor(core, a.organizationId, { childId: a.childId, therapistId: m.userId }, [{ date: localDate(a.startsAt), startsAt: a.startsAt, endsAt: a.endsAt }], [a.id]);
            return {
              profile: st.profiles.find((p) => p.id === m.userId)!,
              membership: m,
              therapyTypeIds: st.qualifications.filter((q) => q.userId === m.userId).map((q) => q.therapyTypeId),
              freeAtTime: !conflicts.some((c) => c.kind === 'therapist_double_booked'),
              knowsChild: core.isAssigned(m.userId, a.childId) || st.sessions.some((s) => s.childId === a.childId && s.therapistId === m.userId),
            };
          })
          .sort((x, y) => Number(y.freeAtTime) - Number(x.freeAtTime) || Number(y.knowsChild) - Number(x.knowsChild) || x.profile.fullName.localeCompare(y.profile.fullName));
      }),
    assignSubstitute: (appointmentId, therapistId) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        const a = core.appointment(appointmentId);
        if (isCancelled(a) || core.sessionFor(a.id)) throw new RepoError('validation', 'This session cannot be reassigned.');
        if (core.roleIn(therapistId, ctx.organizationId) !== 'therapist') throw new RepoError('validation', 'Choose a therapist from this school.');
        if (!st.qualifications.some((q) => q.userId === therapistId && q.therapyTypeId === a.therapyTypeId)) throw new RepoError('validation', 'This therapist is not qualified for this therapy type.');
        const busy = conflictsFor(core, a.organizationId, { childId: a.childId, therapistId }, [{ date: localDate(a.startsAt), startsAt: a.startsAt, endsAt: a.endsAt }], [a.id]).filter((c) => c.kind === 'therapist_double_booked');
        if (busy.length) throw new RepoError('conflict', busy[0].message, { conflicts: busy });
        a.originalTherapistId = a.originalTherapistId ?? a.therapistId;
        a.therapistId = therapistId;
        if (a.originalTherapistId === therapistId) a.originalTherapistId = undefined;
        const sub = core.name(therapistId);
        const isToday = localDate(a.startsAt) === core.today();
        core.notify([therapistId], 'substitute_assigned', `You're covering ${childName(a)}'s session`, `${core.therapyType(a.therapyTypeId).name} · ${formatDay(a.startsAt)} at ${formatTime(a.startsAt)}. Please read the Handover Brief before you start.`, `/appointment/${a.id}`);
        core.notify(core.guardiansOf(a.childId), 'substitute_assigned', isToday ? `Today's session will be taken by ${sub}` : `${formatDay(a.startsAt)}: session will be taken by ${sub}`, `${sub} will take ${childName(a)}'s ${core.therapyType(a.therapyTypeId).name} session at ${formatTime(a.startsAt)}. They have ${childName(a)}'s notes and plan.`, `/appointment/${a.id}`);
        core.audit('appointment.assign_substitute', 'appointment', a.id, { substitute: sub });
      }),
  };
}
