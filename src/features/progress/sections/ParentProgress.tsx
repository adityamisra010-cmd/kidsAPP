import { router } from 'expo-router';
import { CalendarCheck, FileDown, House, Target } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ParentProgress as ParentProgressData, ProgressPeriod, UUID } from '@/domain/types';
import { vocabLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, EmptyState, Icon, ProgressBar, QueryView, Row, SegmentedControl, SkeletonList, Sparkline, Stack, Text, TrendIndicator, TypeTag } from '@/ui';

import { attendanceCounts } from '../chartData';
import { parentDimLabel, parentTrendKey, trendToChange } from '../labels';
import { useParentProgress } from '../queries';

const PERIODS: ProgressPeriod[] = ['week', 'month', 'quarter'];

/**
 * Parent progress in words and arrows. No session scores or growth percentages; attendance as
 * counts; only home-practice completion is a percentage (it is a plain count of tasks done).
 */
export function ParentProgress({ childId, name }: { childId: UUID; name: string }) {
  const { t } = useTranslation('progress');
  const [period, setPeriod] = useState<ProgressPeriod>('month');
  const q = useParentProgress(childId, period);
  return (
    <Stack gap={4} testID="parent-progress">
      <SegmentedControl options={PERIODS.map((p) => ({ value: p, label: t(`parent.period.${p}`) }))} value={period} onChange={setPeriod} />
      <QueryView query={q} skeleton={<SkeletonList rows={3} height={140} />}>
        {(data) => <ParentProgressBody data={data} name={name} childId={childId} />}
      </QueryView>
    </Stack>
  );
}

function ParentProgressBody({ data, name, childId }: { data: ParentProgressData; name: string; childId: UUID }) {
  const theme = useTheme();
  const { t } = useTranslation('progress');
  const att = attendanceCounts(data.attendance);
  const nothing = data.byTherapy.length === 0 && data.goalsSummary.length === 0 && att.expected === 0;

  return (
    <Stack gap={4}>
      {nothing ? <EmptyState compact title={t('parent.emptyTitle')} body={t('parent.emptyBody', { name })} /> : null}

      {data.byTherapy.map((tt) => (
        <Card key={tt.therapyTypeId} accent={tt.therapyTypeColor}>
          <Stack gap={3}>
            <Row justify="between" gap={2}>
              <TypeTag name={tt.therapyTypeName} color={tt.therapyTypeColor} />
              <Text variant="caption" color="textMuted">
                {t('parent.sessionsCount', { count: tt.sessionsCount })}
              </Text>
            </Row>
            {tt.dimensions.map((d) => {
              const label = parentDimLabel(t, d.key, d.label);
              const word = t(parentTrendKey(d.trend));
              return (
                <Row key={d.key} gap={3} accessibilityLabel={`${label}: ${word}`} style={{ minHeight: 40 }}>
                  <Icon name={d.icon} size={20} color="textMuted" />
                  <Stack gap={0} flex={1}>
                    <Text variant="bodyStrong">{label}</Text>
                    <Row gap={1}>
                      <TrendIndicator change={trendToChange(d.trend)} showLabel={false} size="sm" />
                      <Text variant="label" color="textMuted">
                        {word}
                      </Text>
                    </Row>
                  </Stack>
                  {d.recent.length > 1 ? <Sparkline values={d.recent} domain={[1, 5]} width={72} height={26} color={tt.therapyTypeColor} /> : null}
                </Row>
              );
            })}
          </Stack>
        </Card>
      ))}

      {data.goalsSummary.length ? (
        <Card>
          <Stack gap={3}>
            <Row gap={2}>
              <Target size={20} color={theme.colors.primaryText} />
              <Text variant="subheading">{t('parent.goalsTitle')}</Text>
            </Row>
            {data.goalsSummary.map((g) => (
              <Stack key={g.domain} gap={0}>
                <Text variant="bodyStrong">{vocabLabel(t, 'domains', g.domain)}</Text>
                <Text color="textMuted">{t('parent.goalLine', { achieved: g.achieved, inProgress: g.inProgress })}</Text>
              </Stack>
            ))}
          </Stack>
        </Card>
      ) : null}

      <Row gap={3} align="stretch">
        <Card style={{ flex: 1 }}>
          <Stack gap={2}>
            <CalendarCheck size={20} color={theme.colors.primaryText} />
            <Text variant="subheading">{t('parent.attendance', { attended: att.attended, expected: att.expected })}</Text>
            {att.cancelledBySchool ? (
              <Text variant="caption" color="textMuted">
                {t('parent.schoolCancelled', { count: att.cancelledBySchool })}
              </Text>
            ) : null}
          </Stack>
        </Card>
        <Card style={{ flex: 1 }}>
          <Stack gap={2}>
            <House size={20} color={theme.colors.primaryText} />
            <Text variant="subheading">{t('parent.homePractice', { percent: Math.round(data.homePracticeCompletion) })}</Text>
            <View accessible={false}>
              <ProgressBar value={data.homePracticeCompletion / 100} label={t('parent.homePracticeA11y', { percent: Math.round(data.homePracticeCompletion) })} />
            </View>
          </Stack>
        </Card>
      </Row>

      <Button
        label={t('parent.download')}
        icon={FileDown}
        variant="outline"
        fullWidth
        onPress={() => router.push(`/reports/child/${childId}?audience=parent`)}
      />
    </Stack>
  );
}
