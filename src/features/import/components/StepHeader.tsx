import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

export type ImportStep = 'file' | 'match' | 'check' | 'done';
export const IMPORT_STEPS: ImportStep[] = ['file', 'match', 'check', 'done'];

/** "1 Choose file · 2 Match columns · 3 Check · 4 Done" */
export function StepHeader({ step }: { step: ImportStep }) {
  const t = useTheme();
  const { t: tr } = useTranslation('import');
  const current = IMPORT_STEPS.indexOf(step);
  return (
    <View style={{ flexDirection: 'row', gap: t.space[1] }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 4, now: current + 1 }}>
      {IMPORT_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const label = tr(`flow.steps.${s}`);
        const state = done ? tr('flow.stepDone') : active ? tr('flow.stepCurrent') : '';
        return (
          <View
            key={s}
            style={{ flex: 1, alignItems: 'center', gap: 4 }}
            accessible
            accessibilityLabel={`${tr('flow.stepA11y', { n: i + 1, label })}${state ? `, ${state}` : ''}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : done || active ? t.colors.primary : t.colors.border }} />
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done || active ? t.colors.primary : t.colors.surfaceAlt,
                  borderWidth: active ? 0 : 1.5,
                  borderColor: done ? t.colors.primary : t.colors.borderStrong,
                }}
              >
                {done ? (
                  <Check size={16} color={t.colors.onPrimary} strokeWidth={3} />
                ) : (
                  <Text variant="label" weight="bold" tint={active ? t.colors.onPrimary : t.colors.textMuted}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: i === IMPORT_STEPS.length - 1 ? 'transparent' : done ? t.colors.primary : t.colors.border }} />
            </View>
            <Text variant="caption" align="center" numberOfLines={2} weight={active ? 'semibold' : 'regular'} color={active ? 'text' : 'textMuted'}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
