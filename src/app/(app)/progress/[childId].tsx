// Owner: W4 (children/goals/progress/people).
import { useLocalSearchParams } from 'expo-router';

import { StaffProgressScreen } from '@/features/progress/screens/StaffProgressScreen';

export default function Screen() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return <StaffProgressScreen key={childId} childId={childId} />;
}
