// Owner: W3 (calendar). Used on parent Home and therapist Today.
import { router } from 'expo-router';
import { Clock, MapPin, UserRoundCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { AppointmentView } from '@/domain/types';
import { startsIn } from '@/features/calendar/lib/actions';
import { formatTimeRange, relativeDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Card, Row, Stack, Text, TypeTag } from '@/ui';

import { AppointmentStatusBadge } from '../AppointmentStatusBadge';

/**
 * Next session at a glance: who, what, when, where and its status. `showChild` (default) leads with
 * the child's photo and name; turn it off where the child is already obvious to lead with the therapist.
 */
export function UpcomingAppointmentCard({ appointment: a, showChild = true }: { appointment: AppointmentView; showChild?: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const day = relativeDay(a.startsAt, { today: tr('day.today'), tomorrow: tr('day.tomorrow') });
  const time = formatTimeRange(a.startsAt, a.endsAt);
  const soon = startsIn(a, new Date());
  const soonLabel = !soon
    ? null
    : soon.kind === 'now'
      ? tr('card.happeningNow')
      : soon.kind === 'minutes'
        ? tr('card.startsInMinutes', { count: soon.value })
        : tr('card.startsInHours', { count: soon.value });
  const title = showChild ? a.childName : a.therapistName;
  const status = tr(`common:status.${a.displayStatus}`);
  const takingOver = a.isSubstitute && a.originalTherapistName ? tr('row.takingOver', { name: a.originalTherapistName }) : null;

  return (
    <Card
      accent={a.therapyTypeColor}
      onPress={() => router.push(`/appointment/${a.id}`)}
      accessibilityLabel={[a.therapyTypeName, title, showChild ? a.therapistName : null, `${day}, ${time}`, soonLabel, status, takingOver].filter(Boolean).join(', ')}
      accessibilityHint={tr('card.hint')}
      testID={`upcoming-${a.id}`}
    >
      <Row gap={3} align="flex-start">
        <Avatar name={title} uri={showChild ? a.childPhotoUrl : a.therapistAvatarUrl} size={56} />
        <Stack gap={1} flex={1}>
          <Row justify="between" gap={2} align="flex-start">
            <TypeTag name={a.therapyTypeName} color={a.therapyTypeColor} />
            <AppointmentStatusBadge status={a.displayStatus} />
          </Row>
          <Text variant="heading" numberOfLines={1}>
            {title}
          </Text>
          {showChild ? (
            <Text color="textMuted" numberOfLines={1}>
              {a.therapistName}
            </Text>
          ) : null}
          {takingOver ? (
            <Row gap={1}>
              <UserRoundCheck size={15} color={t.colors.info} />
              <Text variant="label" color="info" numberOfLines={1} style={{ flex: 1 }}>
                {takingOver}
              </Text>
            </Row>
          ) : null}
          <Row gap={2} style={{ marginTop: 4 }}>
            <Clock size={16} color={t.colors.textMuted} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>{`${day} · ${time}`}</Text>
          </Row>
          {a.room ? (
            <Row gap={2}>
              <MapPin size={16} color={t.colors.textMuted} />
              <Text variant="label" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
                {a.room}
              </Text>
            </Row>
          ) : null}
          {soonLabel ? (
            <Text variant="label" color="primaryText" weight="semibold" accessibilityLiveRegion="polite">
              {soonLabel}
            </Text>
          ) : null}
        </Stack>
      </Row>
    </Card>
  );
}
