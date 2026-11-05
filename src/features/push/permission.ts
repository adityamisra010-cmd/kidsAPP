/**
 * Notification permission state shared by the setup hook and the Notification settings screen.
 * We never ask on cold start: an in-app explanation is shown once after sign-in, and the system
 * prompt only appears when the person taps "Turn on".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { create } from 'zustand';

export type PermissionState = 'unknown' | 'granted' | 'denied' | 'undetermined' | 'unsupported';

interface PushPermissionStore {
  state: PermissionState;
  canAskAgain: boolean;
  set: (state: PermissionState, canAskAgain: boolean) => void;
}

export const usePushPermission = create<PushPermissionStore>((set) => ({
  state: Platform.OS === 'web' ? 'unsupported' : 'unknown',
  canAskAgain: true,
  set: (state, canAskAgain) => set({ state, canAskAgain }),
}));

function toState(status: string): PermissionState {
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

export async function refreshPermission(): Promise<{ state: PermissionState; canAskAgain: boolean }> {
  if (Platform.OS === 'web') return { state: 'unsupported', canAskAgain: false };
  try {
    const p = await Notifications.getPermissionsAsync();
    const next = { state: toState(p.status), canAskAgain: p.canAskAgain };
    usePushPermission.getState().set(next.state, next.canAskAgain);
    return next;
  } catch {
    return { state: 'unknown', canAskAgain: false };
  }
}

/** Shows the system prompt, or opens system settings when Android won't ask again. */
export async function requestPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'unsupported';
  const current = await refreshPermission();
  if (current.state === 'granted') return 'granted';
  if (!current.canAskAgain) {
    await Linking.openSettings().catch(() => undefined);
    return current.state;
  }
  try {
    const p = await Notifications.requestPermissionsAsync();
    const state = toState(p.status);
    usePushPermission.getState().set(state, p.canAskAgain);
    return state;
  } catch {
    return current.state;
  }
}

const ASKED_KEY = 'mkt.push.explained.v1';

export async function wasExplained(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ASKED_KEY)) === '1';
  } catch {
    return true; // If storage fails, don't nag.
  }
}

export async function markExplained(): Promise<void> {
  try {
    await AsyncStorage.setItem(ASKED_KEY, '1');
  } catch {
    // ignore
  }
}
