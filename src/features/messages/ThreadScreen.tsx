import { useIsFocused } from 'expo-router';
import { Lock, Users } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import type { ThreadKind } from '@/domain/types';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState, ErrorState, Screen, SkeletonList, Text } from '@/ui';

import { Composer } from './Composer';
import { buildChatItems, type ChatItem } from './grouping';
import { membersText, threadTitle } from './labels';
import { DaySeparator, MessageBubble } from './MessageBubble';
import { useMessages, useThread } from './queries';
import { useMarkRead, useSendMessage } from './useConversation';

/** Small, calm banner explaining who can see this conversation. */
export function ThreadBanner({ kind, childName }: { kind: ThreadKind; childName?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('messages');
  if (kind === 'direct') return null;
  const staff = kind === 'staff_only';
  const Icon = staff ? Lock : Users;
  const first = childName?.split(' ')[0];
  const text = staff ? tr('thread.staffOnlyBanner') : first ? tr('thread.careTeamBanner', { name: first }) : tr('thread.careTeamBannerNoName');
  return (
    <View
      testID={`banner-${kind}`}
      accessibilityRole="text"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        paddingHorizontal: t.space[3],
        paddingVertical: t.space[2],
        marginTop: t.space[1],
        borderRadius: t.radius.md,
        backgroundColor: staff ? t.colors.warningSoft : t.colors.infoSoft,
      }}
    >
      <Icon size={16} color={staff ? t.colors.warning : t.colors.info} />
      <Text variant="caption" weight="medium" tint={staff ? t.colors.warning : t.colors.info} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** One conversation: bubbles grouped by day, read receipts, 15 s polling while open, optimistic send. */
export function ThreadScreen({ threadId }: { threadId: string }) {
  const theme = useTheme();
  const { t } = useTranslation('messages');
  const active = useRequiredActive();
  const me = active.user.profile;
  const focused = useIsFocused();
  const thread = useThread(threadId);
  const messages = useMessages(threadId, focused);
  const send = useSendMessage(threadId, { id: me.id, name: me.fullName, role: active.role });
  useMarkRead(threadId, focused, messages.data);

  const items = useMemo(() => buildChatItems(messages.data ?? [], me.id).reverse(), [messages.data, me.id]);
  const isParent = active.role === 'parent';
  const title = thread.data ? threadTitle(t, thread.data, isParent) : t('threads.title');
  const subtitle = thread.data ? membersText(t, thread.data.memberNames, me.fullName) : undefined;

  const renderItem = ({ item }: { item: ChatItem }) =>
    item.type === 'day' ? <DaySeparator date={item.date} /> : <MessageBubble item={item} myName={me.fullName} />;

  return (
    <Screen
      testID="thread"
      title={title}
      subtitle={subtitle}
      back
      scroll={false}
      footer={thread.data || messages.data ? <Composer onSend={(input) => send.mutateAsync(input)} /> : undefined}
    >
      {thread.data ? <ThreadBanner kind={thread.data.kind} childName={thread.data.childName} /> : null}
      {messages.isPending ? (
        <View style={{ paddingTop: theme.space[4] }}>
          <SkeletonList rows={4} height={56} />
        </View>
      ) : messages.error ? (
        <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState compact title={t('thread.emptyTitle')} body={t('thread.emptyBody')} />
      ) : (
        <FlatList
          testID="message-list"
          inverted
          data={items}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: theme.space[3] }}
          initialNumToRender={20}
        />
      )}
    </Screen>
  );
}
