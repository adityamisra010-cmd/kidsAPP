// Sticky logger header: close, child, therapy, time, substitute badge, progress pill, sync status.
import { CircleCheck, UserCheck, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AppointmentView } from '@/domain/types';
import { formatTime } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, IconOnlyButton, Row, Stack, SyncBadge, Text, TypeTag } from '@/ui';

export function LoggerTopBar({
  appointment: a,
  rated,
  total,
  onClose,
}: {
  appointment: AppointmentView;
  rated: number;
  total: number;
  onClose: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const done = total > 0 && rated >= total;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        paddingHorizontal: t.space[2],
        paddingVertical: t.space[2],
        backgroundColor: t.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.border,
      }}
    >
      <IconOnlyButton icon={X} label={tr('logger.close')} onPress={onClose} />
      <Avatar name={a.childName} uri={a.childPhotoUrl} size={40} />
      <Stack gap={1} flex={1}>
        <Text variant="subheading" numberOfLines={1} accessibilityRole="header">
          {a.childName}
        </Text>
        <Row gap={2} wrap>
          <TypeTag name={a.therapyTypeName} color={a.therapyTypeColor} />
          <Text variant="caption" color="textMuted">
            {formatTime(a.startsAt)}
          </Text>
          {a.isSubstitute ? <Badge label={tr('logger.substitute')} tone="warning" icon={UserCheck} /> : null}
        </Row>
      </Stack>
      <Stack gap={1} align="flex-end" style={{ paddingRight: t.space[1] }}>
        <Badge
          testID="progress-pill"
          label={done ? tr('logger.progressDone', { total }) : tr('logger.progress', { rated, total })}
          tone={done ? 'success' : 'primary'}
          icon={done ? CircleCheck : undefined}
        />
        <SyncBadge />
      </Stack>
    </View>
  );
}
