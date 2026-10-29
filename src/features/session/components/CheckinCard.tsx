// Read-only parent pre-session check-in (logger context + handover brief).
import type { LucideIcon } from 'lucide-react-native';
import { ClipboardCheck, FaceNeutral, FaceSlightlyFrowning, FaceSlightlySmiling, Moon, TriangleAlert, Utensils } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ParentCheckin } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Row, Stack, Text } from '@/ui';

function Item({ icon: IconCmp, label, concern }: { icon: LucideIcon; label: string; concern: boolean }) {
  const t = useTheme();
  const color = concern ? t.colors.warning : t.colors.textMuted;
  return (
    <Row gap={2} style={{ minHeight: 28 }}>
      <IconCmp size={18} color={color} />
      <Text variant="label" tint={concern ? t.colors.warning : t.colors.text} weight={concern ? 'semibold' : 'medium'}>
        {label}
      </Text>
    </Row>
  );
}

export function CheckinCard({ checkin }: { checkin: ParentCheckin }) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const sleep = tr(`checkin.sleepValue.${checkin.sleep}`);
  const ate = tr(`checkin.ateValue.${checkin.ateBreakfast ? 'yes' : 'no'}`);
  const mood = tr(`checkin.moodValue.${checkin.mood}`);
  const MoodIcon = checkin.mood === 'happy' ? FaceSlightlySmiling : checkin.mood === 'okay' ? FaceNeutral : FaceSlightlyFrowning;
  const change = checkin.changeFlag ? checkin.changeNote || tr('checkin.change') : tr('checkin.noChange');
  const summary = [sleep, ate, `${tr('checkin.mood')}: ${mood}`, change].join(', ');
  return (
    <Card tone="sunken" accessibilityLabel={tr('checkin.a11y', { summary })} testID="checkin-card">
      <Stack gap={3}>
        <Row gap={2}>
          <ClipboardCheck size={18} color={t.colors.primaryText} />
          <Text variant="subheading">{tr('checkin.title')}</Text>
        </Row>
        <Row gap={4} wrap>
          <Item icon={Moon} label={sleep} concern={checkin.sleep === 'poor'} />
          <Item icon={Utensils} label={ate} concern={!checkin.ateBreakfast} />
          <Item icon={MoodIcon} label={mood} concern={checkin.mood === 'upset'} />
        </Row>
        {checkin.changeFlag ? (
          <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'flex-start' }}>
            <TriangleAlert size={18} color={t.colors.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" tint={t.colors.warning} weight="semibold">
                {tr('checkin.change')}
              </Text>
              {checkin.changeNote ? <Text>{checkin.changeNote}</Text> : null}
            </View>
          </View>
        ) : null}
      </Stack>
    </Card>
  );
}
