// Owner: W7 (reports, import, school settings).
import { useLocalSearchParams } from 'expo-router';

import { ImportFlowScreen } from '@/features/import/ImportFlowScreen';

export default function Screen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  return <ImportFlowScreen kind={kind} />;
}
