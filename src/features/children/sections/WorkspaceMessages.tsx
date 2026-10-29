import { router } from 'expo-router';
import { Lock, MessagesSquare } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { UUID } from '@/domain/types';
import { timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Divider, EmptyState, ListItem, QueryView, SkeletonList, Stack } from '@/ui';

import { useChildThreads } from '../queries';

/** Care-team and staff-only threads about this child. */
export function WorkspaceMessages({ childId }: { childId: UUID }) {
  const theme = useTheme();
  const { t } = useTranslation('child');
  const q = useChildThreads(childId);
  return (
    <QueryView
      query={q}
      skeleton={<SkeletonList rows={2} height={72} />}
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState compact title={t('messages.emptyTitle')} body={t('messages.emptyBody')} />}
    >
      {(threads) => (
        <Card padding={2} testID="workspace-messages">
          <Stack gap={0}>
            {threads.map((th, i) => {
              const Icon = th.kind === 'staff_only' ? Lock : MessagesSquare;
              const preview = th.lastMessage ? `${th.lastMessage.senderName}: ${th.lastMessage.body}` : t('messages.noMessages');
              return (
                <Stack key={th.id} gap={0}>
                  {i > 0 ? <Divider inset={2} /> : null}
                  <ListItem
                    title={th.title || t(`messages.kind.${th.kind}`)}
                    subtitle={th.lastMessage ? `${preview} · ${timeAgo(th.lastMessage.createdAt)}` : preview}
                    left={<Icon size={22} color={theme.colors.primaryText} style={{ marginLeft: theme.space[2] }} />}
                    right={
                      th.unreadCount > 0 ? (
                        <Badge label={t('messages.unread', { count: th.unreadCount })} tone="primary" />
                      ) : th.kind === 'staff_only' ? (
                        <Badge label={t('messages.kind.staff_only')} tone="neutral" />
                      ) : undefined
                    }
                    onPress={() => router.push(`/messages/${th.id}`)}
                  />
                </Stack>
              );
            })}
          </Stack>
        </Card>
      )}
    </QueryView>
  );
}
