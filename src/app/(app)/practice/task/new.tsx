// Owner: W5 (practice). Assign a home task (?childId=&goalId=&resourceId=) or edit one (?taskId=).
import { useLocalSearchParams } from 'expo-router';

import { AssignTaskScreen } from '@/features/practice/screens/AssignTaskScreen';

export default function Screen() {
  const { childId, goalId, resourceId, taskId } = useLocalSearchParams<{ childId?: string; goalId?: string; resourceId?: string; taskId?: string }>();
  return <AssignTaskScreen childId={childId || undefined} goalId={goalId || undefined} resourceId={resourceId || undefined} taskId={taskId || undefined} />;
}
