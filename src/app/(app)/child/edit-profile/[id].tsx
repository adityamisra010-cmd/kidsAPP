// Owner: W4 (children/goals/progress/people).
import { useLocalSearchParams } from 'expo-router';

import { EditProfileScreen } from '@/features/children/screens/EditProfileScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditProfileScreen key={id} childId={id} />;
}
