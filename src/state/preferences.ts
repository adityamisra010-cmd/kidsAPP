import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Language } from '@/domain/types';

export type ThemePreference = 'system' | 'light' | 'dark';

interface PreferencesState {
  /** null until the user (or device locale) picks one. */
  language: Language | null;
  theme: ThemePreference;
  /** Video uploads wait for Wi-Fi. Default off: most parents use mobile data. */
  uploadOnWifiOnly: boolean;
  /** Has seen the first-run welcome. */
  onboarded: boolean;
  setLanguage: (l: Language) => void;
  setTheme: (t: ThemePreference) => void;
  setUploadOnWifiOnly: (v: boolean) => void;
  setOnboarded: (v: boolean) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      language: null,
      theme: 'system',
      uploadOnWifiOnly: false,
      onboarded: false,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setUploadOnWifiOnly: (uploadOnWifiOnly) => set({ uploadOnWifiOnly }),
      setOnboarded: (onboarded) => set({ onboarded }),
    }),
    { name: 'mkt.preferences', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
