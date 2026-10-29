/** The individual cards of the staff progress screen. Each chart has a words summary underneath. */
import { useTranslation } from 'react-i18next';

import type { GoalProgressPoint, GoalWithStats, SessionSummary, StaffProgress, TherapyType } from '@/domain/types';
import { GoalStatusBadge } from '@/features/goals/components/GoalStatusBadge';
import { Card, Row, Sparkline, Stack, Text, TrendIndicator } from '@/ui';

import {
  accuracySeries,
  attendanceCounts,
  comparisonSummary,
  dimensionSeries,
  dimensionTrend,
  incidentSeries,
  masteryProgress,
  scoreSeries,
  scoreSummary,
  substituteImpact,
  type DimensionComparisonRow,
} from '../chartData';
import { ChartCard, LazyMount, LegendItem, useChartTheme } from '../components/ChartFrame';
import { DimensionCompareChart, GoalAccuracyChart, IncidentsChart, ScoreTrendChart } from '../components/Charts';
import { shortDate, shortDimLabel } from '../labels';

export function ScoreTrendCard({ sessions, color }: { sessions: SessionSummary[]; color?: string }) {
  const { t } = useTranslation('progress');
  const s = scoreSummary(sessions);
  const summary =
    s.count === 0
      ? t('staff.noSessions')
      : [
          t('staff.scoreSummary', { count: s.count, average: s.average, latest: s.latest != null ? Math.round(s.latest) : '—' }),
          t(`staff.trendSentence.${s.trend}`),
        ].join(' ');
  return (
    <ChartCard title={t('staff.scoreTitle')} subtitle={t('staff.scoreSubtitle')} summary={summary} testID="score-trend">
      {s.count > 1 ? (
        <LazyMount height={190}>{(w) => <ScoreTrendChart points={scoreSeries(sessions, shortDate)} width={w} color={color} />}</LazyMount>
      ) : null}
    </ChartCard>
  );
}

export function DimensionCompareCard({ rows }: { rows: DimensionComparisonRow[] }) {
  const { t } = useTranslation('progress');
  const c = useChartTheme();
  const { higher, lower } = comparisonSummary(rows);
  const parts = [
    higher.length ? t('staff.compareHigher', { list: higher.join(', ') }) : null,
    lower.length ? t('staff.compareLower', { list: lower.join(', ') }) : null,
  ].filter(Boolean);
  return (
    <ChartCard
      title={t('staff.compareTitle')}
      subtitle={t('staff.compareSubtitle')}
      summary={parts.length ? parts.join(' ') : t('staff.compareSame')}
      legend={
        <Row gap={4} wrap>
          <LegendItem color={c.colors.muted} label={t('staff.legendAverage')} />
          <LegendItem color={c.colors.primary} label={t('staff.legendLatest')} />
        </Row>
      }
      testID="dimension-compare"
    >
      <LazyMount height={170} delay={80}>
        {(w) => <DimensionCompareChart rows={rows} width={w} shortLabel={shortDimLabel} />}
      </LazyMount>
    </ChartCard>
  );
}

export function DimensionSparklinesCard({ sessions, dims, color }: { sessions: SessionSummary[]; dims: { key: string; label: string }[]; color?: string }) {
  const { t } = useTranslation('progress');
  const rows = dims.map((d) => ({ ...d, values: dimensionSeries(sessions, d.key) })).filter((r) => r.values.length > 0);
  if (rows.length === 0) return null;
  return (
    <Card testID="dimension-sparklines">
      <Stack gap={3}>
        <Text variant="subheading" accessibilityRole="header">
          {t('staff.dimensionsTitle')}
        </Text>
        {rows.map((r) => {
          const latest = r.values[r.values.length - 1];
          const trend = dimensionTrend(r.values);
          return (
            <Row key={r.key} gap={3} accessibilityLabel={t('staff.dimensionA11y', { label: r.label, latest, trend: t(`common:trend.${trend}`) })}>
              <Text variant="label" style={{ flex: 1 }} numberOfLines={2}>
                {r.label}
              </Text>
              <Sparkline values={r.values.slice(-10)} domain={[1, 5]} width={84} height={26} color={color} />
              <Text variant="label" weight="semibold" style={{ width: 32, textAlign: 'right' }}>
                {`${latest}/5`}
              </Text>
              <TrendIndicator trend={trend} showLabel={false} size="sm" />
            </Row>
          );
        })}
      </Stack>
    </Card>
  );
}

