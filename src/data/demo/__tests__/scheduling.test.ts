import { RepoError } from '@/data/repository';
import { addDaysISO, clockTime, combineDateTime, toISODate } from '@/lib/dates';

import type { DemoRepository } from '../index';
import { actAs, childByName, DEMO_NOW, signedIn, userByName } from '../testing';

const code = (c: RepoError['code']) => expect.objectContaining({ name: 'RepoError', code: c });
const TODAY = toISODate(DEMO_NOW);
const typeId = (repo: DemoRepository, key: string) => repo.demo.store.therapyTypes.find((t) => t.organizationId === repo.getContext()!.organizationId && t.key === key)!.id;

describe('recurring series', () => {
  it('detects conflicts and refuses unless forced', async () => {
    const repo = await signedIn('school_admin');
    const clash = {
      childId: childByName(repo, 'Aarav Sharma'),
      therapistId: userByName(repo, 'Riya Menon'),
      therapyTypeId: typeId(repo, 'speech'),
      weekdays: [1, 3, 5],
      startTime: '10:30',
      durationMinutes: 45,
      startDate: addDaysISO(TODAY, 5),
      endDate: addDaysISO(TODAY, 18),
    };
    const conflicts = await repo.appointments.checkConflicts(clash);
    const kinds = new Set(conflicts.map((c) => c.kind));
    expect(kinds).toEqual(new Set(['therapist_double_booked', 'child_double_booked', 'holiday']));
    expect(conflicts.find((c) => c.kind === 'holiday')?.date).toBe('2026-11-09');
    const refused = await repo.appointments.createSeries(clash);
    expect(refused).toEqual({ seriesId: '', created: 0, conflicts });
    const sunday = await repo.appointments.checkConflicts({ ...clash, weekdays: [0], startTime: '18:00' });
    expect(sunday.filter((c) => c.kind === 'outside_hours')).toHaveLength(2);
    expect(sunday.every((c) => c.kind === 'outside_hours' || c.kind === 'holiday')).toBe(true);
    const forced = await repo.appointments.createSeries(clash, { force: true });
    expect(forced.created).toBe(6);
  });

  it('creates a free series, notifies the family and edits "this and future"', async () => {
    const repo = await signedIn('coordinator');
    const kavya = childByName(repo, 'Kavya Singh');
    const neha = userByName(repo, 'Neha Verma');
    const input = { childId: kavya, therapistId: neha, therapyTypeId: typeId(repo, 'occupational'), weekdays: [2], startTime: '13:00', durationMinutes: 45, startDate: addDaysISO(TODAY, 1), endDate: addDaysISO(TODAY, 27), room: 'Sensory Gym' };
    expect(await repo.appointments.checkConflicts(input)).toEqual([]);
    const notes = repo.demo.store.notifications.length;
    const { seriesId, created, conflicts } = await repo.appointments.createSeries(input);
    expect(conflicts).toEqual([]);
    expect(created).toBe(4);
    const recipients = repo.demo.store.notifications.slice(notes).map((n) => n.userId);
    expect(recipients).toEqual(expect.arrayContaining([...repo.demo.store.guardians.filter((g) => g.childId === kavya).map((g) => g.userId), neha]));
    const series = repo.demo.store.appointments.filter((a) => a.seriesId === seriesId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    expect(repo.demo.store.series.find((s) => s.id === seriesId)?.rrule).toBe('FREQ=WEEKLY;BYDAY=TU');

    // Move the second occurrence and everything after it to 13:30.
    const second = series[1];
    const newStart = combineDateTime(toISODate(new Date(second.startsAt)), '13:30');
    await repo.appointments.update(second.id, { startsAt: newStart }, 'future');
    const after = repo.demo.store.appointments.filter((a) => a.seriesId === seriesId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    expect(after.map((a) => clockTime(a.startsAt))).toEqual(['13:00', '13:30', '13:30', '13:30']);
    expect(repo.demo.store.series.find((s) => s.id === seriesId)?.startTime).toBe('13:30');

    // A single-occurrence move is a reschedule; a double booking is refused.
    await repo.appointments.update(after[0].id, { startsAt: combineDateTime(toISODate(new Date(after[0].startsAt)), '16:00') }, 'this');
    expect((await repo.appointments.get(after[0].id)).displayStatus).toBe('rescheduled');
    const aaravOt = repo.demo.store.appointments.find((a) => a.childId === childByName(repo, 'Aarav Sharma') && a.therapistId === neha && a.startsAt > new Date(DEMO_NOW.getTime() + 2 * 86_400_000).toISOString())!;
    await expect(repo.appointments.update(after[1].id, { startsAt: aaravOt.startsAt }, 'this')).rejects.toEqual(code('conflict'));
  });

  it('books a make-up linked to a missed session and handles cancellation', async () => {
    const repo = await signedIn('coordinator');
    const missed = repo.demo.store.appointments.find((a) => a.attendance === 'absent' && a.organizationId === repo.getContext()!.organizationId)!;
    const base = { childId: missed.childId, therapistId: missed.therapistId, therapyTypeId: missed.therapyTypeId, startTime: '17:00', durationMinutes: 30, startDate: addDaysISO(TODAY, 1) };
    const { appointment } = await repo.appointments.createOne({ ...base, makeupOfId: missed.id }, { force: true });
    expect((await repo.appointments.get(appointment!.id)).displayStatus).toBe('makeup');
    const notMissed = repo.demo.store.appointments.find((a) => a.childId === missed.childId && a.attendance === 'present')!;
    await expect(repo.appointments.createOne({ ...base, makeupOfId: notMissed.id })).rejects.toEqual(code('validation'));
    await repo.appointments.cancel(appointment!.id, 'school', 'Therapist unwell');
    expect((await repo.appointments.get(appointment!.id)).displayStatus).toBe('cancelled');
    await expect(repo.appointments.cancel(appointment!.id, 'school', 'again')).rejects.toEqual(code('validation'));
  });
});

describe('substitution', () => {
  it('lists sessions needing cover, ranks candidates and assigns a substitute', async () => {
    const repo = await signedIn('coordinator');
    const needing = await repo.appointments.needingSubstitute();
    expect(needing).toHaveLength(2);
    expect(needing.every((a) => a.therapistName === 'Pooja Malhotra')).toBe(true);
    const target = needing.find((a) => a.therapyTypeName === 'Speech Therapy') ?? needing[0];
    const candidates = await repo.appointments.substituteCandidates(target.id);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.therapyTypeIds.includes(target.therapyTypeId))).toBe(true);
    expect(candidates.some((c) => c.profile.fullName === 'Neha Verma')).toBe(false);
    const pick = candidates.find((c) => c.freeAtTime)!;
    expect(candidates[0].freeAtTime).toBe(true);

    await expect(repo.appointments.assignSubstitute(target.id, userByName(repo, 'Neha Verma'))).rejects.toEqual(code('validation'));
    const notes = repo.demo.store.notifications.length;
    await repo.appointments.assignSubstitute(target.id, pick.profile.id);
    const view = await repo.appointments.get(target.id);
    expect(view).toMatchObject({ therapistId: pick.profile.id, originalTherapistName: 'Pooja Malhotra', displayStatus: 'substitute', isSubstitute: true });
    const fresh = repo.demo.store.notifications.slice(notes);
    expect(fresh.find((n) => n.userId === pick.profile.id)?.kind).toBe('substitute_assigned');
    const parentNote = fresh.find((n) => repo.demo.store.guardians.some((g) => g.childId === target.childId && g.userId === n.userId))!;
    expect(parentNote.kind).toBe('substitute_assigned');
    expect(parentNote.title).toContain(`taken by ${pick.profile.fullName}`);
    expect(await repo.appointments.needingSubstitute()).toHaveLength(1);

    // The substitute now has brief access to the child when the session is near.
    actAs(repo, pick.profile.id);
    repo.demo.setNow(new Date(new Date(target.startsAt).getTime() - 2 * 3_600_000));
    const brief = await repo.sessions.brief(target.id);
    expect(brief.mustAcknowledge).toBe(true);
  });

  it('records leave and reports affected sessions', async () => {
    const repo = await signedIn('therapist');
    const riya = userByName(repo, 'Riya Menon');
    const from = addDaysISO(TODAY, 7);
    const { affected, unavailability } = await repo.appointments.addUnavailability({ userId: riya, from, to: addDaysISO(from, 1), reason: 'Workshop' });
    expect(affected.length).toBeGreaterThan(0);
    expect(affected.every((a) => a.therapistId === riya)).toBe(true);
    await expect(repo.appointments.addUnavailability({ userId: userByName(repo, 'Neha Verma'), from, to: from, reason: 'x' })).rejects.toEqual(code('forbidden'));
    actAs(repo, userByName(repo, 'Dr. Meera Iyer'));
    expect((await repo.appointments.needingSubstitute()).length).toBe(2 + affected.length);
    await repo.appointments.removeUnavailability(unavailability.id);
    expect(await repo.appointments.needingSubstitute()).toHaveLength(2);
  });
});

