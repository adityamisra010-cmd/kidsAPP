import { Image } from 'expo-image';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Award, CalendarCheck, CalendarX2, CircleSlash, ClipboardList, House } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Trend } from '@/domain/types';
import { formatDate } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Card, Divider, ProgressBar, Row, Sparkline, Stack, Text, TypeTag } from '@/ui';

import { StatTile } from '../../import/components/StatTile';
import type { ReportModel } from '../reportModel';

function Section({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <Card testID={testID}>
      <Stack gap={3}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {children}
      </Stack>
    </Card>
  );
}

export function TrendWords({ trend, audience }: { trend: Trend; audience: ReportModel['audience'] }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : ArrowRight;
  const color = trend === 'up' ? t.colors.success : trend === 'down' ? t.colors.warning : t.colors.textMuted;
  const label = audience === 'parent' ? tr(`reports:parentTrend.${trend}`) : tr(`common:trend.${trend}`);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessible accessibilityLabel={label}>
      <Icon size={18} color={color} strokeWidth={2.4} />
      <Text variant="label" weight="semibold" tint={color}>
        {label}
      </Text>
    </View>
  );
}

export function ReportHeader({ m }: { m: ReportModel }) {
  const t = useTheme();
  const { t: tr } = useTranslation('reports');
  return (
    <Card tone="primary">
      <Row gap={3} align="center">
        {m.school.logoUrl ? (
          <Image source={{ uri: m.school.logoUrl }} style={{ width: 52, height: 52, borderRadius: t.radius.md }} contentFit="cover" accessibilityLabel={m.school.name} />
        ) : (
          <Avatar name={m.school.shortName || m.school.name} size={52} />
        )}
        <Stack gap={1} flex={1}>
          <Text variant="subheading" numberOfLines={2}>
            {m.school.name}
          </Text>
          <Text variant="caption" color="textMuted">
            {tr('pdf.period', { from: formatDate(m.range.from), to: formatDate(m.range.to) })}
          </Text>
          <Badge label={m.audience === 'parent' ? tr('child.audienceParent') : tr('child.audienceStaff')} tone={m.audience === 'parent' ? 'info' : 'primary'} />
        </Stack>
      </Row>
    </Card>
  );
}

export function ReportPreview({ m }: { m: ReportModel }) {
  const t = useTheme();
  const { t: tr } = useTranslation('reports');
  const a = m.attendance;
  return (
    <Stack gap={4}>
      <Section title={tr('pdf.childTitle')} testID="report-child-section">
        <Row gap={3}>
          <Avatar name={m.child.name} size={48} />
          <Stack gap={1} flex={1}>
            <Text variant="subheading">{m.child.preferredName && m.child.preferredName !== m.child.name ? `${m.child.name} (${m.child.preferredName})` : m.child.name}</Text>
            <Text variant="label" color="textMuted">
              {[m.child.ageLabel, `${tr('pdf.dob')}: ${formatDate(m.child.dob)}`, m.child.classGroup].filter(Boolean).join(' · ')}
            </Text>
          </Stack>
        </Row>
      </Section>

      <Section title={tr('pdf.attendanceTitle')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          <StatTile icon={ClipboardList} value={a.scheduled} label={tr('attendance.scheduled')} />
          <StatTile icon={CalendarCheck} value={a.attended} label={tr('attendance.attended')} tone="success" />
          <StatTile icon={CircleSlash} value={a.absent} label={tr('attendance.absent')} tone={a.absent ? 'warning' : 'neutral'} />
          <StatTile icon={CalendarX2} value={a.cancelledBySchool + a.cancelledByParent} label={tr('attendance.cancelled')} />
        </View>
        {a.rate != null ? (
          <Text variant="label" color="textMuted">
            {[tr('attendance.rate', { rate: a.rate }), a.late ? tr('attendance.lateCount', { count: a.late }) : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </Section>

      <Section title={tr('pdf.therapyTitle')}>
        {m.therapies.length ? (
          m.therapies.map((th, i) => (
            <Stack key={`${th.name}-${i}`} gap={2}>
              {i > 0 ? <Divider /> : null}
              <Row justify="between" gap={2} wrap>
                <TypeTag name={th.name} color={th.color} />
                <TrendWords trend={th.trend} audience={m.audience} />
              </Row>
              <Row justify="between" gap={3}>
                <Text variant="label" color="textMuted" style={{ flex: 1 }}>
                  {[tr('pdf.sessions', { count: th.sessionsCount }), th.averageScore != null ? tr('pdf.averageScore', { score: th.averageScore }) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {th.points.length > 1 ? <Sparkline values={th.points.map((p) => p.score)} domain={[0, 100]} color={th.color} width={110} height={32} /> : null}
              </Row>
              {th.latestNote ? (
                <Text color="textMuted" style={{ fontStyle: 'italic' }}>
                  {`${tr('pdf.latestNote')}: “${th.latestNote}”`}
                </Text>
              ) : null}
            </Stack>
          ))
        ) : (
          <Text color="textMuted">{tr('pdf.noSessions')}</Text>
        )}
      </Section>

      <Section title={tr('pdf.goalsTitle')}>
        {m.goals.length ? (
          m.goals.map((g, i) => (
            <Stack key={g.id} gap={2}>
              {i > 0 ? <Divider /> : null}
              <Text variant="bodyStrong">{g.text}</Text>
              <Row gap={2} wrap>
                {g.therapyName ? <TypeTag name={g.therapyName} color={g.therapyColor ?? t.colors.primary} /> : null}
                <Badge label={tr(g.statusKey)} tone={g.statusTone} />
                {g.masterySuggested ? <Badge label={tr('pdf.masterySuggested')} tone="success" icon={Award} /> : null}
              </Row>
              {m.audience === 'staff' ? (
                <Text variant="caption" color="textMuted">
                  {[
                    `${tr('pdf.col.accuracy')}: ${g.accuracy != null ? `${g.accuracy}%` : '—'}`,
                    `${tr('pdf.col.sessionsTracked')}: ${g.sessionsTracked ?? 0}`,
                    g.promptLevel ? `${tr('pdf.col.promptLevel')}: ${tr(`prompt.${g.promptLevel}`)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
            </Stack>
          ))
        ) : (
          <Text color="textMuted">{tr('pdf.noGoals')}</Text>
        )}
      </Section>

      <Section title={tr('pdf.winsTitle')}>
        {m.wins.length ? (
          m.wins.map((w) => (
            <Row key={w.id} gap={3} align="flex-start">
              <Award size={20} color={t.colors.accent} />
              <Stack gap={1} flex={1}>
                <Text variant="bodyStrong">{w.text}</Text>
                <Text variant="caption" color="textMuted">
                  {[w.therapyName, w.date ? formatDate(w.date) : null].filter(Boolean).join(' · ')}
                </Text>
              </Stack>
            </Row>
          ))
        ) : (
          <Text color="textMuted">{tr('pdf.noWins')}</Text>
        )}
      </Section>

      <Section title={tr('pdf.practiceTitle')}>
        <Row gap={2}>
          <House size={20} color={t.colors.textMuted} />
          <Text variant="bodyStrong">{tr('practice.percent', { percent: m.homePractice.percent })}</Text>
        </Row>
        <ProgressBar value={m.homePractice.percent / 100} label={tr('practice.percent', { percent: m.homePractice.percent })} />
        <Text color="textMuted">{tr(`practice.${m.homePractice.band}`)}</Text>
      </Section>
    </Stack>
  );
}
