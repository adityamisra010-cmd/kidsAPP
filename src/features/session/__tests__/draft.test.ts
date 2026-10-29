import type { RatingValue } from '@/domain/types';

import { allRated, dims, goal, sessionLog, THERAPIST_ID } from '../__fixtures__/session';
import {
  activeGoals,
  bucketForSeconds,
  buildSessionInput,
  canAmend,
  canEdit,
  diffForAmend,
  draftFromLog,
  emptyDraft,
  orderGoals,
  ratedCount,
  validateDraft,
  type LoggerDraft,
} from '../logic/draft';

const ctx = { clientId: 'c-1', appointmentId: 'appt-1', objectiveDraft: 'Auto O', parentSummaryDraft: 'Auto parent' };

function complete(overrides: Partial<LoggerDraft> = {}): LoggerDraft {
  return { ...emptyDraft({ scheduledMinutes: 45 }), ratings: allRated(4), regulationState: 'regulated', planNext: 'Continue', ...overrides };
}

describe('emptyDraft', () => {
  it('starts with blank ratings and the scheduled length', () => {
    const d = emptyDraft({ scheduledMinutes: 45, plannedGoalIds: ['g1'] });
    expect(d.ratings).toEqual({});
    expect(d.actualMinutes).toBe(45);
    expect(d.trials).toEqual([{ goalId: 'g1', attempted: 0, successful: 0, note: '' }]);
    expect(d.objective).toBeNull();
    expect(d.parentSummary).toBeNull();
  });
});

describe('validateDraft', () => {
  it('lists every missing required item in screen order', () => {
    const issues = validateDraft(emptyDraft({ scheduledMinutes: 45 }), dims);
    const ids = issues.map((i) => i.id);
    expect(ids[0]).toBe('rating:engagement');
    // Energy state comes right before the regulation score.
    expect(ids.indexOf('regulationState')).toBe(ids.indexOf('rating:regulation') - 1);
    expect(ids[ids.length - 1]).toBe('planNext');
    expect(issues.filter((i) => i.kind === 'rating')).toHaveLength(8);
  });

  it('passes a complete draft', () => {
    expect(validateDraft(complete(), dims)).toEqual([]);
  });

  it('ignores disabled dimensions and still requires the energy state', () => {
    const custom = dims.map((d) => (d.key === 'regulation' || d.key === 'mood' ? { ...d, enabled: false } : d));
    const ratings = { ...allRated(3) };
    delete ratings.mood;
    delete ratings.regulation;
    const issues = validateDraft(complete({ ratings, regulationState: undefined }), custom);
    expect(issues.map((i) => i.id)).toEqual(['regulationState']);
  });

  it('treats a whitespace-only plan as missing', () => {
    expect(validateDraft(complete({ planNext: '   ' }), dims).map((i) => i.kind)).toEqual(['planNext']);
  });

  it('needs a prompt level for tried goals only when there is no Independence rating', () => {
    const ratings = { ...allRated(4) };
    delete ratings.independence;
    const custom = dims.map((d) => (d.key === 'independence' ? { ...d, enabled: false } : d));
    const draft = complete({ ratings, trials: [{ goalId: 'g1', attempted: 5, successful: 3, note: '' }, { goalId: 'g2', attempted: 0, successful: 0, note: '' }] });
    expect(validateDraft(draft, custom).map((i) => i.id)).toEqual(['trial:g1']);
    // With an Independence rating the session level is used instead.
    expect(validateDraft(complete({ trials: draft.trials }), dims)).toEqual([]);
  });
});

describe('ratedCount', () => {
  it('counts enabled dimensions with a rating', () => {
    expect(ratedCount({ ratings: { engagement: 3, mood: 4 } }, dims)).toBe(2);
    expect(ratedCount({ ratings: allRated(5) }, dims)).toBe(8);
  });
});

describe('buildSessionInput', () => {
  it('drops goals with no tries, clamps correct to tries and falls back to the session prompt level', () => {
    const input = buildSessionInput(
      complete({
        ratings: { ...allRated(4), independence: 2 as RatingValue },
        trials: [
          { goalId: 'g1', attempted: 10, successful: 12, note: '  needs model  ' },
          { goalId: 'g2', attempted: 0, successful: 0, note: '' },
          { goalId: 'g3', attempted: 4, successful: 4, promptLevel: 5, note: '' },
        ],
      }),
      ctx,
    );
    expect(input.goalTrials).toEqual([
      { goalId: 'g1', attempted: 10, successful: 10, promptLevel: 2, note: 'needs model' },
      { goalId: 'g3', attempted: 4, successful: 4, promptLevel: 5 },
    ]);
  });

  it('uses the auto drafts unless the therapist edited them, and defaults a skipped comparison to "same"', () => {
    const auto = buildSessionInput(complete(), ctx);
    expect(auto.notes.objective).toBe('Auto O');
    expect(auto.notes.parentSummary).toBe('Auto parent');
    expect(auto.comparedToLast).toBe('same');
    expect(auto.clientId).toBe('c-1');
    const edited = buildSessionInput(complete({ objective: 'Mine', parentSummary: '', comparedToLast: 'better' }), ctx);
    expect(edited.notes.objective).toBe('Mine');
    expect(edited.notes.parentSummary).toBe('');
    expect(edited.comparedToLast).toBe('better');
  });
});

describe('diffForAmend', () => {
  it('returns only the changed top-level fields', () => {
    const log = sessionLog();
    const same = buildSessionInput(draftFromLog(log), ctx);
    expect(diffForAmend(log, same)).toEqual({});
    const changed = buildSessionInput({ ...draftFromLog(log), breaksCount: 3, ratings: { ...log.ratings, mood: 2 } }, ctx);
    const diff = diffForAmend(log, changed);
    expect(Object.keys(diff).sort()).toEqual(['breaksCount', 'ratings']);
    expect(diff.breaksCount).toBe(3);
  });
});

describe('permissions', () => {
  const log = sessionLog({ lockedAt: '2026-10-30T11:00:00+05:30' });
  const before = new Date('2026-10-30T10:00:00+05:30');
  const after = new Date('2026-10-30T12:00:00+05:30');

  it('lets the author edit inside the window only', () => {
    expect(canEdit(log, THERAPIST_ID, before)).toBe(true);
    expect(canEdit(log, THERAPIST_ID, after)).toBe(false);
    expect(canEdit(log, 'someone-else', before)).toBe(false);
  });

  it('allows amendments after the lock for the author and coordinators', () => {
    expect(canAmend(log, THERAPIST_ID, 'therapist', before)).toBe(false);
    expect(canAmend(log, THERAPIST_ID, 'therapist', after)).toBe(true);
    expect(canAmend(log, 'coord', 'coordinator', after)).toBe(true);
    expect(canAmend(log, 'other-therapist', 'therapist', after)).toBe(false);
  });
});

describe('goals helpers', () => {
  it('keeps active goals and orders planned ones first', () => {
    const goals = [goal('a'), goal('b', { status: 'paused' }), goal('c'), goal('d', { status: 'mastered' })];
    const active = activeGoals(goals);
    expect(active.map((g) => g.id)).toEqual(['a', 'c']);
    expect(orderGoals(active, ['c']).map((g) => g.id)).toEqual(['c', 'a']);
  });

  it('maps seconds to duration chips', () => {
    expect(bucketForSeconds(undefined)).toBeUndefined();
    expect(bucketForSeconds(30)).toBe('lt1');
    expect(bucketForSeconds(180)).toBe('1to5');
    expect(bucketForSeconds(600)).toBe('5to15');
    expect(bucketForSeconds(1200)).toBe('15plus');
  });
});
