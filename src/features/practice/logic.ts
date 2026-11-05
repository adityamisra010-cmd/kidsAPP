/**
 * Pure helpers for the home-practice loop (no React, no native modules) so they are easy to test.
 */
import { HOME_TASK_FREQUENCIES, VIDEO_LIMITS } from '@/domain/constants';
import type {
  Consent,
  GoalStatus,
  HomeLog,
  HomeLogDifficulty,
  HomeLogInput,
  HomeLogOutcome,
  HomeTask,
  HomeTaskInput,
  ISODate,
  ReviewReaction,
  UUID,
  WeeklyCompletion,
} from '@/domain/types';
import { addDaysISO, daysBetween, parse, weekStart } from '@/lib/dates';

export const OUTCOMES: HomeLogOutcome[] = ['done', 'partly', 'could_not'];
export const DIFFICULTIES: HomeLogDifficulty[] = ['easy', 'ok', 'hard'];
export const REACTIONS: ReviewReaction[] = ['great_job', 'good_effort', 'try_next_time', 'lets_discuss'];
export const DURATION_OPTIONS = [5, 10, 15, 20];
export const FREQUENCY_OPTIONS = HOME_TASK_FREQUENCIES;

// ---------------------------------------------------------------------------
// Video validation
// ---------------------------------------------------------------------------

/** The system camera can overshoot its own cap by a fraction of a second; don't punish that. */
export const DURATION_TOLERANCE_S = 1;

export type VideoProblem = 'too_long' | 'too_large';

/** expo-image-picker reports video duration in milliseconds (or null when unknown). */
export function pickerDurationS(durationMs: number | null | undefined): number | undefined {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) return undefined;
  return Math.round((durationMs / 1000) * 10) / 10;
}

/** Checked right after picking, before spending time compressing. Unknown duration is allowed. */
export function checkVideoDuration(durationS: number | undefined): VideoProblem | null {
  if (durationS == null) return null;
  return durationS > VIDEO_LIMITS.maxDurationS + DURATION_TOLERANCE_S ? 'too_long' : null;
}

/** Checked after on-device compression (the limit applies to what we upload). */
export function checkVideoSize(sizeBytes: number | undefined): VideoProblem | null {
  if (sizeBytes == null) return null;
  return sizeBytes > VIDEO_LIMITS.maxSizeBytes ? 'too_large' : null;
}

export function validateVideo(v: { durationS?: number; sizeBytes?: number }): VideoProblem | null {
  return checkVideoDuration(v.durationS) ?? checkVideoSize(v.sizeBytes);
}

// ---------------------------------------------------------------------------
// Weekly progress (encouraging, never guilt-tripping)
// ---------------------------------------------------------------------------

export type WeekMood = 'none' | 'notStarted' | 'started' | 'halfway' | 'complete';

export interface WeeklyProgress {
  /** Practice sessions that happened (done + partly: trying counts). */
  practised: number;
  expected: number;
  /** 0..1 for the progress bar. */
  ratio: number;
  /** Picks the encouraging line under the bar (`practice:week.msg.<mood>`). */
  mood: WeekMood;
}

export function weeklyProgress(wc: Pick<WeeklyCompletion, 'expected' | 'done' | 'partly'>): WeeklyProgress {
  const expected = Math.max(0, wc.expected);
  const practised = Math.max(0, wc.done + wc.partly);
  if (expected === 0) return { practised, expected, ratio: 0, mood: 'none' };
  const ratio = Math.min(1, practised / expected);
  const mood: WeekMood = practised === 0 ? 'notStarted' : ratio >= 1 ? 'complete' : ratio >= 0.5 ? 'halfway' : 'started';
  return { practised: Math.min(practised, expected), expected, ratio, mood };
}

/** Practice logs (done or partly) for one task since Monday. */
export function practisedThisWeek(logs: Pick<HomeLog, 'taskId' | 'outcome' | 'createdAt'>[], taskId: UUID, now: Date = new Date()): number {
  const start = weekStart(now);
  return logs.filter((l) => l.taskId === taskId && l.outcome !== 'could_not' && daysBetween(start, parse(l.createdAt)) >= 0).length;
}

// ---------------------------------------------------------------------------
// Steps editing (assign task)
// ---------------------------------------------------------------------------

export const MAX_STEPS = 10;
export const MAX_STEP_LENGTH = 140;

export function addStep(steps: string[]): string[] {
  return steps.length >= MAX_STEPS ? steps : [...steps, ''];
}

export function updateStep(steps: string[], index: number, text: string): string[] {
  return steps.map((s, i) => (i === index ? text.slice(0, MAX_STEP_LENGTH) : s));
}

/** Removes a step but always leaves one (empty) row to type into. */
export function removeStep(steps: string[], index: number): string[] {
  const next = steps.filter((_, i) => i !== index);
  return next.length ? next : [''];
}

