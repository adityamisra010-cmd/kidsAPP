// Owner: W2 (session). Handover Brief for a therapist before a session.
import { useLocalSearchParams } from 'expo-router';

import { HandoverBriefScreen } from '@/features/session/screens/HandoverBriefScreen';

export default function Screen() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  return <HandoverBriefScreen appointmentId={appointmentId} />;
}
