// Owner: W5 (practice). Morning check-in prompt on session days.
import { router } from 'expo-router';

import type { AppointmentView } from '@/domain/types';
import { Button, Card, Stack, Text } from '@/ui';

export function CheckinPromptCard({ appointment }: { appointment: AppointmentView }) {
  return (
    <Card tone="primary">
      <Stack gap={3}>
        <Text variant="subheading">{appointment.childName}</Text>
        <Button label="Check in" onPress={() => router.push(`/checkin/${appointment.id}`)} />
      </Stack>
    </Card>
  );
}
