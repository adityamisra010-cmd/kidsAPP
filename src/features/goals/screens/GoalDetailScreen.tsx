import { router } from 'expo-router';
import { Award, Pencil, Users } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildDetail, useTherapyTypes } from '@/data/hooks';
import { PROMPT_LEVEL_KEYS } from '@/domain/constants';
import { STAFF_ROLES, type GoalStatus, type GoalWithStats, type UUID } from '@/domain/types';
import { displayName } from '@/features/children/caseload';
import { accuracySeries, masteryProgress } from '@/features/progress/chartData';
import { ChartCard, LazyMount, LegendItem, useChartTheme } from '@/features/progress/components/ChartFrame';
import { GoalAccuracyChart } from '@/features/progress/components/Charts';
import { shortDate } from '@/features/progress/labels';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { formatDate, formatDay } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ChipGroup, Divider, errorMessageKey, LabeledIconButton, ListItem, QueryView, Row, Screen, SkeletonList, Stack, Text, toast, TypeTag } from '@/ui';

import { GoalEditSheet } from '../components/GoalEditSheet';
import { GoalStatusBadge } from '../components/GoalStatusBadge';
import { MasteredMoment } from '../components/MasteredMoment';
import { isActiveGoal, STATUS_OPTIONS } from '../goalStatus';
import { useGoal, useGoalProgress, useSetGoalStatus } from '../queries';
import { useConfirmMastery } from '../useConfirmMastery';

/** Goal detail (`/goal/[id]`): wording, rule, status changer, accuracy chart and trial history. */
export function GoalDetailScreen({ goalId }: { goalId: UUID }) {
  const { t } = useTranslation('goals');
  const q = useGoal(goalId);
  return (
    <QueryView
      query={q}
      skeleton={
        <Screen back title={t('detail.title')}>
          <SkeletonList rows={3} height={140} />
        </Screen>
      }
    >
      {(goal) => <GoalDetail goal={goal} />}
    </QueryView>
  );
}

