import { router } from 'expo-router';
import { ChevronDown, Languages } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { isLanguage, languageInfo } from '@/domain/languages';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

/**
 * Current language as a button ("हिन्दी ▾") that opens the full list of 23 languages. The name is
 * shown in its own script so a parent can recognise theirs whatever the app is in.
 */
export function LanguageToggle({ testID }: { persist?: boolean; width?: number; testID?: string }) {
  const t = useTheme();
  const { t: tr, i18n } = useTranslation();
  const lang = languageInfo(isLanguage(i18n.language) ? i18n.language : 'en');
  return (
    <Pressable
      testID={testID}
      onPress={() => router.push('/language')}
      accessibilityRole="button"
      accessibilityLabel={`${tr('settings:language.title')}: ${lang.native}, ${lang.english}`}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        paddingHorizontal: t.space[4],
        borderRadius: t.radius.pill,
        backgroundColor: pressed ? t.colors.primarySoft : t.colors.surfaceAlt,
        alignSelf: 'flex-end',
      })}
    >
      <Languages size={18} color={t.colors.primaryText} />
      <Text variant="label" weight="semibold">
        {lang.native}
      </Text>
      <ChevronDown size={16} color={t.colors.textMuted} />
    </Pressable>
  );
}
