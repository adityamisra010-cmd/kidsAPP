// Owner: W6 (messaging). Single announcement row/card.
import { router } from 'expo-router';

import type { Announcement } from '@/domain/types';
import { timeAgo } from '@/lib/dates';
import { Card, Stack, Text } from '@/ui';

export function AnnouncementCard({ announcement: a }: { announcement: Announcement }) {
  return (
    <Card onPress={() => router.push('/announcements')} tone={a.urgent ? 'warning' : 'default'}>
      <Stack gap={1}>
        <Text variant="subheading">{a.title}</Text>
        <Text color="textMuted" numberOfLines={2}>{a.body}</Text>
        <Text variant="caption" color="textSubtle">{timeAgo(a.createdAt)}</Text>
      </Stack>
    </Card>
  );
}
