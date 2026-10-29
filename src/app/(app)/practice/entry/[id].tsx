// Owner: W5 (practice). One practice log: review (staff) or read feedback (parent). Optional ?taskId=.
import { useLocalSearchParams } from 'expo-router';

import { LogEntryScreen } from '@/features/practice/screens/LogEntryScreen';

export default function Screen() {
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId?: string }>();
  // Keyed by id so moving to the next review item starts with a fresh form.
  return <LogEntryScreen key={id} logId={id} taskId={taskId || undefined} />;
}
