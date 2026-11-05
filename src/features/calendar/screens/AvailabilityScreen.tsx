/** `/availability`: therapists manage their own leave; coordinators and admins manage anyone's. */
import { router } from 'expo-router';
import { CalendarOff, Plus, Trash2, UserRoundCog } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRepo } from '@/data';
import { useMembers } from '@/data/hooks';
import type { AppointmentView, TherapistUnavailability, UUID } from '@/domain/types';
import { daysBetween, formatDay, toISODate } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Chip, confirm, EmptyState, errorMessageKey, QueryView, Row, Screen, SectionHeader, SkeletonList, Stack, Text, toast } from '@/ui';

import { LeaveSheet } from '../components/LeaveSheet';
import { isAdminRole } from '../lib/actions';
import { useScheduleMutation, useUnavailability } from '../queries';

function LeaveCard({ leave: l, name, onRemove }: { leave: TherapistUnavailability; name?: string; onRemove?: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const range = l.from === l.to ? tr('availability.oneDay', { date: formatDay(l.from) }) : tr('availability.range', { from: formatDay(l.from), to: formatDay(l.to) });
  return (
    <Card padding={4} testID={`leave-${l.id}`}>
      <Row gap={3} align="flex-start">
        <CalendarOff size={22} color={t.colors.textMuted} style={{ marginTop: 2 }} />
        <Stack gap={1} flex={1}>
          {name ? <Text variant="subheading">{name}</Text> : null}
          <Text variant={name ? 'label' : 'subheading'}>{range}</Text>
          <Text variant="caption" color="textMuted">
            {`${tr('availability.days', { count: daysBetween(l.from, l.to) + 1 })} · ${l.reason}`}
          </Text>
        </Stack>
        {onRemove ? (
          <Button size="sm" variant="ghost" icon={Trash2} label={tr('availability.remove')} accessibilityHint={tr('availability.removeA11y', { range })} onPress={onRemove} />
        ) : null}
      </Row>
    </Card>
  );
}

export function AvailabilityScreen() {
  const { t } = useTranslation('calendar');
  const repo = useRepo();
  const active = useRequiredActive();
  const admin = isAdminRole(active.role);
  const me = active.user.profile.id;
  const members = useMembers(['therapist', 'coordinator']);
  const staff = useMemo(() => (members.data ?? []).filter((m) => m.membership.status === 'active').sort((a, b) => a.profile.fullName.localeCompare(b.profile.fullName)), [members.data]);
  const [selected, setSelected] = useState<UUID | undefined>(admin ? undefined : me);
  const [adding, setAdding] = useState(false);
  const [needCover, setNeedCover] = useState<AppointmentView[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const q = useUnavailability(admin ? (selected ? { userId: selected } : {}) : { userId: me });
  const remove = useScheduleMutation((id: UUID) => repo.appointments.removeUnavailability(id));

  const nameOf = (id: UUID) => staff.find((m) => m.profile.id === id)?.profile.fullName ?? '';
  const today = toISODate(new Date());

  const onRemove = async (l: TherapistUnavailability) => {
    const ok = await confirm({
      title: t('availability.removeTitle'),
      body: t('availability.removeBody', { name: l.userId === me ? active.user.profile.fullName : nameOf(l.userId) }),
      confirmLabel: t('availability.remove'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(l.id);
      toast.success(t('availability.removed'));
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      title={t('availability.title')}
      back
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      testID="availability-screen"
      footer={<Button label={t('availability.add')} icon={Plus} onPress={() => setAdding(true)} fullWidth testID="add-leave" />}
    >
      {admin ? (
        <Stack gap={2}>
          <Text variant="label">{t('availability.therapist')}</Text>
          <Row gap={2} wrap>
            <Chip size="sm" label={t('availability.allStaff')} selected={!selected} onPress={() => setSelected(undefined)} />
            {staff.map((m) => (
              <Chip key={m.profile.id} size="sm" label={m.profile.fullName} selected={selected === m.profile.id} onPress={() => setSelected(m.profile.id)} />
            ))}
          </Row>
        </Stack>
      ) : null}

      {admin && needCover.length ? (
        <Card tone="primary" testID="need-cover">
          <Stack gap={3}>
            <Text variant="subheading">{t('admin.needCover', { count: needCover.length })}</Text>
            <Button label={t('availability.arrangeCover')} icon={UserRoundCog} onPress={() => router.push('/substitutions')} />
          </Stack>
        </Card>
      ) : null}

      <QueryView
        query={q}
        skeleton={<SkeletonList rows={2} height={84} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={t('availability.emptyTitle')} body={t('availability.emptyBody')} actionLabel={t('availability.add')} onAction={() => setAdding(true)} />}
      >
        {(data) => {
          const upcoming = data.filter((l) => l.to >= today).sort((a, b) => a.from.localeCompare(b.from));
          const past = data.filter((l) => l.to < today).sort((a, b) => b.from.localeCompare(a.from)).slice(0, 10);
          const showName = admin && !selected;
          return (
            <Stack gap={3}>
              <SectionHeader title={t('availability.upcomingLeave')} />
              {upcoming.length ? (
                upcoming.map((l) => <LeaveCard key={l.id} leave={l} name={showName ? nameOf(l.userId) : undefined} onRemove={() => void onRemove(l)} />)
              ) : (
                <Text color="textMuted">{t('availability.emptyTitle')}</Text>
              )}
              {past.length ? <SectionHeader title={t('availability.pastLeave')} /> : null}
              {past.map((l) => (
                <LeaveCard key={l.id} leave={l} name={showName ? nameOf(l.userId) : undefined} />
              ))}
            </Stack>
          );
        }}
      </QueryView>

      <LeaveSheet visible={adding} onClose={() => setAdding(false)} userId={selected} staff={staff} admin={admin} onSaved={setNeedCover} />
    </Screen>
  );
}
