import { actionCount, clampPercent, complianceRows, formatPercent, rateTone, todayTiles, workloadRows } from '../format';

describe('percent formatting', () => {
  it('clamps, rounds and guards bad numbers', () => {
    expect(clampPercent(91.6)).toBe(92);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(undefined)).toBe(0);
    expect(formatPercent(87.4)).toBe('87%');
  });

  it('uses a calm three-step tone', () => {
    expect(rateTone(95)).toBe('success');
    expect(rateTone(90)).toBe('success');
    expect(rateTone(75)).toBe('neutral');
    expect(rateTone(40)).toBe('warning');
  });
});

describe('complianceRows', () => {
  const rows = complianceRows([
    { therapistId: 'a', name: 'Ms. Riya', logged: 12, due: 14, percent: 85.7 },
    { therapistId: 'b', name: 'Mr. Arjun', logged: 5, due: 10, percent: 50 },
    { therapistId: 'c', name: 'Ms. Neha', logged: 0, due: 0, percent: 0 },
    { therapistId: 'd', name: 'Ms. Kavya', logged: 8, due: 8, percent: 100 },
  ]);

  it('puts the lowest compliance first and therapists with nothing due last', () => {
    expect(rows.map((r) => r.therapistId)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('computes bar fraction, rounded percent and tone', () => {
    const riya = rows.find((r) => r.therapistId === 'a')!;
    expect(riya).toMatchObject({ logged: 12, due: 14, percent: 86, tone: 'neutral' });
    expect(riya.fraction).toBeCloseTo(12 / 14);
    expect(rows.find((r) => r.therapistId === 'b')!.tone).toBe('warning');
    expect(rows.find((r) => r.therapistId === 'c')).toMatchObject({ noneDue: true, fraction: 0, tone: 'neutral' });
  });

  it('falls back to logged/due when percent is missing', () => {
    const [r] = complianceRows([{ therapistId: 'x', name: 'X', logged: 3, due: 4, percent: Number.NaN }]);
    expect(r.percent).toBe(75);
  });
});

describe('workloadRows', () => {
  it('sorts busiest first with bars relative to the busiest', () => {
    const rows = workloadRows([
      { therapistId: 'a', name: 'A', sessionsThisWeek: 10 },
      { therapistId: 'b', name: 'B', sessionsThisWeek: 20 },
      { therapistId: 'c', name: 'C', sessionsThisWeek: 0 },
    ]);
    expect(rows.map((r) => [r.therapistId, r.fraction])).toEqual([
      ['b', 1],
      ['a', 0.5],
      ['c', 0],
    ]);
  });

  it('handles an empty week', () => {
    expect(workloadRows([{ therapistId: 'a', name: 'A', sessionsThisWeek: 0 }])[0].fraction).toBe(0);
    expect(workloadRows([])).toEqual([]);
  });
});

describe('todayTiles / actionCount', () => {
  it('keeps a fixed tile order', () => {
    expect(todayTiles({ scheduled: 20, completed: 8, logged: 6, unlogged: 2, cancelled: 1 }).map((t) => t.key)).toEqual([
      'scheduled',
      'completed',
      'logged',
      'unlogged',
      'cancelled',
    ]);
  });

  it('counts items needing action', () => {
    expect(actionCount({ unloggedSessions: [], needsSubstitute: [], pendingReschedules: [] })).toBe(0);
  });
});
