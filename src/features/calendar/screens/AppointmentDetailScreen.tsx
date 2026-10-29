/** `/appointment/[id]`: session header, request status and role-specific actions. */
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppointment } from '@/data/hooks';
import type { UUID } from '@/domain/types';
import { useRequiredActive } from '@/state/session';
import { ErrorState, Screen, Skeleton, SkeletonList, Stack } from '@/ui';

import { ActionPanel } from '../components/ActionPanel';
import { AppointmentHeaderCard } from '../components/AppointmentHeaderCard';
import { AttendanceSheet } from '../components/AttendanceSheet';
import { CancelSheet } from '../components/CancelSheet';
import { ChangeTimeSheet } from '../components/ChangeTimeSheet';
import { MakeupSheet } from '../components/MakeupSheet';
import { RequestStatusCard } from '../components/RequestStatusCard';
import { SubstituteSheet } from '../components/SubstituteSheet';
import { appointmentActions, isAdminRole, type AppointmentAction } from '../lib/actions';
import { inferSeriesWeekdays } from '../lib/recurrence';
import { useSeriesSiblings } from '../queries';

type SheetKind = 'attendance' | 'cancel_parent' | 'cancel_school' | 'change' | 'makeup' | 'substitute';

export function AppointmentDetailScreen({ id }: { id: UUID }) {
  const { t } = useTranslation('calendar');
  const active = useRequiredActive();
  const q = useAppointment(id);
  const a = q.data;
  const siblings = useSeriesSiblings(a);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const role = active.role;
  const staff = role !== 'parent';
  const seriesWeekdays = a?.seriesId ? inferSeriesWeekdays(siblings.data ?? [a], a.seriesId) : [];
  const actions = a ? appointmentActions(role, a, active.user.profile.id, new Date()) : [];

  const onAction = (action: AppointmentAction) => {
    if (!a) return;
    switch (action) {
      case 'checkin':
        return router.push(`/checkin/${a.id}`);
      case 'view_summary':
      case 'view_log':
        return a.sessionId ? router.push(`/session/${a.sessionId}`) : undefined;
      case 'request_change':
        return router.push(`/reschedule/${a.id}`);
      case 'open_brief':
        return router.push(`/brief/${a.id}`);
      case 'log_session':
        return router.push(`/session/log/${a.id}`);
      case 'cant_make_it':
        return setSheet('cancel_parent');
      case 'cancel_by_school':
        return setSheet('cancel_school');
      case 'mark_attendance':
        return setSheet('attendance');
      case 'change_time':
        return setSheet('change');
      case 'assign_substitute':
        return setSheet('substitute');
      case 'book_makeup':
        return setSheet('makeup');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([q.refetch(), siblings.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };
  const close = () => setSheet(null);

  return (
    <Screen title={t('detail.title')} back refreshing={refreshing} onRefresh={() => void onRefresh()} testID="appointment-detail">
      {q.isPending ? (
        <Stack gap={4}>
          <Skeleton height={300} radius={16} />
          <SkeletonList rows={2} height={64} />
        </Stack>
      ) : q.error || !a ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Stack gap={5}>
          <AppointmentHeaderCard appointment={a} seriesWeekdays={seriesWeekdays} showCheckin={staff} />
          {role !== 'therapist' ? <RequestStatusCard appointment={a} role={role} /> : null}
          <ActionPanel actions={actions} title={isAdminRole(role) ? t('detail.manageTitle') : t('detail.actionsTitle')} onAction={onAction} />

          <AttendanceSheet appointment={a} visible={sheet === 'attendance'} onClose={close} />
          <CancelSheet appointment={a} by="parent" visible={sheet === 'cancel_parent'} onClose={close} />
          <CancelSheet appointment={a} by="school" visible={sheet === 'cancel_school'} onClose={close} />
          {isAdminRole(role) ? (
            <>
              <ChangeTimeSheet appointment={a} siblings={siblings.data ?? []} seriesWeekdays={seriesWeekdays} visible={sheet === 'change'} onClose={close} />
              <MakeupSheet appointment={a} visible={sheet === 'makeup'} onClose={close} />
              <SubstituteSheet appointment={a} visible={sheet === 'substitute'} onClose={close} />
            </>
          ) : null}
        </Stack>
      )}
    </Screen>
  );
}
