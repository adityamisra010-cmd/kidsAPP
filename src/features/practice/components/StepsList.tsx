/**
 * Large numbered steps, easy to follow with one hand while doing the activity.
 */
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

export function StepsList({ steps }: { steps: string[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  return (
    <View style={{ gap: t.space[3] }} accessibilityRole="list">
      {steps.map((s, i) => (
        <View key={`${i}-${s}`} style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start' }} accessibilityLabel={`${tr('task.stepLabel', { n: i + 1 })}. ${s}`}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="subheading" color="primaryText" maxFontSizeMultiplier={1.3}>
              {String(i + 1)}
            </Text>
          </View>
          <Text style={{ flex: 1, fontSize: 18, lineHeight: 26, paddingTop: 4 }}>{s}</Text>
        </View>
      ))}
    </View>
  );
}
