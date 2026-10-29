import { RepoError } from '@/data/repository';
import { DEFAULT_DIMENSIONS } from '@/domain/constants';
import { computeSessionMetrics } from '@/domain/metrics';
import type { RatingValue, SessionInput } from '@/domain/types';
import { toISODate } from '@/lib/dates';

import type { DemoRepository } from '../index';
import { actAs, childByName, DEMO_NOW, signedIn, userByName } from '../testing';

const code = (c: RepoError['code']) => expect.objectContaining({ name: 'RepoError', code: c });
const HOUR = 3_600_000;

function ratings(v: RatingValue): Record<string, RatingValue> {
  return Object.fromEntries(DEFAULT_DIMENSIONS.map((d) => [d.key, v]));
}

/** Riya's substitute session today (Pooja's child), the one with a mandatory brief. */
function substituteAppointment(repo: DemoRepository) {
  return repo.demo.store.appointments.find(
    (a) => a.originalTherapistId === userByName(repo, 'Pooja Malhotra') && a.therapistId === userByName(repo, 'Riya Menon') && new Date(a.startsAt).toDateString() === DEMO_NOW.toDateString(),
  )!;
}

function input(repo: DemoRepository, appointmentId: string, over: Partial<SessionInput> = {}): SessionInput {
  const a = repo.demo.store.appointments.find((x) => x.id === appointmentId)!;
  const goal = repo.demo.store.goals.find((g) => g.childId === a.childId && g.therapyTypeId === a.therapyTypeId && g.status !== 'mastered')!;
  return {
    clientId: `client-${appointmentId}`,
    appointmentId,
    actualMinutes: 45,
    startedLate: false,
    regulationState: 'regulated',
    ratings: ratings(2),
    goalTrials: [{ goalId: goal.id, attempted: 10, successful: 6, promptLevel: 4 }],
    incidents: [
      { type: 'meltdown', durationSeconds: 120, antecedentTags: ['transition'] },
      { type: 'refusal', antecedentTags: ['demand'] },
      { type: 'elopement', durationSeconds: 30, antecedentTags: ['sensory'] },
    ],
    breaksCount: 2,
    comparedToLast: 'worse',
    workedTags: ['visual_schedule'],
    workedText: '',
    notWorkedTags: ['noisy_room'],
    notWorkedText: '',
    notes: { subjective: '', objective: 'Auto', assessment: 'Harder day', planNext: 'Repeat the I-want requests with cars.', planGoalIds: [goal.id], parentSummary: 'A harder day today, but he tried hard.' },
    ...over,
  };
}

