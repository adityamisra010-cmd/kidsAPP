// Owner: W4 (children/goals/progress/people). `id` is the member's user id.
import { useLocalSearchParams } from 'expo-router';

import { MemberScreen } from '@/features/people/screens/MemberScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MemberScreen key={id} userId={id} />;
}
