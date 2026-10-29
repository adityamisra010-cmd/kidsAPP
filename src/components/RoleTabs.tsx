import { Tabs } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

export interface TabDef {
  name: string;
  /** i18n key, e.g. 'common:tabs.home' */
  titleKey: string;
  icon: LucideIcon;
  badge?: number;
}

/** Bottom tabs: always icon + word, 64dp tall, calm active state. */
export function RoleTabs({ tabs }: { tabs: TabDef[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarLabelStyle: { fontFamily: t.fonts.medium, fontSize: 12, marginBottom: Platform.OS === 'android' ? 4 : 0 },
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.border,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 4,
        },
        tabBarItemStyle: { minHeight: 48 },
        sceneStyle: { backgroundColor: t.colors.bg },
        animation: t.reduceMotion ? 'none' : 'fade',
      }}
    >
      {tabs.map(({ name, titleKey, icon: Icon, badge }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: tr(titleKey),
            tabBarAccessibilityLabel: tr(titleKey),
            tabBarIcon: ({ color, focused }) => <Icon size={24} color={color} strokeWidth={focused ? 2.4 : 2} />,
            tabBarBadge: badge ? (badge > 99 ? '99+' : badge) : undefined,
            tabBarBadgeStyle: { backgroundColor: t.colors.primary, color: t.colors.onPrimary, fontSize: 11 },
          }}
        />
      ))}
    </Tabs>
  );
}
