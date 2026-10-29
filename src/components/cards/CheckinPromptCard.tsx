// Owner: W5 (practice). Morning check-in prompt on session days.
import { router } from 'expo-router';
import { ClipboardCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { AppointmentView } from '@/domain/types';
import { firstName, greetingKey } from '@/features/practice/logic';
import { formatTime } from '@/lib/dates';
import { Avatar, Button, Card, Row, Stack, Text } from '@/ui';

export function CheckinPromptCard({ appointment }: { appointment: AppointmentView }) {
  const { t } = useTranslation('practice');
  const name = firstName(appointment.childName);
  return (
    <Card tone="primary" testID="checkin-prompt">
      <Stack gap={4}>
        <Row gap={3} align="flex-start">
          <Avatar name={appointment.childName} uri={appointment.childPhotoUrl} size={48} />
          <Stack gap={1} flex={1}>
            <Text variant="heading">{t(`checkin.greeting.${greetingKey()}`, { name })}</Text>
            <Text variant="label" color="textMuted">
              {t('checkin.promptSession', {
                therapy: appointment.therapyTypeName,
                time: formatTime(appointment.startsAt),
                therapist: appointment.therapistName,
              })}
            </Text>
          </Stack>
        </Row>
        <Button
          label={t('checkin.promptStart')}
          icon={ClipboardCheck}
          size="lg"
          fullWidth
          onPress={() => router.push(`/checkin/${appointment.id}`)}
          accessibilityHint={t('checkin.promptHint')}
        />
      </Stack>
    </Card>
  );
}
