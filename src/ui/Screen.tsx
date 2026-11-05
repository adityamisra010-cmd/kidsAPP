import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

import { IconOnlyButton } from './Button';
import { OfflineBanner } from './Sync';
import { Text } from './Text';

export interface ScreenProps {
  /** Header title. Omit for custom headers (e.g. parent home greeting). */
  title?: string;
  subtitle?: string;
  /** Show a back arrow (stack screens). Tab roots leave this off. */
  back?: boolean;
  onBack?: () => void;
  /** Header actions (use LabeledIconButton / small Buttons). */
  right?: ReactNode;
  /** Content below the title inside the header area (segmented control, search). */
  headerExtra?: ReactNode;
  /** Wrap content in a ScrollView (default true). Use false for FlatList screens. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pinned bottom area (primary action). */
  footer?: ReactNode;
  children: ReactNode;
  /** Remove default horizontal padding (full-bleed lists). */
  edgeToEdge?: boolean;
  testID?: string;
  scrollProps?: Omit<ScrollViewProps, 'children'>;
}

/**
 * Standard screen shell: safe area, warm background, header with optional back + actions,
 * scroll + pull-to-refresh, keyboard avoidance, offline banner and pinned footer.
 */
export function Screen({
  title,
  subtitle,
  back,
  onBack,
  right,
  headerExtra,
  scroll = true,
  refreshing,
  onRefresh,
  footer,
  children,
  edgeToEdge,
  testID,
  scrollProps,
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation();
  const px = edgeToEdge ? 0 : t.space[4];

  const header =
    title || back || right ? (
      <View style={{ paddingHorizontal: t.space[2], paddingTop: t.space[1], paddingBottom: t.space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: t.space[1] }}>
          {back ? (
            <IconOnlyButton
              icon={ArrowLeft}
              label={tr('common:a11y.back')}
              onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace('/'))}
            />
          ) : (
            <View style={{ width: t.space[2] }} />
          )}
          <View style={{ flex: 1, gap: 1 }}>
            {title ? (
              <Text variant={back ? 'heading' : 'title'} accessibilityRole="header" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1], paddingRight: t.space[2] }}>{right}</View> : null}
        </View>
        {headerExtra ? <View style={{ paddingHorizontal: t.space[2], paddingTop: t.space[2] }}>{headerExtra}</View> : null}
      </View>
    ) : headerExtra ? (
      <View style={{ paddingHorizontal: t.space[4], paddingBottom: t.space[2] }}>{headerExtra}</View>
    ) : null;

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: px, paddingBottom: t.space[10], gap: t.space[4], flexGrow: 1 }}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} colors={[t.colors.primary]} /> : undefined
      }
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: px }}>{children}</View>
  );

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header}
        <OfflineBanner />
        {body}
        {footer ? (
          <View
            style={{
              paddingHorizontal: t.space[4],
              paddingTop: t.space[3],
              paddingBottom: t.space[3],
              borderTopWidth: 1,
              borderTopColor: t.colors.border,
              backgroundColor: t.colors.surface,
              gap: t.space[2],
            }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
