// Owner: W2 (session). Session Logger, full-screen modal. `?sessionId=` opens an existing log.
import { useLocalSearchParams } from 'expo-router';

import { SessionLoggerScreen } from '@/features/session/screens/SessionLoggerScreen';

export default function Screen() {
  const { appointmentId, sessionId } = useLocalSearchParams<{ appointmentId: string; sessionId?: string }>();
  return <SessionLoggerScreen appointmentId={appointmentId} sessionId={sessionId} />;
}
