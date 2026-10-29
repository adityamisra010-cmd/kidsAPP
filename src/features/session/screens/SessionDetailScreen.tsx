/**
 * Session detail (`/session/[id]`), role-aware:
 * - Staff: full log with metrics, anchors, deltas, notes and amendment history; Edit / Amend.
 * - Parent: the parent snapshot only (never internal notes).
 */
import { router } from 'expo-router';
import { FilePen, PencilLine } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useAppointment, useGoals, useRatingDimensions } from '@/data/hooks';
import { formatDay } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { Button, QueryView, Screen, SkeletonList, Stack } from '@/ui';

import { ParentSessionDetail } from '../components/detail/ParentSessionDetail';
import {
  AmendmentsCard,
  BehaviourCard,
  DimensionsCard,
  JudgementCard,
  NotesCard,
  ScoreCard,
  StaffHeaderCard,
  TrialsCard,
} from '../components/detail/StaffDetailSections';
import { canAmend, canEdit } from '../logic/draft';
import { useAmendments, useParentSnapshot, useSessionLog } from '../queries';

function StaffSessionDetail({ id }: { id: string }) {
  const { t } = useTranslation('session');
  const active = useRequiredActive();
  const logQ = useSessionLog(id);
  const log = logQ.data;
  const apptQ = useAppointment(log?.appointmentId);
  const dimsQ = useRatingDimensions();
  const goalsQ = useGoals(log?.childId);
  const amendQ = useAmendments(id);
  const userId = active.user.profile.id;
  const editRoute = log ? `/session/log/${log.appointmentId}?sessionId=${log.id}` : '';

  const footer = log ? (
    canEdit(log, userId) ? (
      <Button
        label={t('detail.edit')}
        icon={PencilLine}
        fullWidth
        onPress={() => router.push(editRoute)}
        testID="session-edit"
      />
    ) : canAmend(log, userId, active.role) ? (
      <Button
        label={t('detail.amend')}
        icon={FilePen}
        variant="secondary"
        fullWidth
        onPress={() => router.push(editRoute)}
        testID="session-amend"
      />
    ) : undefined
  ) : undefined;

  return (
    <Screen
      title={t('detail.title')}
      subtitle={
        log ? `${apptQ.data?.therapyTypeName ?? ''}${apptQ.data ? ' · ' : ''}${formatDay(log.date)}` : undefined
      }
      back
      refreshing={logQ.isRefetching}
      onRefresh={() => void Promise.all([logQ.refetch(), amendQ.refetch()])}
      footer={footer}
      testID="session-detail-staff"
    >
      <QueryView query={logQ} skeleton={<SkeletonList rows={4} height={140} />}>
        {(l) => (
          <Stack gap={4}>
            <StaffHeaderCard log={l} appointment={apptQ.data} />
            <ScoreCard log={l} />
            <DimensionsCard log={l} dims={dimsQ.data ?? []} />
            <TrialsCard log={l} goals={goalsQ.data ?? []} />
            <BehaviourCard log={l} />
            <JudgementCard log={l} />
            <NotesCard log={l} goals={goalsQ.data ?? []} />
            <AmendmentsCard amendments={amendQ.data ?? []} />
          </Stack>
        )}
      </QueryView>
    </Screen>
  );
}

function ParentSessionScreen({ id }: { id: string }) {
  const { t } = useTranslation('session');
  const q = useParentSnapshot(id);
  return (
    <Screen
      title={t('parent.title')}
      back
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      testID="session-detail-parent"
    >
      <QueryView query={q} skeleton={<SkeletonList rows={3} height={140} />}>
        {(s) => <ParentSessionDetail snapshot={s} />}
      </QueryView>
    </Screen>
  );
}

export function SessionDetailScreen({ id }: { id: string }) {
  const active = useRequiredActive();
  return active.role === 'parent' ? <ParentSessionScreen id={id} /> : <StaffSessionDetail id={id} />;
}
