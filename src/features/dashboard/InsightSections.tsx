import { CalendarDays, CalendarX, CircleCheck, ClipboardCheck, ClipboardList, Users, type LucideIcon } from 'lucide-react-native';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminDashboard } from '@/domain/types';
import { InlineEmpty, Section } from '@/features/home/components/Blocks';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Divider, SectionHeader, Stack, Text, type Tone } from '@/ui';

import { complianceRows, rateTone, todayTiles, workloadRows, type TodayTileKey } from './format';
import { BarRow, RateRow, useToneBar } from './RateRow';
import { StatGrid, StatTile } from './StatTile';

const TILE: Record<TodayTileKey, { icon: LucideIcon; tone: (v: number) => Tone }> = {
  scheduled: { icon: CalendarDays, tone: () => 'neutral' },
  completed: { icon: CircleCheck, tone: (v) => (v ? 'success' : 'neutral') },
  logged: { icon: ClipboardCheck, tone: (v) => (v ? 'success' : 'neutral') },
  unlogged: { icon: ClipboardList, tone: (v) => (v ? 'warning' : 'neutral') },
  cancelled: { icon: CalendarX, tone: () => 'neutral' },
};

export function TodaySection({ today, index }: { today: AdminDashboard['today']; index: number }) {
  const { t } = useTranslation('dashboard');
  return (
    <Section index={index} testID="dash-today">
      <SectionHeader title={t('today.title')} />
      <StatGrid>
        {todayTiles(today).map(({ key, value }) => (
          <StatTile key={key} testID={`tile-${key}`} icon={TILE[key].icon} tone={TILE[key].tone(value)} label={t(`today.${key}`)} value={value} />
        ))}
      </StatGrid>
    </Section>
  );
}

function ComplianceRowView({ row }: { row: ReturnType<typeof complianceRows>[number] }) {
  const { t } = useTranslation('dashboard');
  const color = useToneBar(row.tone);
  return (
    <BarRow
      testID={`compliance-${row.therapistId}`}
      title={row.name}
      detail={row.noneDue ? t('week.noneDue') : t('week.loggedOf', { logged: row.logged, due: row.due })}
      fraction={row.fraction}
      color={color}
    />
  );
}

export function WeekSection({ week, index }: { week: AdminDashboard['week']; index: number }) {
  const { t } = useTranslation('dashboard');
  const rows = complianceRows(week.loggingCompliance);
  return (
    <Section index={index} testID="dash-week">
      <SectionHeader title={t('week.title')} subtitle={t('week.subtitle')} />
      <Card>
        <Stack gap={5}>
          <RateRow testID="rate-attendance" label={t('week.attendance')} caption={t('week.attendanceHint')} percent={week.attendanceRate} tone={rateTone(week.attendanceRate)} />
          <RateRow testID="rate-practice" label={t('week.practice')} caption={t('week.practiceHint')} percent={week.homePracticeRate} tone={rateTone(week.homePracticeRate)} />
        </Stack>
      </Card>
      <Text variant="subheading">{t('week.compliance')}</Text>
      {rows.length === 0 ? (
        <InlineEmpty icon={Users} title={t('week.noTherapists')} />
      ) : (
        <Card padding={3}>
          {rows.map((r, i) => (
            <Fragment key={r.therapistId}>
              {i > 0 ? <Divider /> : null}
              <ComplianceRowView row={r} />
            </Fragment>
          ))}
        </Card>
      )}
    </Section>
  );
}

export function WorkloadSection({ workload, index }: { workload: AdminDashboard['workload']; index: number }) {
  const { t } = useTranslation('dashboard');
  const theme = useTheme();
  const rows = workloadRows(workload);
  return (
    <Section index={index} testID="dash-workload">
      <SectionHeader title={t('workload.title')} subtitle={t('workload.subtitle')} />
      {rows.length === 0 ? (
        <InlineEmpty icon={Users} title={t('week.noTherapists')} />
      ) : (
        <Card padding={3}>
          {rows.map((r, i) => (
            <Fragment key={r.therapistId}>
              {i > 0 ? <Divider /> : null}
              <BarRow
                testID={`workload-${r.therapistId}`}
                title={r.name}
                detail={t('workload.sessions', { count: r.sessions })}
                fraction={r.fraction}
                color={theme.colors.accent}
              />
            </Fragment>
          ))}
        </Card>
      )}
    </Section>
  );
}
