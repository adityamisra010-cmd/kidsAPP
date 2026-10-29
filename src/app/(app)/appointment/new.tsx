// Owner: W3 (calendar). Coordinator / school admin: new schedule (optional ?childId=&date=).
import { useLocalSearchParams } from 'expo-router';

import { NewScheduleScreen } from '@/features/calendar';

export default function Screen() {
  const { childId, date } = useLocalSearchParams<{ childId?: string; date?: string }>();
  return <NewScheduleScreen childId={childId} date={date} />;
}
