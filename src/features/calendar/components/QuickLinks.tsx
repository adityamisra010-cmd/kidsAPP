/** Coordinator shortcuts on the Schedule tab: substitutions and change requests, with counts. */
import { router } from 'expo-router';
import { CalendarClock, UserRoundCog, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/ThemeProvider';
import { Card, Row, Stack, Text } from '@/ui';

function LinkCard({ icon: Icon, title, detail, attention, onPress, testID }: { icon: LucideIcon; title: string; detail: string; attention: boolean; onPress: () => void; testID: string }) {
  const t = useTheme();
  return (
    <Card onPress={onPress} padding={3} tone={attention ? 'primary' : 'default'} accessibilityLabel={`${title}, ${detail}`} testID={testID} style={{ flex: 1 }}>
      <Stack gap={1}>
        <Row gap={2}>
          <Icon size={18} color={attention ? t.colors.primaryText : t.colors.textMuted} />
          <Text variant="label" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </Text>
        </Row>
        <Text variant="caption" tint={attention ? t.colors.primaryText : t.colors.textMuted} numberOfLines={2}>
          {detail}
        </Text>
      </Stack>
    </Card>
  );
}

export function QuickLinks({ needCover, pendingRequests }: { needCover: number; pendingRequests: number }) {
  const { t } = useTranslation('calendar');
  return (
    <Row gap={3} align="stretch">
      <LinkCard
        testID="link-substitutions"
        icon={UserRoundCog}
        title={t('admin.substitutions')}
        detail={needCover ? t('admin.needCover', { count: needCover }) : t('admin.allClear')}
        attention={needCover > 0}
        onPress={() => router.push('/substitutions')}
      />
      <LinkCard
        testID="link-requests"
        icon={CalendarClock}
        title={t('admin.requests')}
        detail={pendingRequests ? t('admin.waiting', { count: pendingRequests }) : t('admin.allClear')}
        attention={pendingRequests > 0}
        onPress={() => router.push('/reschedule/requests')}
      />
    </Row>
  );
}
