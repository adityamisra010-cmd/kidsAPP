/**
 * Session Logger form model: the in-progress draft, validation, and conversion to SessionInput.
 * Pure (no React), so it is unit-tested and shared by the logger, amend flow and result view.
 */
import type {
  BehaviourIncident,
  ComparedToLast,
  GoalStatus,
  GoalWithStats,
  PromptLevel,
  RatingDimension,
  RatingValue,
  RegulationState,
  Role,
  SessionInput,
  SessionLog,
  UUID,
} from '@/domain/types';

export interface TrialDraft {
  goalId: UUID;
  attempted: number;
  successful: number;
  /** Unset = use the session's Independence rating (same 1–5 prompt scale). */
  promptLevel?: PromptLevel;
  note: string;
}

export interface LoggerDraft {
  actualMinutes: number;
  startedLate: boolean;
  regulationState?: RegulationState;
  ratings: Partial<Record<string, RatingValue>>;
  trials: TrialDraft[];
  incidents: BehaviourIncident[];
  breaksCount: number;
  comparedToLast?: ComparedToLast;
  workedTags: string[];
  workedText: string;
  notWorkedTags: string[];
  notWorkedText: string;
  subjective: string;
  /** null = auto-drafted from the snapshot and kept in sync until the therapist edits it. */
  objective: string | null;
  assessment: string;
  planNext: string;
  planGoalIds: UUID[];
  /** null = auto-drafted (see objective). */
  parentSummary: string | null;
}

export const REGULATION_KEY = 'regulation';
export const INDEPENDENCE_KEY = 'independence';
export const REGULATION_STATES: RegulationState[] = ['under', 'regulated', 'over'];
/** Goal statuses offered in the logger (paused and mastered goals are not practised). */
const ACTIVE_GOAL_STATUSES: GoalStatus[] = ['not_started', 'emerging', 'progressing', 'maintenance'];

/** Approximate incident durations, stored as a representative number of seconds. */
export const DURATION_BUCKETS = [
  { key: 'lt1', seconds: 30 },
  { key: '1to5', seconds: 180 },
  { key: '5to15', seconds: 600 },
  { key: '15plus', seconds: 1200 },
] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number]['key'];

export function bucketForSeconds(seconds: number | undefined): DurationBucket | undefined {
  if (seconds == null) return undefined;
  if (seconds < 60) return 'lt1';
  if (seconds <= 300) return '1to5';
  if (seconds <= 900) return '5to15';
  return '15plus';
}

