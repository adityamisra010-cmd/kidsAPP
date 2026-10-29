import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Avatar, icon or dot. */
  left?: ReactNode;
  /** Value text, badge or custom node. Chevron shows automatically when pressable. */
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  testID?: string;
  accessibilityHint?: string;
}

export function ListItem({ title, subtitle, left, right, onPress, chevron, testID, accessibilityHint }: ListItemProps) {
  const t = useTheme();
  const showChevron = chevron ?? !!onPress;
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 60, paddingVertical: t.space[2] }}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron ? <ChevronRight size={20} color={t.colors.textSubtle} /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: t.colors.surfaceAlt }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {content}
    </Pressable>
  );
}

export function SectionHeader({ title, actionLabel, onAction, subtitle }: { title: string; actionLabel?: string; onAction?: () => void; subtitle?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.space[3], marginTop: t.space[2] }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="link" hitSlop={10} style={{ minHeight: 32, justifyContent: 'center' }}>
          <Text variant="label" color="primaryText" weight="semibold">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
