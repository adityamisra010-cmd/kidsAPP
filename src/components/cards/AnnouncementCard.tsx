// Owner: W6 (messaging). Single announcement card: parent Home preview and the announcements list.
import { router } from 'expo-router';
import { Megaphone, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Announcement } from '@/domain/types';
import { timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Row, Stack, Text } from '@/ui';

export function AnnouncementCard({
  announcement: a,
  onPress,
  full = false,
  audienceLabel,
  testID,
}: {
  announcement: Announcement;
  /** Defaults to opening the announcements list. Pass `null` for a non-pressable card (the list itself). */
  onPress?: (() => void) | null;
  /** Show the whole body instead of a 3-line preview. */
  full?: boolean;
  /** Staff views: who it was sent to, e.g. "All parents". */
  audienceLabel?: string;
  testID?: string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('messages');
  const handlePress = onPress === null ? undefined : (onPress ?? (() => router.push('/announcements')));
  const meta = [tr('announcements.from', { name: a.createdByName }), timeAgo(a.createdAt)].join(' · ');
  return (
    <Card
      testID={testID}
      onPress={handlePress}
      accent={a.urgent ? t.colors.warning : undefined}
      accessibilityLabel={`${a.urgent ? `${tr('announcements.urgent')}. ` : ''}${a.title}. ${a.body}. ${meta}`}
      accessibilityHint={handlePress ? tr('common:a11y.opensDetails') : undefined}
    >
      <Row gap={3} align="flex-start">
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: a.urgent ? t.colors.warningSoft : t.colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Megaphone size={20} color={a.urgent ? t.colors.warning : t.colors.primaryText} />
        </View>
        <Stack gap={1} flex={1}>
          {a.urgent ? <Badge label={tr('announcements.urgent')} tone="warning" icon={TriangleAlert} /> : null}
          <Text variant="subheading">{a.title}</Text>
          <Text color="textMuted" numberOfLines={full ? undefined : 3}>
            {a.body}
          </Text>
          <Text variant="caption" color="textSubtle">
            {audienceLabel ? `${meta} · ${audienceLabel}` : meta}
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}
