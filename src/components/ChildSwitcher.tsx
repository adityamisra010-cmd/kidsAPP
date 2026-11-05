// Owner: W1 (onboarding/account). Parent child switcher (hidden with one child). Prop-less.
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { useMyChildren } from '@/features/account/queries';
import { switchChild } from '@/state/auth-actions';
import { useActive, useSession } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Text } from '@/ui';

/**
 * Horizontal row of child chips (photo/initials + first name). The selected child gets a tinted
 * chip, a ring and a "selected" state for screen readers, so it's never shown by colour alone.
 */
export function ChildSwitcher() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const isParent = useActive()?.role === 'parent';
  const activeChildId = useSession((s) => s.activeChildId);
  const q = useMyChildren(isParent);
  const list = q.data ?? [];
  if (!isParent || list.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: t.space[2], paddingVertical: 2 }}
      accessibilityRole="radiogroup"
      accessibilityLabel={tr('settings:switch.titleChild')}
      testID="child-switcher"
    >
      {list.map(({ child }) => {
        const selected = child.id === activeChildId;
        const name = child.preferredName ?? child.fullName.split(' ')[0];
        return (
          <Pressable
            key={child.id}
            testID={`child-chip-${child.id}`}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={name}
            onPress={() => !selected && switchChild(child.id)}
            hitSlop={4}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[2],
              minHeight: 48,
              paddingLeft: 4,
              paddingRight: t.space[4],
              borderRadius: t.radius.pill,
              borderWidth: 1.5,
              borderColor: selected ? t.colors.primary : t.colors.border,
              backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View>
              <Avatar name={child.fullName} uri={child.photoUrl} size={38} ring={selected ? t.colors.primary : undefined} />
            </View>
            <Text variant="label" weight={selected ? 'semibold' : 'medium'} tint={selected ? t.colors.primaryText : t.colors.text} numberOfLines={1}>
              {name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
