import { ArrowRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { UUID } from '@/domain/types';
import { chipLabel, vocabLabel } from '@/i18n/labels';
import { formatDate, formatTime } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Divider, EmptyState, QueryView, Row, Sheet, SkeletonList, Stack, Text } from '@/ui';

import { fieldLabelKey, formatEditValue } from '../history';
import { useProfileHistory } from '../queries';

/** "Who changed what, when" for the About Me profile. */
export function ProfileHistorySheet({ childId, visible, onClose }: { childId: UUID; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation('child');
  const q = useProfileHistory(childId, visible);
  const labels = {
    chip: (g: Parameters<typeof chipLabel>[1], v: string) => chipLabel(t, g, v),
    commMode: (v: string) => vocabLabel(t, 'commModes', v),
    empty: t('history.empty'),
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('history.title')} subtitle={t('history.subtitle')} testID="profile-history">
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={3} height={64} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState compact title={t('history.noneTitle')} body={t('history.noneBody')} />}
      >
        {(edits) => (
          <Stack gap={3}>
            {[...edits]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((e, i) => (
                <View key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <Stack gap={1} style={{ paddingTop: i > 0 ? theme.space[3] : 0 }}>
                    <Text variant="bodyStrong">{t(fieldLabelKey(e.field), { defaultValue: e.field })}</Text>
                    <Row gap={2} align="flex-start" wrap>
                      <Text color="textMuted" style={{ textDecorationLine: 'line-through', flexShrink: 1 }}>
                        {formatEditValue(e.field, e.oldValue, labels)}
                      </Text>
                      <ArrowRight size={16} color={theme.colors.textSubtle} />
                      <Text style={{ flexShrink: 1 }}>{formatEditValue(e.field, e.newValue, labels)}</Text>
                    </Row>
                    <Text variant="caption" color="textSubtle">
                      {t('history.byLine', { name: e.byName, date: formatDate(e.at), time: formatTime(e.at) })}
                    </Text>
                  </Stack>
                </View>
              ))}
          </Stack>
        )}
      </QueryView>
    </Sheet>
  );
}
