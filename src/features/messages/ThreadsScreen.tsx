import { router } from 'expo-router';
import { Lock, MessageCircle } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { STAFF_ROLES, type ThreadSummary } from '@/domain/types';
import { InlineEmpty } from '@/features/home/components/Blocks';
import { useRefresh } from '@/features/home/components/useRefresh';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Card, Divider, EmptyState, QueryView, Screen, SegmentedControl, SkeletonList, Text } from '@/ui';

import { membersText, threadTitle, timeText } from './labels';
import { useThreads } from './queries';
import { filterThreads, type ThreadSegment } from './threads';

function ThreadRow({ thread: th, short, myName }: { thread: ThreadSummary; short: boolean; myName: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('messages');
  const title = threadTitle(tr, th, short);
  const members = membersText(tr, th.memberNames, myName);
  const unread = th.unreadCount > 0;
  const time = th.lastMessage ? timeText(tr, th.lastMessage.createdAt) : '';
  const preview = th.lastMessage ? `${th.lastMessage.senderName}: ${th.lastMessage.body || tr('threads.photo')}` : tr('threads.noMessages');
  return (
    <Pressable
      testID={`thread-${th.id}`}
      onPress={() => router.push(`/messages/${th.id}`)}
      accessibilityRole="button"
      accessibilityLabel={[title, unread ? tr('threads.unread', { count: th.unreadCount }) : '', preview, time].filter(Boolean).join('. ')}
      android_ripple={{ color: t.colors.surfaceAlt }}
      style={({ pressed }) => ({ flexDirection: 'row', gap: t.space[3], paddingVertical: t.space[3], opacity: pressed ? 0.85 : 1 })}
    >
      <Avatar name={th.childName ?? th.title} uri={th.childPhotoUrl} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <Text variant="subheading" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </Text>
          {time ? (
            <Text variant="caption" color={unread ? 'primaryText' : 'textSubtle'} weight={unread ? 'semibold' : 'regular'}>
              {time}
            </Text>
          ) : null}
        </View>
        {members ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {members}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <Text variant={unread ? 'bodyStrong' : 'body'} color={unread ? 'text' : 'textMuted'} numberOfLines={1} style={{ flex: 1 }}>
            {preview}
          </Text>
          {unread ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: t.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="overline" tint={t.colors.onPrimary} style={{ fontSize: 11, lineHeight: 14 }} maxFontSizeMultiplier={1.2}>
                {th.unreadCount > 99 ? '99+' : th.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
        {th.kind === 'staff_only' ? (
          <View style={{ marginTop: 4 }}>
            <Badge label={tr('kinds.staff_only')} tone="warning" icon={Lock} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Conversations: one care-team thread per child (plus staff-only threads for staff). */
export function ThreadsScreen() {
  const { t } = useTranslation('messages');
  const active = useRequiredActive();
  const isStaff = STAFF_ROLES.includes(active.role);
  const [segment, setSegment] = useState<ThreadSegment>('all');
  const q = useThreads();
  const list = useMemo(() => filterThreads(q.data ?? [], isStaff ? segment : 'all'), [q.data, segment, isStaff]);
  const { refreshing, onRefresh } = useRefresh(['messaging']);
  const myName = active.user.profile.fullName;

  return (
    <Screen
      testID="threads"
      title={t('threads.title')}
      back
      refreshing={refreshing}
      onRefresh={onRefresh}
      headerExtra={
        isStaff ? (
          <SegmentedControl
            testID="thread-segments"
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'all', label: t('threads.segments.all') },
              { value: 'care_team', label: t('threads.segments.care_team') },
              { value: 'staff_only', label: t('threads.segments.staff_only') },
            ]}
          />
        ) : undefined
      }
    >
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={5} height={84} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={t('threads.emptyTitle')} body={isStaff ? t('threads.emptyBodyStaff') : t('threads.emptyBody')} />}
      >
        {() =>
          list.length === 0 ? (
            <InlineEmpty icon={MessageCircle} title={t('threads.segmentEmpty')} />
          ) : (
            <Card padding={3}>
              {list.map((th, i) => (
                <Fragment key={th.id}>
                  {i > 0 ? <Divider inset={12} /> : null}
                  <ThreadRow thread={th} short={!isStaff} myName={myName} />
                </Fragment>
              ))}
            </Card>
          )
        }
      </QueryView>
    </Screen>
  );
}
