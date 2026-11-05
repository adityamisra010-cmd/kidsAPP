/** Renders the role's actions: the most useful one as a big button, the rest as labelled rows. */
import {
  BookOpen,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  ClipboardCheck,
  FileText,
  Info,
  NotebookPen,
  Sun,
  UserRoundCog,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Divider, ListItem, Row, Stack, Text } from '@/ui';

import type { ActionState, AppointmentAction } from '../lib/actions';

const META: Record<AppointmentAction, { icon: LucideIcon; label: string; hint?: string }> = {
  checkin: { icon: Sun, label: 'actions.checkin', hint: 'actions.checkinHint' },
  view_summary: { icon: FileText, label: 'actions.viewSummary', hint: 'actions.viewSummaryHint' },
  request_change: { icon: CalendarClock, label: 'actions.requestChange', hint: 'actions.requestChangeHint' },
  cant_make_it: { icon: CalendarX, label: 'actions.cantMakeIt' },
  open_brief: { icon: BookOpen, label: 'actions.openBrief', hint: 'actions.openBriefHint' },
  log_session: { icon: NotebookPen, label: 'actions.logSession', hint: 'actions.logSessionHint' },
  view_log: { icon: FileText, label: 'actions.viewLog' },
  mark_attendance: { icon: ClipboardCheck, label: 'actions.markAttendance', hint: 'actions.markAttendanceHint' },
  change_time: { icon: CalendarClock, label: 'actions.changeTime', hint: 'actions.changeTimeHint' },
  assign_substitute: { icon: UserRoundCog, label: 'actions.assignSubstitute', hint: 'actions.assignSubstituteHint' },
  book_makeup: { icon: CalendarPlus, label: 'actions.bookMakeup', hint: 'actions.bookMakeupHint' },
  cancel_by_school: { icon: CalendarX, label: 'actions.cancelBySchool' },
};

/** Which action gets the big button. Cancellations never do. */
const PRIORITY: AppointmentAction[] = ['checkin', 'log_session', 'open_brief', 'view_summary', 'view_log', 'request_change', 'mark_attendance', 'book_makeup'];
const DESTRUCTIVE: AppointmentAction[] = ['cant_make_it', 'cancel_by_school'];

export function ActionPanel({ actions, title, onAction }: { actions: ActionState[]; title: string; onAction: (id: AppointmentAction) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  if (!actions.length) return null;

  const primary = PRIORITY.map((id) => actions.find((a) => a.id === id && !a.disabledReason)).find(Boolean);
  const rows = actions.filter((a) => a !== primary && !DESTRUCTIVE.includes(a.id));
  const destructive = actions.filter((a) => DESTRUCTIVE.includes(a.id));
  const blocked = actions.find((a) => a.disabledReason === 'brief_first');

  return (
    <Stack gap={3} testID="action-panel">
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {primary ? (
        <Button
          size="lg"
          fullWidth
          icon={META[primary.id].icon}
          label={tr(META[primary.id].label)}
          accessibilityHint={META[primary.id].hint ? tr(META[primary.id].hint!) : undefined}
          onPress={() => onAction(primary.id)}
          testID={`action-${primary.id}`}
        />
      ) : null}
      {blocked ? (
        <Card tone="info" padding={3} elevated={false} testID="brief-first">
          <Row gap={2} align="flex-start">
            <Info size={18} color={t.colors.info} style={{ marginTop: 2 }} />
            <Text variant="label" tint={t.colors.info} style={{ flex: 1 }}>
              {tr('actions.briefFirst')}
            </Text>
          </Row>
        </Card>
      ) : null}
      {rows.length ? (
        <Card padding={2}>
          {rows.map((a, i) => {
            const m = META[a.id];
            const Icon = m.icon;
            const disabled = !!a.disabledReason;
            return (
              <View key={a.id} style={{ opacity: disabled ? 0.5 : 1, paddingHorizontal: t.space[2] }}>
                {i > 0 ? <Divider /> : null}
                <ListItem
                  testID={`action-${a.id}`}
                  title={tr(m.label)}
                  subtitle={m.hint ? tr(m.hint) : undefined}
                  left={<Icon size={22} color={t.colors.primaryText} />}
                  onPress={disabled ? undefined : () => onAction(a.id)}
                  chevron={!disabled}
                />
              </View>
            );
          })}
        </Card>
      ) : null}
      {destructive.map((a) => (
        <Button
          key={a.id}
          variant="outline"
          icon={META[a.id].icon}
          label={tr(META[a.id].label)}
          onPress={() => onAction(a.id)}
          fullWidth
          testID={`action-${a.id}`}
        />
      ))}
    </Stack>
  );
}
