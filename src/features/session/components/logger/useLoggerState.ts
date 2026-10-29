/**
 * Draft state + actions for the logger, and the live auto-drafts (O and parent message).
 * Callbacks are stable so memoised sections only re-render when their own values change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { PreviousSession } from '@/domain/metrics';
import type {
  BehaviourIncident,
  GoalWithStats,
  Language,
  RatingDimension,
  RatingValue,
  RegulationState,
  UUID,
} from '@/domain/types';

import { joinWords } from '../../labels';
import {
  emptyTrial,
  enabledDimensions,
  sessionPromptLevel,
  type LoggerDraft,
  type TrialDraft,
} from '../../logic/draft';
import { draftObjective, draftParentSummary, type ObjectiveInput, type ParentSummaryInput } from '../../summaries';

type Patch = Partial<LoggerDraft> | ((d: LoggerDraft) => Partial<LoggerDraft>);

export function useLoggerState(args: {
  initialDraft: LoggerDraft;
  allDimensions: RatingDimension[];
  goals: GoalWithStats[];
  plannedGoalIds: UUID[];
  /** Planned goals may arrive after the form opens; merge them while trials are untouched. */
  mergePlanned: boolean;
  previous: PreviousSession[];
  childName: string;
}) {
  const { t, i18n } = useTranslation('session');
  const language: Language = i18n.language === 'hi' ? 'hi' : 'en';
  const [draft, setDraft] = useState<LoggerDraft>(args.initialDraft);
  const dirty = useRef(false);
  const trialsTouched = useRef(false);

  const update = useCallback((patch: Patch) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }));
  }, []);

  // Merge planned goals that arrive late (previous-session plan loads in the background).
  const { mergePlanned, plannedGoalIds, goals } = args;
  useEffect(() => {
    if (!mergePlanned || trialsTouched.current || plannedGoalIds.length === 0) return;
    setDraft((d) => {
      if (d.trials.length > 0) return d;
      const ids = plannedGoalIds.filter((id) => goals.some((g) => g.id === id));
      return ids.length ? { ...d, trials: ids.map(emptyTrial) } : d;
    });
  }, [mergePlanned, plannedGoalIds, goals]);

  const actions = useMemo(
    () => ({
      setMinutes: (actualMinutes: number) => update({ actualMinutes }),
      setStartedLate: (startedLate: boolean) => update({ startedLate }),
      rate: (key: string, value: RatingValue) => update((d) => ({ ratings: { ...d.ratings, [key]: value } })),
      setRegulationState: (regulationState: RegulationState) => update({ regulationState }),
      changeTrial: (goalId: UUID, patch: Partial<TrialDraft>) => {
        trialsTouched.current = true;
        update((d) => ({ trials: d.trials.map((tr) => (tr.goalId === goalId ? { ...tr, ...patch } : tr)) }));
      },
      addGoal: (goalId: UUID) => {
        trialsTouched.current = true;
        update((d) =>
          d.trials.some((tr) => tr.goalId === goalId) ? {} : { trials: [...d.trials, emptyTrial(goalId)] },
        );
      },
      removeGoal: (goalId: UUID) => {
        trialsTouched.current = true;
        update((d) => ({ trials: d.trials.filter((tr) => tr.goalId !== goalId) }));
      },
      addIncident: (incident: BehaviourIncident) => update((d) => ({ incidents: [...d.incidents, incident] })),
      removeIncident: (index: number) => update((d) => ({ incidents: d.incidents.filter((_, i) => i !== index) })),
      setBreaks: (breaksCount: number) => update({ breaksCount }),
      patch: (p: Partial<LoggerDraft>) => update(p),
    }),
    [update],
  );

  const isDirty = useCallback(() => dirty.current, []);
  const dims = useMemo(() => enabledDimensions(args.allDimensions), [args.allDimensions]);
  const goalText = useCallback((id: UUID) => args.goals.find((g) => g.id === id), [args.goals]);

  const objectiveInput: ObjectiveInput = useMemo(
    () => ({
      language,
      dimensions: dims,
      ratings: draft.ratings,
      regulationState: draft.regulationState,
      trials: draft.trials.map((tr) => ({ ...tr, goalText: goalText(tr.goalId)?.staffText ?? '' })),
      incidents: draft.incidents,
      breaksCount: draft.breaksCount,
      actualMinutes: draft.actualMinutes,
      startedLate: draft.startedLate,
      fallbackPromptLevel: sessionPromptLevel(draft),
    }),
    [language, dims, draft, goalText],
  );

  const parentInput: ParentSummaryInput = useMemo(() => {
    const prev = args.previous[0];
    const deltaLast = prev
      ? Object.fromEntries(
          dims.map((d) => {
            const v = draft.ratings[d.key];
            const p = prev.ratings[d.key];
            return [d.key, v != null && p != null ? v - p : undefined];
          }),
        )
      : undefined;
    return {
      language,
      childName: args.childName,
      dimensions: dims,
      ratings: draft.ratings,
      regulationState: draft.regulationState,
      deltaLast,
      goalTexts: draft.trials.filter((tr) => tr.attempted > 0).map((tr) => goalText(tr.goalId)?.parentText ?? ''),
    };
  }, [language, args.previous, args.childName, dims, draft.ratings, draft.regulationState, draft.trials, goalText]);

  const objectiveDraft = useMemo(() => draftObjective(t, objectiveInput), [t, objectiveInput]);
  const parentSummaryDraft = useMemo(() => draftParentSummary(t, parentInput), [t, parentInput]);

  /** Goals worked on today → next session's plan (fills P only when it's still empty). */
  const continueGoals = useCallback(() => {
    update((d) => {
      const ids = (d.trials.some((tr) => tr.attempted > 0) ? d.trials.filter((tr) => tr.attempted > 0) : d.trials).map(
        (tr) => tr.goalId,
      );
      const texts = ids.map((id) => goalText(id)?.staffText).filter((x): x is string => !!x);
      return {
        planGoalIds: ids,
        planNext: d.planNext.trim() ? d.planNext : t('logger.notes.continueText', { goals: joinWords(t, texts) }),
      };
    });
  }, [update, goalText, t]);

  return {
    draft,
    dims,
    isDirty,
    actions,
    objectiveInput,
    parentInput,
    objectiveDraft,
    parentSummaryDraft,
    continueGoals,
    language,
  };
}
