// Handover brief, "where we are": plan, alerts, goals, last 3 sessions, what worked, home practice.
import { Award, ClipboardList, House, ThumbsDown, ThumbsUp, TriangleAlert, Video } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Alert, GoalStatus, GoalWithStats, HandoverBrief, HomeLog, HomeTask, RatingDimension, SessionSummary } from '@/domain/types';
import { chipLabel, dimensionText } from '@/i18n/labels';
import { formatDay, timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Chip, Delta, Divider, Row, Sparkline, Stack, Text, type Tone } from '@/ui';

import { promptLabel } from '../../labels';
import { dedupeChips } from '../../summaries';

const STATUS_TONE: Record<GoalStatus, Tone> = {
  not_started: 'neutral',
  emerging: 'neutral',
  progressing: 'info',
  mastered: 'success',
  maintenance: 'success',
  paused: 'neutral',
};
/** Dimensions shown on each recent-session row (scannable, not all eight). */
const KEY_DIMENSIONS = ['engagement', 'attention', 'regulation', 'mood'];

export function PlanCard({ plan, goals }: { plan: HandoverBrief['planForToday']; goals: GoalWithStats[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('brief');
  const planned = plan ? goals.filter((g) => plan.goalIds.includes(g.id)) : [];
  return (
    <Card tone="primary" padding={4} testID="brief-plan">
      <Stack gap={3}>
        <Row gap={2}>
          <ClipboardList size={20} color={t.colors.primaryText} />
          <Text variant="heading" tint={t.colors.primaryText}>
            {tr('plan.title')}
          </Text>
        </Row>
        {plan ? (
          <>
            <Text variant="bodyStrong">{plan.text}</Text>
            {planned.length ? (
              <Stack gap={2}>
                <Text variant="label" color="textMuted">
                  {tr('plan.goals')}
                </Text>
                {planned.map((g) => (
                  <Text key={g.id}>{`• ${g.staffText}`}</Text>
                ))}
              </Stack>
            ) : null}
            <Text variant="caption" color="textMuted">
              {tr('plan.by', { name: plan.byName, date: formatDay(plan.date) })}
            </Text>
          </>
        ) : (
          <Text>{tr('plan.empty')}</Text>
        )}
      </Stack>
    </Card>
  );
}

export function AlertsCard({ alerts }: { alerts: Alert[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('brief');
  if (!alerts.length) return null;
  return (
    <Card tone="warning" padding={4}>
      <Stack gap={2}>
        <Row gap={2}>
          <TriangleAlert size={20} color={t.colors.warning} />
          <Text variant="subheading" tint={t.colors.warning}>
            {tr('alerts')}
          </Text>
        </Row>
        {alerts.map((a) => (
          <Text key={a.id}>{a.message}</Text>
        ))}
      </Stack>
    </Card>
  );
}

export function GoalsCard({ goals, plannedIds }: { goals: GoalWithStats[]; plannedIds: string[] }) {
  const { t } = useTranslation('brief');
  if (!goals.length) {
    return (
      <Card tone="sunken">
        <Text color="textMuted">{t('goals.empty')}</Text>
      </Card>
    );
  }
  return (
    <Card padding={4}>
      <Stack gap={3}>
        {goals.map((g, i) => (
          <Stack key={g.id} gap={2}>
            {i > 0 ? <Divider /> : null}
            <Text variant="bodyStrong">{g.staffText}</Text>
            <Row gap={2} wrap>
              <Badge label={t(`goalStatus.${g.status}`)} tone={STATUS_TONE[g.status]} />
              {plannedIds.includes(g.id) ? <Badge label={t('goals.planned')} tone="primary" /> : null}
              {g.masterySuggested ? <Badge label={t('goals.masterySuggested')} tone="success" icon={Award} /> : null}
            </Row>
            <Text variant="label" color="textMuted">
              {[
                g.lastAccuracy != null ? t('goals.last', { value: Math.round(g.lastAccuracy) }) : t('goals.noData'),
                g.lastPromptLevel ? promptLabel(t, g.lastPromptLevel) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}

function SessionRow({ s, dims }: { s: SessionSummary; dims: RatingDimension[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('brief');
  const key = KEY_DIMENSIONS.map((k) => dims.find((d) => d.key === k)).filter((d): d is RatingDimension => !!d && s.ratings[d.key] != null);
  const dimText = key.map((d) => `${dimensionText(tr, d).parentLabel} ${s.ratings[d.key]}`);
  return (
    <View
      accessible
      accessibilityLabel={tr('recent.rowA11y', { date: formatDay(s.date), therapist: s.therapistName, score: Math.round(s.sessionScore), dims: dimText.join(', ') })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}
    >
      <Stack gap={1} flex={1}>
        <Row gap={2} wrap>
          <Text variant="label" weight="semibold">
            {formatDay(s.date)}
          </Text>
          <Text variant="caption" color="textMuted">
            {s.therapistName}
          </Text>
          {s.isSubstitute ? <Badge label={tr('recent.sub')} /> : null}
        </Row>
        <Row gap={2} wrap>
          {key.map((d) => (
            <Row key={d.key} gap={1}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.scale[s.ratings[d.key] - 1] }} />
              <Text variant="caption" color="textMuted">{`${dimensionText(tr, d).parentLabel} ${s.ratings[d.key]}`}</Text>
            </Row>
          ))}
        </Row>
      </Stack>
      <Stack align="flex-end" gap={1}>
        <Text variant="heading">{Math.round(s.sessionScore)}</Text>
        <Delta value={s.deltaLast} />
      </Stack>
    </View>
  );
}

export function RecentSessionsCard({ sessions, dims }: { sessions: SessionSummary[]; dims: RatingDimension[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('brief');
  if (!sessions.length) {
    return (
      <Card tone="sunken">
        <Text color="textMuted">{tr('recent.empty')}</Text>
      </Card>
    );
  }
  const scores = [...sessions].reverse().map((s) => s.sessionScore);
  return (
    <Card padding={4}>
      <Stack gap={3}>
        <Row justify="end">
          <Sparkline values={scores} domain={[0, 100]} width={120} height={32} color={t.colors.primary} />
        </Row>
        {sessions.slice(0, 3).map((s, i) => (
          <Stack key={s.id} gap={3}>
            {i > 0 ? <Divider /> : null}
            <SessionRow s={s} dims={dims} />
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}

export function WorkedCard({ worked, didnt }: { worked: string[]; didnt: string[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('brief');
  const block = (title: string, Icon: typeof ThumbsUp, items: string[], group: 'worked' | 'notWorked', color: string) => (
    <Stack gap={2}>
      <Row gap={2}>
        <Icon size={18} color={color} />
        <Text variant="subheading">{title}</Text>
      </Row>
      {items.length ? (
        <Row gap={2} wrap>
          {dedupeChips(items).map((c) => (
            <Chip key={c} size="sm" label={chipLabel(tr, group, c)} />
          ))}
        </Row>
      ) : (
        <Text variant="label" color="textSubtle">
          {tr('nothingYet')}
        </Text>
      )}
    </Stack>
  );
  return (
    <Card padding={4}>
      <Stack gap={4}>
        {block(tr('worked'), ThumbsUp, worked, 'worked', t.colors.success)}
        {block(tr('didnt'), ThumbsDown, didnt, 'notWorked', t.colors.warning)}
      </Stack>
    </Card>
  );
}

export function HomePracticeCard({ tasks, feedback }: { tasks: HomeTask[]; feedback?: HomeLog }) {
  const t = useTheme();
  const { t: tr } = useTranslation('brief');
  return (
    <Card padding={4}>
      <Stack gap={3}>
        <Row gap={2}>
          <House size={18} color={t.colors.primaryText} />
          <Text variant="subheading">{tr('home.title')}</Text>
        </Row>
        {tasks.length ? (
          tasks.map((task) => (
            <Row key={task.id} justify="between" gap={2}>
              <Text style={{ flex: 1 }}>{task.title}</Text>
              <Text variant="caption" color="textMuted">
                {tr('home.perWeek', { count: task.frequencyPerWeek })}
              </Text>
            </Row>
          ))
        ) : (
          <Text variant="label" color="textSubtle">
            {tr('home.empty')}
          </Text>
        )}
        {feedback ? (
          <>
            <Divider />
            <Text variant="label" color="textMuted">
              {tr('home.latestFeedback')}
            </Text>
            <Text variant="bodyStrong">{feedback.taskTitle}</Text>
            <Row gap={2} wrap>
              <Badge label={tr(`home.outcome.${feedback.outcome}`)} tone={feedback.outcome === 'done' ? 'success' : feedback.outcome === 'partly' ? 'info' : 'warning'} />
              <Badge label={tr(`home.difficulty.${feedback.difficulty}`)} />
              {feedback.useInNextSession ? <Badge label={tr('home.useInSession')} tone="primary" icon={Video} /> : null}
            </Row>
            {feedback.note ? <Text>{`“${feedback.note}”`}</Text> : null}
            <Text variant="caption" color="textSubtle">{`${feedback.loggedByName} · ${timeAgo(feedback.createdAt)}`}</Text>
          </>
        ) : null}
      </Stack>
    </Card>
  );
}
