/* eslint-disable import/no-named-as-default-member -- i18next's default instance is the documented API */
/**
 * i18next setup. Every user-facing string goes through a translation key.
 * One namespace per feature area (files in ./locales/<lang>/<ns>.json) so features can be
 * worked on independently. Usage: `const { t } = useTranslation('session')` then t('logger.title'),
 * or cross-namespace t('common:actions.save').
 */
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { fallbackChain, isLanguage } from '@/domain/languages';
import type { Language } from '@/domain/types';
import { setAgeFormatter, setDateLanguage } from '@/lib/dates';

import enAdmin from './locales/en/admin.json';
import enAuth from './locales/en/auth.json';
import enBrief from './locales/en/brief.json';
import enCalendar from './locales/en/calendar.json';
import enChild from './locales/en/child.json';
import enChips from './locales/en/chips.json';
import enCommon from './locales/en/common.json';
import enDashboard from './locales/en/dashboard.json';
import enDims from './locales/en/dims.json';
import enErrors from './locales/en/errors.json';
import enGoals from './locales/en/goals.json';
import enImport from './locales/en/import.json';
import enMessages from './locales/en/messages.json';
import enNotifications from './locales/en/notifications.json';
import enParent from './locales/en/parent.json';
import enPlatform from './locales/en/platform.json';
import enPractice from './locales/en/practice.json';
import enProgress from './locales/en/progress.json';
import enReports from './locales/en/reports.json';
import enResources from './locales/en/resources.json';
import enSchool from './locales/en/school.json';
import enSession from './locales/en/session.json';
import enSettings from './locales/en/settings.json';
import enTherapist from './locales/en/therapist.json';
import hiAdmin from './locales/hi/admin.json';
import hiAuth from './locales/hi/auth.json';
import hiBrief from './locales/hi/brief.json';
import hiCalendar from './locales/hi/calendar.json';
import hiChild from './locales/hi/child.json';
import hiChips from './locales/hi/chips.json';
import hiCommon from './locales/hi/common.json';
import hiDashboard from './locales/hi/dashboard.json';
import hiDims from './locales/hi/dims.json';
import hiErrors from './locales/hi/errors.json';
import hiGoals from './locales/hi/goals.json';
import hiImport from './locales/hi/import.json';
import hiMessages from './locales/hi/messages.json';
import hiNotifications from './locales/hi/notifications.json';
import hiParent from './locales/hi/parent.json';
import hiPlatform from './locales/hi/platform.json';
import hiPractice from './locales/hi/practice.json';
import hiProgress from './locales/hi/progress.json';
import hiReports from './locales/hi/reports.json';
import hiResources from './locales/hi/resources.json';
import hiSchool from './locales/hi/school.json';
import hiSession from './locales/hi/session.json';
import hiSettings from './locales/hi/settings.json';
import hiTherapist from './locales/hi/therapist.json';
import { LOADERS } from './locales/loaders';

export const NAMESPACES = [
  'common',
  'auth',
  'parent',
  'therapist',
  'admin',
  'session',
  'brief',
  'calendar',
  'child',
  'goals',
  'progress',
  'practice',
  'resources',
  'messages',
  'notifications',
  'dashboard',
  'reports',
  'import',
  'settings',
  'school',
  'platform',
  'chips',
  'dims',
  'errors',
] as const;

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    parent: enParent,
    therapist: enTherapist,
    admin: enAdmin,
    session: enSession,
    brief: enBrief,
    calendar: enCalendar,
    child: enChild,
    goals: enGoals,
    progress: enProgress,
    practice: enPractice,
    resources: enResources,
    messages: enMessages,
    notifications: enNotifications,
    dashboard: enDashboard,
    reports: enReports,
    import: enImport,
    settings: enSettings,
    school: enSchool,
    platform: enPlatform,
    chips: enChips,
    dims: enDims,
    errors: enErrors,
  },
  hi: {
    common: hiCommon,
    auth: hiAuth,
    parent: hiParent,
    therapist: hiTherapist,
    admin: hiAdmin,
    session: hiSession,
    brief: hiBrief,
    calendar: hiCalendar,
    child: hiChild,
    goals: hiGoals,
    progress: hiProgress,
    practice: hiPractice,
    resources: hiResources,
    messages: hiMessages,
    notifications: hiNotifications,
    dashboard: hiDashboard,
    reports: hiReports,
    import: hiImport,
    settings: hiSettings,
    school: hiSchool,
    platform: hiPlatform,
    chips: hiChips,
    dims: hiDims,
    errors: hiErrors,
  },
};

export function deviceLanguage(): Language {
  try {
    for (const l of getLocales()) {
      if (isLanguage(l.languageCode)) return l.languageCode;
    }
  } catch {
    // fall through
  }
  return 'en';
}

/** Adds a language's bundles (and those it falls back to) the first time it is used. */
function ensureLoaded(lang: Language) {
  for (const code of fallbackChain(lang)) {
    if (code === 'en' || code === 'hi' || i18n.hasResourceBundle(code, 'common')) continue;
    const bundle = LOADERS[code]?.();
    if (!bundle) continue;
    for (const [ns, data] of Object.entries(bundle)) i18n.addResourceBundle(code, ns, data, true, true);
  }
}

function formatAge({ years, months }: { years: number; months: number }): string {
  if (years === 0) return i18n.t('common:age.months', { count: months });
  if (months === 0) return i18n.t('common:age.years', { count: years });
  return i18n.t('common:age.yearsMonths', { years, months });
}

let initialised = false;

export function initI18n(lang: Language) {
  setDateLanguage(lang);
  if (initialised) {
    changeLanguage(lang);
    return i18n;
  }
  initialised = true;
  void i18n.use(initReactI18next).init({
    resources,
    lng: lang,
    // Missing strings come from the closest language a reader is likely to know, then English.
    fallbackLng: (code: string) => (isLanguage(code) ? fallbackChain(code).slice(1) : ['en']),
    ns: NAMESPACES as unknown as string[],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
  });
  ensureLoaded(lang);
  setAgeFormatter(formatAge);
  return i18n;
}

export function changeLanguage(lang: Language) {
  ensureLoaded(lang);
  setDateLanguage(lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
