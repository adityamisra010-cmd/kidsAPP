// Owner: W5 (practice). "This week's home practice" summary for parent Home.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { UUID } from '@/domain/types';
import { Card, ProgressBar, Stack, Text } from '@/ui';

export function HomeTasksCard({ childId }: { childId: UUID }) {
  const repo = useRepo();
  const q = useQuery({ queryKey: key('homePractice', 'weekly', childId), queryFn: () => repo.homePractice.weeklyCompletion(childId) });
  if (!q.data) return null;
  return (
    <Card onPress={() => router.push('/parent/practice')}>
      <Stack gap={2}>
        <Text variant="subheading">{`${q.data.done} / ${q.data.expected}`}</Text>
        <ProgressBar value={q.data.expected ? q.data.done / q.data.expected : 0} />
      </Stack>
    </Card>
  );
}
