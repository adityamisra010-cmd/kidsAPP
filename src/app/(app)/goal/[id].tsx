// Owner: W4 (children/goals/progress/people).
import { useLocalSearchParams } from 'expo-router';

import { GoalDetailScreen } from '@/features/goals/screens/GoalDetailScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GoalDetailScreen key={id} goalId={id} />;
}
