/**
 * Staff resource library: school + global resources with search, type chips and a filter sheet
 * (therapy type, area).
 */
import { router } from 'expo-router';
import { Plus, Search, SlidersHorizontal } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { useTherapyTypes } from '@/data/hooks';
import { GOAL_DOMAINS } from '@/domain/constants';
import type { GoalDomain, ResourceKind } from '@/domain/types';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Chip, ChipGroup, EmptyState, LabeledIconButton, QueryView, Row, Screen, Sheet, SkeletonList, Stack, Text, TextField } from '@/ui';

import { ResourceRow } from '../components/ResourceRow';
import { activeFilterCount, RESOURCE_KINDS, toRepoFilter, type LibraryFilter } from '../logic';
import { useResources } from '../queries';
import { useDebounced } from '../useDebounced';

export function StaffLibrary() {
  const t = useTheme();
  const { t: tr } = useTranslation('resources');
  const [filter, setFilter] = useState<LibraryFilter>({ search: '' });
  const [sheet, setSheet] = useState(false);
  const search = useDebounced(filter.search);
  const repoFilter = useMemo(() => toRepoFilter({ ...filter, search }), [filter, search]);
  const q = useResources(repoFilter);
  const therapyTypes = useTherapyTypes();
  const extra = activeFilterCount(filter);
  const anyFilter = extra > 0 || !!filter.kind || !!filter.search.trim();
  const clearAll = () => setFilter({ search: '' });

  const typeOptions = useMemo(
    () => (therapyTypes.data ?? []).filter((tt) => tt.active).map((tt) => ({ value: tt.key, label: therapyTypeLabel(tr, tt), dot: tt.color })),
    [therapyTypes.data, tr],
  );
  const domainOptions = GOAL_DOMAINS.map((d) => ({ value: d, label: vocabLabel(tr, 'domains', d) }));

  return (
    <Screen
      title={tr('title')}
      back
      testID="staff-library"
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
      right={<LabeledIconButton icon={Plus} label={tr('add')} onPress={() => router.push('/resources/new')} />}
      headerExtra={
        <TextField icon={Search} value={filter.search} onChangeText={(v) => setFilter((f) => ({ ...f, search: v }))} placeholder={tr('search')} accessibilityLabel={tr('search')} returnKeyType="search" />
      }
    >
      <Row gap={2} align="center">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space[2] }} style={{ flex: 1 }}>
          <Chip label={tr('kind.all')} selected={!filter.kind} onPress={() => setFilter((f) => ({ ...f, kind: undefined }))} />
          {RESOURCE_KINDS.map((k: ResourceKind) => (
            <Chip key={k} label={tr(`kind.${k}`)} selected={filter.kind === k} onPress={() => setFilter((f) => ({ ...f, kind: f.kind === k ? undefined : k }))} />
          ))}
        </ScrollView>
      </Row>
      <Row justify="between">
        <Button size="sm" variant={extra ? 'secondary' : 'outline'} icon={SlidersHorizontal} label={extra ? tr('filtersCount', { count: extra }) : tr('filters')} onPress={() => setSheet(true)} />
        {anyFilter ? <Button size="sm" variant="ghost" label={tr('common:actions.clear')} onPress={clearAll} /> : null}
      </Row>

      <QueryView
        query={q}
        skeleton={<SkeletonList rows={4} height={104} />}
        isEmpty={(d) => d.length === 0}
        empty={
          anyFilter ? (
            <EmptyState title={tr('emptyTitle')} body={tr('emptyBody')} actionLabel={tr('common:actions.clear')} onAction={clearAll} />
          ) : (
            <EmptyState title={tr('emptyStaffTitle')} body={tr('emptyStaffBody')} actionLabel={tr('new.title')} onAction={() => router.push('/resources/new')} />
          )
        }
      >
        {(list) => (
          <Stack gap={3}>
            <Text variant="caption" color="textMuted">
              {tr('count', { count: list.length })}
            </Text>
            {list.map((r, i) => (
              <ResourceRow key={r.id} testID={`resource-${i}`} resource={r} showSource onPress={() => router.push(`/resources/${r.id}`)} />
            ))}
          </Stack>
        )}
      </QueryView>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={tr('filters')}
        footer={
          <Row gap={2}>
            <Button variant="ghost" label={tr('common:actions.clear')} onPress={() => setFilter((f) => ({ ...f, therapyTypeKey: undefined, domain: undefined }))} />
            <Button label={tr('common:actions.apply')} onPress={() => setSheet(false)} style={{ flex: 1 }} />
          </Row>
        }
      >
        <Text variant="label">{tr('therapyType')}</Text>
        <ChipGroup single options={typeOptions} value={filter.therapyTypeKey ? [filter.therapyTypeKey] : []} onChange={(v) => setFilter((f) => ({ ...f, therapyTypeKey: v[0] }))} />
        <Text variant="label">{tr('domain')}</Text>
        <ChipGroup single options={domainOptions} value={filter.domain ? [filter.domain] : []} onChange={(v) => setFilter((f) => ({ ...f, domain: v[0] as GoalDomain | undefined }))} />
      </Sheet>
    </Screen>
  );
}

