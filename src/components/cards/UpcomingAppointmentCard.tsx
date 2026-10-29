// Owner: W3 (calendar). Used on parent Home and therapist Today.
import { router } from 'expo-router';
import { Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { AppointmentView } from '@/domain/types';
import { formatTimeRange, relativeDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Card, Row, Stack, Text, TypeTag } from '@/ui';

import { AppointmentStatusBadge } from '../AppointmentStatusBadge';

export function UpcomingAppointmentCard({ appointment: a, showChild = true }: { appointment: AppointmentView; showChild?: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const day = relativeDay(a.startsAt, { today: tr('common:time.today'), tomorrow: tr('common:time.tomorrow') });
  return (
    <Card accent={a.therapyTypeColor} onPress={() => router.push(`/appointment/${a.id}`)} accessibilityLabel={`${a.therapyTypeName}, ${day}, ${formatTimeRange(a.startsAt, a.endsAt)}, ${a.therapistName}`}>
      <Row gap={3} align="flex-start">
        {showChild ? <Avatar name={a.childName} uri={a.childPhotoUrl} size={52} /> : null}
        <Stack gap={1} flex={1}>
          <TypeTag name={a.therapyTypeName} color={a.therapyTypeColor} />
          <Text variant="subheading">{showChild ? a.childName : a.therapistName}</Text>
          {showChild ? <Text variant="caption" color="textMuted">{a.therapistName}</Text> : null}
          <Row gap={2}>
            <Clock size={16} color={t.colors.textMuted} />
            <Text variant="label">{`${day} · ${formatTimeRange(a.startsAt, a.endsAt)}`}</Text>
          </Row>
          <AppointmentStatusBadge status={a.displayStatus} />
        </Stack>
      </Row>
    </Card>
  );
}
