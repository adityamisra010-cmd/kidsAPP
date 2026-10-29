import { router } from 'expo-router';
import { CalendarClock, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { ChildSummary, TherapyType } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { ageLabel, formatTime, relativeDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Card, Row, Stack, Text, TrendIndicator, TypeTag } from '@/ui';

import { displayName } from '../caseload';

/** Child list row for caseload and the People tab. Taps open the child workspace. */
export function ChildRow({ summary, therapyTypes, showTrend = true }: { summary: ChildSummary; therapyTypes: TherapyType[]; showTrend?: boolean }) {
  const theme = useTheme();
  const { t } = useTranslation('child');
  const c = summary.child;
  const typeIds = [...new Set(summary.therapists.map((x) => x.therapyTypeId))];
  const next = summary.nextAppointment;
  const nextText = next
    ? t('row.next', { day: relativeDay(next.startsAt, { today: t('common:time.today'), tomorrow: t('common:time.tomorrow') }), time: formatTime(next.startsAt) })
    : t('row.noNext');
  const needsAttention = summary.openAlerts > 0;

  return (
    <Card
      onPress={() => router.push(`/child/${c.id}`)}
      accessibilityLabel={[displayName(c), ageLabel(c.dob), needsAttention ? t('row.needsAttention') : '', nextText].filter(Boolean).join(', ')}
      accessibilityHint={t('common:a11y.opensDetails')}
      testID={`child-row-${c.id}`}
    >
      <Row gap={3} align="flex-start">
        <Avatar name={c.fullName} uri={c.photoUrl} size={52} />
        <Stack gap={1} flex={1}>
          <Row justify="between" gap={2} align="flex-start">
            <Stack gap={0} flex={1}>
              <Text variant="subheading" numberOfLines={1}>
                {displayName(c)}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {[c.preferredName ? c.fullName : null, ageLabel(c.dob), c.classGroup].filter(Boolean).join(' · ')}
              </Text>
            </Stack>
            {showTrend && summary.trend ? <TrendIndicator trend={summary.trend} size="sm" /> : null}
          </Row>
          {typeIds.length ? (
            <Row gap={3} wrap>
              {typeIds.map((id) => {
                const tt = therapyTypes.find((x) => x.id === id);
                return tt ? <TypeTag key={id} name={therapyTypeLabel(t, tt)} color={tt.color} /> : null;
              })}
            </Row>
          ) : null}
          <Row gap={2}>
            <CalendarClock size={14} color={theme.colors.textMuted} />
            <Text variant="caption" color="textMuted">
              {nextText}
            </Text>
          </Row>
          {needsAttention ? <Badge label={t('row.needsAttention')} tone="warning" icon={TriangleAlert} testID="needs-attention" /> : null}
        </Stack>
      </Row>
    </Card>
  );
}