export function enabledDimensions(dims: RatingDimension[]): RatingDimension[] {
  return dims.filter((d) => d.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function activeGoals(goals: GoalWithStats[]): GoalWithStats[] {
  return goals.filter((g) => ACTIVE_GOAL_STATUSES.includes(g.status));
}

/** Planned goals first (in plan order), then the rest. */
export function orderGoals(goals: GoalWithStats[], plannedIds: UUID[]): GoalWithStats[] {
  const rank = (g: GoalWithStats) => {
    const i = plannedIds.indexOf(g.id);
    return i === -1 ? plannedIds.length : i;
  };
  return [...goals].sort((a, b) => rank(a) - rank(b));
}

export function emptyTrial(goalId: UUID): TrialDraft {
  return { goalId, attempted: 0, successful: 0, note: '' };
}

/** A blank log. Ratings always start empty (pre-filling from the last session biases scoring). */
export function emptyDraft(opts: { scheduledMinutes: number; plannedGoalIds?: UUID[] }): LoggerDraft {
  return {
    actualMinutes: Math.max(5, opts.scheduledMinutes),
    startedLate: false,
    regulationState: undefined,
    ratings: {},
    trials: (opts.plannedGoalIds ?? []).map(emptyTrial),
    incidents: [],
    breaksCount: 0,
    comparedToLast: undefined,
    workedTags: [],
    workedText: '',
    notWorkedTags: [],
    notWorkedText: '',
    subjective: '',
    objective: null,
    assessment: '',
    planNext: '',
    planGoalIds: [],
    parentSummary: null,
  };
}

/** Prefill for editing or amending an existing log (the therapist's own values). */
export function draftFromLog(log: SessionLog): LoggerDraft {
  return {
    actualMinutes: log.actualMinutes,
    startedLate: log.startedLate,
    regulationState: log.regulationState,
    ratings: { ...log.ratings },
    trials: log.goalTrials.map((g) => ({
      goalId: g.goalId,
      attempted: g.attempted,
      successful: g.successful,
      promptLevel: g.promptLevel,
      note: g.note ?? '',
    })),
    incidents: log.incidents.map((i) => ({ ...i, antecedentTags: [...i.antecedentTags] })),
    breaksCount: log.breaksCount,
    comparedToLast: log.comparedToLast,
    workedTags: [...log.workedTags],
    workedText: log.workedText,
    notWorkedTags: [...log.notWorkedTags],
    notWorkedText: log.notWorkedText,
    subjective: log.notes.subjective,
    objective: log.notes.objective,
    assessment: log.notes.assessment,
    planNext: log.notes.planNext,
    planGoalIds: [...log.notes.planGoalIds],
    parentSummary: log.notes.parentSummary,
  };
}

export function ratedCount(draft: Pick<LoggerDraft, 'ratings'>, dims: RatingDimension[]): number {
  return enabledDimensions(dims).filter((d) => draft.ratings[d.key] != null).length;
}

/** The session-level prompt level (Independence rating), used when a goal has none chosen. */
export function sessionPromptLevel(draft: Pick<LoggerDraft, 'ratings'>): PromptLevel | undefined {
  return draft.ratings[INDEPENDENCE_KEY];
}

export function trialAccuracyPercent(t: Pick<TrialDraft, 'attempted' | 'successful'>): number | undefined {
  if (t.attempted <= 0) return undefined;
  return Math.round((Math.min(t.successful, t.attempted) / t.attempted) * 100);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type IssueKind = 'duration' | 'regulationState' | 'rating' | 'trialPrompt' | 'planNext';

export interface ValidationIssue {
  /** Stable id, also used as the scroll target id. */
  id: string;
  kind: IssueKind;
  dimensionKey?: string;
  goalId?: UUID;
}

export const issueId = {
  duration: 'duration',
  regulationState: 'regulationState',
  rating: (key: string) => `rating:${key}`,
  trial: (goalId: UUID) => `trial:${goalId}`,
  planNext: 'planNext',
};

/**
 * Everything required before a log can be saved, in screen order (so the first issue is the
 * first thing the therapist meets when scrolling down).
 */
export function validateDraft(draft: LoggerDraft, dims: RatingDimension[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!(draft.actualMinutes > 0)) issues.push({ id: issueId.duration, kind: 'duration' });

  const enabled = enabledDimensions(dims);
  const hasRegulationDim = enabled.some((d) => d.key === REGULATION_KEY);
  if (!hasRegulationDim && !draft.regulationState) issues.push({ id: issueId.regulationState, kind: 'regulationState' });
  for (const d of enabled) {
    if (d.key === REGULATION_KEY && !draft.regulationState) {
      issues.push({ id: issueId.regulationState, kind: 'regulationState' });
    }
    if (draft.ratings[d.key] == null) issues.push({ id: issueId.rating(d.key), kind: 'rating', dimensionKey: d.key });
  }

  const fallbackPrompt = sessionPromptLevel(draft);
  for (const tr of draft.trials) {
    if (tr.attempted > 0 && tr.promptLevel == null && fallbackPrompt == null) {
      issues.push({ id: issueId.trial(tr.goalId), kind: 'trialPrompt', goalId: tr.goalId });
    }
  }

  if (draft.planNext.trim().length === 0) issues.push({ id: issueId.planNext, kind: 'planNext' });
  return issues;
}

// ---------------------------------------------------------------------------
// Build / diff
// ---------------------------------------------------------------------------

export interface BuildContext {
  clientId: UUID;
  appointmentId: UUID;
  /** Current auto-drafts, used when the therapist kept the drafted text. */
  objectiveDraft: string;
  parentSummaryDraft: string;
}

/**
 * Converts a validated draft into what the repository saves. Goals with no tries are dropped
 * (they were planned but not worked on, so parents should not see them as "worked on").
 */
export function buildSessionInput(draft: LoggerDraft, ctx: BuildContext): SessionInput {
  const fallbackPrompt = sessionPromptLevel(draft) ?? 3;
  const ratings: Record<string, RatingValue> = {};
  for (const [k, v] of Object.entries(draft.ratings)) if (v != null) ratings[k] = v;
  return {
    clientId: ctx.clientId,
    appointmentId: ctx.appointmentId,
    actualMinutes: draft.actualMinutes,
    startedLate: draft.startedLate,
    regulationState: draft.regulationState ?? 'regulated',
    ratings,
    goalTrials: draft.trials
      .filter((t) => t.attempted > 0)
      .map((t) => {
        const note = t.note.trim();
        return {
          goalId: t.goalId,
          attempted: t.attempted,
          successful: Math.min(t.successful, t.attempted),
          promptLevel: t.promptLevel ?? fallbackPrompt,
          ...(note ? { note } : {}),
        };
      }),
    incidents: draft.incidents,
    breaksCount: draft.breaksCount,
    // Skipped (or first session): "same" is the neutral answer.
    comparedToLast: draft.comparedToLast ?? 'same',
    workedTags: draft.workedTags,
    workedText: draft.workedText.trim(),
    notWorkedTags: draft.notWorkedTags,
    notWorkedText: draft.notWorkedText.trim(),
    notes: {
      subjective: draft.subjective.trim(),
      objective: (draft.objective ?? ctx.objectiveDraft).trim(),
      assessment: draft.assessment.trim(),
      planNext: draft.planNext.trim(),
      planGoalIds: draft.planGoalIds,
      parentSummary: (draft.parentSummary ?? ctx.parentSummaryDraft).trim(),
    },
  };
}

export type SessionChanges = Partial<Omit<SessionInput, 'clientId' | 'appointmentId'>>;

/** Stable JSON (sorted object keys) so key order never counts as a change. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

const AMENDABLE_FIELDS = [
  'actualMinutes',
  'startedLate',
  'regulationState',
  'ratings',
  'goalTrials',
  'incidents',
  'breaksCount',
  'comparedToLast',
  'workedTags',
  'workedText',
  'notWorkedTags',
  'notWorkedText',
  'notes',
] as const satisfies readonly (keyof SessionChanges)[];

/** Only the top-level fields that differ from the saved log (for the amendment trail). */
export function diffForAmend(log: SessionLog, input: SessionInput): SessionChanges {
  const changes: SessionChanges = {};
  const write = <K extends keyof SessionChanges>(k: K, v: SessionChanges[K]) => {
    changes[k] = v;
  };
  for (const field of AMENDABLE_FIELDS) {
    if (stable(log[field]) !== stable(input[field])) write(field, input[field]);
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export function isLocked(log: Pick<SessionLog, 'lockedAt'>, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(log.lockedAt).getTime();
}

/** Own log, still inside the edit window. */
export function canEdit(log: Pick<SessionLog, 'lockedAt' | 'therapistId'>, userId: UUID, now: Date = new Date()): boolean {
  return log.therapistId === userId && !isLocked(log, now);
}

/** After the lock: the author, or a coordinator / school admin reviewing logs. */
export function canAmend(log: Pick<SessionLog, 'lockedAt' | 'therapistId'>, userId: UUID, role: Role, now: Date = new Date()): boolean {
  if (!isLocked(log, now)) return false;
  return log.therapistId === userId || role === 'coordinator' || role === 'school_admin';
}