describe('reschedule requests', () => {
  it('lets the coordinator approve a pending request', async () => {
    const repo = await signedIn('coordinator');
    const [pending] = await repo.appointments.listRescheduleRequests({ status: ['pending'] });
    expect(pending.requestedByName).toBe('Priya Sharma');
    expect(pending.appointment.pendingRescheduleRequestId).toBe(pending.id);
    const slot = pending.proposedSlots[0];
    const notes = repo.demo.store.notifications.length;
    const resolved = await repo.appointments.resolveRescheduleRequest(pending.id, { type: 'approve', slot });
    expect(resolved).toMatchObject({ status: 'approved', resolution: { chosenSlot: slot } });
    const moved = await repo.appointments.get(pending.appointmentId);
    expect(moved).toMatchObject({ startsAt: slot, wasRescheduled: true, displayStatus: 'rescheduled' });
    expect(moved.pendingRescheduleRequestId).toBeUndefined();
    expect(repo.demo.store.notifications.slice(notes).some((n) => n.kind === 'reschedule_response' && n.userId === userByName(repo, 'Priya Sharma'))).toBe(true);
    await expect(repo.appointments.resolveRescheduleRequest(pending.id, { type: 'decline', note: 'x' })).rejects.toEqual(code('validation'));
  });

  it('runs the request → counter → accept flow', async () => {
    const parent = await signedIn('parent');
    const anaya = childByName(parent, 'Anaya Sharma');
    const [countered] = await parent.appointments.listRescheduleRequests({ status: ['countered'] });
    expect(countered.appointment.childId).toBe(anaya);
    await expect(parent.appointments.acceptCounter(countered.id, countered.proposedSlots[0])).rejects.toEqual(code('validation'));
    const slot = countered.resolution!.counterSlots![0];
    const accepted = await parent.appointments.acceptCounter(countered.id, slot);
    expect(accepted).toMatchObject({ status: 'approved', resolution: { chosenSlot: slot } });
    expect((await parent.appointments.get(countered.appointmentId)).startsAt).toBe(slot);

    const next = (await parent.appointments.upcoming({ childId: anaya, limit: 3 })).find((a) => !a.pendingRescheduleRequestId && new Date(a.startsAt).getTime() > DEMO_NOW.getTime())!;
    const proposed = [combineDateTime(addDaysISO(toISODate(new Date(next.startsAt)), 1), '16:00')];
    const req = await parent.appointments.requestReschedule(next.id, proposed, 'School picnic');
    await expect(parent.appointments.requestReschedule(next.id, proposed, 'again')).rejects.toEqual(code('conflict'));
    await expect(parent.appointments.resolveRescheduleRequest(req.id, { type: 'decline', note: 'no' })).rejects.toEqual(code('forbidden'));
    expect(parent.demo.store.notifications.some((n) => n.kind === 'reschedule_request' && n.userId === userByName(parent, 'Dr. Meera Iyer') && n.route === `/appointment/${next.id}`)).toBe(true);

    actAs(parent, userByName(parent, 'Dr. Meera Iyer'));
    const counterSlots = [combineDateTime(addDaysISO(toISODate(new Date(next.startsAt)), 2), '14:00')];
    expect((await parent.appointments.resolveRescheduleRequest(req.id, { type: 'counter', slots: counterSlots, note: 'Riya is free then' })).status).toBe('countered');
    actAs(parent, userByName(parent, 'Priya Sharma'));
    await parent.appointments.acceptCounter(req.id, counterSlots[0]);
    expect((await parent.appointments.get(next.id)).startsAt).toBe(counterSlots[0]);
  });
});
