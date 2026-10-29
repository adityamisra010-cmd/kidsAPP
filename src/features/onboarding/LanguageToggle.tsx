import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Language } from '@/domain/types';
import { applyLanguage, saveLanguage } from '@/features/account/language';
import { SegmentedControl, toast } from '@/ui';

/**
 * English / हिंदी switch. Language names are always shown in their own script so a parent can
 * find theirs whatever the current language is.
 */
export function LanguageToggle({ persist = false, width = 220, testID }: { persist?: boolean; width?: number; testID?: string }) {
  const { t, i18n } = useTranslation();
  const value: Language = i18n.language === 'hi' ? 'hi' : 'en';
  const onChange = (lang: Language) => {
    if (lang === value) return;
    if (!persist) {
      applyLanguage(lang);
      return;
    }
    saveLanguage(lang).catch(() => toast.error(t('errors:unknown')));
  };
  return (
    <View style={{ width }} accessibilityLabel={t('settings:language.title')}>
      <SegmentedControl<Language>
        testID={testID}
        value={value}
        onChange={onChange}
        options={[
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'हिंदी' },
        ]}
      />
    </View>
  );
}
