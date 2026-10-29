// Parent view of one session: words + arrows, the therapist's message, goals in parent wording.
// Never shows internal notes; the score only when the school enables it (snapshot.sessionScore).
import { MessageCircleHeart, Target } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ParentSessionSnapshot } from '@/domain/types';
import { formatDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Icon, Row, Stack, Text, TrendIndicator, TypeTag } from '@/ui';

import { parentDimensionLabel, therapyNameLabel } from '../../labels';

export function ParentSessionDetail({ snapshot: s }: { snapshot: ParentSessionSnapshot }) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  return (
    <Stack gap={4}>
      <Card padding={5} accent={s.therapyTypeColor}>
        <Stack gap={3}>
          <Row justify="between" gap={2}>
            <View style={{ flexShrink: 1 }}>
              <TypeTag name={therapyNameLabel(tr, s.therapyTypeName)} color={s.therapyTypeColor} />
            </View>
            <Text variant="label" color="textMuted">
              {formatDay(s.date)}
            </Text>
          </Row>
          <Text color="textMuted">{tr(s.isSubstitute ? 'parent.covering' : 'parent.with', { name: s.therapistName })}</Text>
          <Row gap={2} accessibilityRole="header">
            <TrendIndicator change={s.overall} showLabel={false} />
            <Text variant="title" style={{ flex: 1 }}>
              {tr(`parent.overall.${s.overall}`)}
            </Text>
          </Row>
          {s.sessionScore != null ? (
            <Text variant="bodyStrong" tint={t.colors.primaryText}>{`${tr('parent.score')}: ${tr('parent.scoreValue', { score: Math.round(s.sessionScore) })}`}</Text>
          ) : null}
        </Stack>
      </Card>

      {s.highlights.length ? (
        <Card padding={4}>
          <Stack gap={3}>
            <Text variant="heading">{tr('parent.howItWent')}</Text>
            {s.highlights.map((h) => {
              const label = parentDimensionLabel(tr, h.key, h.label);
              return (
                <Row
                  key={h.key}
                  gap={3}
                  style={{ minHeight: 40 }}
                  accessible
                  accessibilityLabel={tr('parent.highlightA11y', { label, change: tr(`common:change.${h.change}`) })}
                >
                  <Icon name={h.icon} size={22} color="primaryText" />
                  <Text style={{ flex: 1 }}>{label}</Text>
                  <TrendIndicator change={h.change} />
                </Row>
              );
            })}
          </Stack>
        </Card>
      ) : null}

      <Card padding={4} tone="primary">
        <Stack gap={2}>
          <Row gap={2}>
            <MessageCircleHeart size={20} color={t.colors.primaryText} />
            <Text variant="heading">{tr('parent.fromTherapist')}</Text>
          </Row>
          <Text>{s.parentSummary || tr('parent.noSummary')}</Text>
        </Stack>
      </Card>

      {s.goalsWorkedOn.length ? (
        <Card padding={4}>
          <Stack gap={3}>
            <Row gap={2}>
              <Target size={20} color={t.colors.primaryText} />
              <Text variant="heading">{tr('parent.goalsWorkedOn')}</Text>
            </Row>
            {s.goalsWorkedOn.map((g) => (
              <Row key={g.goalId} gap={2} align="flex-start">
                <Text color="textMuted">•</Text>
                <Text style={{ flex: 1 }}>{g.parentText}</Text>
              </Row>
            ))}
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
