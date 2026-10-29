// Owner: W3 (calendar). Appointment detail with role actions.
import { useLocalSearchParams } from 'expo-router';

import { AppointmentDetailScreen } from '@/features/calendar';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AppointmentDetailScreen id={id} />;
}
