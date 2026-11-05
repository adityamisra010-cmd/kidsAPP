// Owner: W6 (platform admin).
import { useLocalSearchParams } from 'expo-router';

import { SchoolDetailScreen } from '@/features/platform/SchoolDetailScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SchoolDetailScreen id={String(id)} />;
}
