import { router } from 'expo-router';
import { BookHeart, ChartLine, ClipboardList, Info, ListChecks, Lock, MessagesSquare, Target } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildDetail, useTherapyTypes } from '@/data/hooks';
import { invalidate } from '@/data/queryClient';
import { RepoError } from '@/data/repository';
import { STAFF_ROLES, type ChildDetail, type UUID } from '@/domain/types';
import { WorkspaceGoals } from '@/features/goals/sections/WorkspaceGoals';
import { WorkspaceProgress } from '@/features/progress/sections/WorkspaceProgress';
import { ageLabel } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, EmptyState, ErrorState, Row, Screen, SkeletonList, Stack, Text } from '@/ui';

import { displayName } from '../caseload';
import { AboutMeStaff } from '../components/AboutMeStaff';
import { ChildHeaderCard } from '../components/ChildHeaderCard';
import { SectionTabs, type SectionTab } from '../components/SectionTabs';
import { WorkspaceHomeTasks } from '../sections/WorkspaceHomeTasks';
import { WorkspaceMessages } from '../sections/WorkspaceMessages';
import { WorkspaceSessions } from '../sections/WorkspaceSessions';
import { ParentChildView } from './ParentChildScreen';

export type WorkspaceTab = 'about' | 'goals' | 'sessions' | 'progress' | 'homeTasks' | 'messages';
const WORKSPACE_TABS: WorkspaceTab[] = ['about', 'goals', 'sessions', 'progress', 'homeTasks', 'messages'];
/** What a substitute (brief-only access) may see. */
const BRIEF_SAFE_TABS: WorkspaceTab[] = ['about', 'goals'];

export function isWorkspaceTab(v: unknown): v is WorkspaceTab {
  return typeof v === 'string' && (WORKSPACE_TABS as string[]).includes(v);
}

/** Staff child workspace (`/child/[id]`). Parents opening this route get their own view. */
export function ChildWorkspaceScreen({ childId, initialTab }: { childId: UUID; initialTab?: WorkspaceTab }) {
  const { t } = useTranslation('child');
  const q = useChildDetail(childId);
  const role = useRequiredActive().role;

  if (q.isPending) {
    return (
      <Screen back title={t('workspace.loading')}>
        <SkeletonList rows={4} height={120} />
      </Screen>
    );
  }
  const forbidden = (q.error instanceof RepoError && q.error.code === 'forbidden') || q.data?.access === 'none';
  if (forbidden) return <NoAccess />;
  if (q.error || !q.data) {
    return (
      <Screen back title={t('workspace.title')}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  if (q.data.access === 'parent' || role === 'parent') return <ParentChildView childId={childId} back />;
  return <Workspace detail={q.data} initialTab={initialTab} canManage={q.data.access === 'full' && STAFF_ROLES.includes(role)} />;
}

function Workspace({ detail, initialTab, canManage }: { detail: ChildDetail; initialTab?: WorkspaceTab; canManage: boolean }) {
  const theme = useTheme();
  const { t } = useTranslation('child');
  const types = useTherapyTypes().data ?? [];
  const briefOnly = detail.access === 'brief_only';
  const allowed = briefOnly ? BRIEF_SAFE_TABS : WORKSPACE_TABS;
  const [tab, setTab] = useState<WorkspaceTab>(initialTab && allowed.includes(initialTab) ? initialTab : 'about');
  const [refreshing, setRefreshing] = useState(false);
  const c = detail.child;
  const id = c.id;

  const icons = { about: BookHeart, goals: Target, sessions: ClipboardList, progress: ChartLine, homeTasks: ListChecks, messages: MessagesSquare };
  const tabs: SectionTab<WorkspaceTab>[] = allowed.map((k) => ({ key: k, label: t(`workspace.tabs.${k}`), icon: icons[k] }));

  const refresh = async () => {
    setRefreshing(true);
    try {
      await invalidate('children', 'goals', 'sessions', 'homePractice', 'messaging');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      back
      title={displayName(c)}
      subtitle={[ageLabel(c.dob), c.classGroup].filter(Boolean).join(' · ')}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      testID="child-workspace"
    >
      {briefOnly ? (
        <Card tone="info" testID="brief-only-notice">
          <Row gap={2} align="flex-start">
            <Info size={20} color={theme.colors.info} />
            <Stack gap={1} flex={1}>
              <Text variant="subheading" tint={theme.colors.info}>
                {t('workspace.briefOnlyTitle')}
              </Text>
              <Text color="textMuted">{t('workspace.briefOnlyBody')}</Text>
            </Stack>
          </Row>
        </Card>
      ) : null}
      <ChildHeaderCard detail={detail} therapyTypes={types} showContacts={!briefOnly} />
      <SectionTabs tabs={tabs} value={tab} onChange={setTab} testID="workspace-tabs" />
      {tab === 'about' ? <AboutMeStaff detail={detail} canEdit={canManage} /> : null}
      {tab === 'goals' ? <WorkspaceGoals childId={id} canManage={canManage} /> : null}
      {tab === 'sessions' ? <WorkspaceSessions childId={id} /> : null}
      {tab === 'progress' ? <WorkspaceProgress childId={id} /> : null}
      {tab === 'homeTasks' ? <WorkspaceHomeTasks childId={id} canAssign={canManage} /> : null}
      {tab === 'messages' ? <WorkspaceMessages childId={id} /> : null}
    </Screen>
  );
}

function NoAccess() {
  const theme = useTheme();
  const { t } = useTranslation('child');
  return (
    <Screen back title={t('workspace.title')}>
      <Stack gap={4} align="center" style={{ paddingTop: theme.space[8] }} testID="no-access">
        <Lock size={36} color={theme.colors.textMuted} />
        <EmptyState compact title={t('workspace.noAccessTitle')} body={t('workspace.noAccessBody')} />
        <Button label={t('common:actions.back')} variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </Stack>
    </Screen>
  );
}
