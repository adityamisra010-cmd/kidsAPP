import { DEFAULT_DIMENSIONS } from '../constants';
import {
  checkAlerts,
  computeSessionMetrics,
  dimensionChange,
  goalAccuracy,
  masteryMet,
  overallChange,
  round,
  sessionScore,
  slope,
  trend,
  type PreviousSession,
} from '../metrics';
import type { RatingValue } from '../types';

const dims = DEFAULT_DIMENSIONS.map(({ key, weight, enabled }) => ({ key, weight, enabled }));
const all = (v: RatingValue): Record<string, RatingValue> => Object.fromEntries(dims.map((d) => [d.key, v]));
const prev = (score: number, rating: number, deltaRolling?: number): PreviousSession => ({
  sessionScore: score,
  ratings: Object.fromEntries(dims.map((d) => [d.key, rating])),
  deltaRolling,
});

describe('round', () => {
  it('rounds half away from zero like Postgres', () => {
    expect(round(2.25)).toBe(2.3);
    expect(round(-2.25)).toBe(-2.3);
    expect(round(-2.5, 0)).toBe(-3);
    expect(round(1.005, 2)).toBe(1.01);
  });
});

describe('sessionScore', () => {
  it('maps all 1s to 0 and all 5s to 100', () => {
    expect(sessionScore(all(1), dims)).toBe(0);
    expect(sessionScore(all(5), dims)).toBe(100);
    expect(sessionScore(all(3), dims)).toBe(50);
  });

  it('ignores disabled dimensions and applies weights', () => {
    const custom = [
      { key: 'engagement', weight: 3, enabled: true },
      { key: 'mood', weight: 1, enabled: true },
      { key: 'attention', weight: 1, enabled: false },
    ];
    // engagement 5 → 100 (w3), mood 1 → 0 (w1) → 75
    expect(sessionScore({ engagement: 5, mood: 1, attention: 1 }, custom)).toBe(75);
  });

  it('returns 0 when nothing is rated', () => {
    expect(sessionScore({}, dims)).toBe(0);
  });
});

describe('goalAccuracy', () => {
  it('averages per-goal accuracy, skipping goals with no attempts', () => {
    expect(
      goalAccuracy([
        { attempted: 10, successful: 8 },
        { attempted: 4, successful: 1 },
        { attempted: 0, successful: 0 },
      ]),
    ).toBe(52.5);
  });
  it('is undefined with no trials', () => {
    expect(goalAccuracy([])).toBeUndefined();
  });
  it('caps successful at attempted', () => {
    expect(goalAccuracy([{ attempted: 3, successful: 5 }])).toBe(100);
  });
});

describe('trend', () => {
  it('needs at least 3 points', () => {
    expect(trend([10, 90])).toBe('flat');
  });
  it('detects up, down and flat', () => {
    expect(trend([40, 45, 50, 55])).toBe('up');
    expect(trend([60, 55, 50, 45])).toBe('down');
    expect(trend([50, 51, 49, 50])).toBe('flat');
  });
  it('uses only the last 6 values', () => {
    expect(trend([0, 100, 50, 50, 50, 50, 50, 50])).toBe('flat');
  });
  it('slope is least squares', () => {
    expect(slope([1, 2, 3])).toBeCloseTo(1);
    expect(slope([5])).toBe(0);
  });
});

describe('computeSessionMetrics', () => {
  it('first session has no deltas', () => {
    const m = computeSessionMetrics({ ratings: all(4), goalTrials: [], incidents: [], dimensions: dims, previous: [] });
    expect(m.sessionScore).toBe(75);
    expect(m.deltaLast).toBeUndefined();
    expect(m.deltaRolling).toBeUndefined();
    expect(m.trend).toBe('flat');
    expect(m.dimensions.engagement).toEqual({ value: 4, deltaLast: undefined, deltaRolling: undefined, trend: 'flat' });
  });

  it('rolling average needs 2+ previous sessions and uses at most 4', () => {
    const one = computeSessionMetrics({
      ratings: all(4),
      goalTrials: [],
      incidents: [],
      dimensions: dims,
      previous: [prev(50, 3)],
    });
    expect(one.deltaLast).toBe(25);
    expect(one.deltaRolling).toBeUndefined();

    const many = computeSessionMetrics({
      ratings: all(4),
      goalTrials: [],
      incidents: [],
      dimensions: dims,
      // newest first; the 5th (score 0) must be ignored by the 4-session window
      previous: [prev(50, 3), prev(50, 3), prev(25, 2), prev(25, 2), prev(0, 1)],
    });
    expect(many.rollingAverage).toBe(37.5);
    expect(many.deltaRolling).toBe(37.5);
    expect(many.dimensions.mood.deltaLast).toBe(1);
    expect(many.dimensions.mood.deltaRolling).toBe(1.5);
    expect(many.trend).toBe('up');
  });

  it('counts incidents', () => {
    const m = computeSessionMetrics({
      ratings: all(2),
      goalTrials: [{ attempted: 5, successful: 5 }],
      incidents: [
        { type: 'meltdown', antecedentTags: ['transition'] },
        { type: 'refusal', antecedentTags: [] },
      ],
      dimensions: dims,
      previous: [],
    });
    expect(m.incidentCount).toBe(2);
    expect(m.goalAccuracy).toBe(100);
  });
});

describe('checkAlerts', () => {
  const t = { drop: 15, incidents: 3 };
  it('needs two consecutive drops', () => {
    expect(checkAlerts({ deltaRolling: -20, incidentCount: 0 }, prev(50, 3, -16), t).scoreDrop).toBe(true);
    expect(checkAlerts({ deltaRolling: -20, incidentCount: 0 }, prev(50, 3, -5), t).scoreDrop).toBe(false);
    expect(checkAlerts({ deltaRolling: -20, incidentCount: 0 }, undefined, t).scoreDrop).toBe(false);
    expect(checkAlerts({ deltaRolling: -15, incidentCount: 0 }, prev(50, 3, -15), t).scoreDrop).toBe(true);
  });
  it('flags 3+ incidents', () => {
    expect(checkAlerts({ incidentCount: 3 }, undefined, t).incidentSpike).toBe(true);
    expect(checkAlerts({ incidentCount: 2 }, undefined, t).incidentSpike).toBe(false);
  });
});

describe('masteryMet', () => {
  const rule = { accuracy: 80, consecutiveSessions: 3 };
  it('requires the last N sessions at or above the criterion', () => {
    expect(masteryMet([90, 80, 85], rule)).toBe(true);
    expect(masteryMet([90, 70, 85, 90], rule)).toBe(false);
    expect(masteryMet([60, 82, 85, 90], rule)).toBe(true);
    expect(masteryMet([90, 90], rule)).toBe(false);
  });
});

describe('parent wording', () => {
  it('maps deltas to words', () => {
    expect(dimensionChange(1)).toBe('better');
    expect(dimensionChange(0.5)).toBe('same');
    expect(dimensionChange(-1.5)).toBe('harder');
    expect(dimensionChange(undefined)).toBe('same');
    expect(overallChange(5)).toBe('better');
    expect(overallChange(-4.9)).toBe('same');
    expect(overallChange(-12)).toBe('harder');
  });
});

describe('trend boundary', () => {
  it('treats a slope of exactly -2.5 as down despite float noise', () => {
    expect(trend([38.8, 36.3, 33.8, 31.3])).toBe('down');
    expect(trend([31.3, 33.8, 36.3, 38.8])).toBe('up');
  });
});
