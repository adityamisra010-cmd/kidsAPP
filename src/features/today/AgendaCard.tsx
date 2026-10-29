import { router } from 'expo-router';
import {
  BookOpen,
  BookOpenCheck,
  CircleAlert,
  CircleCheck,
  CirclePlay,
  ClipboardCheck,
  Clock,
  Eye,
  Info,
  PenLine,
  UserCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppointmentStatusBadge } from '@/components/AppointmentStatusBadge';
import type { AppointmentView, LogState } from '@/domain/types';
import { formatDay, formatTimeRange } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Button, Card, Row, Stack, Text, TypeTag, type Tone } from '@/ui';

import { isHappening, logAction } from './agenda';

const LOG_STATE: Record<Exclude<LogState, 'not_applicable'>, { icon: LucideIcon; tone: Tone }> = {
  upcoming: { icon: Clock, tone: 'neutral' },
  in_progress: { icon: CirclePlay, tone: 'primary' },
  logged: { icon: CircleCheck, tone: 'success' },
  not_logged: { icon: CircleAlert, tone: 'warning' },
};

export function LogStateBadge({ appointment: a }: { appointment: AppointmentView }) {
  const { t } = useTranslation();
  if (!isHappening(a) || a.logState === 'not_applicable') return <AppointmentStatusBadge status={a.displayStatus} />;
  const m = LOG_STATE[a.logState];
  return <Badge label={t(`common:logState.${a.logState}`)} tone={m.tone} icon={m.icon} testID={`logstate-${a.id}`} />;
}

/**
 * One session on the therapist's day: time, child, therapy, status (icon + word), substitute and
 * brief flags, check-in, and the two actions: read the Brief, then Log.
 */
export function AgendaCard({ appointment: a, focus, showDate }: { appointment: AppointmentView; focus?: 'now' | 'next'; showDate?: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation('therapist');
  const action = logAction(a);
  const happening = isHappening(a);
  const time = formatTimeRange(a.startsAt, a.endsAt);
  const strongLog = focus === 'now' || a.logState === 'in_progress' || a.logState === 'not_logged';

  return (
    <Card
      testID={`agenda-${a.id}`}
      accent={a.therapyTypeColor}
      style={focus ? { borderColor: t.colors.primary, borderWidth: 1.5 } : !happening ? { opacity: 0.75 } : undefined}
    >
      <Stack gap={3}>
        {focus ? (
          <Text variant="overline" color="primaryText" testID={`focus-${a.id}`}>
            {focus === 'now' ? tr('today.now') : tr('today.upNext')}
          </Text>
        ) : null}

        <Row justify="between" align="flex-start" gap={2}>
          <Text variant="heading" style={{ flexShrink: 1, fontVariant: ['tabular-nums'] }}>
            {showDate ? `${formatDay(a.startsAt)} · ${time}` : time}
          </Text>
          <LogStateBadge appointment={a} />
        </Row>

        <Row gap={3}>
          <Avatar name={a.childName} uri={a.childPhotoUrl} size={44} />
          <Stack gap={1} flex={1}>
            <Text variant="subheading" numberOfLines={1}>
              {a.childName}
            </Text>
            <Row gap={2} wrap>
              <TypeTag name={a.therapyTypeName} color={a.therapyTypeColor} />
              {a.room ? (
                <Text variant="caption" color="textMuted">
                  {tr('today.room', { room: a.room })}
                </Text>
              ) : null}
            </Row>
          </Stack>
        </Row>

        {a.isSubstitute || a.briefRequired || a.hasCheckin ? (
          <Row gap={2} wrap>
            {a.isSubstitute ? <Badge label={tr('today.substitute')} tone="warning" icon={UserCheck} /> : null}
            {a.briefRequired && !a.briefAcknowledged ? <Badge label={tr('today.briefRequired')} tone="warning" icon={BookOpen} /> : null}
            {a.briefRequired && a.briefAcknowledged ? <Badge label={tr('today.briefRead')} tone="success" icon={BookOpenCheck} /> : null}
            {a.hasCheckin ? <Badge label={tr('today.checkinReceived')} tone="info" icon={ClipboardCheck} /> : null}
          </Row>
        ) : null}
        {a.isSubstitute && a.originalTherapistName ? (
          <Text variant="caption" color="textMuted">
            {tr('today.coveringFor', { name: a.originalTherapistName })}
          </Text>
        ) : null}
        {!happening && a.cancelReason ? (
          <Text variant="caption" color="textMuted">
            {a.cancelReason}
          </Text>
        ) : null}

        {happening || action === 'view_log' ? (
          <Stack gap={2}>
            <Row gap={2}>
              <Button
                label={tr('today.brief')}
                icon={BookOpen}
                variant={action === 'log_blocked' ? 'primary' : 'outline'}
                onPress={() => router.push(`/brief/${a.id}`)}
                style={{ flex: 1 }}
                testID={`brief-${a.id}`}
              />
              {action === 'view_log' ? (
                <Button
                  label={tr('today.viewLog')}
                  icon={Eye}
                  variant="secondary"
                  onPress={() => router.push(`/session/${a.sessionId}`)}
                  style={{ flex: 1 }}
                  testID={`view-${a.id}`}
                />
              ) : action === 'log' || action === 'log_blocked' ? (
                <Button
                  label={tr('today.log')}
                  icon={PenLine}
                  variant={strongLog ? 'primary' : 'secondary'}
                  disabled={action === 'log_blocked'}
                  accessibilityHint={action === 'log_blocked' ? tr('today.readBriefFirst') : undefined}
                  onPress={() => router.push(`/session/log/${a.id}`)}
                  style={{ flex: 1 }}
                  testID={`log-${a.id}`}
                />
              ) : null}
            </Row>
            {action === 'log_blocked' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                <Info size={16} color={t.colors.warning} />
                <Text variant="caption" tint={t.colors.warning} weight="medium">
                  {tr('today.readBriefFirst')}
                </Text>
              </View>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}
