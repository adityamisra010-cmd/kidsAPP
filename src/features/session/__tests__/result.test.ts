import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { SessionInput } from '@/domain/types';

import { allRated, dims, goal, summary } from '../__fixtures__/session';
import { buildParentPreview, computeSavedResult, masterySuggestions, toPreviousSessions } from '../logic/result';

function input(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
    clientId: 'c',
    appointmentId: 'appt-now',
    actualMinutes: 45,
    startedLate: false,
    regulationState: 'regulated',
    ratings: allRated(4),
    goalTrials: [{ goalId: 'g1', attempted: 10, successful: 9, promptLevel: 4 }],
    incidents: [],
    breaksCount: 0,
    comparedToLast: 'better',
    workedTags: [],
    workedText: '',
    notWorkedTags: [],
    notWorkedText: '',
    notes: {
      subjective: '',
      objective: '',
      assessment: '',
      planNext: 'x',
      planGoalIds: [],
      parentSummary: 'Kind words',
    },
    ...overrides,
  };
}

describe('toPreviousSessions', () => {
  it('orders newest first and excludes this appointment, the edited session and later dates', () => {
    const list = [
      summary('a', '2026-10-20', 40, 3),
      summary('b', '2026-10-27', 60, 3),
      summary('c', '2026-10-29', 70, 3, { appointmentId: 'appt-now' }),
      summary('d', '2026-11-02', 90, 5),
      summary('e', '2026-10-24', 50, 3),
    ];
    const prev = toPreviousSessions(list, {
      appointmentId: 'appt-now',
      onOrBefore: '2026-10-29',
      excludeSessionId: 'e',
    });
    expect(prev.map((p) => p.sessionScore)).toEqual([60, 40]);
  });
});

describe('computeSavedResult', () => {
  it('computes score, deltas and rolling average from previous sessions', () => {
    const previous = toPreviousSessions([summary('a', '2026-10-27', 50, 3), summary('b', '2026-10-24', 40, 3)], {
      appointmentId: 'x',
      onOrBefore: '2026-10-29',
    });
    const r = computeSavedResult({
      input: input(),
      dimensions: dims,
      previous,
      goals: [],
      history: {},
      settings: DEFAULT_ORG_SETTINGS,
    });
    expect(r.metrics.sessionScore).toBe(75);
    expect(r.metrics.deltaLast).toBe(25);
    expect(r.metrics.rollingAverage).toBe(45);
    expect(r.metrics.deltaRolling).toBe(30);
    expect(r.metrics.goalAccuracy).toBe(90);
    expect(r.hasPrevious).toBe(true);
    expect(r.alerts).toEqual({ scoreDrop: false, incidentSpike: false });
  });

  it('has no deltas for a first session and flags an incident spike', () => {
    const incidents = [1, 2, 3].map(() => ({ type: 'meltdown' as const, antecedentTags: [] }));
    const r = computeSavedResult({
      input: input({ incidents }),
      dimensions: dims,
      previous: [],
      goals: [],
      history: {},
      settings: DEFAULT_ORG_SETTINGS,
    });
    expect(r.metrics.deltaLast).toBeUndefined();
    expect(r.metrics.deltaRolling).toBeUndefined();
    expect(r.hasPrevious).toBe(false);
    expect(r.alerts.incidentSpike).toBe(true);
  });
});

describe('masterySuggestions', () => {
  it('suggests mastery when this session completes the rule', () => {
    const goals = [goal('g1')];
    const history = {
      g1: [
        { date: '2026-10-20', sessionId: 's1', accuracy: 85, attempted: 10, successful: 8, promptLevel: 4 as const },
        { date: '2026-10-24', sessionId: 's2', accuracy: 82, attempted: 10, successful: 8, promptLevel: 4 as const },
      ],
    };
    expect(masterySuggestions(input(), goals, history)).toEqual(['g1']);
    // Excluding the session being edited removes one qualifying point.
    expect(masterySuggestions(input(), goals, history, 's2')).toEqual([]);
    // Already mastered goals are not suggested again.
    expect(masterySuggestions(input(), [goal('g1', { status: 'mastered' })], history)).toEqual([]);
  });
});

describe('buildParentPreview', () => {
  it('shows highlights in words, hides the score unless enabled and lists goals worked on', () => {
    const previous = toPreviousSessions([summary('a', '2026-10-27', 50, 3)], {
      appointmentId: 'x',
      onOrBefore: '2026-10-29',
    });
    const base = {
      sessionId: 'preview',
      date: '2026-10-29',
      therapyTypeName: 'Speech Therapy',
      therapyTypeColor: '#C66B4E',
      therapistName: 'Ms. Priya',
      isSubstitute: false,
      input: input({ ratings: { ...allRated(3), attention: 5 } }),
      dimensions: dims,
      previous,
      goals: [goal('g1')],
    };
    const p = buildParentPreview({ ...base, showScore: false });
    expect(p.highlights.map((h) => h.key)).toEqual(['attention', 'mood', 'engagement', 'communication']);
    expect(p.highlights[0].change).toBe('better');
    expect(p.highlights[1].change).toBe('same');
    expect(p.sessionScore).toBeUndefined();
    expect(p.goalsWorkedOn).toEqual([{ goalId: 'g1', parentText: goal('g1').parentText }]);
    expect(buildParentPreview({ ...base, showScore: true }).sessionScore).toBeGreaterThan(0);
  });
});
