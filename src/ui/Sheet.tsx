import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

import { IconOnlyButton } from './Button';
import { Text } from './Text';

/**
 * Bottom sheet built on Modal (no extra native deps). Use for anchor explanations, pickers,
 * quick forms. Content scrolls; footer stays pinned.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType={t.reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable
          style={{ flex: 1, backgroundColor: t.colors.overlay }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={tr('common:a11y.close')}
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={{
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            maxHeight: '88%',
            paddingBottom: Math.max(insets.bottom, t.space[4]),
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: t.space[2] }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.borderStrong }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: t.space[5], paddingRight: t.space[2], paddingTop: t.space[2] }}>
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
            <IconOnlyButton icon={X} label={tr('common:a11y.close')} onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: t.space[5], paddingTop: t.space[3], paddingBottom: t.space[4], gap: t.space[3] }}
          >
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: t.space[5], paddingTop: t.space[2], gap: t.space[2] }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
