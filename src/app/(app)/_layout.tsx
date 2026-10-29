import { Redirect, Stack } from 'expo-router';

import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';

/** Signed-in area. Role tab groups + shared stack screens. */
export default function AppLayout() {
  const t = useTheme();
  const active = useActive();
  if (!active) return <Redirect href="/welcome" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg }, animation: t.reduceMotion ? 'none' : 'default' }}>
      <Stack.Screen name="session/log/[appointmentId]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
    </Stack>
  );
}
