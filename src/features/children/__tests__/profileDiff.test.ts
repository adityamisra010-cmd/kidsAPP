import type { ChildProfile } from '@/domain/types';

import { addBullet, moveBullet, removeBullet, updateBullet, MAX_BULLETS } from '../bulletList';
import { buildProfilePatch, changedFields, cleanDraft, draftFromProfile, hasClinical, isProfileEmpty } from '../profileDiff';

const profile: ChildProfile = {
  childId: 'c1',
  communicationMode: 'limited_verbal',
  commTools: ['pecs', 'gestures'],
  commNotes: 'Uses 2-word phrases',
  reinforcers: ['bubbles', 'music'],
  reinforcersNotes: '',
  triggers: ['loud_sounds'],
  triggersNotes: '',
  calming: ['deep_pressure'],
  calmingNotes: '',
  sensoryNotes: 'Seeks movement',
  dos: ['Give a 2-minute warning before transitions', 'Use his name first'],
  donts: ["Don't touch without telling him first"],
  clinical: { diagnosis: ['Autism'], medicalNotes: '', allergies: 'Peanuts', medications: '' },
  updatedAt: '2026-10-01T10:00:00Z',
};

describe('profile diff', () => {
  it('reports no changes for an untouched draft', () => {
    const d = draftFromProfile(profile);
    expect(changedFields(d, draftFromProfile(profile), { includeClinical: true })).toEqual([]);
    expect(buildProfilePatch(d, draftFromProfile(profile), { includeClinical: true })).toEqual({});
  });

  it('ignores whitespace and chip order', () => {
    const base = draftFromProfile(profile);
    const d = { ...draftFromProfile(profile), commNotes: '  Uses 2-word phrases ', commTools: ['gestures', 'pecs'] };
    expect(changedFields(base, d, { includeClinical: false })).toEqual([]);
  });

  it('treats a re-ordered Do list as a change (order is priority)', () => {
    const base = draftFromProfile(profile);
    const d = { ...draftFromProfile(profile), dos: [...profile.dos].reverse() };
    expect(changedFields(base, d, { includeClinical: false })).toEqual(['dos']);
  });

  it('builds a cleaned patch with only changed fields', () => {
    const base = draftFromProfile(profile);
    const d = { ...draftFromProfile(profile), reinforcers: ['bubbles', 'music', 'swing', ' swing '], sensoryNotes: 'Seeks movement; avoids glue  ' };
    const patch = buildProfilePatch(base, d, { includeClinical: false });
    expect(patch).toEqual({ reinforcers: ['bubbles', 'music', 'swing'], sensoryNotes: 'Seeks movement; avoids glue' });
  });

  it('only includes clinical when allowed', () => {
    const base = draftFromProfile(profile);
    const d = draftFromProfile(profile);
    d.clinical.allergies = 'Peanuts, dust';
    expect(changedFields(base, d, { includeClinical: false })).toEqual([]);
    expect(buildProfilePatch(base, d, { includeClinical: true })).toEqual({
      clinical: { diagnosis: ['Autism'], medicalNotes: '', allergies: 'Peanuts, dust', medications: '' },
    });
  });

  it('treats a missing clinical block as empty', () => {
    const noClinical = { ...profile, clinical: undefined };
    const base = draftFromProfile(noClinical);
    expect(base.clinical).toEqual({ diagnosis: [], medicalNotes: '', allergies: '', medications: '' });
    expect(hasClinical(noClinical.clinical)).toBe(false);
    expect(hasClinical(profile.clinical)).toBe(true);
  });

  it('cleans empty bullets and duplicate chips', () => {
    const d = cleanDraft({ ...draftFromProfile(profile), donts: ['  ', 'No loud music', 'no loud music'] });
    expect(d.donts).toEqual(['No loud music']);
  });

  it('detects an empty profile', () => {
    expect(isProfileEmpty(profile)).toBe(false);
    expect(
      isProfileEmpty({ commTools: [], reinforcers: [], triggers: [], calming: [], dos: [], donts: [], commNotes: ' ', sensoryNotes: '' }),
    ).toBe(true);
  });
});

describe('bullet list', () => {
  it('adds trimmed unique bullets', () => {
    expect(addBullet([], '  Say his name first ')).toEqual(['Say his name first']);
    expect(addBullet(['A rule'], 'a rule')).toEqual(['A rule']);
    expect(addBullet(['A'], '   ')).toEqual(['A']);
  });

  it('caps the list length', () => {
    const full = Array.from({ length: MAX_BULLETS }, (_, i) => `Rule ${i}`);
    expect(addBullet(full, 'One more')).toBe(full);
  });

  it('updates, removes and moves', () => {
    const list = ['a', 'b', 'c'];
    expect(updateBullet(list, 1, 'B')).toEqual(['a', 'B', 'c']);
    expect(removeBullet(list, 0)).toEqual(['b', 'c']);
    expect(moveBullet(list, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveBullet(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveBullet(list, 0, -3)).toBe(list);
    expect(moveBullet(list, 5, 0)).toBe(list);
  });
});
