import {
  ArrowLeftRight,
  BellRing,
  CalendarClock,
  ClipboardList,
  MessageCircle,
  Moon,
  Sun,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Role } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, formatClock, Row, Sheet, Stack, Text } from '@/ui';

const POINTS: Record<Role, { icon: LucideIcon; key: string }[]> = {
  parent: [
    { icon: CalendarClock, key: 'parentSessions' },
    { icon: ArrowLeftRight, key: 'parentChanges' },
    { icon: MessageCircle, key: 'parentMessages' },
  ],
  therapist: [
    { icon: Sun, key: 'therapistAgenda' },
    { icon: ClipboardList, key: 'therapistBrief' },
    { icon: MessageCircle, key: 'therapistMessages' },
  ],
  coordinator: [
    { icon: TriangleAlert, key: 'adminAlerts' },
    { icon: ArrowLeftRight, key: 'adminRequests' },
    { icon: MessageCircle, key: 'adminMessages' },
  ],
  school_admin: [
    { icon: TriangleAlert, key: 'adminAlerts' },
    { icon: ArrowLeftRight, key: 'adminRequests' },
    { icon: MessageCircle, key: 'adminMessages' },
  ],
  platform_admin: [{ icon: BellRing, key: 'platformUpdates' }],
};

/** One-time, in-app explanation before the system permission prompt. */
export function PermissionSheet({
  visible,
  role,
  quietHours,
  onAllow,
  onDismiss,
}: {
  visible: boolean;
  role: Role;
  quietHours?: { start: string; end: string };
  onAllow: () => void;
  onDismiss: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('settings');
  return (
    <Sheet
      visible={visible}
      onClose={onDismiss}
      title={tr('push.sheet.title')}
      subtitle={tr('push.sheet.subtitle')}
      testID="push-permission-sheet"
      footer={
        <>
          <Button label={tr('push.sheet.allow')} icon={BellRing} size="lg" fullWidth onPress={onAllow} />
          <Button label={tr('push.sheet.notNow')} variant="ghost" fullWidth onPress={onDismiss} />
        </>
      }
    >
      <Stack gap={3}>
        {POINTS[role].map(({ icon: Icon, key }) => (
          <Row key={key} gap={3} align="flex-start">
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: t.radius.md,
                backgroundColor: t.colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={20} color={t.colors.primaryText} />
            </View>
            <Text style={{ flex: 1, paddingTop: 8 }}>{tr(`push.sheet.points.${key}`)}</Text>
          </Row>
        ))}
        <Row gap={2} align="flex-start" style={{ marginTop: t.space[1] }}>
          <Moon size={16} color={t.colors.textMuted} style={{ marginTop: 2 }} />
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {quietHours
              ? tr('push.sheet.quiet', { start: formatClock(quietHours.start), end: formatClock(quietHours.end) })
              : tr('push.sheet.changeLater')}
          </Text>
        </Row>
      </Stack>
    </Sheet>
  );
}
