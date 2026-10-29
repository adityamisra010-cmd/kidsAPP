import { Check, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Small coloured dot before the label (therapy types). */
  dot?: string;
  size?: 'md' | 'sm';
  testID?: string;
}

/** Toggleable chip. Selected state uses tint + check mark, never colour alone. */
export function Chip({ label, selected = false, onPress, dot, size = 'md', testID }: ChipProps) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const height = size === 'sm' ? 32 : 40;
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {selected ? <Check size={16} color={t.colors.primaryText} strokeWidth={2.6} /> : null}
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text variant="label" tint={selected ? t.colors.primaryText : t.colors.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  const style = {
    minHeight: height,
    paddingHorizontal: t.space[3],
    borderRadius: t.radius.pill,
    borderWidth: 1.5,
    borderColor: selected ? t.colors.primary : t.colors.border,
    backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
    justifyContent: 'center' as const,
  };
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={size === 'sm' ? 6 : 4}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}, ${selected ? tr('common:a11y.selected') : tr('common:a11y.notSelected')}`}
      style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}
    >
      {content}
    </Pressable>
  );
}

export interface ChipGroupProps {
  options: { value: string; label: string; dot?: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Single choice (radio-like). */
  single?: boolean;
  /** Show "Add your own" which appends free text values. */
  allowCustom?: boolean;
  /** Labels for custom values not in options (shown as typed). */
  size?: 'md' | 'sm';
  testID?: string;
}

export function ChipGroup({ options, value, onChange, single, allowCustom, size, testID }: ChipGroupProps) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const custom = value.filter((v) => !options.some((o) => o.value === v));
  const all = [...options, ...custom.map((c) => ({ value: c, label: c, dot: undefined }))];

  const toggle = (v: string) => {
    if (single) onChange(value.includes(v) ? [] : [v]);
    else onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const commit = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange(single ? [v] : [...value, v]);
    setDraft('');
    setAdding(false);
  };

  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
      {all.map((o) => (
        <Chip key={o.value} label={o.label} dot={o.dot} size={size} selected={value.includes(o.value)} onPress={() => toggle(o.value)} />
      ))}
      {allowCustom ? (
        adding ? (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
            onBlur={commit}
            returnKeyType="done"
            placeholder={tr('common:actions.addCustom')}
            placeholderTextColor={t.colors.textSubtle}
            accessibilityLabel={tr('common:actions.addCustom')}
            style={{
              minHeight: 40,
              minWidth: 140,
              paddingHorizontal: t.space[3],
              borderRadius: t.radius.pill,
              borderWidth: 1.5,
              borderColor: t.colors.primary,
              color: t.colors.text,
              fontFamily: t.fonts.medium,
              fontSize: 14,
            }}
          />
        ) : (
          <Pressable
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel={tr('common:actions.addCustom')}
            style={{
              minHeight: 40,
              paddingHorizontal: t.space[3],
              borderRadius: t.radius.pill,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: t.colors.borderStrong,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Plus size={16} color={t.colors.textMuted} />
            <Text variant="label" color="textMuted">
              {tr('common:actions.addCustom')}
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}
