import { peekRepo } from '@/data';
import type { AuthUser, Language } from '@/domain/types';
import { changeLanguage } from '@/i18n';
import { usePreferences } from '@/state/preferences';
import { useSession } from '@/state/session';

/** Switches the app language on this phone (preferences + i18n + date formatting). */
export function applyLanguage(lang: Language) {
  usePreferences.getState().setLanguage(lang);
  changeLanguage(lang);
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
