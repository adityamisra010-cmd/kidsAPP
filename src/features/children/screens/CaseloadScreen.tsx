import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildren, useTherapyTypes } from '@/data/hooks';
import type { UUID } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { useRequiredActive } from '@/state/session';
import { Chip, EmptyState, QueryView, Row, Screen, SkeletonList, Stack, TextField } from '@/ui';

import { filterCaseload, sortCaseload, therapyTypeIdsIn } from '../caseload';
import { ChildRow } from '../components/ChildRow';

/** Therapist "Caseload" tab: assigned children with what needs attention first. */
export function CaseloadScreen() {
  const { t } = useTranslation('child');
  const me = useRequiredActive().user.profile.id;
  const q = useChildren({ therapistId: me });
  const types = useTherapyTypes().data ?? [];
  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState<UUID | null>(null);

  const list = useMemo(() => q.data ?? [], [q.data]);
  const presentTypes = useMemo(() => therapyTypeIdsIn(list), [list]);
  const shown = useMemo(() => sortCaseload(filterCaseload(list, { search, therapyTypeId: typeId })), [list, search, typeId]);

  return (
    <Screen
      title={t('caseload.title')}
      subtitle={q.data ? t('caseload.count', { count: list.length }) : undefined}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
      testID="caseload-screen"
    >
      <Stack gap={3}>
        <TextField
          icon={Search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('caseload.search')}
          accessibilityLabel={t('caseload.search')}
          returnKeyType="search"
          autoCorrect={false}
        />
        {presentTypes.length > 1 ? (
          <Row gap={2} wrap accessibilityLabel={t('caseload.filterLabel')}>
            <Chip label={t('caseload.all')} selected={!typeId} onPress={() => setTypeId(null)} size="sm" />
            {presentTypes.map((id) => {
              const tt = types.find((x) => x.id === id);
              if (!tt) return null;
              return (
                <Chip
                  key={id}
                  label={therapyTypeLabel(t, tt)}
                  dot={tt.color}
                  size="sm"
                  selected={typeId === id}
                  onPress={() => setTypeId(typeId === id ? null : id)}
                />
              );
            })}
          </Row>
        ) : null}
      </Stack>
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={4} height={112} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={t('caseload.emptyTitle')} body={t('caseload.emptyBody')} />}
      >
        {() =>
          shown.length === 0 ? (
            <EmptyState compact title={t('caseload.noMatchTitle')} body={t('caseload.noMatchBody')} actionLabel={t('common:actions.clear')} onAction={() => { setSearch(''); setTypeId(null); }} />
          ) : (
            <Stack gap={3}>
              {shown.map((s) => (
                <ChildRow key={s.child.id} summary={s} therapyTypes={types} />
              ))}
            </Stack>
          )
        }
      </QueryView>
    </Screen>
  );
}
