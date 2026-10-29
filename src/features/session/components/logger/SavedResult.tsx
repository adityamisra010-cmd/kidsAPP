// Calm "Saved" view after logging: score, deltas, trend, goal accuracy, mastery, alerts, sync state.
import { router } from 'expo-router';
import { ArrowRight, Award, CircleCheckBig, CloudCheck, CloudUpload, House, TriangleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useOutboxStore } from '@/data/outbox';
import type { AppointmentView, GoalWithStats, SessionInput } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Delta, Divider, Row, Screen, Stack, SyncBadge, Text, TrendIndicator } from '@/ui';

import type { SavedResult as Result } from '../../logic/result';
import { payloadClientId } from '../../outbox';

function useSyncState(clientId: string): 'pending' | 'failed' | 'synced' {
  const status = useOutboxStore((s) => s.items.find((i) => payloadClientId(i.payload) === clientId)?.status);
  return status ?? 'synced';
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={1} style={{ minWidth: 120, flexGrow: 1 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

export function SavedResult({
  appointment: a,
  input,
  result,
  goals,
  clientId,
  queued,
  primaryLabel,
  onDone,
}: {
  appointment: AppointmentView;
  input: SessionInput;
  result: Result;
  goals: GoalWithStats[];
  clientId: string;
  /** False for amendments (saved online straight away). */
  queued: boolean;
  primaryLabel: string;
  onDone: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const sync = useSyncState(clientId);
  const { metrics } = result;
  const goalName = (id: string) => goals.find((g) => g.id === id)?.staffText ?? '';
  const practiceGoal = input.goalTrials[0]?.goalId ?? input.notes.planGoalIds[0];
  const SyncIcon = !queued || sync === 'synced' ? CloudCheck : sync === 'failed' ? TriangleAlert : CloudUpload;
  const syncText = !queued || sync === 'synced' ? tr('result.synced') : sync === 'failed' ? tr('result.failed') : tr('result.syncing');
  const syncColor = sync === 'failed' && queued ? t.colors.warning : t.colors.textMuted;

  return (
    <Screen
      testID="session-saved"
      footer={
        <Stack gap={2}>
          <Button
            label={tr('result.assignPractice')}
            icon={House}
            variant="secondary"
            fullWidth
            onPress={() => router.push(`/practice/task/new?childId=${a.childId}${practiceGoal ? `&goalId=${practiceGoal}` : ''}`)}
          />
          <Button label={primaryLabel} iconRight={ArrowRight} fullWidth onPress={onDone} testID="saved-done" />
        </Stack>
      }
    >
      <Stack gap={2} align="center" style={{ paddingTop: t.space[6] }}>
        <CircleCheckBig size={44} color={t.colors.success} strokeWidth={1.8} />
        <Text variant="title" align="center" accessibilityRole="header">
          {tr('result.title')}
        </Text>
        <Text color="textMuted" align="center">
          {tr('result.subtitle', { name: a.childName, therapy: a.therapyTypeName })}
        </Text>
        <Row gap={2} accessibilityLiveRegion="polite">
          <SyncIcon size={16} color={syncColor} />
          <Text variant="label" tint={syncColor}>
            {syncText}
          </Text>
        </Row>
        {queued && sync === 'failed' ? <SyncBadge /> : null}
      </Stack>

      <Card padding={5}>
        <Stack gap={4}>
          <Text variant="caption" color="textMuted">
            {tr('result.score')}
          </Text>
          <Row gap={1} align="flex-end">
            <Text variant="display" testID="saved-score">
              {Math.round(metrics.sessionScore)}
            </Text>
            <Text variant="label" color="textMuted" style={{ marginBottom: 6 }}>
              {tr('result.outOf')}
            </Text>
          </Row>
          {result.hasPrevious ? (
            <Row gap={4} wrap align="flex-start">
              <Stat label={tr('result.vsLast')}>
                <Delta value={metrics.deltaLast} />
              </Stat>
              {metrics.deltaRolling != null ? (
                <Stat label={tr('result.vsAverage')}>
                  <Delta value={metrics.deltaRolling} />
                </Stat>
              ) : null}
              <Stat label={tr('result.trend')}>
                <TrendIndicator trend={metrics.trend} size="sm" />
              </Stat>
            </Row>
          ) : (
            <Text color="textMuted">{tr('result.firstSession')}</Text>
          )}
          {metrics.goalAccuracy != null ? (
            <>
              <Divider />
              <Row justify="between">
                <Text variant="subheading">{tr('result.goalAccuracy')}</Text>
                <Text variant="subheading">{`${Math.round(metrics.goalAccuracy)}%`}</Text>
              </Row>
              {input.goalTrials.map((g) => (
                <View key={g.goalId} style={{ gap: 2 }}>
                  <Text variant="label">{goalName(g.goalId)}</Text>
                  <Text variant="caption" color="textMuted">
                    {tr('result.goalLine', {
                      successful: Math.min(g.successful, g.attempted),
                      attempted: g.attempted,
                      accuracy: Math.round((Math.min(g.successful, g.attempted) / g.attempted) * 100),
                    })}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </Stack>
      </Card>

      {result.masteryGoalIds.map((id) => (
        <Card key={id} tone="success" padding={4}>
          <Stack gap={2}>
            <Row gap={2}>
              <Award size={20} color={t.colors.success} />
              <Text variant="subheading" tint={t.colors.success}>
                {tr('result.masteryTitle')}
              </Text>
            </Row>
            <Text>{tr('result.masteryBody', { goal: goalName(id) })}</Text>
            <Button label={tr('result.openGoal')} variant="outline" size="sm" onPress={() => router.push(`/goal/${id}`)} style={{ alignSelf: 'flex-start' }} />
          </Stack>
        </Card>
      ))}

      {result.alerts.scoreDrop || result.alerts.incidentSpike ? (
        <Card tone="warning" padding={4}>
          <Stack gap={2}>
            <Row gap={2}>
              <TriangleAlert size={20} color={t.colors.warning} />
              <Text variant="subheading" tint={t.colors.warning}>
                {tr('result.alertsTitle')}
              </Text>
            </Row>
            {result.alerts.scoreDrop ? <Text>{tr('result.alertDrop')}</Text> : null}
            {result.alerts.incidentSpike ? <Text>{tr('result.alertIncidents', { count: metrics.incidentCount })}</Text> : null}
          </Stack>
        </Card>
      ) : null}
    </Screen>
  );
}