describe('sessions.save', () => {
  it('computes metrics, locks after 24 h, raises alerts and notifies, idempotently', async () => {
    const repo = await signedIn('therapist');
    const sub = substituteAppointment(repo);
    await expect(repo.sessions.save(input(repo, sub.id))).rejects.toEqual(code('validation'));
    repo.demo.setNow(new Date(new Date(sub.endsAt).getTime() + 10 * 60_000));

    const before = repo.demo.store.sessions.filter((s) => s.childId === sub.childId && s.therapyTypeId === sub.therapyTypeId).sort((a, b) => b.date.localeCompare(a.date));
    const notesBefore = repo.demo.store.notifications.length;
    const saved = await repo.sessions.save(input(repo, sub.id));

    const dims = repo.demo.store.dimensions.filter((d) => d.organizationId === sub.organizationId);
    const expected = computeSessionMetrics({
      ratings: ratings(2),
      goalTrials: input(repo, sub.id).goalTrials,
      incidents: input(repo, sub.id).incidents,
      dimensions: dims,
      previous: before.map((s) => ({ sessionScore: s.metrics.sessionScore, ratings: s.ratings, deltaRolling: s.metrics.deltaRolling })),
    });
    expect(saved.metrics).toEqual(expected);
    expect(saved.metrics.sessionScore).toBe(25);
    expect(saved.metrics.deltaLast).toBe(25 - before[0].metrics.sessionScore);
    expect(saved).toMatchObject({ isSubstitute: true, therapistName: 'Riya Menon', amendmentCount: 0, date: toISODate(new Date(sub.startsAt)) });
    expect(new Date(saved.lockedAt).getTime() - new Date(saved.createdAt).getTime()).toBe(24 * HOUR);

    const appt = await repo.appointments.get(sub.id);
    expect(appt).toMatchObject({ status: 'completed', attendance: 'present', logState: 'logged', sessionId: saved.id });

    const alert = repo.demo.store.alerts.find((a) => a.childId === sub.childId && a.kind === 'incident_spike' && a.status === 'open');
    expect(alert?.payload).toMatchObject({ incidents: 3, therapyTypeId: sub.therapyTypeId });
    const fresh = repo.demo.store.notifications.slice(notesBefore);
    const parents = repo.demo.store.guardians.filter((g) => g.childId === sub.childId).map((g) => g.userId);
    expect(fresh.filter((n) => n.kind === 'session_summary').map((n) => n.userId).sort()).toEqual([...parents].sort());
    expect(fresh.find((n) => n.kind === 'session_summary')?.route).toBe(`/session/${saved.id}`);
    expect(fresh.some((n) => n.kind === 'child_alert' && n.userId === userByName(repo, 'Dr. Meera Iyer'))).toBe(true);

    // Same clientId again (offline retry): nothing new happens.
    const count = repo.demo.store.sessions.length;
    const notes = repo.demo.store.notifications.length;
    expect((await repo.sessions.save(input(repo, sub.id))).id).toBe(saved.id);
    expect(repo.demo.store.sessions.length).toBe(count);
    expect(repo.demo.store.notifications.length).toBe(notes);

    // Edit within the window (new clientId) recomputes metrics in place.
    const edited = await repo.sessions.save(input(repo, sub.id, { clientId: 'edit-1', ratings: ratings(4), incidents: [] }));
    expect(edited).toMatchObject({ id: saved.id, createdAt: saved.createdAt, lockedAt: saved.lockedAt });
    expect(edited.metrics.sessionScore).toBe(75);
    expect(repo.demo.store.sessions.filter((s) => s.appointmentId === sub.id)).toHaveLength(1);
    expect(repo.demo.store.alerts.filter((a) => a.childId === sub.childId && a.kind === 'incident_spike' && a.status === 'open')).toHaveLength(1);

    // After the lock: save is refused, amend with a reason works and is audited.
    repo.demo.setNow(new Date(new Date(saved.createdAt).getTime() + 25 * HOUR));
    await expect(repo.sessions.save(input(repo, sub.id, { clientId: 'edit-2' }))).rejects.toEqual(code('locked'));
    await expect(repo.sessions.amend(saved.id, { breaksCount: 3 }, '  ')).rejects.toEqual(code('validation'));
    await expect(repo.sessions.amend(saved.id, { breaksCount: 2 }, 'No change')).rejects.toEqual(code('validation'));
    const amended = await repo.sessions.amend(saved.id, { ratings: ratings(5), notes: { ...edited.notes, planNext: 'Use the timer first.' } }, 'Corrected after reviewing the video');
    expect(amended.metrics.sessionScore).toBe(100);
    expect(amended.amendmentCount).toBe(2);
    const rows = await repo.sessions.amendments(saved.id);
    expect(rows.map((r) => [r.entity, r.field])).toEqual([
      ['session', 'ratings'],
      ['session_notes', 'notes.planNext'],
    ]);
    expect(rows[0]).toMatchObject({ reason: 'Corrected after reviewing the video', byName: 'Riya Menon' });
  });

  it('validates the logger input and permissions', async () => {
    const repo = await signedIn('therapist');
    const riya = userByName(repo, 'Riya Menon');
    const ended = repo.demo.store.appointments.find((a) => a.therapistId === riya && a.attendance === 'present' && a.status === 'scheduled' && new Date(a.endsAt) < DEMO_NOW)!;
    const missing = { ...ratings(3) };
    delete missing.mood;
    await expect(repo.sessions.save(input(repo, ended.id, { ratings: missing }))).rejects.toEqual(expect.objectContaining({ code: 'validation', details: { missing: ['mood'] } }));
    await expect(repo.sessions.save(input(repo, ended.id, { notes: { ...input(repo, ended.id).notes, planNext: ' ' } }))).rejects.toEqual(code('validation'));
    const others = repo.demo.store.appointments.find((a) => a.therapistId === userByName(repo, 'Neha Verma') && new Date(a.endsAt) < DEMO_NOW && a.attendance === 'present')!;
    await expect(repo.sessions.save(input(repo, others.id))).rejects.toEqual(code('forbidden'));
    const absent = repo.demo.store.appointments.find((a) => a.therapistId === riya && a.attendance === 'absent')!;
    await expect(repo.sessions.save(input(repo, absent.id))).rejects.toEqual(code('validation'));
  });

  it('clears an unlogged session once logged', async () => {
    const repo = await signedIn('coordinator');
    const unlogged = await repo.sessions.unlogged();
    expect(unlogged.length).toBeGreaterThanOrEqual(3);
    expect(unlogged.every((a) => a.logState === 'not_logged')).toBe(true);
    const target = unlogged[0];
    actAs(repo, target.therapistId);
    expect((await repo.sessions.unlogged()).map((a) => a.id)).toContain(target.id);
    await repo.sessions.save(input(repo, target.id, { incidents: [] }));
    actAs(repo, userByName(repo, 'Dr. Meera Iyer'));
    expect((await repo.sessions.unlogged()).map((a) => a.id)).not.toContain(target.id);
  });

  it('serves history, previous session and parent snapshots', async () => {
    const repo = await signedIn('therapist');
    const aarav = childByName(repo, 'Aarav Sharma');
    const speech = repo.demo.store.therapyTypes.find((t) => t.organizationId === repo.getContext()!.organizationId && t.key === 'speech')!.id;
    const history = await repo.sessions.listForChild(aarav, { therapyTypeId: speech, limit: 5 });
    expect(history).toHaveLength(5);
    expect(history[0].date >= history[4].date).toBe(true);
    const prev = await repo.sessions.previous(aarav, speech);
    expect(prev?.id).toBe(history[0].id);
    const full = await repo.sessions.get(history[0].id);
    expect(full.notes.planNext).toBeTruthy();
    expect(await repo.sessions.getByAppointment(full.appointmentId)).toMatchObject({ id: full.id });
    const parent = await signedIn('parent');
    const snaps = await parent.sessions.parentSnapshots(aarav, { limit: 3 });
    expect(snaps).toHaveLength(3);
    expect(snaps[0].highlights.length).toBeGreaterThanOrEqual(3);
    expect(['better', 'same', 'harder']).toContain(snaps[0].overall);
  });
});
