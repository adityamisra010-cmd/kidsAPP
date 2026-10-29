/**
 * supabase-js client for React Native: URL polyfill, session persisted in the secure store
 * (see session-storage.ts), token auto-refresh while the app is in the foreground, no URL
 * session detection (deep links are not used for auth).
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { createSessionStorage, type KeyValueStore } from './session-storage';

const asyncStore: KeyValueStore = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};

const secureOptions: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

const secureStore: KeyValueStore = {
  getItem: (k) => SecureStore.getItemAsync(k, secureOptions),
  setItem: (k, v) => SecureStore.setItemAsync(k, v, secureOptions),
  removeItem: (k) => SecureStore.deleteItemAsync(k, secureOptions),
};

/** Plain key/value store for non-secret adapter state (e.g. the cached AuthUser for offline start). */
export const appStore: KeyValueStore = asyncStore;

export function createSupabaseClient(cfg: { url: string; anonKey: string }): SupabaseClient {
  const native = Platform.OS !== 'web';
  const client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      storage: createSessionStorage(native ? secureStore : null, asyncStore),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  if (native) {
    // Refresh tokens only while the app is visible (supabase-js recommendation for React Native).
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
  }
  return client;
}
