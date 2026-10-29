import type { GoalProgressPoint, RatingValue, SessionSummary } from '@/domain/types';

import {
  accuracySeries,
  attendanceCounts,
  comparisonSummary,
  computeFourSessionAverage,
  dimensionComparison,
  dimensionSeries,
  dimensionTrend,
  groupedBarData,
  incidentSeries,
  masteryLine,
  masteryProgress,
  niceMax,
  scoreSeries,
  scoreSummary,
  substituteImpact,
  thinLabels,
} from '../chartData';
import { rangeForPreset } from '../ranges';

function session(date: string, score: number, ratings: Record<string, RatingValue> = {}): SessionSummary {
  return {
    id: date,
    appointmentId: date,
    childId: 'c1',
    date,
    therapyTypeId: 'sp',
    therapyTypeName: 'Speech',
    therapyTypeColor: '#C66B4E',
    therapistName: 'Ms Rao',
    isSubstitute: false,
    sessionScore: score,
    trend: 'flat',
    ratings,
    incidentCount: 0,
    comparedToLast: 'same',
    parentSummary: '',
  };
}

const fmt = (d: string) => d.slice(5);

describe('score series', () => {
  const sessions = [session('2026-10-08', 60), session('2026-10-01', 50), session('2026-10-15', 70), session('2026-10-22', 75)];

  it('sorts oldest → newest and labels points', () => {
    expect(scoreSeries(sessions, fmt).map((p) => [p.label, p.value])).toEqual([
      ['10-01', 50],
      ['10-08', 60],
      ['10-15', 70],
      ['10-22', 75],
    ]);
  });

  it('summarises count, average, change and trend', () => {
    expect(scoreSummary(sessions)).toEqual({ count: 4, average: 64, latest: 75, change: 25, trend: 'up' });
    expect(scoreSummary([])).toEqual({ count: 0, average: undefined, latest: undefined, change: undefined, trend: 'flat' });
  });

  it('thins labels but keeps the last', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ label: String(i) }));
    const thinned = thinLabels(pts, 4).map((p) => p.label);
    expect(thinned[9]).toBe('9');
    expect(thinned.filter(Boolean).length).toBeLessThanOrEqual(4);
  });
});

describe('dimension comparison', () => {
  const sessions = [
    session('2026-09-01', 50, { attention: 2, mood: 4 }),
    session('2026-09-08', 50, { attention: 3, mood: 4 }),
    session('2026-09-15', 50, { attention: 3, mood: 3 }),
    session('2026-09-22', 50, { attention: 2, mood: 5 }),
    session('2026-09-29', 50, { attention: 4, mood: 3 }),
    session('2026-10-06', 50, { attention: 5, mood: 2 }),
  ];

  it('averages the 4 sessions before the latest', () => {
    // attention: 3,3,2,4 → 3 ; mood: 4,3,5,3 → 3.8
    expect(computeFourSessionAverage(sessions)).toEqual({ attention: 3, mood: 3.8 });
  });

  it('builds rows and a words summary', () => {
    const rows = dimensionComparison(sessions[5], { attention: 3, mood: 3.8 }, [
      { key: 'attention', label: 'Focus' },
      { key: 'mood', label: 'Mood' },
      { key: 'transitions', label: 'Transitions' },
    ]);
    expect(rows).toEqual([
      { key: 'attention', label: 'Focus', latest: 5, average: 3, diff: 2 },
      { key: 'mood', label: 'Mood', latest: 2, average: 3.8, diff: -1.8 },
      { key: 'transitions', label: 'Transitions', latest: undefined, average: undefined, diff: undefined },
    ]);
    expect(comparisonSummary(rows)).toEqual({ higher: ['Focus'], lower: ['Mood'] });
  });

  it('builds grouped bars (average then latest) and skips empty dimensions', () => {
    const rows = dimensionComparison(sessions[5], { attention: 3 }, [
      { key: 'attention', label: 'Focus' },
      { key: 'transitions', label: 'Transitions' },
    ]);
    const bars = groupedBarData(rows, { averageColor: 'grey', latestColor: 'orange', barWidth: 10, innerGap: 2, groupGap: 14 });
    expect(bars).toEqual([
      { value: 3, frontColor: 'grey', spacing: 2, label: 'Focus', barWidth: 10 },
      { value: 5, frontColor: 'orange', spacing: 14, barWidth: 10 },
    ]);
  });

  it('extracts a per-dimension series and its trend', () => {
    expect(dimensionSeries(sessions, 'attention')).toEqual([2, 3, 3, 2, 4, 5]);
    expect(dimensionSeries(sessions, 'missing')).toEqual([]);
    expect(dimensionTrend([2, 3, 3, 2, 4, 5])).toBe('up');
    expect(dimensionTrend([3, 3, 3])).toBe('flat');
  });
});

