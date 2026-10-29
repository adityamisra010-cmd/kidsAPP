// Three-way energy state (separate from the regulation score: high energy is not "good").
import type { LucideIcon } from 'lucide-react-native';
import { BatteryLow, Check, CircleCheck, Zap } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { RegulationState } from '@/domain/types';
import { vocabLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

import { issueId, REGULATION_STATES } from '../../logic/draft';
import { useTargetRef } from './scrollTargets';

const ICONS: Record<RegulationState, LucideIcon> = { under: BatteryLow, regulated: CircleCheck, over: Zap };

function RegulationStateSelectorBase({
  value,
  onChange,
  invalid,
}: {
  value?: RegulationState;
  onChange: (v: RegulationState) => void;
  invalid: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const ref = useTargetRef(issueId.regulationState);
  return (
    <View ref={ref} style={{ gap: t.space[2] }}>
      <Text variant="label" color="textMuted">
        {tr('logger.regulationState.label')}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={tr('logger.regulationState.label')} style={{ flexDirection: 'row', gap: t.space[2] }}>
        {REGULATION_STATES.map((s) => {
          const selected = value === s;
          const Icon = ICONS[s];
          const label = vocabLabel(tr, 'regulation', s);
          return (
            <Pressable
              key={s}
              testID={`regulation-state-${s}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={label}
              onPress={() => onChange(s)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 56,
                borderRadius: t.radius.md,
                borderWidth: 1.5,
                borderColor: selected ? t.colors.primary : invalid ? t.colors.danger : t.colors.border,
                backgroundColor: selected ? t.colors.primarySoft : pressed ? t.colors.surfaceAlt : t.colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                paddingHorizontal: 4,
                paddingVertical: 6,
              })}
            >
              {selected ? <Check size={18} color={t.colors.primaryText} strokeWidth={2.6} /> : <Icon size={18} color={t.colors.textMuted} />}
              <Text variant="label" align="center" numberOfLines={2} tint={selected ? t.colors.primaryText : t.colors.text} weight={selected ? 'semibold' : 'medium'}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {invalid && !value ? (
        <Text variant="label" color="danger" weight="semibold">
          {tr('logger.regulationState.needed')}
        </Text>
      ) : (
        <Text variant="caption" color="textSubtle">
          {tr('logger.regulationState.hint')}
        </Text>
      )}
    </View>
  );
}

export const RegulationStateSelector = memo(RegulationStateSelectorBase);
