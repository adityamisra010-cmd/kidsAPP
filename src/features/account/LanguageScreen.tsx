import { router } from 'expo-router';
import { Check, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { LANGUAGES, isLanguage, languageInfo } from '@/domain/languages';
import type { Language } from '@/domain/types';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, confirm, Divider, Screen, Text, TextField, toast } from '@/ui';

import { applyLanguage, needsRestart, saveLanguage } from './language';

/**
 * Pick from English + the 22 scheduled languages of India. Names show in their own script (with
 * the English name under it), so anyone can find theirs whatever the app is currently in.
 */
export function LanguageScreen() {
  const t = useTheme();
  const { t: tr, i18n } = useTranslation();
  const signedIn = useSession((s) => !!s.user);
  const current: Language = isLanguage(i18n.language) ? i18n.language : 'en';
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter((l) => l.english.toLowerCase().includes(q) || l.native.includes(query.trim()) || l.code === q);
  }, [query]);

  const choose = async (lang: Language) => {
    if (lang === current) {
      router.back();
      return;
    }
    if (needsRestart(lang)) {
      const ok = await confirm({
        title: tr('settings:language.restartTitle'),
        body: tr('settings:language.restartBody', { language: languageInfo(lang).native }),
        confirmLabel: tr('settings:language.restartConfirm'),
      });
      if (!ok) return;
    }
    try {
      if (signedIn) await saveLanguage(lang);
      else applyLanguage(lang);
    } catch {
      toast.error(tr('errors:unknown'));
    }
    if (router.canGoBack()) router.back();
  };

  return (
    <Screen title={tr('settings:language.title')} subtitle={tr('settings:language.subtitle')} back testID="language-screen">
      <TextField
        icon={Search}
        placeholder={tr('settings:language.search')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        testID="language-search"
      />
      <Card padding={0}>
        {list.map((l, i) => {
          const selected = l.code === current;
          return (
            <View key={l.code}>
              {i > 0 ? <Divider inset={4} /> : null}
              <Pressable
                testID={`language-${l.code}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${l.native}, ${l.english}`}
                onPress={() => void choose(l.code)}
                android_ripple={{ color: t.colors.surfaceAlt }}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: t.space[4], paddingVertical: t.space[2], gap: t.space[3] }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="subheading" tint={selected ? t.colors.primaryText : undefined}>
                    {l.native}
                  </Text>
                  {l.native !== l.english ? (
                    <Text variant="caption" color="textMuted">
                      {l.english}
                    </Text>
                  ) : null}
                </View>
                {selected ? <Check size={22} color={t.colors.primaryText} strokeWidth={2.6} /> : null}
              </Pressable>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
