import { Award } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTherapyTypes } from '@/data/hooks';
import type { UUID } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { formatDate } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, EmptyState, QueryView, Row, SkeletonList, Stack, Text, TypeTag } from '@/ui';

import { useWins } from '../queries';

/** Mastered goals, newest first: a quiet record of what the child has achieved. */
export function ParentWins({ childId, name }: { childId: UUID; name: string }) {
  const theme = useTheme();
  const { t } = useTranslation('goals');
  const q = useWins(childId);
  const types = useTherapyTypes().data ?? [];
  return (
    <QueryView
      query={q}
      skeleton={<SkeletonList rows={2} height={96} />}
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState title={t('wins.emptyTitle')} body={t('wins.emptyBody', { name })} />}
    >
      {(wins) => (
        <Stack gap={3} testID="parent-wins">
          <Text color="textMuted">{t('wins.intro', { count: wins.length, name })}</Text>
          {wins.map((g) => {
            const type = types.find((x) => x.id === g.therapyTypeId);
            return (
              <Card key={g.id} tone="success">
                <Row gap={3} align="flex-start">
                  <View
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Award size={22} color={theme.colors.success} />
                  </View>
                  <Stack gap={1} flex={1}>
                    <Text variant="bodyStrong">{g.parentText}</Text>
                    <Text variant="caption" color="success" weight="semibold">
                      {g.masteredAt ? t('wins.achievedOn', { date: formatDate(g.masteredAt) }) : t('parentStatus.achieved')}
                    </Text>
                    {type ? <TypeTag name={therapyTypeLabel(t, type)} color={type.color} /> : null}
                  </Stack>
                </Row>
              </Card>
            );
          })}
        </Stack>
      )}
    </QueryView>
  );
}
