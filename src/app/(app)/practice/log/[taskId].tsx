// Owner: W5 (practice). Log home practice (outcome, difficulty, note, optional private video).
import { useLocalSearchParams } from 'expo-router';

import { LogPracticeScreen } from '@/features/practice/screens/LogPracticeScreen';

export default function Screen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  return <LogPracticeScreen taskId={taskId} />;
}
