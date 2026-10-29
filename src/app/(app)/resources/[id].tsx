// Owner: W5 (resources). Resource detail.
import { useLocalSearchParams } from 'expo-router';

import { ResourceDetailScreen } from '@/features/resources/screens/ResourceDetailScreen';

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ResourceDetailScreen id={id} />;
}
