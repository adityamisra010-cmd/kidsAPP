/**
 * Applies a reminder plan to the device, idempotently. We remember the identifiers we scheduled
 * (and a signature of each) in AsyncStorage, cancel the ones that disappeared or changed, and
 * schedule only what is new. Calls are serialised so overlapping refreshes can't race.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { TFunction } from 'i18next';
import { Platform } from 'react-native';

import { diffSchedule, ID_PREFIX, type PlannedReminder } from './plan';
import { reminderSignature, reminderText } from './text';

const STORE_KEY = 'mkt.push.scheduled.v1';

async function readStore(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function writeStore(v: Record<string, string>) {
  try {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    // Worst case we re-schedule next time; identifiers are stable so nothing duplicates.
  }
}

async function apply(plan: PlannedReminder[], t: TFunction) {
  const previous = await readStore();
  const items = plan.map((r) => {
    const text = reminderText(t, r);
    return { r, text, id: r.id, signature: reminderSignature(r, text) };
  });
  const { cancel, schedule } = diffSchedule(previous, items);

  await Promise.all(cancel.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));

  const kept: Record<string, string> = {};
  const toSchedule = new Set(schedule);
  for (const item of items) {
    if (!toSchedule.has(item.id)) {
      kept[item.id] = item.signature;
      continue;
    }
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: item.id,
        content: {
          title: item.text.title,
          body: item.text.body,
          data: { route: item.r.route, kind: item.r.muteKind },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.r.fireAt, channelId: 'reminders' },
      });
      kept[item.id] = item.signature;
    } catch {
      // Skip this one; it will be retried on the next refresh.
    }
  }
  await writeStore(kept);
}

let chain: Promise<void> = Promise.resolve();

/** Make the device's scheduled reminders match `plan`. */
export function syncReminders(plan: PlannedReminder[], t: TFunction): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  chain = chain.then(() => apply(plan, t)).catch(() => undefined);
  return chain;
}

/** Cancel every reminder this app scheduled (sign-out, role switch to staff without reminders). */
export function clearReminders(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  chain = chain
    .then(async () => {
      const previous = await readStore();
      const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
      const ours = new Set([...Object.keys(previous), ...all.map((n) => n.identifier).filter((id) => id.startsWith(ID_PREFIX))]);
      await Promise.all([...ours].map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
      await writeStore({});
    })
    .catch(() => undefined);
  return chain;
}
