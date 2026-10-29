import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { queryClient } from '@/data/queryClient';
import { deviceLanguage, initI18n } from '@/i18n';
import { initErrorReporting } from '@/lib/errorReporting';
import { bootstrapSession } from '@/state/auth-actions';
import { usePreferences } from '@/state/preferences';
import { useSession } from '@/state/session';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { ConfirmHost, ToastHost } from '@/ui';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
initErrorReporting();

function waitForHydration(): Promise<void> {
  const stores = [usePreferences.persist, useSession.persist];
  return Promise.all(
    stores.map((p) => (p.hasHydrated() ? Promise.resolve() : new Promise<void>((res) => p.onFinishHydration(() => res())))),
  ).then(() => undefined);
}

function Shell() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg }, animation: t.reduceMotion ? 'none' : 'default' }} />
      <ToastHost />
      <ConfirmHost />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await waitForHydration();
      initI18n(usePreferences.getState().language ?? deviceLanguage());
      await bootstrapSession();
      if (!cancelled) setBooted(true);
    })().catch(() => setBooted(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = booted && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AppErrorBoundary>
              <Shell />
            </AppErrorBoundary>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
