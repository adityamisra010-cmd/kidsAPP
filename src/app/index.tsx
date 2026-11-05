import { Redirect } from 'expo-router';

import { homeRouteFor, useActive, useSession } from '@/state/session';

/** Entry: route to welcome, consent, or the role's home. */
export default function Index() {
  const active = useActive();
  const consentDone = useSession((s) => s.consentDone);
  if (!active) return <Redirect href="/welcome" />;
  if (active.role === 'parent' && !consentDone) return <Redirect href="/consent" />;
  return <Redirect href={homeRouteFor(active.role)} />;
}
