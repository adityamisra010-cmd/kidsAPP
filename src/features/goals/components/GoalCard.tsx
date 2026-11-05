import { router } from 'expo-router';
import { Award, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { GoalWithStats } from '@/domain/types';
import { vocabLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Row, Stack, Text } from '@/ui';

import { isActiveGoal } from '../goalStatus';
import { GoalStatusBadge } from './GoalStatusBadge';

/** Staff goal row: wording, status, last accuracy, and the "mastery reached" confirmation. */
export function GoalCard({
  goal: g,
  canManage,
  onConfirmMastery,
  confirming,
}: {
  goal: GoalWithStats;
  canManage: boolean;
  onConfirmMastery?: () => void;
  confirming?: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation('goals');
  const suggest = g.masterySuggested && isActiveGoal(g.status);
  return (
    <Card onPress={() => router.push(`/goal/${g.id}`)} accessibilityHint={t('common:a11y.opensDetails')} testID={`goal-${g.id}`}>
      <Stack gap={2}>
        <Row justify="between" gap={2} align="flex-start">
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {g.staffText}
          </Text>
          <GoalStatusBadge status={g.status} />
        </Row>
        <Row gap={2} align="flex-start">
          <Users size={14} color={theme.colors.textSubtle} style={{ marginTop: 3 }} />
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {t('card.parentSees', { text: g.parentText })}
          </Text>
        </Row>
        <Row gap={3} wrap>
          <Text variant="caption" color="textMuted">
            {vocabLabel(t, 'domains', g.domain)}
          </Text>
          <Text variant="caption" color="textMuted">
            {g.lastAccuracy != null ? t('card.lastAccuracy', { value: Math.round(g.lastAccuracy) }) : t('card.noTrials')}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('card.rule', { accuracy: g.masteryRule.accuracy, sessions: g.masteryRule.consecutiveSessions })}
          </Text>
        </Row>
        {suggest && canManage ? (
          <Card tone="success" padding={3} elevated={false} testID={`mastery-banner-${g.id}`}>
            <Stack gap={2}>
              <Row gap={2}>
                <Award size={18} color={theme.colors.success} />
                <Text variant="label" color="success" weight="semibold" style={{ flex: 1 }}>
                  {t('mastery.banner')}
                </Text>
              </Row>
              <Text variant="caption" color="textMuted">
                {t('mastery.bannerBody', { accuracy: g.masteryRule.accuracy, count: g.masteryRule.consecutiveSessions })}
              </Text>
              <Button label={t('mastery.confirm')} icon={Award} size="sm" onPress={onConfirmMastery} loading={confirming} />
            </Stack>
          </Card>
        ) : null}
      </Stack>
    </Card>
  );
}
