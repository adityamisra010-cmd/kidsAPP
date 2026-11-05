import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AnnouncementCard } from '@/components/cards/AnnouncementCard';
import { useTherapyTypes } from '@/data/hooks';
import { ADMIN_ROLES, STAFF_ROLES } from '@/domain/types';
import { useRefresh } from '@/features/home/components/useRefresh';
import { useRequiredActive } from '@/state/session';
import { EmptyState, LabeledIconButton, QueryView, Screen, SkeletonList } from '@/ui';

import { audienceText } from './labels';
import { useAnnouncements } from './queries';
import { sortAnnouncements } from './threads';

/** School announcements: recent urgent ones pinned on top, then newest first. */
export function AnnouncementsScreen() {
  const { t } = useTranslation('messages');
  const active = useRequiredActive();
  const canCreate = ADMIN_ROLES.includes(active.role);
  const isStaff = STAFF_ROLES.includes(active.role);
  const q = useAnnouncements();
  const therapyTypes = useTherapyTypes();
  const list = useMemo(() => sortAnnouncements(q.data ?? []), [q.data]);
  const { refreshing, onRefresh } = useRefresh(['messaging']);

  return (
    <Screen
      testID="announcements"
      title={t('announcements.title')}
      back
      refreshing={refreshing}
      onRefresh={onRefresh}
      right={canCreate ? <LabeledIconButton testID="new-announcement" icon={Plus} label={t('announcements.new')} onPress={() => router.push('/announcements/new')} /> : undefined}
    >
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={3} height={120} />}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            title={t('announcements.emptyTitle')}
            body={canCreate ? t('announcements.emptyBodyAdmin') : t('announcements.emptyBody')}
            actionLabel={canCreate ? t('announcements.new') : undefined}
            onAction={canCreate ? () => router.push('/announcements/new') : undefined}
          />
        }
      >
        {() =>
          list.map((a) => (
            <AnnouncementCard
              key={a.id}
              testID={`announcement-${a.id}`}
              announcement={a}
              onPress={null}
              full
              audienceLabel={isStaff ? audienceText(t, a, therapyTypes.data) : undefined}
            />
          ))
        }
      </QueryView>
    </Screen>
  );
}