export function moveStep(steps: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Trim whitespace, collapse inner spaces and drop empty rows. */
export function cleanSteps(steps: string[]): string[] {
  return steps.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Task draft (assign / edit)
// ---------------------------------------------------------------------------

export interface TaskDraft {
  childId?: UUID;
  goalId?: UUID;
  title: string;
  steps: string[];
  frequencyPerWeek: number;
  durationMinutes: number;
  resourceId?: UUID;
  demoMediaId?: UUID;
  activeFrom: ISODate;
  activeTo: ISODate;
}

export const DEFAULT_ACTIVE_DAYS = 14;

export function defaultTaskDraft(today: ISODate, init?: { childId?: UUID; goalId?: UUID; resourceId?: UUID; title?: string }): TaskDraft {
  return {
    childId: init?.childId,
    goalId: init?.goalId,
    resourceId: init?.resourceId,
    title: init?.title ?? '',
    steps: [''],
    frequencyPerWeek: 5,
    durationMinutes: 10,
    activeFrom: today,
    activeTo: addDaysISO(today, DEFAULT_ACTIVE_DAYS),
  };
}

export function draftFromTask(task: HomeTask): TaskDraft {
  return {
    childId: task.childId,
    goalId: task.goalId,
    title: task.title,
    steps: task.steps.length ? [...task.steps] : [''],
    frequencyPerWeek: task.frequencyPerWeek,
    durationMinutes: task.durationMinutes,
    resourceId: task.resourceId,
    demoMediaId: task.demoMediaId,
    activeFrom: task.activeFrom,
    activeTo: task.activeTo,
  };
}

export type TaskDraftField = 'child' | 'title' | 'steps' | 'dates';
/** Values are i18n keys in the `practice` namespace. */
export type TaskDraftErrors = Partial<Record<TaskDraftField, string>>;

export function validateTaskDraft(d: TaskDraft): TaskDraftErrors {
  const errors: TaskDraftErrors = {};
  if (!d.childId) errors.child = 'assign.errors.child';
  if (!d.title.trim()) errors.title = 'assign.errors.title';
  if (cleanSteps(d.steps).length === 0) errors.steps = 'assign.errors.steps';
  if (!d.activeFrom || !d.activeTo || daysBetween(d.activeFrom, d.activeTo) < 0) errors.dates = 'assign.errors.dates';
  return errors;
}

/** Call only after validateTaskDraft returned no errors. */
export function toTaskInput(d: TaskDraft): HomeTaskInput {
  if (!d.childId) throw new Error('toTaskInput: childId missing');
  return {
    childId: d.childId,
    goalId: d.goalId,
    title: d.title.replace(/\s+/g, ' ').trim(),
    steps: cleanSteps(d.steps),
    frequencyPerWeek: d.frequencyPerWeek,
    durationMinutes: d.durationMinutes,
    resourceId: d.resourceId,
    demoMediaId: d.demoMediaId,
    activeFrom: d.activeFrom,
    activeTo: d.activeTo,
  };
}

/** Goals worth linking a home task to (not finished, not paused). */
export function isAssignableGoal(status: GoalStatus): boolean {
  return status !== 'mastered' && status !== 'maintenance' && status !== 'paused';
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/**
 * True unless the user's most recent `video_upload` consent (for this child, or account-wide)
 * was withdrawn. No record means the onboarding consent covers it.
 */
export function videoConsentGranted(consents: Consent[], childId?: UUID | null): boolean {
  const relevant = consents
    .filter((c) => c.kind === 'video_upload' && (!c.childId || !childId || c.childId === childId))
    .sort((a, b) => parse(b.at).getTime() - parse(a.at).getTime());
  return relevant.length === 0 ? true : relevant[0].granted;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export interface LocalVideo {
  localUri: string;
  durationS: number;
  sizeBytes: number;
}

export interface LogDraft {
  outcome?: HomeLogOutcome;
  difficulty?: HomeLogDifficulty;
  note: string;
  video?: LocalVideo;
}

export function isLogDraftComplete(d: LogDraft): d is LogDraft & { outcome: HomeLogOutcome; difficulty: HomeLogDifficulty } {
  return !!d.outcome && !!d.difficulty;
}

export function buildHomeLogInput(taskId: UUID, d: LogDraft, clientId: UUID): HomeLogInput | null {
  if (!isLogDraftComplete(d)) return null;
  return {
    clientId,
    taskId,
    outcome: d.outcome,
    difficulty: d.difficulty,
    note: d.note.trim(),
    ...(d.video ? { video: { ...d.video } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export function sortNewestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => parse(b.createdAt).getTime() - parse(a.createdAt).getTime());
}

/** The item to open after reviewing `currentId` (next newer-first item that isn't this one). */
export function nextInQueue<T extends { id: UUID; createdAt: string }>(queue: T[], currentId: UUID): T | undefined {
  const sorted = sortNewestFirst(queue);
  const idx = sorted.findIndex((l) => l.id === currentId);
  const rest = sorted.filter((l) => l.id !== currentId);
  if (!rest.length) return undefined;
  return idx < 0 ? rest[0] : (rest[idx] ?? rest[0]);
}

/** Reviewed logs, most recently reviewed first. */
export function recentFeedback(logs: HomeLog[], limit = 5): HomeLog[] {
  return logs
    .filter((l) => !!l.reviewReaction)
    .sort((a, b) => parse(b.reviewedAt ?? b.createdAt).getTime() - parse(a.reviewedAt ?? a.createdAt).getTime())
    .slice(0, limit);
}

/** First name (or preferred short name) for warm copy: "How is Aarav today?" */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Time-of-day greeting key: `practice:checkin.greeting.<key>`. */
export function greetingKey(now: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = now.getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
