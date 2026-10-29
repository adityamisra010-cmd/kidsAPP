import type { Consent } from '@/domain/types';

import { buildConsentInputs, hasCurrentConsent, latestConsent, videoConsentInputs, videoUploadsAllowed } from '../consents';

const c = (over: Partial<Consent>): Consent => ({
  id: Math.random().toString(36),
  userId: 'u1',
  kind: 'data_processing',
  granted: true,
  at: '2026-10-01T10:00:00.000Z',
  version: '2026-10',
  ...over,
});

describe('consent records', () => {
  it('writes data + video records per child', () => {
    expect(buildConsentInputs(['a', 'b'], false, 'v1')).toEqual([
      { kind: 'data_processing', granted: true, version: 'v1', childId: 'a' },
      { kind: 'video_upload', granted: false, version: 'v1', childId: 'a' },
      { kind: 'data_processing', granted: true, version: 'v1', childId: 'b' },
      { kind: 'video_upload', granted: false, version: 'v1', childId: 'b' },
    ]);
  });

  it('writes one unscoped pair when no child is linked yet', () => {
    expect(buildConsentInputs([], true, 'v1')).toEqual([
      { kind: 'data_processing', granted: true, version: 'v1' },
      { kind: 'video_upload', granted: true, version: 'v1' },
    ]);
  });

  it('writes a video record per child when the choice changes', () => {
    expect(videoConsentInputs(['a', 'b'], false, 'v1').map((i) => [i.childId, i.granted])).toEqual([
      ['a', false],
      ['b', false],
    ]);
  });

  it('uses the newest record per kind and child', () => {
    const list = [
      c({ kind: 'video_upload', granted: true, childId: 'a', at: '2026-10-01T10:00:00.000Z' }),
      c({ kind: 'video_upload', granted: false, childId: 'a', at: '2026-10-05T10:00:00.000Z' }),
      c({ kind: 'video_upload', granted: true, childId: 'b', at: '2026-10-06T10:00:00.000Z' }),
    ];
    expect(latestConsent(list, 'video_upload', 'a')?.granted).toBe(false);
    expect(latestConsent(list, 'video_upload', 'b')?.granted).toBe(true);
    expect(latestConsent(list, 'data_processing', 'a')).toBeUndefined();
  });

  it('requires a current-version grant for every child', () => {
    const list = [c({ childId: 'a' }), c({ childId: 'b', version: '2025-01' })];
    expect(hasCurrentConsent(list, ['a'], '2026-10')).toBe(true);
    expect(hasCurrentConsent(list, ['a', 'b'], '2026-10')).toBe(false);
    expect(hasCurrentConsent([], ['a'], '2026-10')).toBe(false);
    expect(hasCurrentConsent([c({ childId: undefined })], [], '2026-10')).toBe(true);
  });

  it('treats a withdrawal as the current choice', () => {
    const list = [c({ childId: 'a', granted: true }), c({ childId: 'a', granted: false, at: '2026-10-02T10:00:00.000Z' })];
    expect(hasCurrentConsent(list, ['a'], '2026-10')).toBe(false);
  });

  it('allows video uploads only when every child has a current grant', () => {
    const list = [c({ kind: 'video_upload', childId: 'a' }), c({ kind: 'video_upload', childId: 'b', granted: false })];
    expect(videoUploadsAllowed(list, ['a'])).toBe(true);
    expect(videoUploadsAllowed(list, ['a', 'b'])).toBe(false);
    expect(videoUploadsAllowed([], ['a'])).toBe(false);
  });
});
