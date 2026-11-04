import { reloadAppAsync } from 'expo';
import { I18nManager, Platform } from 'react-native';

import { peekRepo } from '@/data';
import { languageInfo } from '@/domain/languages';
import type { AuthUser, Language } from '@/domain/types';
import { changeLanguage } from '@/i18n';
import { usePreferences } from '@/state/preferences';
import { useSession } from '@/state/session';

/** True when switching to `lang` flips reading direction (Urdu, Kashmiri, Sindhi read right to left). */
export function needsRestart(lang: Language): boolean {
  return Platform.OS !== 'web' && languageInfo(lang).rtl !== I18nManager.isRTL;
}

/**
 * Switches the app language on this phone (preferences + i18n + date formatting). A change of
 * reading direction only takes effect after a restart, so the app reloads itself.
 */
export function applyLanguage(lang: Language) {
  const restart = needsRestart(lang);
  usePreferences.getState().setLanguage(lang);
  changeLanguage(lang);
  if (restart) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(languageInfo(lang).rtl);
    // Give the preference store a moment to persist before the reload.
    setTimeout(() => void reloadAppAsync('language direction changed').catch(() => undefined), 300);
  }
}

/** Same as applyLanguage, and remembers it on the profile so the school's messages can follow. */
export async function saveLanguage(lang: Language): Promise<void> {
  applyLanguage(lang);
  const repo = peekRepo();
  if (repo && useSession.getState().user) await repo.me.updateProfile({ preferredLanguage: lang });
}

/** After sign-in: use the profile's language if this phone never had one chosen. */
export function adoptProfileLanguage(user: AuthUser) {
  if (usePreferences.getState().language == null) applyLanguage(user.profile.preferredLanguage);
}
