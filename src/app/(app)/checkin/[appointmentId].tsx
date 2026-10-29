// Owner: W5 (practice). Morning check-in before a session.
import { useLocalSearchParams } from 'expo-router';

import { CheckinScreen } from '@/features/checkins/CheckinScreen';

export default function Screen() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  return <CheckinScreen appointmentId={appointmentId} />;
}
