import { router } from 'expo-router';
import type { TFunction } from 'i18next';

import { useOutboxStore } from '@/data/outbox';
import { clearReminders } from '@/features/push';
import { signOut } from '@/state/auth-actions';
import { useSession } from '@/state/session';
import { confirm, toast } from '@/ui';

async function doSignOut(next: '/welcome' | '/demo') {
  await clearReminders();
  try {
    await signOut();
  } finally {
    router.replace(next);
  }
}

/** Asks first, and warns when changes saved on this phone haven't synced yet. */
export async function confirmSignOut(t: TFunction): Promise<void> {
  const isDemo = useSession.getState().mode === 'demo';
  const waiting = useOutboxStore.getState().items.length;
  const ok = await confirm({
    title: t('settings:signOut.title'),
    body: isDemo
      ? t('settings:signOut.bodyDemo')
      : waiting > 0
        ? t('settings:signOut.bodyUnsynced', { count: waiting })
        : t('settings:signOut.body'),
    confirmLabel: t('settings:signOut.confirm'),
    destructive: !isDemo && waiting > 0,
  });
  if (!ok) return;
  try {
    await doSignOut('/welcome');
  } catch {
    toast.error(t('errors:unknown'));
  }
}

/** Demo only: back to the role picker without a confirmation (nothing real to lose). */
export async function switchDemoRole(): Promise<void> {
  await doSignOut('/demo');
}