function GoalDetail({ goal: g }: { goal: GoalWithStats }) {
  const theme = useTheme();
  const { t } = useTranslation('goals');
  const role = useRequiredActive().role;
  const child = useChildDetail(g.childId).data;
  const type = (useTherapyTypes().data ?? []).find((x) => x.id === g.therapyTypeId);
  const progress = useGoalProgress(g.id);
  const setStatus = useSetGoalStatus();
  const mastery = useConfirmMastery();
  const chart = useChartTheme();
  const [editing, setEditing] = useState(false);
  const canManage = STAFF_ROLES.includes(role) && child?.access === 'full';

  const changeStatus = async (next: GoalStatus) => {
    if (next === g.status) return;
    if (next === 'mastered') {
      await mastery.confirmMastery(g);
      return;
    }
    try {
      await setStatus.mutateAsync({ goalId: g.id, status: next });
      toast.success(t('detail.statusChanged', { status: t(`status.${next}`) }));
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  return (
    <Screen
      back
      title={t('detail.title')}
      subtitle={child ? displayName(child.child) : undefined}
      testID="goal-detail"
      right={canManage ? <LabeledIconButton icon={Pencil} label={t('common:actions.edit')} onPress={() => setEditing(true)} testID="edit-goal" /> : undefined}
    >
      {mastery.celebrating ? <MasteredMoment goalText={mastery.celebrating.text} onDone={mastery.endCelebration} /> : null}

      <Card accent={type?.color}>
        <Stack gap={3}>
          <Row justify="between" gap={2} wrap>
            {type ? <TypeTag name={therapyTypeLabel(t, type)} color={type.color} /> : <Text variant="caption" color="textMuted">—</Text>}
            <GoalStatusBadge status={g.status} />
          </Row>
          <Text variant="heading">{g.staffText}</Text>
          <Card tone="sunken" padding={3} elevated={false}>
            <Row gap={2} align="flex-start">
              <Users size={16} color={theme.colors.textMuted} style={{ marginTop: 3 }} />
              <Stack gap={1} flex={1}>
                <Text variant="caption" color="textMuted">
                  {t('detail.parentWording')}
                </Text>
                <Text>{g.parentText}</Text>
              </Stack>
            </Row>
          </Card>
          <Divider />
          <Fact label={t('form.domain')} value={vocabLabel(t, 'domains', g.domain)} />
          <Fact label={t('form.baseline')} value={g.baseline || t('detail.noBaseline')} />
          <Fact label={t('form.rule')} value={t('form.ruleSentence', { accuracy: g.masteryRule.accuracy, count: g.masteryRule.consecutiveSessions })} />
          <Fact label={t('form.startDate')} value={formatDate(g.startDate)} />
          {g.masteredAt ? <Fact label={t('detail.masteredOn')} value={formatDate(g.masteredAt)} /> : null}
        </Stack>
      </Card>

      {g.masterySuggested && isActiveGoal(g.status) && canManage ? (
        <Card tone="success" testID="mastery-banner">
          <Stack gap={2}>
            <Row gap={2}>
              <Award size={20} color={theme.colors.success} />
              <Text variant="subheading" color="success">
                {t('mastery.banner')}
              </Text>
            </Row>
            <Text color="textMuted">{t('mastery.bannerBody', { accuracy: g.masteryRule.accuracy, count: g.masteryRule.consecutiveSessions })}</Text>
            <Button label={t('mastery.confirm')} icon={Award} onPress={() => void mastery.confirmMastery(g)} loading={mastery.pendingGoalId === g.id} />
          </Stack>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <Stack gap={3}>
            <Text variant="subheading">{t('detail.status')}</Text>
            <ChipGroup
              single
              size="sm"
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) }))}
              value={[g.status]}
              onChange={(v) => v[0] && void changeStatus(v[0] as GoalStatus)}
              testID="status-changer"
            />
            <Text variant="caption" color="textMuted">
              {t('detail.statusHelp')}
            </Text>
          </Stack>
        </Card>
      ) : null}

      <QueryView query={progress} skeleton={<SkeletonList rows={1} height={200} />}>
        {(points) => {
          const m = masteryProgress(points, g.masteryRule);
          const summary =
            m.sessions === 0
              ? t('detail.noTrials')
              : t('detail.chartSummary', { count: m.sessions, latest: Math.round(m.latest ?? 0), atOrAbove: m.atOrAbove, accuracy: g.masteryRule.accuracy, streak: m.streak });
          return (
            <Stack gap={4}>
              <ChartCard
                title={t('detail.chartTitle')}
                summary={summary}
                legend={
                  m.sessions > 1 ? (
                    <Row gap={4} wrap>
                      <LegendItem color={type?.color ?? chart.colors.primary} label={t('detail.legendAccuracy')} />
                      <LegendItem color={chart.colors.mastery} label={t('detail.legendMastery', { accuracy: g.masteryRule.accuracy })} dashed />
                    </Row>
                  ) : undefined
                }
                testID="goal-chart"
              >
                {m.sessions > 1 ? (
                  <LazyMount height={170}>
                    {(w) => <GoalAccuracyChart points={accuracySeries(points, shortDate)} accuracy={g.masteryRule.accuracy} width={w} color={type?.color} height={160} />}
                  </LazyMount>
                ) : null}
              </ChartCard>

              {points.length ? (
                <Card padding={3}>
                  <Stack gap={2}>
                    <Text variant="subheading">{t('detail.history')}</Text>
                    {[...points]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((p, i) => (
                        <Stack key={p.sessionId} gap={0}>
                          {i > 0 ? <Divider /> : null}
                          <ListItem
                            title={formatDay(p.date)}
                            subtitle={`${t('detail.trials', { successful: p.successful, attempted: p.attempted })} · ${t(`prompt.${PROMPT_LEVEL_KEYS[p.promptLevel]}`)}`}
                            right={
                              <Text variant="subheading" tint={p.accuracy >= g.masteryRule.accuracy ? theme.colors.success : theme.colors.text}>
                                {`${Math.round(p.accuracy)}%`}
                              </Text>
                            }
                            onPress={() => router.push(`/session/${p.sessionId}`)}
                          />
                        </Stack>
                      ))}
                  </Stack>
                </Card>
              ) : null}
            </Stack>
          );
        }}
      </QueryView>

      {canManage && editing ? <GoalEditSheet goal={g} visible onClose={() => setEditing(false)} /> : null}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Row justify="between" gap={3} align="flex-start">
      <Text variant="label" color="textMuted">
        {label}
      </Text>
      <Text style={{ flex: 1, textAlign: 'right' }}>{value}</Text>
    </Row>
  );
}
