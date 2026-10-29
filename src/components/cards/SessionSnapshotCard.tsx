// Owner: W2 (session). Parent-facing session card (parent Home "Latest session", history lists,
// logger preview): words + arrows, never the raw score unless the school turned it on.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ParentSessionSnapshot } from '@/domain/types';
import { parentDimensionLabel, therapyNameLabel } from '@/features/session/labels';
import { formatDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Icon, Row, Stack, Text, TrendIndicator, TypeTag } from '@/ui';

export function SessionSnapshotCard({
  snapshot: s,
  onPress,
  compact = false,
  preview = false,
}: {
  snapshot: ParentSessionSnapshot;
  /** Override what tapping does (default: open the session). */
  onPress?: () => void;
  /** History lists: hide the therapist's message to keep rows short. */
  compact?: boolean;
  /** Logger "What parents will see" preview: not pressable. */
  preview?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const therapy = therapyNameLabel(tr, s.therapyTypeName);
  const date = formatDay(s.date);
  const withText = tr(s.isSubstitute ? 'parent.covering' : 'parent.with', { name: s.therapistName });
  const overall = tr(`parent.overall.${s.overall}`);
  const highlights = s.highlights.map((h) => ({ ...h, text: parentDimensionLabel(tr, h.key, h.label) }));
  const a11y = tr('card.a11y', {
    therapy,
    date,
    with: withText,
    overall,
    highlights: highlights.map((h) => tr('parent.highlightA11y', { label: h.text, change: tr(`common:changeShort.${h.change}`) })).join('. '),
  });

  return (
    <Card
      accent={s.therapyTypeColor}
      onPress={preview ? undefined : (onPress ?? (() => router.push(`/session/${s.sessionId}`)))}
      accessibilityLabel={a11y}
      accessibilityHint={preview ? undefined : tr('common:a11y.opensDetails')}
      testID={`session-snapshot-${s.sessionId}`}
    >
      <Stack gap={3}>
        <Row justify="between" gap={2}>
          <View style={{ flexShrink: 1 }}>
            <TypeTag name={therapy} color={s.therapyTypeColor} />
          </View>
          <Text variant="label" color="textMuted">
            {date}
          </Text>
        </Row>
        <Stack gap={1}>
          <Row gap={2}>
            <TrendIndicator change={s.overall} showLabel={false} />
            <Text variant="subheading" style={{ flex: 1 }}>
              {overall}
            </Text>
          </Row>
          <Text variant="label" color="textMuted">
            {withText}
          </Text>
        </Stack>
        {highlights.length ? (
          <Stack gap={2}>
            {highlights.map((h) => (
              <Row key={h.key} gap={3} style={{ minHeight: 28 }}>
                <Icon name={h.icon} size={20} color="textMuted" />
                <Text style={{ flex: 1 }}>{h.text}</Text>
                <TrendIndicator change={h.change} size="sm" />
              </Row>
            ))}
          </Stack>
        ) : null}
        {s.sessionScore != null ? (
          <Text variant="bodyStrong" tint={t.colors.primaryText}>
            {tr('card.score', { score: Math.round(s.sessionScore) })}
          </Text>
        ) : null}
        {!compact && s.parentSummary ? (
          <Text color="textMuted" numberOfLines={preview ? undefined : 4}>
            {s.parentSummary}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
