import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

export interface QuickLink {
  key: string;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  badge?: number;
}

/** Row of icon + word tiles (always words: some parents read little English or prefer Hindi). */
export function QuickLinks({ links }: { links: QuickLink[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: t.space[3] }}>
      {links.map((l) => (
        <Pressable
          key={l.key}
          testID={`quick-${l.key}`}
          onPress={l.onPress}
          accessibilityRole="button"
          accessibilityLabel={l.badge ? `${l.label}, ${l.badge}` : l.label}
          android_ripple={{ color: t.colors.surfaceAlt }}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 96,
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.space[2],
            paddingVertical: t.space[3],
            paddingHorizontal: t.space[2],
            borderRadius: t.radius.lg,
            borderWidth: 1,
            borderColor: t.colors.border,
            backgroundColor: t.colors.surface,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <l.icon size={22} color={t.colors.primaryText} />
            </View>
            {l.badge ? (
              <View
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -10,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  paddingHorizontal: 5,
                  backgroundColor: t.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: t.colors.surface,
                }}
              >
                <Text variant="overline" tint={t.colors.onPrimary} style={{ fontSize: 10, lineHeight: 12 }} maxFontSizeMultiplier={1.2}>
                  {l.badge > 99 ? '99+' : l.badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="subheading" align="center" numberOfLines={2}>
            {l.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
