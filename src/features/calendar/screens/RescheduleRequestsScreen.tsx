/** `/reschedule/requests` (coordinator): pending first, then waiting on parents, then history. */
import { router } from 'expo-router';
import { CalendarCheck, CalendarClock, CalendarX } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDay, formatTimeRange, timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Button, Card, EmptyState, QueryView, Row, Screen, SectionHeader, SkeletonList, Stack, Text, TypeTag, type Tone } from '@/ui';

import { ApproveSheet, CounterSheet, DeclineSheet, type RequestWithAppointment } from '../components/RequestSheets';
import { slotLabel } from '../components/RequestStatusCard';
import { partitionRequests } from '../lib/requests';
import { useRescheduleRequests } from '../queries';

const MAX_HISTORY = 20;
type Answer = 'approve' | 'counter' | 'decline';

const STATUS: Record<RequestWithAppointment['status'], { tone: Tone; key: string; icon: typeof CalendarCheck }> = {
  pending: { tone: 'warning', key: 'requests.statusPending', icon: CalendarClock },
  countered: { tone: 'info', key: 'requests.statusCountered', icon: CalendarClock },
  approved: { tone: 'success', key: 'requests.statusApproved', icon: CalendarCheck },
  declined: { tone: 'neutral', key: 'requests.statusDeclined', icon: CalendarX },
};

function RequestCard({ request: r, onAnswer }: { request: RequestWithAppointment; onAnswer?: (a: Answer) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const a = r.appointment;
  const s = STATUS[r.status];
  const slots = r.status === 'countered' ? (r.resolution?.counterSlots ?? []) : r.proposedSlots;
  return (
    <Card accent={a.therapyTypeColor} testID={`request-${r.id}`}>
      <Stack gap={3}>
        <Row gap={3} align="flex-start">
          <Avatar name={a.childName} uri={a.childPhotoUrl} size={44} />
          <Stack gap={1} flex={1}>
            <Text variant="subheading" numberOfLines={1}>
              {a.childName}
            </Text>
            <TypeTag name={a.therapyTypeName} color={a.therapyTypeColor} />
          </Stack>
          <Badge label={tr(s.key)} tone={s.tone} icon={s.icon} />
        </Row>
        <Card tone="sunken" elevated={false} padding={3} onPress={() => router.push(`/appointment/${a.id}`)} accessibilityHint={tr('card.hint')}>
          <Text variant="caption" color="textMuted">
            {tr('reschedule.current')}
          </Text>
          <Text variant="label" weight="semibold">{`${formatDay(a.startsAt)}, ${formatTimeRange(a.startsAt, a.endsAt)}`}</Text>
          <Text variant="caption" color="textMuted">
            {a.therapistName}
          </Text>
        </Card>
        <Stack gap={1}>
          <Text variant="label" weight="semibold">
            {r.status === 'countered' ? tr('requests.offered') : tr('requests.proposed')}
          </Text>
          {slots.map((x) => (
            <Text key={x} variant="label">{`• ${slotLabel(x)}`}</Text>
          ))}
          {r.status === 'approved' && r.resolution?.chosenSlot ? <Text variant="label" color="success">{tr('request.approvedBody', { when: slotLabel(r.resolution.chosenSlot) })}</Text> : null}
        </Stack>
        {r.reason ? <Text color="textMuted">{tr('request.reason', { reason: r.reason })}</Text> : null}
        {r.resolution?.note ? (
          <Text variant="caption" color="textMuted">
            {tr('request.note', { note: r.resolution.note })}
          </Text>
        ) : null}
        <Text variant="caption" color="textSubtle">
          {tr('request.requestedBy', { name: r.requestedByName, ago: timeAgo(r.createdAt) })}
        </Text>
        {onAnswer ? (
          <Row gap={2} wrap style={{ marginTop: t.space[1] }}>
            <Button size="sm" label={tr('requests.approve')} icon={CalendarCheck} onPress={() => onAnswer('approve')} testID={`approve-${r.id}`} />
            <Button size="sm" variant="secondary" label={tr('requests.counter')} icon={CalendarClock} onPress={() => onAnswer('counter')} />
            <Button size="sm" variant="ghost" label={tr('requests.decline')} onPress={() => onAnswer('decline')} />
          </Row>
        ) : null}
      </Stack>
    </Card>
  );
}

export function RescheduleRequestsScreen() {
  const { t } = useTranslation('calendar');
  const q = useRescheduleRequests();
  const [open, setOpen] = useState<{ request: RequestWithAppointment; kind: Answer } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const close = () => setOpen(null);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen title={t('requests.title')} back refreshing={refreshing} onRefresh={() => void onRefresh()} testID="requests-screen">
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={3} height={200} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={t('requests.emptyTitle')} body={t('requests.emptyBody')} />}
      >
        {(data) => {
          const p = partitionRequests(data);
          return (
            <Stack gap={4}>
              <SectionHeader title={t('requests.pending')} subtitle={p.pending.length ? undefined : t('admin.allClear')} />
              {p.pending.map((r) => (
                <RequestCard key={r.id} request={r} onAnswer={(kind) => setOpen({ request: r, kind })} />
              ))}
              {p.countered.length ? <SectionHeader title={t('requests.countered')} /> : null}
              {p.countered.map((r) => (
                <RequestCard key={r.id} request={r} />
              ))}
              {p.resolved.length ? <SectionHeader title={t('requests.resolved')} /> : null}
              {p.resolved.slice(0, MAX_HISTORY).map((r) => (
                <RequestCard key={r.id} request={r} />
              ))}
            </Stack>
          );
        }}
      </QueryView>
      {open ? (
        <>
          <ApproveSheet request={open.request} visible={open.kind === 'approve'} onClose={close} />
          <CounterSheet request={open.request} visible={open.kind === 'counter'} onClose={close} />
          <DeclineSheet request={open.request} visible={open.kind === 'decline'} onClose={close} />
        </>
      ) : null}
    </Screen>
  );
}
