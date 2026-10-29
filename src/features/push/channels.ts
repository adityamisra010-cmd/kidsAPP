/**
 * Android notification channels. Three calm channels; nothing is "urgent" or heads-up by default.
 * Server pushes (Edge Functions) should set `channelId` using `channelForKind`.
 */
import { AndroidImportance, AndroidNotificationVisibility, setNotificationChannelAsync } from 'expo-notifications';
import type { TFunction } from 'i18next';
import { Platform } from 'react-native';

import type { NotificationKind } from '@/domain/types';
import { BRAND } from '@/theme/brand';

export type ChannelId = 'reminders' | 'messages' | 'updates';

export function channelForKind(kind: NotificationKind): ChannelId {
  switch (kind) {
    case 'appointment_reminder':
    case 'appointment_changed':
    case 'substitute_assigned':
    case 'reschedule_request':
    case 'reschedule_response':
    case 'daily_agenda':
    case 'unlogged_session':
      return 'reminders';
    case 'new_message':
      return 'messages';
    default:
      return 'updates';
  }
}

export async function ensureChannels(t: TFunction): Promise<void> {
  if (Platform.OS !== 'android') return;
  const common = {
    lightColor: BRAND.primary,
    // Child names stay hidden on a locked screen.
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    showBadge: true,
  };
  await Promise.all([
    setNotificationChannelAsync('reminders', {
      ...common,
      name: t('settings:push.channels.reminders'),
      description: t('settings:push.channels.remindersBody'),
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180],
      sound: 'default',
    }),
    setNotificationChannelAsync('messages', {
      ...common,
      name: t('settings:push.channels.messages'),
      description: t('settings:push.channels.messagesBody'),
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0, 120],
      sound: 'default',
    }),
    setNotificationChannelAsync('updates', {
      ...common,
      name: t('settings:push.channels.updates'),
      description: t('settings:push.channels.updatesBody'),
      importance: AndroidImportance.LOW,
      enableVibrate: false,
      sound: null,
    }),
  ]).catch(() => undefined);
}
