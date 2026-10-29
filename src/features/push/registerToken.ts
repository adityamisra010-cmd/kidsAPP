/**
 * Registers this phone for server pushes. Skipped quietly on web, emulators, and builds without
 * an EAS projectId / FCM config: local reminders keep working either way.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Repository } from '@/data/repository';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export async function registerPushToken(repo: Repository): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  const id = projectId();
  if (!id) return false;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await repo.me.registerPushToken(data, Platform.OS === 'ios' ? 'ios' : 'android');
    return true;
  } catch {
    return false;
  }
}
