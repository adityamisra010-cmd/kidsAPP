import { Award, BookHeart, ChartLine, ClipboardList, Target } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChildSwitcher } from '@/components/ChildSwitcher';
import { useChildDetail } from '@/data/hooks';
import { invalidate } from '@/data/queryClient';
import type { UUID } from '@/domain/types';
import { ParentGoals } from '@/features/goals/sections/ParentGoals';
import { ParentWins } from '@/features/goals/sections/ParentWins';
import { ParentProgress } from '@/features/progress/sections/ParentProgress';
import { ageLabel } from '@/lib/dates';
import { useActive } from '@/state/session';
import { Avatar, EmptyState, ErrorState, Row, Screen, Skeleton, Stack, Text } from '@/ui';

import { displayName } from '../caseload';
import { AboutMeParent } from '../components/AboutMeParent';
import { SectionTabs, type SectionTab } from '../components/SectionTabs';
import { ParentSessions } from '../sections/ParentSessions';

type ParentTab = 'sessions' | 'goals' | 'wins' | 'progress' | 'about';

/** Parent "My Child" tab: the active child (switcher for families with several children). */
export function ParentChildScreen() {
  const { t } = useTranslation('child');
  const childId = useActive()?.childId ?? null;
  if (!childId) {
    return (
      <Screen title={t('parent.title')}>
        <EmptyState title={t('parent.noChildTitle')} body={t('parent.noChildBody')} />
      </Screen>
    );
  }
  return <ParentChildView childId={childId} />;
}

/** The parent view of one child. Also used when a parent opens `/child/[id]`. */
export function ParentChildView({ childId, back }: { childId: UUID; back?: boolean }) {
  const { t } = useTranslation('child');
  const [tab, setTab] = useState<ParentTab>('sessions');
  const [refreshing, setRefreshing] = useState(false);
  const q = useChildDetail(childId);

  const tabs: SectionTab<ParentTab>[] = [
    { key: 'sessions', label: t('parent.tabs.sessions'), icon: ClipboardList },
    { key: 'goals', label: t('parent.tabs.goals'), icon: Target },
    { key: 'wins', label: t('parent.tabs.wins'), icon: Award },
    { key: 'progress', label: t('parent.tabs.progress'), icon: ChartLine },
    { key: 'about', label: t('parent.tabs.about'), icon: BookHeart },
  ];

  const refresh = async () => {
    setRefreshing(true);
    try {
      await invalidate('children', 'sessions', 'goals', 'progress', 'homePractice');
    } finally {
      setRefreshing(false);
    }
  };

  const detail = q.data;
  const name = detail ? displayName(detail.child).split(' ')[0] : '';

  return (
    <Screen back={back} onRefresh={() => void refresh()} refreshing={refreshing} testID="parent-child-screen">
      {q.isPending ? (
        <Row gap={3} style={{ paddingTop: 12 }}>
          <Skeleton width={64} height={64} radius={32} />
          <Stack gap={2} flex={1}>
            <Skeleton width="60%" height={22} />
            <Skeleton width="40%" height={14} />
          </Stack>
        </Row>
      ) : q.error || !detail ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Row gap={3} style={{ paddingTop: 12 }}>
          <Avatar name={detail.child.fullName} uri={detail.child.photoUrl} size={64} />
          <Stack gap={1} flex={1}>
            <Text variant="title" accessibilityRole="header">
              {displayName(detail.child)}
            </Text>
            <Text color="textMuted">
              {[ageLabel(detail.child.dob), detail.child.classGroup].filter(Boolean).join(' · ')}
            </Text>
          </Stack>
        </Row>
      )}
      <ChildSwitcher />
      <SectionTabs tabs={tabs} value={tab} onChange={setTab} testID="parent-child-tabs" />
      {tab === 'sessions' ? <ParentSessions childId={childId} name={name} /> : null}
      {tab === 'goals' ? <ParentGoals childId={childId} name={name} /> : null}
      {tab === 'wins' ? <ParentWins childId={childId} name={name} /> : null}
      {tab === 'progress' ? <ParentProgress childId={childId} name={name} /> : null}
      {tab === 'about' && detail ? <AboutMeParent detail={detail} /> : null}
    </Screen>
  );
}
