/**
 * Notifications wiring for the signed-in app. Call once in `src/app/(app)/_layout.tsx` and render
 * what it returns (the one-time explanation sheet).
 *
 * - Android channels + foreground behaviour (calm: banner + list, no sound while the app is open).
 * - Tap on a notification → `router.push(data.route)` (also when the tap launched the app).
 * - Permission: explained once in-app after sign-in, never asked on cold start.
 * - When granted: Expo push token registered (real backend only), and local reminders kept in
 *   sync with upcoming appointments, the school's reminder settings and the user's muted kinds.
 */
import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useMutedKinds, useOrgSafe } from '@/features/account/queries';
import { getRepo } from '@/data';
import { key } from '@/data/queryClient';
import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import { useActive, useSession } from '@/state/session';

import { ensureChannels } from './channels';
import { markExplained, refreshPermission, requestPermission, usePushPermission, wasExplained } from './permission';
import { PermissionSheet } from './PermissionSheet';
import { planReminders } from './plan';
import { registerPushToken } from './registerToken';
import { clearReminders, syncReminders } from './scheduler';

const isNative = Platform.OS !== 'web';
/** Demo reminders cover one day only, so a pitch phone isn't pinged about sample children all week. */
const DEMO_HORIZON_HOURS = 24;
const EXPLAIN_DELAY_MS = 1200;

let handlerSet = false;
function configureForeground() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

function routeOf(response: Notifications.NotificationResponse | null): string | null {
  const route = response?.notification.request.content.data?.route;
  return typeof route === 'string' && route.startsWith('/') ? route : null;
}

export function useNotificationsSetup(): ReactElement | null {
  const { t, i18n } = useTranslation();
  const active = useActive();
  const mode = useSession((s) => s.mode);
  const permission = usePushPermission((s) => s.state);
  const [explainOpen, setExplainOpen] = useState(false);
  const handledResponses = useRef(new Set<string>());
  const tokenRegisteredFor = useRef<string | null>(null);

  const role = active?.role;
  const userKey = active ? `${active.user.profile.id}:${active.membership.id}` : null;
  const wantsReminders = isNative && permission === 'granted' && (role === 'parent' || role === 'therapist');

  // 1. Channels + foreground behaviour (channel names follow the app language).
  useEffect(() => {
    if (!isNative) return;
    configureForeground();
    void ensureChannels(t);
  }, [t, i18n.language]);

  // 2. Taps, including the one that opened the app.
  useEffect(() => {
    if (!isNative) return;
    const handle = (response: Notifications.NotificationResponse | null) => {
      const route = routeOf(response);
      const id = response?.notification.request.identifier;
      if (!route || !id || handledResponses.current.has(id)) return;
      handledResponses.current.add(id);
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // Older native module: the handled-id set still prevents a second navigation.
      }
      router.push(route);
    };
    try {
      handle(Notifications.getLastNotificationResponse());
    } catch {
      // Not available on this platform/build.
    }
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);

  // 3. Explain once, after sign-in (not on cold start of a signed-out app).
  useEffect(() => {
    if (!isNative || !userKey) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const p = await refreshPermission();
        if (cancelled || p.state === 'granted' || !p.canAskAgain) return;
        if (await wasExplained()) return;
        if (!cancelled) setExplainOpen(true);
      })();
    }, EXPLAIN_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userKey]);

  // 4. Server push token (real backend only; the demo has no server to push from).
  useEffect(() => {
    if (!isNative || permission !== 'granted' || mode !== 'supabase' || !userKey) return;
    if (tokenRegisteredFor.current === userKey) return;
    tokenRegisteredFor.current = userKey;
    void registerPushToken(getRepo());
  }, [permission, mode, userKey]);

  // 5. Local reminders.
  const upcoming = useQuery({
    queryKey: key('appointments', 'upcoming', 'reminders', userKey),
    queryFn: () => getRepo().appointments.upcoming({ limit: 100 }),
    enabled: wantsReminders && !!userKey,
    staleTime: 5 * 60_000,
    refetchInterval: 30 * 60_000,
  });
  const muted = useMutedKinds(wantsReminders);
  const org = useOrgSafe(wantsReminders);
  const settings = org.data?.settings ?? active?.organization?.settings ?? DEFAULT_ORG_SETTINGS;

  const plan = useMemo(() => {
    if (!wantsReminders || !role || !upcoming.data || !muted.data) return null;
    return planReminders({
      appointments: upcoming.data,
      role,
      settings,
      muted: muted.data,
      now: new Date(),
      horizonHours: mode === 'demo' ? DEMO_HORIZON_HOURS : undefined,
    });
  }, [wantsReminders, role, upcoming.data, muted.data, settings, mode]);

  useEffect(() => {
    if (!isNative) return;
    if (!userKey) {
      void clearReminders();
      return;
    }
    if (plan) void syncReminders(plan, t);
    else if (permission === 'granted' && role !== 'parent' && role !== 'therapist') void clearReminders();
  }, [plan, userKey, permission, role, t, i18n.language]);

  if (!isNative || !role) return null;

  const close = () => {
    setExplainOpen(false);
    void markExplained();
  };

  return (
    <PermissionSheet
      visible={explainOpen}
      role={role}
      quietHours={settings.quietHours}
      onDismiss={close}
      onAllow={() => {
        close();
        void requestPermission();
      }}
    />
  );
}
