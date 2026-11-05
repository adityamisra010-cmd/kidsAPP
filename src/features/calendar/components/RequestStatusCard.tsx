/** Latest reschedule request for an appointment; parents can accept a counter-proposal here. */
import { CalendarCheck, CalendarClock, CalendarX, Clock } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRepo } from '@/data';
import type { AppointmentView, ISODateTime, Role } from '@/domain/types';
import { formatDay, formatTime, timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, errorMessageKey, Row, Stack, Text, toast } from '@/ui';

import { latestRequestFor } from '../lib/requests';
import { useRescheduleRequests, useScheduleMutation } from '../queries';

export const slotLabel = (iso: ISODateTime) => `${formatDay(iso)}, ${formatTime(iso)}`;

export function RequestStatusCard({ appointment: a, role }: { appointment: AppointmentView; role: Role }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const repo = useRepo();
  const requests = useRescheduleRequests({ childId: a.childId });
  const [accepting, setAccepting] = useState<string | null>(null);
  const accept = useScheduleMutation((v: { id: string; slot: ISODateTime }) => repo.appointments.acceptCounter(v.id, v.slot));
  const r = latestRequestFor(requests.data ?? [], a.id);
  if (!r) return null;

  const onAccept = async (slot: ISODateTime) => {
    setAccepting(slot);
    try {
      await accept.mutateAsync({ id: r.id, slot });
      toast.success(tr('request.accepted', { when: slotLabel(slot) }));
    } catch (e) {
      toast.error(tr(errorMessageKey(e)));
    } finally {
      setAccepting(null);
    }
  };

  const note = r.resolution?.note ? (
    <Text variant="label" color="textMuted">
      {tr('request.note', { note: r.resolution.note })}
    </Text>
  ) : null;

  if (r.status === 'pending') {
    return (
      <Card tone="info" testID="request-status">
        <Stack gap={2}>
          <Row gap={2}>
            <Clock size={18} color={t.colors.info} />
            <Text variant="subheading" tint={t.colors.info}>
              {tr('request.pendingTitle')}
            </Text>
          </Row>
          <Text color="textMuted">{tr('request.pendingBody')}</Text>
          <Text variant="label" weight="semibold">
            {tr('request.yourOptions')}
          </Text>
          {r.proposedSlots.map((s) => (
            <Text key={s} variant="label">{`• ${slotLabel(s)}`}</Text>
          ))}
          {r.reason ? (
            <Text variant="caption" color="textMuted">
              {tr('request.reason', { reason: r.reason })}
            </Text>
          ) : null}
          {role !== 'parent' ? (
            <Text variant="caption" color="textMuted">
              {tr('request.requestedBy', { name: r.requestedByName, ago: timeAgo(r.createdAt) })}
            </Text>
          ) : null}
        </Stack>
      </Card>
    );
  }

  if (r.status === 'countered') {
    const slots = r.resolution?.counterSlots ?? [];
    return (
      <Card tone="primary" testID="request-status">
        <Stack gap={3}>
          <Row gap={2}>
            <CalendarClock size={18} color={t.colors.primaryText} />
            <Text variant="subheading" tint={t.colors.primaryText} style={{ flex: 1 }}>
              {tr('request.counteredTitle')}
            </Text>
          </Row>
          {note}
          {role === 'parent' ? (
            <>
              <Text color="textMuted">{tr('request.counteredBody')}</Text>
              {slots.map((s) => (
                <Card key={s} padding={3} elevated={false}>
                  <Row gap={3} justify="between">
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {slotLabel(s)}
                    </Text>
                    <Button
                      size="sm"
                      label={tr('request.accept')}
                      accessibilityHint={slotLabel(s)}
                      loading={accepting === s}
                      disabled={!!accepting && accepting !== s}
                      onPress={() => void onAccept(s)}
                      testID={`accept-${s}`}
                    />
                  </Row>
                </Card>
              ))}
            </>
          ) : (
            slots.map((s) => <Text key={s} variant="label">{`• ${slotLabel(s)}`}</Text>)
          )}
        </Stack>
      </Card>
    );
  }

  const approved = r.status === 'approved';
  return (
    <Card tone={approved ? 'success' : 'sunken'} elevated={false} testID="request-status">
      <Stack gap={2}>
        <Row gap={2}>
          {approved ? <CalendarCheck size={18} color={t.colors.success} /> : <CalendarX size={18} color={t.colors.textMuted} />}
          <Text variant="subheading" tint={approved ? t.colors.success : t.colors.text}>
            {approved ? tr('request.approvedTitle') : tr('request.declinedTitle')}
          </Text>
        </Row>
        {approved ? (
          r.resolution?.chosenSlot ? <Text color="textMuted">{tr('request.approvedBody', { when: slotLabel(r.resolution.chosenSlot) })}</Text> : null
        ) : (
          <Text color="textMuted">{tr('request.declinedBody')}</Text>
        )}
        {note}
      </Stack>
    </Card>
  );
}
