import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View, type LayoutRectangle, type ScrollViewInstance } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

export interface SectionTab<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
}

/**
 * One row of section tabs that scrolls sideways when there are more than fit (5–6 sections on a
 * phone). Icon + word pills; the active one is filled. Keeps the active tab in view.
 */
export function SectionTabs<K extends string>({
  tabs,
  value,
  onChange,
  testID,
}: {
  tabs: SectionTab<K>[];
  value: K;
  onChange: (k: K) => void;
  testID?: string;
}) {
  const t = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const layouts = useRef<Partial<Record<K, LayoutRectangle>>>({});

  useEffect(() => {
    const l = layouts.current[value];
    if (l) scroll.current?.scrollTo({ x: Math.max(0, l.x - t.space[4]), animated: !t.reduceMotion });
  }, [value, t.reduceMotion, t.space]);

  return (
    <View accessibilityRole="tablist" testID={testID}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: t.space[2], paddingVertical: t.space[1] }}
      >
        {tabs.map((tab) => {
          const active = tab.key === value;
          const Icon = tab.icon;
          const fg = active ? t.colors.onPrimary : t.colors.text;
          return (
            <Pressable
              key={tab.key}
              onLayout={(e) => {
                layouts.current[tab.key] = e.nativeEvent.layout;
              }}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              hitSlop={4}
              style={({ pressed }) => ({
                minHeight: 44,
                paddingHorizontal: t.space[4],
                borderRadius: t.radius.pill,
                borderWidth: 1.5,
                borderColor: active ? t.colors.primary : t.colors.border,
                backgroundColor: active ? t.colors.primary : t.colors.surface,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {Icon ? <Icon size={16} color={fg} strokeWidth={2.2} /> : null}
              <Text variant="label" weight={active ? 'semibold' : 'medium'} tint={fg} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
