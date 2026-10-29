/** Header of the appointment detail: when, how long, where, who, recurrence, outcome. */
import { ClipboardCheck, Clock, Info, MapPin, Repeat, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { AppointmentStatusBadge } from '@/components/AppointmentStatusBadge';
import { useAppointment } from '@/data/hooks';
import type { AppointmentView } from '@/domain/types';
import { formatDay, formatTimeRange, relativeDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Card, Divider, Row, Stack, Text, TypeTag } from '@/ui';

import { formatWeekdayList } from '../lib/recurrence';
import { durationMinutes } from '../lib/slots';

function InfoLine({ icon: Icon, text, muted }: { icon: LucideIcon; text: string; muted?: boolean }) {
  const t = useTheme();
  return (
    <Row gap={2} align="flex-start">
      <Icon size={18} color={t.colors.textMuted} style={{ marginTop: 2 }} />
      <Text variant="label" color={muted ? 'textMuted' : 'text'} style={{ flex: 1 }}>
        {text}
      </Text>
    </Row>
  );
}

function Person({ label, name, uri, note }: { label: string; name: string; uri?: string; note?: string }) {
  return (
    <Row gap={3}>
      <Avatar name={name} uri={uri} size={44} />
      <Stack gap={0} flex={1}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        {note ? (
          <Text variant="caption" color="textMuted">
            {note}
          </Text>
        ) : null}
      </Stack>
    </Row>
  );
}

export function AppointmentHeaderCard({
  appointment: a,
  seriesWeekdays,
  showCheckin,
}: {
  appointment: AppointmentView;
  /** Inferred weekdays when the appointment belongs to a series; empty while unknown. */
  seriesWeekdays: number[];
  showCheckin: boolean;
}) {
  const { t } = useTranslation('calendar');
  const missed = useAppointment(a.makeupOfId);
  const day = relativeDay(a.startsAt, { today: t('day.today'), tomorrow: t('day.tomorrow') });
  const fullDay = formatDay(a.startsAt);
  const shortNames = [0, 1, 2, 3, 4, 5, 6].map((d) => t(`weekdays.short.${d}`));
  const recurrence = a.seriesId
    ? seriesWeekdays.length
      ? t('recurrence.every', { days: formatWeekdayList(seriesWeekdays, shortNames) })
      : null
    : t('recurrence.oneOff');

  return (
    <Card accent={a.therapyTypeColor} padding={5} testID="appointment-header">
      <Stack gap={4}>
        <Row justify="between" align="flex-start" gap={2} wrap>
          <TypeTag name={a.therapyTypeName} color={a.therapyTypeColor} />
          <AppointmentStatusBadge status={a.displayStatus} />
        </Row>
        <Stack gap={1}>
          <Text variant="title">{day === fullDay ? fullDay : `${day} · ${fullDay}`}</Text>
          <Text variant="heading" color="textMuted">
            {formatTimeRange(a.startsAt, a.endsAt)}
          </Text>
        </Stack>
        <Stack gap={2}>
          <InfoLine icon={Clock} text={t('detail.duration', { count: durationMinutes(a.startsAt, a.endsAt) })} />
          <InfoLine icon={MapPin} text={a.room ?? t('detail.noRoom')} muted={!a.room} />
          {recurrence ? <InfoLine icon={Repeat} text={recurrence} /> : null}
          {a.makeupOfId && missed.data ? <InfoLine icon={Info} text={t('detail.makeupFor', { date: formatDay(missed.data.startsAt) })} /> : null}
          {a.attendance ? (
            <InfoLine icon={ClipboardCheck} text={t(`detail.attendance.${a.attendance}`, { count: a.lateMinutes ?? 0 })} />
          ) : null}
          {a.cancelReason ? <InfoLine icon={Info} text={t('detail.cancelReason', { reason: a.cancelReason })} muted /> : null}
          {showCheckin && a.hasCheckin ? <InfoLine icon={ClipboardCheck} text={t('detail.checkinDone')} /> : null}
        </Stack>
        <Divider />
        <Stack gap={3}>
          <Person label={t('detail.child')} name={a.childName} uri={a.childPhotoUrl} />
          <Person
            label={t('detail.therapist')}
            name={a.therapistName}
            uri={a.therapistAvatarUrl}
            note={a.isSubstitute && a.originalTherapistName ? t('detail.takingOver', { name: a.originalTherapistName }) : undefined}
          />
        </Stack>
      </Stack>
    </Card>
  );
}
