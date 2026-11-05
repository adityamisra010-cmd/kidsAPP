// Owner: W7 (reports, import, school settings). Parents open this with audience=parent.
import { useLocalSearchParams } from 'expo-router';

import { ChildReportScreen } from '@/features/reports/ChildReportScreen';

export default function Screen() {
  const { id, from, to, audience } = useLocalSearchParams<{ id: string; from?: string; to?: string; audience?: string }>();
  return <ChildReportScreen id={id} from={from} to={to} audience={audience} />;
}
