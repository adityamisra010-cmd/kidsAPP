/**
 * Session Logger (full-screen modal). `/session/log/[appointmentId]` logs a new session;
 * `?sessionId=` (or an already-logged appointment) opens the therapist's own log for editing within
 * the lock window, or the Amend flow after it.
 */
import { router } from 'expo-router';
import { BookOpenCheck, ClipboardCheck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppointment, useGoals, useOrg, useRatingDimensions } from '@/data/hooks';
import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { SessionInput } from '@/domain/types';
import { uuid } from '@/lib/id';
import { toISODate } from '@/lib/dates';
import { homeRouteFor, useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, EmptyState, ErrorState, errorMessageKey, Screen, SkeletonList, Stack, Text, toast } from '@/ui';

import { scheduledMinutes } from '../components/logger/ContextSection';
import { LoggerForm, type LoggerMode } from '../components/logger/LoggerForm';
import { SavedResult } from '../components/logger/SavedResult';
import { activeGoals, canAmend, canEdit, diffForAmend, draftFromLog, emptyDraft, orderGoals } from '../logic/draft';
import { computeSavedResult, toPreviousSessions } from '../logic/result';
import { enqueueSessionSave, registerSessionOutbox } from '../outbox';
import {
  useAmendSession,
  useCheckin,
  useGoalHistories,
  usePreviousPlan,
  useRecentSessions,
  useSessionLog,
} from '../queries';

// Make sure queued logs can sync even before the integrator wires all handlers (idempotent).
registerSessionOutbox();

const EMPTY: never[] = [];

export function SessionLoggerScreen({ appointmentId, sessionId }: { appointmentId: string; sessionId?: string }) {
  const { t } = useTranslation('session');
  const theme = useTheme();
  const active = useRequiredActive();
  const apptQ = useAppointment(appointmentId);
  const appt = apptQ.data;
  const existingId = sessionId || appt?.sessionId;
  const existingQ = useSessionLog(existingId);
  const existing = existingQ.data;
  const dimsQ = useRatingDimensions();
  const orgQ = useOrg();
  const goalsQ = useGoals(appt?.childId, appt?.therapyTypeId);
  const recentQ = useRecentSessions(appt?.childId, appt?.therapyTypeId);
  const planQ = usePreviousPlan(appt?.childId, appt?.therapyTypeId, appt?.startsAt);
  const checkinQ = useCheckin(appointmentId);
  const amendM = useAmendSession(existingId ?? '');
  const [clientId] = useState(uuid);
  const [saved, setSaved] = useState<{ input: SessionInput; queued: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const settings = orgQ.data?.settings ?? active.organization?.settings ?? DEFAULT_ORG_SETTINGS;
  const plannedGoalIds = planQ.data?.planGoalIds ?? EMPTY;
  const goals = useMemo(
    () => orderGoals(activeGoals(goalsQ.data ?? EMPTY), plannedGoalIds),
    [goalsQ.data, plannedGoalIds],
  );
  const goalIds = useMemo(() => goals.map((g) => g.id), [goals]);
  const histories = useGoalHistories(goalIds);
  const previous = useMemo(
    () =>
      appt && recentQ.data
        ? toPreviousSessions(recentQ.data, {
            appointmentId: appt.id,
            onOrBefore: toISODate(new Date(appt.startsAt)),
            excludeSessionId: existingId,
          })
        : EMPTY,
    [appt, recentQ.data, existingId],
  );

  const now = new Date();
  const mode: LoggerMode | 'readonly' = !existing
    ? 'new'
    : canEdit(existing, active.user.profile.id, now)
      ? 'edit'
      : canAmend(existing, active.user.profile.id, active.role, now)
        ? 'amend'
        : 'readonly';

  const initialDraft = useMemo(
    () => (existing ? draftFromLog(existing) : appt ? emptyDraft({ scheduledMinutes: scheduledMinutes(appt) }) : null),
    // Only on first load: later refetches must not reset what the therapist is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existing?.id, appt?.id],
  );

  const home = homeRouteFor(active.role);
  const close = () => (router.canGoBack() ? router.back() : router.replace(home));
  const done = () => (active.role === 'therapist' ? router.dismissTo(home) : close());

  const onSubmit = async (input: SessionInput, reason?: string) => {
    if (!appt) return;
    setSaving(true);
    try {
      if (mode === 'amend' && existing) {
        await amendM.mutateAsync({ changes: diffForAmend(existing, input), reason: reason ?? '' });
        toast.success(t('logger.amend.saved'));
        router.replace(`/session/${existing.id}`);
        return;
      }
      await enqueueSessionSave(input, t('logger.outboxLabel', { name: appt.childName }));
      setSaved({ input, queued: true });
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    } finally {
      setSaving(false);
    }
  };

  if (apptQ.error || dimsQ.error || existingQ.error) {
    return (
      <Screen title={t('logger.title')} back onBack={close}>
        <ErrorState
          error={apptQ.error ?? dimsQ.error ?? existingQ.error}
          onRetry={() => void Promise.all([apptQ.refetch(), dimsQ.refetch(), existingQ.refetch()])}
        />
      </Screen>
    );
  }
  if (!appt || !dimsQ.data || !initialDraft || (existingId && existingQ.isPending)) {
    return (
      <Screen title={t('logger.title')} back onBack={close}>
        <SkeletonList rows={5} height={120} />
      </Screen>
    );
  }

  if (saved && dimsQ.data) {
    const result = computeSavedResult({
      input: saved.input,
      dimensions: dimsQ.data,
      previous,
      goals: goalsQ.data ?? EMPTY,
      history: histories,
      settings,
      excludeSessionId: existingId,
    });
    return (
      <SavedResult
        appointment={appt}
        input={saved.input}
        result={result}
        goals={goalsQ.data ?? EMPTY}
        clientId={clientId}
        queued={saved.queued}
        primaryLabel={active.role === 'therapist' ? t('result.backToToday') : t('result.done')}
        onDone={done}
      />
    );
  }

  if (mode === 'readonly' && existing) {
    return (
      <Screen title={t('logger.title')} back onBack={close}>
        <EmptyState
          title={t('logger.readOnlyTitle')}
          body={t('logger.readOnlyBody')}
          actionLabel={t('logger.viewLog')}
          onAction={() => router.replace(`/session/${existing.id}`)}
        />
      </Screen>
    );
  }

  if (mode === 'new' && appt.briefRequired && !appt.briefAcknowledged) {
    return (
      <Screen title={t('logger.title')} back onBack={close}>
        <Card tone="primary" padding={5} testID="brief-gate">
          <Stack gap={3}>
            <BookOpenCheck size={28} color={theme.colors.primaryText} />
            <Text variant="heading">{t('logger.briefFirstTitle')}</Text>
            <Text>{t('logger.briefFirstBody', { name: appt.childName })}</Text>
            <Button
              label={t('logger.openBrief')}
              icon={ClipboardCheck}
              onPress={() => router.replace(`/brief/${appt.id}`)}
            />
          </Stack>
        </Card>
      </Screen>
    );
  }

  return (
    <LoggerForm
      key={existing?.id ?? 'new'}
      appointment={appt}
      allDimensions={dimsQ.data}
      goals={goals}
      plannedGoalIds={plannedGoalIds}
      checkin={checkinQ.data}
      mode={mode === 'readonly' ? 'new' : mode}
      existing={existing}
      initialDraft={initialDraft}
      previous={previous}
      settings={settings}
      clientId={clientId}
      saving={saving}
      onSubmit={(input, reason) => void onSubmit(input, reason)}
      onClose={close}
    />
  );
}
