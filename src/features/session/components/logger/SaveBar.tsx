// Pinned save bar: what's still missing (tap to jump there) + the save button.
import { Check, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { Button, Text } from '@/ui';

export function SaveBar({
  label,
  missingMessage,
  onShowMissing,
  onSave,
  saving,
  compact = false,
}: {
  label: string;
  /** Shown after a save attempt while something required is missing. */
  missingMessage?: string;
  onShowMissing: () => void;
  onSave: () => void;
  saving: boolean;
  /** Keyboard open: keep Save reachable but small, so the field being typed stays visible. */
  compact?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation('session');
  return (
    <View
      style={{
        paddingHorizontal: t.space[4],
        paddingTop: compact ? t.space[2] : t.space[3],
        paddingBottom: compact ? t.space[2] : Math.max(insets.bottom, t.space[3]),
        borderTopWidth: 1,
        borderTopColor: t.colors.border,
        backgroundColor: t.colors.surface,
        gap: t.space[2],
      }}
    >
      {missingMessage && !compact ? (
        <Pressable
          onPress={onShowMissing}
          accessibilityRole="button"
          accessibilityLabel={`${missingMessage}. ${tr('logger.save.goToMissing')}`}
          accessibilityLiveRegion="polite"
          testID="missing-banner"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            minHeight: 44,
            paddingHorizontal: t.space[3],
            borderRadius: t.radius.md,
            backgroundColor: t.colors.dangerSoft,
          }}
        >
          <TriangleAlert size={18} color={t.colors.danger} />
          <Text variant="label" tint={t.colors.danger} weight="semibold" style={{ flex: 1 }}>
            {missingMessage}
          </Text>
          <Text variant="label" tint={t.colors.danger} weight="bold">
            {tr('logger.save.goToMissing')}
          </Text>
        </Pressable>
      ) : null}
      <Button
        label={label}
        icon={Check}
        size={compact ? 'md' : 'lg'}
        fullWidth
        onPress={onSave}
        loading={saving}
        testID="save-session"
      />
    </View>
  );
}
