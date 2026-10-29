// Owner: W4 (children/goals/progress/people).
import { useLocalSearchParams } from 'expo-router';

import { NewGoalScreen } from '@/features/goals/screens/NewGoalScreen';

export default function Screen() {
  const { childId } = useLocalSearchParams<{ childId?: string }>();
  return <NewGoalScreen key={childId} childId={childId || undefined} />;
}
