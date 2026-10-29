// A. Session context: scheduled time, actual length, started late, parent check-in.
import { Clock } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AppointmentView, ParentCheckin } from '@/domain/types';
import { formatTime } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Divider, Row, SectionHeader, Stack, Stepper, SwitchRow, Text } from '@/ui';

import { CheckinCard } from '../CheckinCard';
import { issueId } from '../../logic/draft';
import { useTargetRef } from './scrollTargets';

export function scheduledMinutes(a: Pick<AppointmentView, 'startsAt' | 'endsAt'>): number {
  return Math.max(5, Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60_000));
}

function ContextSectionBase({
  appointment,
  actualMinutes,
  startedLate,
  checkin,
  onMinutes,
  onStartedLate,
}: {
  appointment: AppointmentView;
  actualMinutes: number;
  startedLate: boolean;
  checkin?: ParentCheckin | null;
  onMinutes: (v: number) => void;
  onStartedLate: (v: boolean) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const ref = useTargetRef(issueId.duration);
  return (
    <Stack gap={2}>
      <SectionHeader title={tr('logger.sections.context')} />
      <Card padding={4}>
        <Stack gap={3}>
          <Row gap={2}>
            <Clock size={16} color={t.colors.textMuted} />
            <Text variant="label" color="textMuted">
              {tr('logger.context.scheduled', { time: formatTime(appointment.startsAt), minutes: scheduledMinutes(appointment) })}
            </Text>
          </Row>
          <View ref={ref}>
            <Stepper
              testID="duration-stepper"
              label={tr('logger.context.duration')}
              value={actualMinutes}
              onChange={onMinutes}
              min={5}
              max={240}
              step={5}
              suffix={tr('logger.context.minutes')}
            />
          </View>
          <Divider />
          <SwitchRow label={tr('logger.context.startedLate')} description={tr('logger.context.startedLateHint')} value={startedLate} onChange={onStartedLate} />
        </Stack>
      </Card>
      {checkin ? <CheckinCard checkin={checkin} /> : null}
    </Stack>
  );
}

export const ContextSection = memo(ContextSectionBase);
