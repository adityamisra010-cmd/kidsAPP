import { router } from 'expo-router';
import { BellRing, CalendarClock, Check, CircleCheck, UserCheck, UserX } from 'lucide-react-native';
import { Fragment, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import type { AdminDashboard, AppointmentView } from '@/domain/types';
import { InlineEmpty, Section } from '@/features/home/components/Blocks';
import { formatTimeRange, relativeDay } from '@/lib/dates';
import { Avatar, Badge, Button, Card, Divider, ListItem, SectionHeader, Text, toast, TrendIndicator } from '@/ui';

const MAX_ROWS = 5;

/** Card of rows separated by dividers; long lists show the first few with "Show N more" (expands in place). */
function RowsCard<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const { t } = useTranslation('dashboard');
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, MAX_ROWS);
  const hidden = items.length - shown.length;
  return (
    <Card padding={3}>
      {shown.map((item, i) => (
        <Fragment key={i}>
          {i > 0 ? <Divider /> : null}
          {render(item)}
        </Fragment>
      ))}
      {hidden > 0 ? (
        <Pressable onPress={() => setExpanded(true)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="label" color="primaryText" weight="semibold">
            {t('showMore', { count: hidden })}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

function useWhen() {
  const { t } = useTranslation();
  return (a: Pick<AppointmentView, 'startsAt' | 'endsAt'>) =>
    `${relativeDay(a.startsAt, { today: t('common:time.today'), tomorrow: t('common:time.tomorrow') })} · ${formatTimeRange(a.startsAt, a.endsAt)}`;
}

export function AttentionSection({ items, index }: { items: AdminDashboard['childrenNeedingAttention']; index: number }) {
  const { t } = useTranslation('dashboard');
  return (
    <Section index={index} testID="dash-attention">
      <SectionHeader title={t('attention.title')} actionLabel={t('attention.allAlerts')} onAction={() => router.push('/alerts')} />
      {items.length === 0 ? (
        <InlineEmpty icon={CircleCheck} tone="success" title={t('attention.emptyTitle')} body={t('attention.emptyBody')} />
      ) : (
        <RowsCard
          items={items}
          render={(c) => (
            <ListItem
              testID={`attention-${c.child.id}`}
              title={c.child.fullName}
              subtitle={c.reason}
              left={<Avatar name={c.child.fullName} uri={c.child.photoUrl} size={40} />}
              right={c.trend ? <TrendIndicator trend={c.trend} size="sm" /> : undefined}
              onPress={() => router.push(`/child/${c.child.id}`)}
            />
          )}
        />
      )}
    </Section>
  );
}

/**
 * Sessions attended but not logged. "Remind" confirms with a toast only: the repository contract has
 * no reminder call yet. Wire it to a `notifications.remindUnlogged(appointmentId)` once it exists.
 */
export function UnloggedSection({ items, index }: { items: AppointmentView[]; index: number }) {
  const { t } = useTranslation('dashboard');
  const when = useWhen();
  const [reminded, setReminded] = useState<Set<string>>(() => new Set());
  const remind = (a: AppointmentView) => {
    setReminded((s) => new Set(s).add(a.id));
    toast.success(t('unlogged.sent', { name: a.therapistName }));
  };
  return (
    <Section index={index} testID="dash-unlogged">
      <SectionHeader title={t('unlogged.title')} subtitle={t('unlogged.subtitle')} />
      {items.length === 0 ? (
        <InlineEmpty icon={CircleCheck} tone="success" title={t('unlogged.emptyTitle')} />
      ) : (
        <RowsCard
          items={items}
          render={(a) => {
            const done = reminded.has(a.id);
            return (
              <ListItem
                testID={`unlogged-${a.id}`}
                title={a.therapistName}
                subtitle={`${a.childName} · ${when(a)}`}
                left={<Avatar name={a.therapistName} uri={a.therapistAvatarUrl} size={40} />}
                right={
                  <Button
                    testID={`remind-${a.id}`}
                    size="sm"
                    variant={done ? 'ghost' : 'secondary'}
                    icon={done ? Check : BellRing}
                    label={done ? t('unlogged.reminded') : t('unlogged.remind')}
                    disabled={done}
                    onPress={() => remind(a)}
                  />
                }
              />
            );
          }}
        />
      )}
    </Section>
  );
}

export function CoverSection({ needs, upcoming, index }: { needs: AppointmentView[]; upcoming: AppointmentView[]; index: number }) {
  const { t } = useTranslation('dashboard');
  const when = useWhen();
  const go = () => router.push('/substitutions');
  return (
    <Section index={index} testID="dash-cover">
      <SectionHeader title={t('cover.title')} actionLabel={t('cover.manage')} onAction={go} />
      {needs.length === 0 && upcoming.length === 0 ? (
        <InlineEmpty icon={CircleCheck} tone="success" title={t('cover.emptyTitle')} />
      ) : (
        <>
          {needs.length > 0 ? (
            <RowsCard
              items={needs}
              render={(a) => (
                <ListItem
                  testID={`needs-cover-${a.id}`}
                  title={a.childName}
                  subtitle={`${when(a)}\n${t('cover.away', { name: a.therapistName, therapy: a.therapyTypeName })}`}
                  left={<Avatar name={a.childName} uri={a.childPhotoUrl} size={40} />}
                  right={<Badge label={t('cover.needsCover')} tone="warning" icon={UserX} />}
                  onPress={go}
                />
              )}
            />
          ) : null}
          {upcoming.length > 0 ? (
            <RowsCard
              items={upcoming}
              render={(a) => (
                <ListItem
                  testID={`cover-set-${a.id}`}
                  title={a.childName}
                  subtitle={`${when(a)}\n${t('cover.covering', { sub: a.therapistName, original: a.originalTherapistName ?? '—' })}`}
                  left={<Avatar name={a.childName} uri={a.childPhotoUrl} size={40} />}
                  right={<Badge label={t('cover.set')} tone="info" icon={UserCheck} />}
                  onPress={go}
                />
              )}
            />
          ) : null}
        </>
      )}
    </Section>
  );
}

export function RescheduleSection({ items, index }: { items: AdminDashboard['pendingReschedules']; index: number }) {
  const { t } = useTranslation('dashboard');
  const when = useWhen();
  const go = () => router.push('/reschedule/requests');
  return (
    <Section index={index} testID="dash-reschedule">
      <SectionHeader title={t('reschedule.title')} actionLabel={items.length ? t('reschedule.review') : undefined} onAction={go} />
      {items.length === 0 ? (
        <InlineEmpty icon={CircleCheck} tone="success" title={t('reschedule.emptyTitle')} />
      ) : (
        <RowsCard
          items={items}
          render={(r) => (
            <ListItem
              testID={`reschedule-${r.id}`}
              title={r.appointment.childName}
              subtitle={`${t('reschedule.by', { name: r.requestedByName })}\n${t('reschedule.now', { when: when(r.appointment) })}`}
              left={<Avatar name={r.appointment.childName} uri={r.appointment.childPhotoUrl} size={40} />}
              right={<Badge label={t('reschedule.options', { count: r.proposedSlots.length })} tone="info" icon={CalendarClock} />}
              onPress={go}
            />
          )}
        />
      )}
    </Section>
  );
}
