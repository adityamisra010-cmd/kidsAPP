import { VIDEO_LIMITS } from '@/domain/constants';
import type { Consent } from '@/domain/types';

import {
  addStep,
  buildHomeLogInput,
  checkVideoDuration,
  checkVideoSize,
  cleanSteps,
  defaultTaskDraft,
  greetingKey,
  isAssignableGoal,
  MAX_STEPS,
  moveStep,
  nextInQueue,
  pickerDurationS,
  practisedThisWeek,
  recentFeedback,
  removeStep,
  toTaskInput,
  updateStep,
  validateTaskDraft,
  validateVideo,
  videoConsentGranted,
  weeklyProgress,
} from '../logic';
import { makeLog } from '../testing';

describe('video validation', () => {
  it('converts picker milliseconds to seconds and ignores unknown values', () => {
    expect(pickerDurationS(32_400)).toBe(32.4);
    expect(pickerDurationS(null)).toBeUndefined();
    expect(pickerDurationS(0)).toBeUndefined();
  });

  it('allows up to 60 s with a small tolerance, rejects longer clips', () => {
    expect(checkVideoDuration(60)).toBeNull();
    expect(checkVideoDuration(60.8)).toBeNull();
    expect(checkVideoDuration(62)).toBe('too_long');
    expect(checkVideoDuration(undefined)).toBeNull();
  });

  it('caps the compressed size at 25 MB', () => {
    expect(checkVideoSize(VIDEO_LIMITS.maxSizeBytes)).toBeNull();
    expect(checkVideoSize(VIDEO_LIMITS.maxSizeBytes + 1)).toBe('too_large');
    expect(validateVideo({ durationS: 90, sizeBytes: 1 })).toBe('too_long');
    expect(validateVideo({ durationS: 30, sizeBytes: 30 * 1024 * 1024 })).toBe('too_large');
    expect(validateVideo({ durationS: 30, sizeBytes: 5 * 1024 * 1024 })).toBeNull();
  });
});

describe('weekly progress', () => {
  it('counts partly as practised and picks an encouraging line', () => {
    expect(weeklyProgress({ expected: 5, done: 2, partly: 1 })).toEqual({ practised: 3, expected: 5, ratio: 0.6, mood: 'halfway' });
    expect(weeklyProgress({ expected: 5, done: 0, partly: 0 }).mood).toBe('notStarted');
    expect(weeklyProgress({ expected: 5, done: 1, partly: 0 }).mood).toBe('started');
  });

  it('never shows more than expected and handles weeks with nothing planned', () => {
    expect(weeklyProgress({ expected: 3, done: 5, partly: 0 })).toEqual({ practised: 3, expected: 3, ratio: 1, mood: 'complete' });
    expect(weeklyProgress({ expected: 0, done: 0, partly: 0 }).mood).toBe('none');
  });

  it("counts this week's practice per task, skipping couldn't-do and last week", () => {
    const now = new Date(2026, 9, 29, 12); // Thu 29 Oct 2026
    const logs = [
      makeLog({ id: 'a', createdAt: new Date(2026, 9, 26, 18).toISOString() }), // Mon
      makeLog({ id: 'b', outcome: 'partly', createdAt: new Date(2026, 9, 28, 18).toISOString() }),
      makeLog({ id: 'c', outcome: 'could_not', createdAt: new Date(2026, 9, 28, 19).toISOString() }),
      makeLog({ id: 'd', createdAt: new Date(2026, 9, 25, 18).toISOString() }), // previous Sunday
      makeLog({ id: 'e', taskId: 'other', createdAt: new Date(2026, 9, 27, 18).toISOString() }),
    ];
    expect(practisedThisWeek(logs, 't1', now)).toBe(2);
  });
});

describe('steps editing', () => {
  it('adds, updates, moves and removes steps', () => {
    let s = ['Sit down'];
    s = addStep(s);
    s = updateStep(s, 1, 'Blow bubbles');
    expect(s).toEqual(['Sit down', 'Blow bubbles']);
    expect(moveStep(s, 1, -1)).toEqual(['Blow bubbles', 'Sit down']);
    expect(moveStep(s, 0, -1)).toBe(s);
    expect(moveStep(s, 1, 1)).toBe(s);
    expect(removeStep(s, 0)).toEqual(['Blow bubbles']);
    expect(removeStep(['only'], 0)).toEqual(['']);
  });

  it('respects the maximum number of steps and trims on save', () => {
    const full = Array.from({ length: MAX_STEPS }, (_, i) => `s${i}`);
    expect(addStep(full)).toBe(full);
    expect(cleanSteps(['  Sit   down ', '', '   ', 'Wait'])).toEqual(['Sit down', 'Wait']);
  });
});

