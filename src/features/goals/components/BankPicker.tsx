import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { GOAL_DOMAINS } from '@/domain/constants';
import type { GoalBankItem, GoalDomain, TherapyType } from '@/domain/types';
import { vocabLabel } from '@/i18n/labels';
import { Chip, EmptyState, QueryView, Row, SkeletonList, Stack, Text, TextField } from '@/ui';

import { filterBank } from '../goalForm';
import { useGoalBank } from '../queries';
import { BankItemCard, bankTypeName } from './BankItemCard';

/** Search + filter the Goal Bank (domain, therapy type). Tapping an item calls `onPick`. */
export function BankPicker({
  therapyTypes,
  initialTypeKey,
  onPick,
  selectedId,
  limit = 30,
}: {
  therapyTypes: TherapyType[];
  initialTypeKey?: string | null;
  onPick: (item: GoalBankItem) => void;
  selectedId?: string;
  limit?: number;
}) {
  const { t } = useTranslation('goals');
  const q = useGoalBank();
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<GoalDomain | null>(null);
  const [typeKey, setTypeKey] = useState<string | null>(initialTypeKey ?? null);
  const items = useMemo(() => q.data ?? [], [q.data]);
  const keys = useMemo(() => [...new Set(items.map((i) => i.therapyTypeKey))], [items]);
  const shown = useMemo(() => filterBank(items, { search, domain, therapyTypeKey: typeKey }), [items, search, domain, typeKey]);

  return (
    <Stack gap={3} testID="bank-picker">
      <TextField icon={Search} value={search} onChangeText={setSearch} placeholder={t('bank.search')} accessibilityLabel={t('bank.search')} autoCorrect={false} />
      <Stack gap={2}>
        <Text variant="label" color="textMuted">
          {t('bank.domain')}
        </Text>
        <Row gap={2} wrap>
          <Chip size="sm" label={t('bank.all')} selected={!domain} onPress={() => setDomain(null)} />
          {GOAL_DOMAINS.map((d) => (
            <Chip key={d} size="sm" label={vocabLabel(t, 'domains', d)} selected={domain === d} onPress={() => setDomain(domain === d ? null : d)} />
          ))}
        </Row>
      </Stack>
      {keys.length > 1 ? (
        <Stack gap={2}>
          <Text variant="label" color="textMuted">
            {t('bank.therapy')}
          </Text>
          <Row gap={2} wrap>
            <Chip size="sm" label={t('bank.all')} selected={!typeKey} onPress={() => setTypeKey(null)} />
            {keys.map((k) => {
              const n = bankTypeName(t, k, therapyTypes);
              return <Chip key={k} size="sm" dot={n.color} label={n.name} selected={typeKey === k} onPress={() => setTypeKey(typeKey === k ? null : k)} />;
            })}
          </Row>
        </Stack>
      ) : null}
      <QueryView query={q} skeleton={<SkeletonList rows={3} height={110} />}>
        {() =>
          shown.length === 0 ? (
            <EmptyState compact title={t('bank.noMatchTitle')} body={t('bank.noMatchBody')} />
          ) : (
            <Stack gap={3}>
              <Text variant="caption" color="textMuted">
                {t('bank.count', { count: shown.length })}
              </Text>
              {shown.slice(0, limit).map((item) => (
                <BankItemCard key={item.id} item={item} therapyTypes={therapyTypes} onPress={() => onPick(item)} selected={item.id === selectedId} />
              ))}
              {shown.length > limit ? (
                <Text variant="caption" color="textMuted" align="center">
                  {t('bank.refine', { count: shown.length - limit })}
                </Text>
              ) : null}
            </Stack>
          )
        }
      </QueryView>
    </Stack>
  );
}
