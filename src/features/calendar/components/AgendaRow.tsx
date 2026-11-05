/** One appointment in a day agenda or list: time, therapy, who, room, status. */
import { router } from 'expo-router';
import { ClipboardCheck, MapPin, UserRoundCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppointmentStatusBadge } from '@/components/AppointmentStatusBadge';
import type { AppointmentView } from '@/domain/types';
import { formatTime } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Row, Stack, Text, TypeTag } from '@/ui';

import { isCancelled } from '../lib/marking';

/** Whose point of view: parents see the therapist, staff see the child, admins see both. */
export type Perspective = 'parent' | 'therapist' | 'admin';

export function AgendaRow({
  appointment: a,
  perspective,
  showChildName = false,
  onPress,
}: {
  appointment: AppointmentView;
  perspective: Perspective;
  /** Parents with more than one child see whose session it is. */
  showChildName?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const cancelled = isCancelled(a);
  const primary = perspective === 'parent' ? a.therapistName : a.childName;
  const secondary =
    perspective === 'admin' ? a.therapistName : perspective === 'parent' && showChildName ? tr('row.for', { name: a.childName }) : undefined;
  const start = formatTime(a.startsAt);
  const end = formatTime(a.endsAt);
  const status = tr(`common:status.${a.displayStatus}`);

  return (
    <Card
      accent={cancelled ? t.colors.borderStrong : a.therapyTypeColor}
      padding={3}
      onPress={onPress ?? (() => router.push(`/appointment/${a.id}`))}
      accessibilityLabel={tr('row.a11y', { therapy: a.therapyTypeName, time: `${start} – ${end}`, name: primary, status })}
      accessibilityHint={tr('card.hint')}
      testID={`agenda-row-${a.id}`}
    >
      <Row gap={3} align="flex-start">
        <View style={{ width: 72, gap: 2, paddingTop: 2 }}>
          <Text
            variant="label"
            weight="semibold"
            color={cancelled ? 'textSubtle' : 'text'}
            style={cancelled ? { textDecorationLine: 'line-through' } : undefined}
          >
            {start}
          </Text>
          <Text variant="caption" color="textSubtle">
            {end}
          </Text>
        </View>
        <Stack gap={1} flex={1}>
          <TypeTag name={a.therapyTypeName} color={cancelled ? t.colors.borderStrong : a.therapyTypeColor} />
          <Text variant="subheading" color={cancelled ? 'textMuted' : 'text'} numberOfLines={1}>
            {primary}
          </Text>
          {secondary ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {secondary}
            </Text>
          ) : null}
          {a.isSubstitute && a.originalTherapistName ? (
            <Row gap={1}>
              <UserRoundCheck size={14} color={t.colors.textMuted} />
              <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
                {tr('row.takingOver', { name: a.originalTherapistName })}
              </Text>
            </Row>
          ) : null}
          {a.room ? (
            <Row gap={1}>
              <MapPin size={14} color={t.colors.textMuted} />
              <Text variant="caption" color="textMuted" numberOfLines={1} accessibilityLabel={tr('detail.room')}>
                {a.room}
              </Text>
            </Row>
          ) : null}
          <Row gap={2} wrap style={{ marginTop: 2 }}>
            <AppointmentStatusBadge status={a.displayStatus} />
            {perspective !== 'parent' && a.hasCheckin && !cancelled ? (
              <Badge label={tr('row.checkinReceived')} tone="success" icon={ClipboardCheck} />
            ) : null}
          </Row>
        </Stack>
      </Row>
    </Card>
  );
}
