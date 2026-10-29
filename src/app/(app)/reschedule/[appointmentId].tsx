// Owner: W3 (calendar). Parent: request a change to a session.
import { useLocalSearchParams } from 'expo-router';

import { RescheduleRequestScreen } from '@/features/calendar';

export default function Screen() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  return <RescheduleRequestScreen appointmentId={appointmentId} />;
}