export function GoalAccuracyCard({ goal, points, color, index }: { goal: GoalWithStats; points: GoalProgressPoint[]; color?: string; index: number }) {
  const { t } = useTranslation('progress');
  const m = masteryProgress(points, goal.masteryRule);
  const summary =
    m.sessions === 0
      ? t('staff.goalNoTrials')
      : [
          t('staff.goalSummary', { latest: Math.round(m.latest ?? 0), atOrAbove: m.atOrAbove, count: m.sessions, accuracy: goal.masteryRule.accuracy }),
          m.met ? t('staff.goalMet') : t('staff.goalStreak', { streak: m.streak, count: goal.masteryRule.consecutiveSessions }),
        ].join(' ');
  const c = useChartTheme();
  return (
    <ChartCard
      title={goal.staffText}
      summary={summary}
      legend={
        m.sessions > 0 ? (
          <Row gap={4} wrap>
            <LegendItem color={color ?? c.colors.primary} label={t('staff.legendAccuracy')} />
            <LegendItem color={c.colors.mastery} label={t('staff.legendMastery', { accuracy: goal.masteryRule.accuracy })} dashed />
          </Row>
        ) : undefined
      }
      testID={`goal-accuracy-${goal.id}`}
    >
      <Stack gap={2}>
        <GoalStatusBadge status={goal.status} />
        {m.sessions > 1 ? (
          <LazyMount height={160} delay={160 + index * 80}>
            {(w) => <GoalAccuracyChart points={accuracySeries(points, shortDate)} accuracy={goal.masteryRule.accuracy} width={w} color={color} />}
          </LazyMount>
        ) : null}
      </Stack>
    </ChartCard>
  );
}

export function AttendanceCard({ attendance }: { attendance: StaffProgress['attendance'] }) {
  const { t } = useTranslation('progress');
  const a = attendanceCounts(attendance);
  const cells: [string, number][] = [
    [t('staff.att.attended'), a.attended],
    [t('staff.att.late'), a.late],
    [t('staff.att.absent'), a.absent],
    [t('staff.att.cancelledByParent'), a.cancelledByParent],
    [t('staff.att.cancelledBySchool'), a.cancelledBySchool],
  ];
  return (
    <Card testID="attendance">
      <Stack gap={3}>
        <Text variant="subheading" accessibilityRole="header">
          {t('staff.attendanceTitle')}
        </Text>
        <Text variant="heading">{t('parent.attendance', { attended: a.attended, expected: a.expected })}</Text>
        <Row gap={2} wrap>
          {cells.map(([label, n]) => (
            <Card key={label} tone="sunken" padding={3} style={{ minWidth: '30%', flexGrow: 1 }}>
              <Text variant="heading">{n}</Text>
              <Text variant="caption" color="textMuted">
                {label}
              </Text>
            </Card>
          ))}
        </Row>
      </Stack>
    </Card>
  );
}

export function IncidentsCard({ byWeek }: { byWeek: StaffProgress['incidentsByWeek'] }) {
  const { t } = useTranslation('progress');
  const points = incidentSeries(byWeek, shortDate);
  const total = points.reduce((s, p) => s + p.value, 0);
  const weeks = points.filter((p) => p.value > 0).length;
  return (
    <ChartCard
      title={t('staff.incidentsTitle')}
      summary={total === 0 ? t('staff.incidentsNone') : t('staff.incidentsSummary', { total, weeks, count: points.length })}
      testID="incidents"
    >
      {total > 0 ? <LazyMount height={140} delay={120}>{(w) => <IncidentsChart points={points} width={w} />}</LazyMount> : null}
    </ChartCard>
  );
}

export function SubstituteImpactCard({ impact }: { impact: StaffProgress['substituteImpact'] }) {
  const { t } = useTranslation('progress');
  const s = substituteImpact(impact);
  if (!s) return null;
  return (
    <Card tone={s.direction === 'lower' ? 'warning' : 'sunken'} testID="substitute-impact">
      <Stack gap={1}>
        <Text variant="subheading">{t('staff.substituteTitle')}</Text>
        <Text>{t(`staff.substitute.${s.direction}`, { diff: s.diff, count: s.count })}</Text>
        {s.direction === 'lower' ? (
          <Text variant="caption" color="textMuted">
            {t('staff.substituteTip')}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

export function therapyColor(types: TherapyType[], id: string | null): string | undefined {
  return id ? types.find((x) => x.id === id)?.color : undefined;
}