describe('goal accuracy + mastery line', () => {
  const pt = (date: string, accuracy: number): GoalProgressPoint => ({ date, sessionId: date, accuracy, attempted: 5, successful: 4, promptLevel: 3 });
  const points = [pt('2026-10-15', 80), pt('2026-10-01', 40), pt('2026-10-08', 85), pt('2026-10-22', 90)];

  it('builds an ordered accuracy series and a flat mastery line', () => {
    expect(accuracySeries(points, fmt).map((p) => p.value)).toEqual([40, 85, 80, 90]);
    expect(masteryLine(4, 80)).toEqual([80, 80, 80, 80]);
    expect(masteryLine(0, 80)).toEqual([]);
  });

  it('reports streak and whether mastery is met', () => {
    expect(masteryProgress(points, { accuracy: 80, consecutiveSessions: 3 })).toEqual({ sessions: 4, atOrAbove: 3, streak: 3, met: true, latest: 90 });
    expect(masteryProgress(points, { accuracy: 85, consecutiveSessions: 3 })).toMatchObject({ streak: 1, met: false });
  });
});

describe('summaries', () => {
  it('describes substitute impact in whole points', () => {
    expect(substituteImpact({ regularAvg: 68.4, substituteAvg: 62.1, substituteCount: 3 })).toEqual({ diff: 6, direction: 'lower', count: 3 });
    expect(substituteImpact({ regularAvg: 60, substituteAvg: 61, substituteCount: 2 })).toEqual({ diff: 1, direction: 'same', count: 2 });
    expect(substituteImpact({ regularAvg: 60, substituteAvg: 0, substituteCount: 0 })).toBeNull();
    expect(substituteImpact(undefined)).toBeNull();
  });

  it('counts attendance without blaming families for school cancellations', () => {
    expect(attendanceCounts({ scheduled: 11, attended: 8, late: 1, absent: 1, cancelledBySchool: 2, cancelledByParent: 0 })).toEqual({
      attended: 8,
      expected: 9,
      late: 1,
      absent: 1,
      cancelledByParent: 0,
      cancelledBySchool: 2,
    });
  });

  it('orders incidents by week', () => {
    expect(incidentSeries([{ weekStart: '2026-10-12', count: 2 }, { weekStart: '2026-10-05', count: 0 }], fmt).map((p) => p.value)).toEqual([0, 2]);
  });

  it('computes a tidy chart ceiling', () => {
    expect(niceMax([1, 2], 4)).toBe(4);
    expect(niceMax([7], 4, 2)).toBe(8);
  });

  it('maps range presets to dates', () => {
    const today = new Date(2026, 9, 29);
    expect(rangeForPreset('4w', today)).toEqual({ from: '2026-10-01', to: '2026-10-29' });
    expect(rangeForPreset('3m', today)).toEqual({ from: '2026-07-29', to: '2026-10-29' });
    expect(rangeForPreset('all', today)).toEqual({});
  });
});
