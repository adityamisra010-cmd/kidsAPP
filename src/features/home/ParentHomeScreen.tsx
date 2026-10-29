import { router } from 'expo-router';
import { BookOpen, CalendarDays, ClipboardList, ListChecks, MessageCircle, Phone } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ChildSwitcher } from '@/components/ChildSwitcher';
import { AnnouncementCard } from '@/components/cards/AnnouncementCard';
import { CheckinPromptCard } from '@/components/cards/CheckinPromptCard';
import { HomeTasksCard } from '@/components/cards/HomeTasksCard';
import { SessionSnapshotCard } from '@/components/cards/SessionSnapshotCard';
import { UpcomingAppointmentCard } from '@/components/cards/UpcomingAppointmentCard';
import { useChildren, useUnreadCounts, useUpcoming } from '@/data/hooks';
import { useAnnouncements } from '@/features/messages/queries';
import { sortAnnouncements } from '@/features/messages/threads';
import { BellButton } from '@/features/notifications/BellButton';
import { useRequiredActive } from '@/state/session';
import { EmptyState, Screen, SectionHeader } from '@/ui';

import { InlineEmpty, Section, SectionQuery } from './components/Blocks';
import { HomeHeader, SchoolLine } from './components/HomeHeader';
import { QuickLinks } from './components/QuickLinks';
import { useRefresh } from './components/useRefresh';
import { dayPeriod, firstName, pickCheckinPrompts } from './greeting';
import { useLatestSnapshot, usePendingCheckins, useWeeklyPractice } from './queries';

/**
 * Parent Home: the first screen every pitch audience sees. Next appointment, latest session in
 * plain words and this week's practice are all on this screen (each one more tap to detail).
 */
export function ParentHomeScreen() {
  const { t } = useTranslation('parent');
  const active = useRequiredActive();
  const childId = active.childId;
  const unread = useUnreadCounts();
  const { refreshing, onRefresh } = useRefresh(['appointments', 'sessions', 'checkins', 'homePractice', 'messaging', 'notifications', 'children']);

  const children = useChildren();
  const child = children.data?.find((c) => c.child.id === childId)?.child;
  const childName = child ? (child.preferredName ?? child.fullName.split(' ')[0]) : undefined;

  const checkinEnabled = active.organization?.settings.checkinEnabled !== false;
  const checkins = usePendingCheckins(checkinEnabled);
  const prompts = useMemo(() => pickCheckinPrompts(checkins.data ?? [], childId), [checkins.data, childId]);

  const upcoming = useUpcoming({ childId: childId ?? undefined, limit: 1 });
  const snapshot = useLatestSnapshot(childId);
  const practice = useWeeklyPractice(childId);
  const announcements = useAnnouncements();
  const latestAnnouncement = useMemo(() => sortAnnouncements(announcements.data ?? [])[0], [announcements.data]);

  const greeting = t(`home.greeting.${dayPeriod()}`, { name: firstName(active.user.profile.fullName) });

  const header = (
    <HomeHeader testID="parent-home-header" title={greeting} below={<SchoolLine organization={active.organization} />} actions={<BellButton />} />
  );

  if (!childId) {
    return (
      <Screen testID="parent-home" refreshing={refreshing} onRefresh={onRefresh}>
        {header}
        <EmptyState
          title={t('home.noChild.title')}
          body={t('home.noChild.body')}
          actionLabel={t('home.links.contact')}
          onAction={() => router.push('/account/contact')}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="parent-home" refreshing={refreshing} onRefresh={onRefresh}>
      {header}
      <ChildSwitcher />

      {prompts.map((a) => (
        <Section key={a.id} index={0} testID="checkin-prompt">
          <CheckinPromptCard appointment={a} />
        </Section>
      ))}

      <Section index={1} testID="section-next">
        <SectionHeader
          title={childName ? t('home.next.titleFor', { name: childName }) : t('home.next.title')}
          actionLabel={t('home.next.seeCalendar')}
          onAction={() => router.push('/parent/calendar')}
        />
        <SectionQuery
          query={upcoming}
          skeletonHeight={128}
          isEmpty={(d) => d.length === 0}
          empty={<InlineEmpty icon={CalendarDays} title={t('home.next.emptyTitle')} body={t('home.next.emptyBody')} />}
        >
          {(list) => <UpcomingAppointmentCard appointment={list[0]} showChild={false} />}
        </SectionQuery>
      </Section>

      <Section index={2} testID="section-latest">
        <SectionHeader title={t('home.latest.title')} actionLabel={t('home.latest.all')} onAction={() => router.push('/parent/child')} />
        <SectionQuery
          query={snapshot}
          skeletonHeight={180}
          isEmpty={(d) => d.length === 0}
          empty={<InlineEmpty icon={ClipboardList} title={t('home.latest.emptyTitle')} body={t('home.latest.emptyBody')} />}
        >
          {(list) => <SessionSnapshotCard snapshot={list[0]} />}
        </SectionQuery>
      </Section>

      <Section index={3} testID="section-practice">
        <SectionHeader title={t('home.practice.title')} actionLabel={t('home.practice.open')} onAction={() => router.push('/parent/practice')} />
        <SectionQuery
          query={practice}
          skeletonHeight={96}
          isEmpty={(d) => d.expected === 0}
          empty={<InlineEmpty icon={ListChecks} title={t('home.practice.emptyTitle')} body={t('home.practice.emptyBody')} />}
        >
          {() => <HomeTasksCard childId={childId} />}
        </SectionQuery>
      </Section>

      {latestAnnouncement ? (
        <Section index={4} testID="section-announcement">
          <SectionHeader title={t('home.announcements.title')} actionLabel={t('home.announcements.all')} onAction={() => router.push('/announcements')} />
          <AnnouncementCard announcement={latestAnnouncement} />
        </Section>
      ) : null}

      <Section index={5} testID="section-links">
        <SectionHeader title={t('home.links.title')} />
        <QuickLinks
          links={[
            { key: 'messages', icon: MessageCircle, label: t('home.links.messages'), badge: unread.messages, onPress: () => router.push('/messages') },
            { key: 'resources', icon: BookOpen, label: t('home.links.resources'), onPress: () => router.push('/resources') },
            { key: 'contact', icon: Phone, label: t('home.links.contact'), onPress: () => router.push('/account/contact') },
          ]}
        />
      </Section>
    </Screen>
  );
}
