import type { TFunction } from 'i18next';
import { router } from 'expo-router';
import { Ban, CircleCheck, MapPin } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Organization, SchoolSummary } from '@/domain/types';
import { formatPercent } from '@/features/dashboard/format';
import { timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Card, Row, Stack, Text } from '@/ui';

export function SchoolStatusBadge({ status }: { status: Organization['status'] }) {
  const { t } = useTranslation('platform');
  return status === 'active' ? (
    <Badge label={t('status.active')} tone="success" icon={CircleCheck} />
  ) : (
    <Badge label={t('status.suspended')} tone="danger" icon={Ban} />
  );
}

function MiniStat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function lastActivityText(t: TFunction, at?: string): string {
  return at ? t('platform:card.lastActivity', { when: timeAgo(at) }) : t('platform:card.noActivity');
}

/** One school in the platform list: status, three usage numbers, last activity. */
export function SchoolCard({ school: s }: { school: SchoolSummary }) {
  const theme = useTheme();
  const { t } = useTranslation('platform');
  const o = s.organization;
  return (
    <Card testID={`school-${o.id}`} onPress={() => router.push(`/platform-school/${o.id}`)} accessibilityLabel={`${o.name}, ${o.city}`} accessibilityHint={t('common:a11y.opensDetails')}>
      <Stack gap={3}>
        <Row gap={3} align="flex-start">
          <Avatar name={o.shortName || o.name} uri={o.logoUrl} size={44} />
          <Stack gap={1} flex={1}>
            <Text variant="subheading" numberOfLines={2}>
              {o.name}
            </Text>
            <Row gap={1}>
              <MapPin size={14} color={theme.colors.textMuted} />
              <Text variant="caption" color="textMuted">
                {o.city}
              </Text>
            </Row>
          </Stack>
          <SchoolStatusBadge status={o.status} />
        </Row>
        <Row gap={3} align="flex-start">
          <MiniStat value={s.activeChildren} label={t('card.children')} />
          <MiniStat value={s.sessionsThisMonth} label={t('card.sessions')} />
          <MiniStat value={formatPercent(s.activeParentsPercent)} label={t('card.parents')} />
        </Row>
        <Text variant="caption" color="textSubtle">
          {lastActivityText(t, s.lastActivityAt)}
        </Text>
      </Stack>
    </Card>
  );
}
