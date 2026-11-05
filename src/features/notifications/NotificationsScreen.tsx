import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CheckCheck } from 'lucide-react-native';
import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { AppNotification } from '@/domain/types';
import { useRefresh } from '@/features/home/components/useRefresh';
import { formatDay, formatTime, sameDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Divider, EmptyState, LabeledIconButton, QueryView, Screen, SectionHeader, SkeletonList, Text, toast, useToneColors } from '@/ui';

import { countUnread, groupNotifications, markReadLocally, safeRoute } from './grouping';
import { NOTIFICATION_KIND } from './kinds';

const listKey = () => key('notifications', 'list');

function NotificationRow({ n, onPress }: { n: AppNotification; onPress: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('notifications');
  const kind = NOTIFICATION_KIND[n.kind] ?? NOTIFICATION_KIND.announcement;
  const c = useToneColors(kind.tone);
  const unread = !n.readAt;
  const time = sameDay(n.createdAt, new Date()) ? formatTime(n.createdAt) : `${formatDay(n.createdAt)} · ${formatTime(n.createdAt)}`;
  return (
    <Pressable
      testID={`notification-${n.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? `${tr('unread')}. ` : ''}${n.title}. ${n.body}. ${time}`}
      android_ripple={{ color: t.colors.surfaceAlt }}
      style={({ pressed }) => ({ flexDirection: 'row', gap: t.space[3], paddingVertical: t.space[3], minHeight: 64, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <kind.icon size={20} color={c.fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant={unread ? 'subheading' : 'body'} numberOfLines={2}>
          {n.title}
        </Text>
        {n.body ? (
          <Text color="textMuted" numberOfLines={3}>
            {n.body}
          </Text>
        ) : null}
        <Text variant="caption" color="textSubtle">
          {time}
        </Text>
      </View>
      {unread ? (
        <View style={{ paddingTop: 6 }} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.primary }} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** "Updates": in-app inbox grouped Today / Earlier. Tapping opens the related screen. */
export function NotificationsScreen() {
  const { t } = useTranslation('notifications');
  const theme = useTheme();
  const repo = useRepo();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: listKey(), queryFn: () => repo.notifications.list({ limit: 100 }) });
  const groups = useMemo(() => groupNotifications(q.data ?? []), [q.data]);
  const unread = countUnread(q.data ?? []);
  const { refreshing, onRefresh } = useRefresh(['notifications']);

  const markRead = useMutation({
    mutationFn: (id: string) => repo.notifications.markRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: listKey() });
      const prev = qc.getQueryData<AppNotification[]>(listKey());
      if (prev) qc.setQueryData(listKey(), markReadLocally(prev, id, new Date().toISOString()));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(listKey(), ctx.prev);
      toast.error(t('errors:unknown'));
    },
    onSuccess: (_d, id) => {
      if (id === 'all') toast.success(t('markedAll'));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key('notifications', 'unread') }),
  });

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    const route = safeRoute(n.route);
    if (route) router.push(route);
  };

  return (
    <Screen
      testID="notifications"
      title={t('title')}
      subtitle={unread ? t('unreadCount', { count: unread }) : undefined}
      back
      refreshing={refreshing}
      onRefresh={onRefresh}
      right={unread ? <LabeledIconButton testID="mark-all" icon={CheckCheck} label={t('markAll')} onPress={() => markRead.mutate('all')} /> : undefined}
    >
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={5} height={72} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={t('empty.title')} body={t('empty.body')} />}
      >
        {() =>
          groups.map((g) => (
            <View key={g.key} style={{ gap: theme.space[2] }}>
              <SectionHeader title={t(`groups.${g.key}`)} />
              <Card padding={3}>
                {g.items.map((n, i) => (
                  <Fragment key={n.id}>
                    {i > 0 ? <Divider inset={10} /> : null}
                    <NotificationRow n={n} onPress={() => open(n)} />
                  </Fragment>
                ))}
              </Card>
            </View>
          ))
        }
      </QueryView>
    </Screen>
  );
}