describe('task draft', () => {
  it('defaults to five times a week, ten minutes, two weeks from today', () => {
    const d = defaultTaskDraft('2026-10-29', { childId: 'c1' });
    expect(d).toMatchObject({ childId: 'c1', frequencyPerWeek: 5, durationMinutes: 10, activeFrom: '2026-10-29', activeTo: '2026-11-12', steps: [''] });
  });

  it('reports missing child, title, steps and inverted dates', () => {
    const d = { ...defaultTaskDraft('2026-10-29'), activeTo: '2026-10-01' };
    expect(validateTaskDraft(d)).toEqual({ child: 'assign.errors.child', title: 'assign.errors.title', steps: 'assign.errors.steps', dates: 'assign.errors.dates' });
  });

  it('builds a clean HomeTaskInput', () => {
    const d = { ...defaultTaskDraft('2026-10-29', { childId: 'c1' }), title: '  Bubbles  time ', steps: [' Sit ', '', 'Blow'] };
    expect(validateTaskDraft(d)).toEqual({});
    expect(toTaskInput(d)).toMatchObject({ childId: 'c1', title: 'Bubbles time', steps: ['Sit', 'Blow'] });
  });

  it('only links goals that are still being worked on', () => {
    expect(isAssignableGoal('progressing')).toBe(true);
    expect(isAssignableGoal('mastered')).toBe(false);
    expect(isAssignableGoal('paused')).toBe(false);
  });
});

describe('video consent', () => {
  const c = (granted: boolean, at: string, childId?: string): Consent => ({ id: at, userId: 'u', kind: 'video_upload', granted, at, version: '1', childId });

  it('is granted when nothing was recorded', () => {
    expect(videoConsentGranted([], 'c1')).toBe(true);
  });

  it('follows the most recent video consent', () => {
    expect(videoConsentGranted([c(true, '2026-01-01T00:00:00Z'), c(false, '2026-06-01T00:00:00Z')], 'c1')).toBe(false);
    expect(videoConsentGranted([c(false, '2026-01-01T00:00:00Z'), c(true, '2026-06-01T00:00:00Z')], 'c1')).toBe(true);
  });

  it('ignores another child and other consent kinds', () => {
    const other: Consent = { id: 'x', userId: 'u', kind: 'data_processing', granted: false, at: '2026-09-01T00:00:00Z', version: '1' };
    expect(videoConsentGranted([c(false, '2026-06-01T00:00:00Z', 'c2'), other], 'c1')).toBe(true);
  });
});

describe('home log payload', () => {
  it('needs an outcome and a difficulty', () => {
    expect(buildHomeLogInput('t1', { note: '', outcome: 'done' }, 'cid')).toBeNull();
  });

  it('trims the note and includes the video only when attached', () => {
    expect(buildHomeLogInput('t1', { outcome: 'partly', difficulty: 'hard', note: '  tired today ' }, 'cid')).toEqual({
      clientId: 'cid',
      taskId: 't1',
      outcome: 'partly',
      difficulty: 'hard',
      note: 'tired today',
    });
    const video = { localUri: 'file:///v.mp4', durationS: 30, sizeBytes: 1000 };
    expect(buildHomeLogInput('t1', { outcome: 'done', difficulty: 'easy', note: '', video }, 'cid')?.video).toEqual(video);
  });
});

describe('lists', () => {
  it('moves to the next newest item after a review', () => {
    const q = [makeLog({ id: 'old', createdAt: '2026-10-20T10:00:00Z' }), makeLog({ id: 'new', createdAt: '2026-10-28T10:00:00Z' }), makeLog({ id: 'mid', createdAt: '2026-10-24T10:00:00Z' })];
    expect(nextInQueue(q, 'new')?.id).toBe('mid');
    expect(nextInQueue(q, 'mid')?.id).toBe('old');
    expect(nextInQueue(q, 'old')?.id).toBe('new');
    expect(nextInQueue([q[0]], 'old')).toBeUndefined();
  });

  it('shows reviewed logs, most recently reviewed first', () => {
    const logs = [
      makeLog({ id: 'a', reviewReaction: 'great_job', reviewedAt: '2026-10-20T10:00:00Z' }),
      makeLog({ id: 'b' }),
      makeLog({ id: 'c', reviewReaction: 'good_effort', reviewedAt: '2026-10-27T10:00:00Z' }),
    ];
    expect(recentFeedback(logs).map((l) => l.id)).toEqual(['c', 'a']);
  });

  it('greets by time of day', () => {
    expect(greetingKey(new Date(2026, 9, 29, 8))).toBe('morning');
    expect(greetingKey(new Date(2026, 9, 29, 14))).toBe('afternoon');
    expect(greetingKey(new Date(2026, 9, 29, 19))).toBe('evening');
  });
});
