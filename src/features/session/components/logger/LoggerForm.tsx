// The one-screen Session Logger form (sections A–F + save). Data loading lives in the screen.
import { Info, Lock } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewInstance, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PreviousSession } from '@/domain/metrics';
import type { AppointmentView, GoalWithStats, OrgSettings, ParentCheckin, RatingDimension, SessionInput, SessionLog, UUID } from '@/domain/types';
import { dimensionText } from '@/i18n/labels';
import { formatDay, formatTime, toISODate } from '@/lib/dates';
import { getSummaryService } from '@/services/summaries';
import { useTheme } from '@/theme/ThemeProvider';
import { confirm, OfflineBanner, Row, Text, toast } from '@/ui';

import { buildSessionInput, diffForAmend, sessionPromptLevel, validateDraft, type LoggerDraft, type ValidationIssue } from '../../logic/draft';
import { buildParentPreview } from '../../logic/result';
import { AmendSheet } from './AmendSheet';
import { BehaviourSection } from './BehaviourSection';
import { ContextSection } from './ContextSection';
import { GoalTrialsSection } from './GoalTrialsSection';
import { JudgementSection } from './JudgementSection';
import { LoggerTopBar } from './LoggerTopBar';
import { NotesSection } from './NotesSection';
import { SaveBar } from './SaveBar';
import { ScrollTargetsProvider, useScrollTargets } from './scrollTargets';
import { SnapshotSection } from './SnapshotSection';
import { useLoggerState } from './useLoggerState';

export type LoggerMode = 'new' | 'edit' | 'amend';

export interface LoggerFormProps {
  appointment: AppointmentView;
  allDimensions: RatingDimension[];
  /** Active goals for this child + therapy type, planned first. */
  goals: GoalWithStats[];
  plannedGoalIds: UUID[];
  checkin?: ParentCheckin | null;
  mode: LoggerMode;
  existing?: SessionLog;
  initialDraft: LoggerDraft;
  previous: PreviousSession[];
  settings: Pick<OrgSettings, 'parentsSeeNumericScore'>;
  clientId: UUID;
  saving: boolean;
  /** Called with a validated input (and the reason, for amendments). */
  onSubmit: (input: SessionInput, reason?: string) => void;
  onClose: () => void;
}

export function LoggerForm(props: LoggerFormProps) {
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const contentRef = useRef<ViewInstance | null>(null);
  return (
    <ScrollTargetsProvider scrollRef={scrollRef} contentRef={contentRef}>
      <LoggerFormBody {...props} scrollRef={scrollRef} contentRef={contentRef} />
    </ScrollTargetsProvider>
  );
}

