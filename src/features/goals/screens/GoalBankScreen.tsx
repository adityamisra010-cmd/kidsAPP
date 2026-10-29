import { Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTherapyTypes } from '@/data/hooks';
import { GOAL_DOMAINS } from '@/domain/constants';
import { ADMIN_ROLES, type GoalDomain } from '@/domain/types';
import { vocabLabel } from '@/i18n/labels';
import { useRequiredActive } from '@/state/session';
import { Chip, EmptyState, LabeledIconButton, QueryView, Row, Screen, SectionHeader, SkeletonList, Stack, TextField } from '@/ui';

import { AddBankItemSheet } from '../components/AddBankItemSheet';
import { BankItemCard } from '../components/BankItemCard';
import { filterBank } from '../goalForm';
import { useGoalBank } from '../queries';

/** Goal Bank (`/goal-bank`): browse by domain; coordinators and admins add school goals. */
export function GoalBankScreen() {
  const { t } = useTranslation('goals');
  const role = useRequiredActive().role;
  const canAdd = ADMIN_ROLES.includes(role);
  const q = useGoalBank();
  const types = useTherapyTypes().data ?? [];
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<GoalDomain | null>(null);
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => {
    const shown = filterBank(q.data ?? [], { search, domain });
    return GOAL_DOMAINS.map((d) => ({ domain: d, items: shown.filter((i) => i.domain === d) })).filter((g) => g.items.length > 0);
  }, [q.data, search, domain]);

  return (
    <Screen
      back
      title={t('bank.title')}
      subtitle={t('bank.subtitle')}
      right={canAdd ? <LabeledIconButton icon={Plus} label={t('bank.addShort')} onPress={() => setAdding(true)} testID="add-bank-goal" /> : undefined}
      testID="goal-bank"
    >
      <Stack gap={3}>
        <TextField icon={Search} value={search} onChangeText={setSearch} placeholder={t('bank.search')} accessibilityLabel={t('bank.search')} autoCorrect={false} />
        <Row gap={2} wrap>
          <Chip size="sm" label={t('bank.all')} selected={!domain} onPress={() => setDomain(null)} />
          {GOAL_DOMAINS.map((d) => (
            <Chip key={d} size="sm" label={vocabLabel(t, 'domains', d)} selected={domain === d} onPress={() => setDomain(domain === d ? null : d)} />
          ))}
        </Row>
      </Stack>
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={4} height={110} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={t('bank.emptyTitle')} body={t('bank.emptyBody')} actionLabel={canAdd ? t('bank.addShort') : undefined} onAction={canAdd ? () => setAdding(true) : undefined} />}
      >
        {() =>
          groups.length === 0 ? (
            <EmptyState compact title={t('bank.noMatchTitle')} body={t('bank.noMatchBody')} />
          ) : (
            <Stack gap={4}>
              {groups.map((g) => (
                <Stack key={g.domain} gap={3}>
                  <SectionHeader title={vocabLabel(t, 'domains', g.domain)} subtitle={t('bank.count', { count: g.items.length })} />
                  {g.items.map((item) => (
                    <BankItemCard key={item.id} item={item} therapyTypes={types} />
                  ))}
                </Stack>
              ))}
            </Stack>
          )
        }
      </QueryView>
      {canAdd && adding ? <AddBankItemSheet visible onClose={() => setAdding(false)} therapyTypes={types} /> : null}
    </Screen>
  );
}
