/**
 * Handover Brief (`/brief/[appointmentId]`): one screen a substitute can scan in 30 seconds.
 * When acknowledgement is required, "I've read this" must be tapped before logging opens.
 * `brief_only` access (substitutes) never shows clinical details or the full profile link.
 */
import { router } from 'expo-router';
import { Check, ClipboardPen, Eye, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildDetail, useRatingDimensions } from '@/data/hooks';
import type { HandoverBrief } from '@/domain/types';
import { formatTimeRange } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { Button, errorMessageKey, Screen, SectionHeader, SkeletonList, Stack, Text, toast, QueryView } from '@/ui';

import { BriefHeader, DoDontCard, ProfileChipsCard } from '../components/brief/BriefProfile';
import {
  AlertsCard,
  GoalsCard,
  HomePracticeCard,
  PlanCard,
  RecentSessionsCard,
  WorkedCard,
} from '../components/brief/BriefProgress';
import { CheckinCard } from '../components/CheckinCard';
import { activeGoals, orderGoals } from '../logic/draft';
import { useAcknowledgeBrief, useBrief } from '../queries';

function BriefBody({ brief: b, fullAccess }: { brief: HandoverBrief; fullAccess: boolean }) {
  const { t } = useTranslation('brief');
  const dimsQ = useRatingDimensions();
  const plannedIds = b.planForToday?.goalIds ?? [];
  const goals = orderGoals(activeGoals(b.goals), plannedIds);
  return (
    <Stack gap={4}>
      <BriefHeader brief={b} allergies={fullAccess ? b.profile.clinical?.allergies || undefined : undefined} />
      <AlertsCard alerts={b.activeAlerts} />
      <PlanCard plan={b.planForToday} goals={b.goals} />
      <DoDontCard dos={b.profile.dos} donts={b.profile.donts} />
      <ProfileChipsCard brief={b} />
      {b.todaysCheckin ? <CheckinCard checkin={b.todaysCheckin} /> : null}
      <SectionHeader title={t('goals.title')} />
      <GoalsCard goals={goals} plannedIds={plannedIds} />
      <SectionHeader title={t('recent.title')} />
      <RecentSessionsCard sessions={b.recentSessions} dims={dimsQ.data ?? []} />
      <WorkedCard worked={b.whatWorked} didnt={b.whatDidnt} />
      <HomePracticeCard tasks={b.openHomeTasks} feedback={b.latestParentFeedback} />
      {fullAccess ? (
        <Button
          label={t('fullProfile')}
          icon={UserRound}
          variant="ghost"
          onPress={() => router.push(`/child/${b.child.id}`)}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </Stack>
  );
}

function BriefFooter({ brief: b }: { brief: HandoverBrief }) {
  const { t } = useTranslation('brief');
  const active = useRequiredActive();
  const ack = useAcknowledgeBrief(b.appointment.id);
  const [ackLocal, setAckLocal] = useState(false);
  const acknowledged = b.acknowledged || ackLocal;
  const needsAck = b.mustAcknowledge && !acknowledged;
  const isOwnSession = b.appointment.therapistId === active.user.profile.id;
  const logRoute = `/session/log/${b.appointment.id}`;

  const onAck = () =>
    ack.mutate(undefined, {
      onSuccess: () => {
        setAckLocal(true);
        toast.success(t('footer.acknowledged'));
      },
      onError: (e) => toast.error(t(errorMessageKey(e))),
    });

  if (b.appointment.sessionId) {
    return (
      <Button
        label={t('footer.viewLog')}
        icon={Eye}
        variant="secondary"
        fullWidth
        onPress={() => router.push(`/session/${b.appointment.sessionId}`)}
      />
    );
  }
  if (needsAck) {
    return (
      <>
        <Text variant="caption" color="textMuted" align="center">
          {t('footer.mustRead')}
        </Text>
        <Button
          label={t('footer.acknowledge')}
          icon={Check}
          size="lg"
          fullWidth
          loading={ack.isPending}
          onPress={onAck}
          testID="brief-ack"
        />
        {isOwnSession ? (
          <Button label={t('footer.log')} icon={ClipboardPen} variant="outline" fullWidth disabled testID="brief-log" />
        ) : null}
      </>
    );
  }
  if (!isOwnSession) return null;
  return (
    <Button
      label={t('footer.log')}
      icon={ClipboardPen}
      size="lg"
      fullWidth
      onPress={() => router.push(logRoute)}
      testID="brief-log"
    />
  );
}

export function HandoverBriefScreen({ appointmentId }: { appointmentId: string }) {
  const { t } = useTranslation('brief');
  const q = useBrief(appointmentId);
  const b = q.data;
  const detail = useChildDetail(b?.child.id);
  // Until access is known, treat it as brief-only (never flash clinical info).
  const fullAccess = detail.data?.access === 'full';
  return (
    <Screen
      title={t('title')}
      subtitle={
        b
          ? t('subtitle', {
              therapy: b.appointment.therapyTypeName,
              time: formatTimeRange(b.appointment.startsAt, b.appointment.endsAt),
            })
          : undefined
      }
      back
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      footer={b ? <BriefFooter brief={b} /> : undefined}
      testID="handover-brief"
    >
      <QueryView query={q} skeleton={<SkeletonList rows={4} height={140} />}>
        {(data) => <BriefBody brief={data} fullAccess={fullAccess} />}
      </QueryView>
    </Screen>
  );
}
