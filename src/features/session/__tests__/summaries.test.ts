import i18n, { initI18n } from '@/i18n';
import { localSummaryService } from '@/services/summaries';

import { allRated, dims } from '../__fixtures__/session';
import { dedupeChips, draftObjective, draftParentSummary, parentOpening } from '../summaries';

initI18n('en');
const en = i18n.getFixedT('en');
const hi = i18n.getFixedT('hi');

describe('draftObjective', () => {
  const base = {
    language: 'en' as const,
    dimensions: dims,
    ratings: { engagement: 4, attention: 3 } as const,
    regulationState: 'over' as const,
    trials: [{ goalText: 'Requests with 2 words', attempted: 10, successful: 7, promptLevel: 4 as const }],
    incidents: [{ type: 'refusal' as const, durationSeconds: 180, antecedentTags: ['demand', 'transition'] }],
    breaksCount: 2,
    actualMinutes: 40,
    startedLate: true,
  };

  it('writes ratings, energy, trials, incidents, breaks and length', () => {
    const text = draftObjective(en, base);
    expect(text.split('\n')).toEqual([
      'Snapshot: Engagement 4/5, Attention / Focus 3/5.',
      'Energy state: over-excited.',
      'Requests with 2 words: 7/10 correct (70%), verbal prompt.',
      '1 behaviour incident: refusal (1–5 min), after task demand and transition.',
      '2 breaks taken.',
      'Session length 40 min, started late.',
    ]);
  });

  it('notes when there were no incidents and skips goals with no tries', () => {
    const text = draftObjective(en, { ...base, incidents: [], breaksCount: 0, trials: [{ goalText: 'X', attempted: 0, successful: 0 }] });
    expect(text).toContain('No behaviour incidents.');
    expect(text).not.toContain('X:');
    expect(text).not.toContain('break');
  });

  it('uses the session prompt level when a trial has none', () => {
    const text = draftObjective(en, { ...base, trials: [{ goalText: 'G', attempted: 4, successful: 2 }], fallbackPromptLevel: 5 });
    expect(text).toContain('G: 2/4 correct (50%), independent.');
  });

  it('drafts in Hindi', () => {
    const text = draftObjective(hi, { ...base, language: 'hi' });
    expect(text).toContain('भागीदारी 4/5');
    expect(text).toContain('7/10 सही');
  });
});

describe('draftParentSummary', () => {
  const input = {
    language: 'en' as const,
    childName: 'Aarav',
    dimensions: dims,
    ratings: allRated(4),
    regulationState: 'regulated' as const,
    goalTexts: ['Asks for help with two words.'],
  };

  it('is empty until something is rated', () => {
    expect(draftParentSummary(en, { ...input, ratings: {} })).toBe('');
  });

  it('opens warmly, names improvements in words and the goals worked on', () => {
    const text = draftParentSummary(en, { ...input, deltaLast: { attention: 1, mood: 2, engagement: 0 } });
    expect(text).toBe('Aarav had a calm, settled session today. Focus and mood were better than last time. We worked on: asks for help with two words.');
  });

  it('mentions one harder area kindly and energy state', () => {
    const text = draftParentSummary(en, { ...input, regulationState: 'under', deltaLast: { attention: 1, transitions: -2 } });
    expect(text).toContain('Focus was better than last time.');
    expect(text).toContain('Moving between activities was a little harder today.');
    expect(text).toContain('Energy was a little low today.');
  });

  it('uses strengths when there is no previous session, and never numbers', () => {
    const text = draftParentSummary(en, { ...input, ratings: { ...allRated(3), attention: 5, mood: 4 } });
    expect(text).toContain('Focus and mood went well.');
    expect(text).not.toMatch(/\d/);
  });

  it('is gentle on a hard day', () => {
    const text = draftParentSummary(en, { ...input, ratings: allRated(1), deltaLast: { attention: -2 } });
    expect(text.startsWith("Aarav found today's session hard.")).toBe(true);
    expect(text).not.toContain('harder today');
  });

  it('drafts in Hindi', () => {
    const text = draftParentSummary(hi, { ...input, language: 'hi', deltaLast: { attention: 1 } });
    expect(text).toContain('Aarav');
    expect(text).toContain('ध्यान');
  });
});

describe('parentOpening', () => {
  it('maps scores to wording buckets', () => {
    expect(parentOpening(80, { mood: 3, regulation: 3 })).toBe('great');
    expect(parentOpening(60, { mood: 5, regulation: 4 })).toBe('settled');
    expect(parentOpening(60, {})).toBe('good');
    expect(parentOpening(45, {})).toBe('mixed');
    expect(parentOpening(10, {})).toBe('hard');
  });
});

describe('dedupeChips', () => {
  it('merges lists case-insensitively keeping first-seen order', () => {
    expect(dedupeChips(['timer', 'Bubbles '], ['bubbles', 'timer', ''], ['song_cue'])).toEqual(['timer', 'Bubbles', 'song_cue']);
  });
});

describe('localSummaryService', () => {
  it('wraps the rule-based drafts without any network call', async () => {
    expect(localSummaryService.kind).toBe('local');
    const text = await localSummaryService.draftParentSummary({
      language: 'en',
      childName: 'Diya',
      dimensions: dims,
      ratings: allRated(5),
      goalTexts: [],
    });
    expect(text.startsWith('Diya had')).toBe(true);
  });
});
