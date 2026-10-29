import { School, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { GoalBankItem, TherapyType } from '@/domain/types';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Row, Stack, Text, TypeTag } from '@/ui';

export function bankTypeName(t: ReturnType<typeof useTranslation>['t'], key: string, types: TherapyType[]): { name: string; color?: string } {
  const tt = types.find((x) => x.key === key);
  return tt ? { name: therapyTypeLabel(t, tt), color: tt.color } : { name: t(`chips:therapyTypes.${key}`, { defaultValue: key }) };
}

/** One Goal Bank entry: staff wording, what parents will read, domain and therapy type. */
export function BankItemCard({ item, therapyTypes, onPress, selected }: { item: GoalBankItem; therapyTypes: TherapyType[]; onPress?: () => void; selected?: boolean }) {
  const theme = useTheme();
  const { t } = useTranslation('goals');
  const type = bankTypeName(t, item.therapyTypeKey, therapyTypes);
  return (
    <Card onPress={onPress} tone={selected ? 'primary' : 'default'} accessibilityLabel={`${item.staffText}. ${t('card.parentSees', { text: item.parentText })}`} testID={`bank-${item.id}`}>
      <Stack gap={2}>
        <Row justify="between" gap={2} wrap>
          {type.color ? <TypeTag name={type.name} color={type.color} /> : <Text variant="caption" color="textMuted">{type.name}</Text>}
          {item.organizationId ? <Badge label={t('bank.ourSchool')} tone="info" icon={School} /> : null}
        </Row>
        <Text variant="bodyStrong">{item.staffText}</Text>
        <Row gap={2} align="flex-start">
          <Users size={14} color={theme.colors.textSubtle} style={{ marginTop: 3 }} />
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {t('card.parentSees', { text: item.parentText })}
          </Text>
        </Row>
        <Text variant="caption" color="textSubtle">
          {vocabLabel(t, 'domains', item.domain)}
        </Text>
      </Stack>
    </Card>
  );
}
