// Owner: W6 (messaging).
import { useLocalSearchParams } from 'expo-router';

import { ThreadScreen } from '@/features/messages/ThreadScreen';

export default function Screen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  return <ThreadScreen threadId={String(threadId)} />;
}
