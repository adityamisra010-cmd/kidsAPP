import type { GoalBankItem, GoalStatus, TherapyType } from '@/domain/types';

import { draftFromBankItem, emptyGoalDraft, filterBank, toGoalInput, validateBankDraft, validateGoalDraft } from '../goalForm';
import {
  groupByTherapy,
  isAchieved,
  isActiveGoal,
  parentStatusView,
  PARENT_STATUS_META,
  sortForParent,
  sortForStaff,
  STAFF_STATUS_META,
  STATUS_OPTIONS,
} from '../goalStatus';

const ALL: GoalStatus[] = ['not_started', 'emerging', 'progressing', 'mastered', 'maintenance', 'paused'];

describe('goal status → parent status', () => {
  it.each([
    ['not_started', 'working_on_it'],
    ['emerging', 'working_on_it'],
    ['progressing', 'getting_there'],
    ['mastered', 'achieved'],
    ['maintenance', 'achieved'],
    ['paused', 'paused'],
  ] as const)('%s shows parents "%s" with an icon and label key', (status, parent) => {
    const v = parentStatusView(status);
    expect(v.status).toBe(parent);
    expect(v.labelKey).toBe(`goals:parentStatus.${parent}`);
    expect(v.icon).toBeTruthy();
  });

  it('has icon + tone for every status (never colour alone)', () => {
    for (const s of ALL) expect(STAFF_STATUS_META[s].icon).toBeTruthy();
    for (const p of Object.keys(PARENT_STATUS_META)) expect(PARENT_STATUS_META[p as keyof typeof PARENT_STATUS_META].icon).toBeTruthy();
    expect(STATUS_OPTIONS).toEqual(ALL);
  });

  it('classifies active and achieved goals', () => {
    expect(ALL.filter(isActiveGoal)).toEqual(['not_started', 'emerging', 'progressing']);
    expect(ALL.filter(isAchieved)).toEqual(['mastered', 'maintenance']);
  });

  it('orders parent goals closest-to-success first', () => {
    const goals = ALL.map((status, i) => ({ id: String(i), status }));
    expect(sortForParent(goals).map((g) => g.status)).toEqual(['progressing', 'not_started', 'emerging', 'paused', 'mastered', 'maintenance']);
  });

  it('puts mastery confirmations first for staff', () => {
    const goals = [
      { id: 'a', status: 'emerging' as GoalStatus, masterySuggested: false },
      { id: 'b', status: 'mastered' as GoalStatus, masterySuggested: true },
      { id: 'c', status: 'progressing' as GoalStatus, masterySuggested: true },
      { id: 'd', status: 'progressing' as GoalStatus, masterySuggested: false },
    ];
    expect(sortForStaff(goals).map((g) => g.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('groups by therapy type in school order', () => {
    const types = [{ id: 'sp' }, { id: 'ot' }] as TherapyType[];
    const groups = groupByTherapy(
      [
        { id: '1', therapyTypeId: 'ot' },
        { id: '2', therapyTypeId: 'x' },
        { id: '3', therapyTypeId: 'sp' },
        { id: '4', therapyTypeId: 'ot' },
      ],
      types,
    );
    expect(groups.map((g) => [g.therapyTypeId, g.goals.map((x) => x.id)])).toEqual([
      ['sp', ['3']],
      ['ot', ['1', '4']],
      ['x', ['2']],
    ]);
    expect(groups[2].therapyType).toBeUndefined();
  });
});

describe('goal form', () => {
  const bank: GoalBankItem[] = [
    { id: 'b1', organizationId: null, domain: 'communication', therapyTypeKey: 'speech', staffText: 'Requests using 2-word phrases in 4/5 trials', parentText: 'Asks for things with two words' },
    { id: 'b2', organizationId: 'o1', domain: 'fine_motor', therapyTypeKey: 'occupational', staffText: 'Uses pincer grasp', parentText: 'Picks up small things with fingers' },
  ];

  it('starts with the default mastery rule', () => {
    const d = emptyGoalDraft('2026-10-29');
    expect(d.accuracy).toBe(80);
    expect(d.consecutiveSessions).toBe(3);
    expect(d.status).toBe('not_started');
  });

  it('requires parent-friendly wording', () => {
    const d = { ...emptyGoalDraft('2026-10-29', 'sp'), domain: 'communication' as const, staffText: 'Staff text' };
    expect(validateGoalDraft(d)).toEqual({ parentText: 'goals:form.errors.parentText' });
    expect(validateGoalDraft({ ...d, parentText: 'Asks for help' })).toEqual({});
  });

  it('validates the mastery rule bounds', () => {
    const d = { ...emptyGoalDraft('2026-10-29', 'sp'), domain: 'communication' as const, staffText: 'a', parentText: 'b', accuracy: 30, consecutiveSessions: 0 };
    const e = validateGoalDraft(d);
    expect(e.accuracy).toBeDefined();
    expect(e.consecutiveSessions).toBeDefined();
  });

  it('prefills from the bank and maps the therapy type by key', () => {
    const d = draftFromBankItem(bank[0], emptyGoalDraft('2026-10-29'), [
      { id: 'tt-speech', key: 'speech' },
      { id: 'tt-ot', key: 'occupational' },
    ]);
    expect(d).toMatchObject({ therapyTypeId: 'tt-speech', domain: 'communication', parentText: 'Asks for things with two words', bankItemId: 'b1' });
    const keep = draftFromBankItem(bank[0], emptyGoalDraft('2026-10-29', 'tt-ot'), [{ id: 'tt-ot', key: 'occupational' }]);
    expect(keep.therapyTypeId).toBe('tt-ot');
  });

  it('builds a trimmed create payload', () => {
    const d = { ...emptyGoalDraft('2026-10-29', 'sp'), domain: 'social' as const, staffText: ' Takes turns ', parentText: ' Waits for a turn ', baseline: ' 1/5 ' };
    expect(toGoalInput(d, 'c1')).toEqual({
      childId: 'c1',
      therapyTypeId: 'sp',
      domain: 'social',
      staffText: 'Takes turns',
      parentText: 'Waits for a turn',
      baseline: '1/5',
      masteryRule: { accuracy: 80, consecutiveSessions: 3 },
      status: 'not_started',
      startDate: '2026-10-29',
    });
  });

  it('filters the bank by domain, therapy type and text', () => {
    expect(filterBank(bank, { domain: 'fine_motor' }).map((b) => b.id)).toEqual(['b2']);
    expect(filterBank(bank, { therapyTypeKey: 'speech' }).map((b) => b.id)).toEqual(['b1']);
    expect(filterBank(bank, { search: 'FINGERS' }).map((b) => b.id)).toEqual(['b2']);
    expect(filterBank(bank, {})).toHaveLength(2);
  });

  it('validates new bank items', () => {
    expect(Object.keys(validateBankDraft({ domain: null, therapyTypeKey: null, staffText: '', parentText: '' })).sort()).toEqual([
      'domain',
      'parentText',
      'staffText',
      'therapyTypeKey',
    ]);
  });
});