function LoggerFormBody({
  appointment: a,
  allDimensions,
  goals,
  plannedGoalIds,
  checkin,
  mode,
  existing,
  initialDraft,
  previous,
  settings,
  clientId,
  saving,
  onSubmit,
  onClose,
  scrollRef,
  contentRef,
}: LoggerFormProps & {
  scrollRef: RefObject<ScrollViewInstance | null>;
  contentRef: RefObject<ViewInstance | null>;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation('session');
  const { scrollTo } = useScrollTargets();
  const [showIssues, setShowIssues] = useState(false);
  const [amendInput, setAmendInput] = useState<SessionInput | null>(null);
  const s = useLoggerState({ initialDraft, allDimensions, goals, plannedGoalIds, mergePlanned: mode === 'new', previous, childName: a.childName });
  const { draft, dims, actions } = s;

  const issues = useMemo(() => validateDraft(draft, allDimensions), [draft, allDimensions]);
  const invalidGoalIds = useMemo(() => (showIssues ? issues.filter((i) => i.kind === 'trialPrompt').map((i) => i.goalId ?? '') : []), [issues, showIssues]);
  const rated = dims.filter((d) => draft.ratings[d.key] != null).length;

  const issueText = useCallback(
    (i: ValidationIssue) => {
      const dim = dims.find((d) => d.key === i.dimensionKey);
      const goal = goals.find((g) => g.id === i.goalId);
      return tr(`logger.save.issue.${i.kind}`, { label: dim ? dimensionText(tr, dim).label : '', goal: goal?.staffText ?? '' });
    },
    [dims, goals, tr],
  );

  const { isDirty } = s;
  const requestClose = useCallback(async () => {
    if (!isDirty() || (await confirm({ title: tr('logger.discardTitle'), body: tr('logger.discardBody'), confirmLabel: tr('logger.discardConfirm'), cancelLabel: tr('logger.keepEditing'), destructive: true }))) {
      onClose();
    }
  }, [onClose, isDirty, tr]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void requestClose();
      return true;
    });
    return () => sub.remove();
  }, [requestClose]);

  const build = useCallback(
    (d: LoggerDraft) => buildSessionInput(d, { clientId, appointmentId: a.id, objectiveDraft: s.objectiveDraft, parentSummaryDraft: s.parentSummaryDraft }),
    [clientId, a.id, s.objectiveDraft, s.parentSummaryDraft],
  );

  const onSave = () => {
    if (issues.length) {
      setShowIssues(true);
      scrollTo(issues[0].id);
      return;
    }
    const input = build(draft);
    if (mode === 'amend') {
      if (existing && Object.keys(diffForAmend(existing, input)).length === 0) {
        toast.info(tr('logger.amend.nothingChanged'));
        return;
      }
      setAmendInput(input);
      return;
    }
    onSubmit(input);
  };

  const regenerate = useCallback(
    async (which: 'objective' | 'parentSummary') => {
      const service = getSummaryService();
      if (service.kind === 'local') {
        actions.patch({ [which]: null });
        return;
      }
      const text = which === 'objective' ? await service.draftObjective(s.objectiveInput) : await service.draftParentSummary(s.parentInput);
      actions.patch({ [which]: text });
    },
    [actions, s.objectiveInput, s.parentInput],
  );

  const buildPreview = useCallback(
    () =>
      buildParentPreview({
        sessionId: existing?.id ?? 'preview',
        date: toISODate(new Date(a.startsAt)),
        therapyTypeName: a.therapyTypeName,
        therapyTypeColor: a.therapyTypeColor,
        therapistName: a.therapistName,
        isSubstitute: a.isSubstitute,
        input: build(draft),
        dimensions: allDimensions,
        previous,
        goals,
        showScore: settings.parentsSeeNumericScore,
      }),
    [existing?.id, a, build, draft, allDimensions, previous, goals, settings.parentsSeeNumericScore],
  );

  const banner =
    mode === 'edit' && existing
      ? { icon: Info, text: tr('logger.editingBanner', { time: `${formatDay(existing.lockedAt)}, ${formatTime(existing.lockedAt)}` }) }
      : mode === 'amend'
        ? { icon: Lock, text: tr('logger.lockedBanner') }
        : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }} testID="session-logger">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <LoggerTopBar appointment={a} rated={rated} total={dims.length} onClose={() => void requestClose()} />
        <OfflineBanner />
        {banner ? (
          <Row gap={2} style={{ paddingHorizontal: t.space[4], paddingVertical: t.space[2], backgroundColor: t.colors.infoSoft }}>
            <banner.icon size={16} color={t.colors.info} />
            <Text variant="caption" tint={t.colors.info} weight="medium" style={{ flex: 1 }}>
              {banner.text}
            </Text>
          </Row>
        ) : null}
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: t.space[4], paddingBottom: t.space[10] }}>
          <View ref={contentRef} style={{ gap: t.space[6] }}>
            <ContextSection
              appointment={a}
              actualMinutes={draft.actualMinutes}
              startedLate={draft.startedLate}
              checkin={checkin}
              onMinutes={actions.setMinutes}
              onStartedLate={actions.setStartedLate}
            />
            <SnapshotSection
              dimensions={dims}
              ratings={draft.ratings}
              regulationState={draft.regulationState}
              showIssues={showIssues}
              onRate={actions.rate}
              onRegulationState={actions.setRegulationState}
            />
            <GoalTrialsSection
              goals={goals}
              trials={draft.trials}
              plannedGoalIds={plannedGoalIds}
              fallbackPrompt={sessionPromptLevel(draft)}
              invalidGoalIds={invalidGoalIds}
              onChange={actions.changeTrial}
              onAdd={actions.addGoal}
              onRemove={actions.removeGoal}
            />
            <BehaviourSection
              incidents={draft.incidents}
              breaksCount={draft.breaksCount}
              onAddIncident={actions.addIncident}
              onRemoveIncident={actions.removeIncident}
              onBreaks={actions.setBreaks}
            />
            <JudgementSection
              hasPrevious={previous.length > 0}
              comparedToLast={draft.comparedToLast}
              workedTags={draft.workedTags}
              workedText={draft.workedText}
              notWorkedTags={draft.notWorkedTags}
              notWorkedText={draft.notWorkedText}
              onChange={actions.patch}
            />
            <NotesSection
              subjective={draft.subjective}
              objective={draft.objective ?? s.objectiveDraft}
              assessment={draft.assessment}
              planNext={draft.planNext}
              planGoalIds={draft.planGoalIds}
              parentSummary={draft.parentSummary ?? s.parentSummaryDraft}
              goals={goals}
              canContinueGoals={draft.trials.length > 0}
              planInvalid={showIssues && draft.planNext.trim().length === 0}
              onChange={actions.patch}
              onRegenerateObjective={() => void regenerate('objective')}
              onRegenerateParent={() => void regenerate('parentSummary')}
              onContinueGoals={s.continueGoals}
              buildPreview={buildPreview}
            />
          </View>
        </ScrollView>
        <SaveBar
          label={tr(mode === 'new' ? 'logger.save.save' : mode === 'edit' ? 'logger.save.saveEdit' : 'logger.save.saveAmend')}
          missingMessage={showIssues && issues.length ? tr('logger.save.missing', { count: issues.length, first: issueText(issues[0]) }) : undefined}
          onShowMissing={() => issues[0] && scrollTo(issues[0].id)}
          onSave={onSave}
          saving={saving}
        />
      </KeyboardAvoidingView>
      <AmendSheet visible={!!amendInput} saving={saving} onClose={() => setAmendInput(null)} onSubmit={(reason) => amendInput && onSubmit(amendInput, reason)} />
    </View>
  );
}
