/** Clash results from `checkConflicts`, shown clearly BEFORE saving. */
import { CircleCheck, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import type { Conflict } from '@/domain/types';
import { formatDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Row, Stack, Text } from '@/ui';

const MAX_SHOWN = 6;

export function ConflictList({ conflicts, checking }: { conflicts?: Conflict[]; checking?: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');

  if (checking && !conflicts) {
    return (
      <Row gap={2} testID="conflicts-checking">
        <ActivityIndicator color={t.colors.textMuted} />
        <Text variant="label" color="textMuted">
          {tr('conflicts.checking')}
        </Text>
      </Row>
    );
  }
  if (!conflicts) return null;
  if (conflicts.length === 0) {
    return (
      <Row gap={2} testID="conflicts-none" accessibilityLiveRegion="polite">
        <CircleCheck size={18} color={t.colors.success} />
        <Text variant="label" color="success">
          {tr('conflicts.none')}
        </Text>
      </Row>
    );
  }
  const extra = conflicts.length - MAX_SHOWN;
  return (
    <Card tone="warning" padding={3} testID="conflicts-list">
      <Stack gap={2} accessibilityLiveRegion="polite">
        <Row gap={2}>
          <TriangleAlert size={18} color={t.colors.warning} />
          <Text variant="subheading" tint={t.colors.warning}>
            {tr('conflicts.title', { count: conflicts.length })}
          </Text>
        </Row>
        {conflicts.slice(0, MAX_SHOWN).map((c, i) => (
          <Stack key={`${c.kind}-${c.date}-${c.appointmentId ?? i}`} gap={0}>
            <Text variant="label" weight="semibold">
              {c.message || tr(`conflicts.kinds.${c.kind}`)}
            </Text>
            <Text variant="caption" color="textMuted">
              {c.message ? `${tr(`conflicts.kinds.${c.kind}`)} · ${formatDay(c.date)}` : formatDay(c.date)}
            </Text>
          </Stack>
        ))}
        {extra > 0 ? (
          <Text variant="caption" color="textMuted">{`+${extra}`}</Text>
        ) : null}
      </Stack>
    </Card>
  );
}
