// Owner: W2 (session). Session detail: full log for staff, parent snapshot for parents.
import { useLocalSearchParams } from 'expo-router';

import { SessionDetailScreen } from '@/features/session/screens/SessionDetailScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionDetailScreen id={id} />;
}
