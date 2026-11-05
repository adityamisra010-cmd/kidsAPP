// Owner: W4 (children/goals/progress/people). Optional `?tab=goals|sessions|progress|homeTasks|messages`.
import { useLocalSearchParams } from 'expo-router';

import { ChildWorkspaceScreen, isWorkspaceTab } from '@/features/children/screens/ChildWorkspaceScreen';

export default function Screen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  return <ChildWorkspaceScreen key={id} childId={id} initialTab={isWorkspaceTab(tab) ? tab : undefined} />;
}
