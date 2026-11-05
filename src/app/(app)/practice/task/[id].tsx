// Owner: W5 (practice). Home task detail.
import { useLocalSearchParams } from 'expo-router';

import { TaskDetailScreen } from '@/features/practice/screens/TaskDetailScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskDetailScreen taskId={id} />;
}
