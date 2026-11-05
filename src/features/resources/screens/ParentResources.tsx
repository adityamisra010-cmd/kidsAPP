/**
 * Parent resources: "Shared with you" (who shared it + their note) and "From your school".
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ChildSwitcher } from '@/components/ChildSwitcher';
import { useActive } from '@/state/session';
import { EmptyState, QueryView, Screen, SectionHeader, SkeletonList, Stack, Text } from '@/ui';

import { ResourceRow } from '../components/ResourceRow';
import { splitParentResources } from '../logic';
import { useParentResources } from '../queries';

export function ParentResources() {
  const { t } = useTranslation('resources');
  const childId = useActive()?.childId ?? null;
  const q = useParentResources(childId);
  const groups = useMemo(() => splitParentResources(q.data ?? []), [q.data]);

  return (
    <Screen title={t('title')} back onRefresh={() => void q.refetch()} refreshing={q.isRefetching} testID="parent-resources">
      <ChildSwitcher />
      {!childId ? (
        <EmptyState title={t('parent.emptyTitle')} body={t('parent.emptyBody')} />
      ) : (
        <QueryView
          query={q}
          skeleton={<SkeletonList rows={3} height={104} />}
          isEmpty={(d) => d.length === 0}
          empty={<EmptyState title={t('parent.emptyTitle')} body={t('parent.emptyBody')} />}
        >
          {() => (
            <Stack gap={5}>
              <Stack gap={3}>
                <SectionHeader title={t('parent.shared')} />
                {groups.shared.length ? (
                  groups.shared.map((r) => <ResourceRow key={r.id} resource={r} share={r.share} onPress={() => router.push(`/resources/${r.id}`)} />)
                ) : (
                  <Text color="textMuted">{t('parent.sharedEmpty')}</Text>
                )}
              </Stack>
              {groups.school.length ? (
                <Stack gap={3}>
                  <SectionHeader title={t('parent.school')} subtitle={t('parent.schoolHint')} />
                  {groups.school.map((r) => (
                    <ResourceRow key={r.id} resource={r} onPress={() => router.push(`/resources/${r.id}`)} />
                  ))}
                </Stack>
              ) : null}
            </Stack>
          )}
        </QueryView>
      )}
    </Screen>
  );
}
