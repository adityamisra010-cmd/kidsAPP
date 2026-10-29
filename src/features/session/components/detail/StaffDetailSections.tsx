// Staff session detail sections: header, score, dimensions, trials, behaviour, judgement, notes, amendments.
import { History, Lock, PencilLine, Share2, ThumbsDown, ThumbsUp, TriangleAlert, UserCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Amendment, AppointmentView, GoalWithStats, RatingDimension, SessionLog } from '@/domain/types';
import { chipLabel, dimensionText, vocabLabel } from '@/i18n/labels';
import { formatDay, formatTime, timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Card, Chip, Delta, Divider, Row, Stack, Text, TrendIndicator, TypeTag } from '@/ui';

import { comparedLabel, promptLabel } from '../../labels';
import { enabledDimensions, isLocked } from '../../logic/draft';
import { useIncidentText } from '../logger/BehaviourSection';

export function StaffHeaderCard({ log, appointment: a }: { log: SessionLog; appointment?: AppointmentView }) {
  const { t } = useTranslation('session');
  const locked = isLocked(log);
  return (
    <Card padding={4} accent={a?.therapyTypeColor}>
      <Stack gap={3}>
        <Row gap={3}>
          <Avatar name={a?.childName ?? ''} uri={a?.childPhotoUrl} size={52} />
          <Stack gap={1} flex={1}>
            <Text variant="heading">{a?.childName ?? ''}</Text>
            {a ? <TypeTag name={a.therapyTypeName} color={a.therapyTypeColor} /> : null}
            <Text variant="label" color="textMuted">
              {a ? `${formatDay(log.date)} · ${formatTime(a.startsAt)}` : formatDay(log.date)}
            </Text>
          </Stack>
        </Row>
        <Text variant="label">{t('detail.loggedBy', { name: log.therapistName })}</Text>
        <Row gap={2} wrap>
          {log.isSubstitute ? <Badge label={t('detail.substituteTag')} tone="warning" icon={UserCheck} /> : null}
          {log.amendmentCount > 0 ? <Badge label={t('detail.amendedTag')} tone="info" icon={History} /> : null}
          {locked ? (
            <Badge label={t('detail.lockedTag')} icon={Lock} />
          ) : (
            <Badge label={t('detail.editableUntil', { time: `${formatDay(log.lockedAt)}, ${formatTime(log.lockedAt)}` })} icon={PencilLine} />
          )}
        </Row>
      </Stack>
    </Card>
  );
}

export function ScoreCard({ log }: { log: SessionLog }) {
  const { t } = useTranslation('session');
  const m = log.metrics;
  const stat = (label: string, node: ReactNode) => (
    <Stack gap={1} style={{ minWidth: 110, flexGrow: 1 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      {node}
    </Stack>
  );
  return (
    <Card padding={4}>
      <Stack gap={3}>
        <Text variant="caption" color="textMuted">
          {t('detail.score')}
        </Text>
        <Row gap={1} align="flex-end">
          <Text variant="display">{Math.round(m.sessionScore)}</Text>
          <Text variant="label" color="textMuted" style={{ marginBottom: 6 }}>
            {t('result.outOf')}
          </Text>
        </Row>
        <Row gap={4} wrap align="flex-start">
          {stat(t('result.vsLast'), <Delta value={m.deltaLast} />)}
          {m.deltaRolling != null ? stat(t('result.vsAverage'), <Delta value={m.deltaRolling} />) : null}
          {stat(t('result.trend'), <TrendIndicator trend={m.trend} size="sm" />)}
        </Row>
        <Divider />
        <Row gap={4} wrap>
          {stat(t('detail.goalAccuracy'), <Text variant="subheading">{m.goalAccuracy != null ? `${Math.round(m.goalAccuracy)}%` : '—'}</Text>)}
          {stat(t('detail.incidents'), <Text variant="subheading">{String(m.incidentCount)}</Text>)}
          {stat(
            t('logger.context.duration'),
            <Text variant="subheading">{`${t('detail.duration', { minutes: log.actualMinutes })}${log.startedLate ? ` · ${t('detail.startedLate')}` : ''}`}</Text>,
          )}
        </Row>
      </Stack>
    </Card>
  );
}

export function DimensionsCard({ log, dims }: { log: SessionLog; dims: RatingDimension[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const shown = enabledDimensions(dims).filter((d) => log.ratings[d.key] != null);
  return (
    <Card padding={4}>
      <Stack gap={3}>
        <Text variant="subheading">{tr('detail.dimensions')}</Text>
        <Text variant="label" color="textMuted">
          {tr('detail.energyState', { state: vocabLabel(tr, 'regulation', log.regulationState) })}
        </Text>
        {shown.map((d) => {
          const v = log.ratings[d.key];
          const text = dimensionText(tr, d);
          const dm = log.metrics.dimensions[d.key];
          return (
            <Stack key={d.key} gap={2}>
              <Divider />
              <Row gap={3} align="flex-start">
                <View
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.scale[v - 1], alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text variant="subheading" tint={t.scheme === 'dark' ? t.colors.bg : t.colors.text}>
                    {v}
                  </Text>
                </View>
                <Stack gap={1} flex={1}>
                  <Text variant="bodyStrong">{text.label}</Text>
                  <Text variant="label" color="textMuted">
                    {d.key === 'independence' ? promptLabel(tr, v) : text.anchor(v)}
                  </Text>
                </Stack>
                <Stack gap={1} align="flex-end">
                  <Row gap={1}>
                    <Delta value={dm?.deltaLast} />
                    <Text variant="caption" color="textSubtle">
                      {tr('detail.vsLastShort')}
                    </Text>
                  </Row>
                  {dm ? <TrendIndicator trend={dm.trend} size="sm" /> : null}
                </Stack>
              </Row>
            </Stack>
          );
        })}
      </Stack>
    </Card>
  );
}

export function TrialsCard({ log, goals }: { log: SessionLog; goals: GoalWithStats[] }) {
  const { t } = useTranslation('session');
  return (
    <Card padding={4}>
      <Stack gap={3}>
        <Text variant="subheading">{t('detail.goals')}</Text>
        {log.goalTrials.length === 0 ? <Text color="textMuted">{t('detail.noGoals')}</Text> : null}
        {log.goalTrials.map((g, i) => {
          const successful = Math.min(g.successful, g.attempted);
          const acc = g.attempted ? Math.round((successful / g.attempted) * 100) : 0;
          return (
            <Stack key={g.goalId} gap={1}>
              {i > 0 ? <Divider /> : null}
              <Text variant="bodyStrong">{goals.find((x) => x.id === g.goalId)?.staffText ?? '—'}</Text>
              <Text variant="label" color="textMuted">
                {`${t('result.goalLine', { successful, attempted: g.attempted, accuracy: acc })} · ${promptLabel(t, g.promptLevel)}`}
              </Text>
              {g.note ? <Text>{g.note}</Text> : null}
            </Stack>
          );
        })}
      </Stack>
    </Card>
  );
}

export function BehaviourCard({ log }: { log: SessionLog }) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const describe = useIncidentText();
  return (
    <Card padding={4}>
      <Stack gap={2}>
        <Text variant="subheading">{tr('detail.behaviour')}</Text>
        {log.incidents.length === 0 ? <Text color="textMuted">{tr('detail.noIncidents')}</Text> : null}
        {log.incidents.map((inc, i) => (
          <Row key={i} gap={2}>
            <TriangleAlert size={16} color={t.colors.warning} />
            <Text style={{ flex: 1 }}>{describe(inc)}</Text>
          </Row>
        ))}
        <Text variant="label" color="textMuted">
          {tr('detail.breaks', { count: log.breaksCount })}
        </Text>
      </Stack>
    </Card>
  );
}

export function JudgementCard({ log }: { log: SessionLog }) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const block = (title: string, Icon: typeof ThumbsUp, tags: string[], text: string, group: 'worked' | 'notWorked') => (
    <Stack gap={2}>
      <Row gap={2}>
        <Icon size={16} color={t.colors.textMuted} />
        <Text variant="label" weight="semibold">
          {title}
        </Text>
      </Row>
      {tags.length ? (
        <Row gap={2} wrap>
          {tags.map((c) => (
            <Chip key={c} size="sm" label={chipLabel(tr, group, c)} />
          ))}
        </Row>
      ) : null}
      {text ? <Text>{text}</Text> : null}
      {!tags.length && !text ? <Text color="textSubtle">{tr('detail.noteEmpty')}</Text> : null}
    </Stack>
  );
  return (
    <Card padding={4}>
      <Stack gap={3}>
        <Text variant="subheading">{tr('detail.judgement')}</Text>
        <Text>{tr('detail.compared', { value: comparedLabel(tr, log.comparedToLast) })}</Text>
        {block(tr('detail.worked'), ThumbsUp, log.workedTags, log.workedText, 'worked')}
        {block(tr('detail.notWorked'), ThumbsDown, log.notWorkedTags, log.notWorkedText, 'notWorked')}
      </Stack>
    </Card>
  );
}

export function NotesCard({ log, goals }: { log: SessionLog; goals: GoalWithStats[] }) {
  const { t } = useTranslation('session');
  const n = log.notes;
  const field = (label: string, value: string) => (
    <Stack gap={1}>
      <Text variant="label" color="textMuted">
        {label}
      </Text>
      <Text>{value || t('detail.noteEmpty')}</Text>
    </Stack>
  );
  const planGoals = goals.filter((g) => n.planGoalIds.includes(g.id));
  return (
    <>
      <Card padding={4}>
        <Stack gap={3}>
          <Row justify="between">
            <Text variant="subheading">{t('detail.notes')}</Text>
            <Badge label={t('logger.notes.staffOnly')} icon={Lock} />
          </Row>
          {field(t('logger.notes.s'), n.subjective)}
          {field(t('logger.notes.o'), n.objective)}
          {field(t('logger.notes.a'), n.assessment)}
          {field(t('logger.notes.p'), n.planNext)}
          {planGoals.length ? (
            <Stack gap={1}>
              <Text variant="label" color="textMuted">
                {t('detail.planGoals')}
              </Text>
              {planGoals.map((g) => (
                <Text key={g.id}>{`• ${g.staffText}`}</Text>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Card>
      <Card padding={4} tone="primary">
        <Stack gap={2}>
          <Row justify="between" gap={2}>
            <Text variant="subheading" style={{ flex: 1 }}>
              {t('detail.parentSummary')}
            </Text>
            <Badge label={t('logger.notes.sharedWithParents')} icon={Share2} tone="primary" />
          </Row>
          <Text>{n.parentSummary || t('detail.noteEmpty')}</Text>
        </Stack>
      </Card>
    </>
  );
}

export function AmendmentsCard({ amendments }: { amendments: Amendment[] }) {
  const theme = useTheme();
  const { t } = useTranslation('session');
  if (!amendments.length) return null;
  return (
    <Card padding={4}>
      <Stack gap={3}>
        <Row gap={2}>
          <History size={18} color={theme.colors.textMuted} />
          <Text variant="subheading">{t('detail.amendments')}</Text>
        </Row>
        {amendments.map((a, i) => (
          <Stack key={a.id} gap={1}>
            {i > 0 ? <Divider /> : null}
            <Text variant="label" weight="semibold">
              {t('detail.amendmentLine', { field: t(`fields.${a.field}`, { defaultValue: a.field }), name: a.byName, when: timeAgo(a.at) })}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={2}>{`${a.oldValue} → ${a.newValue}`}</Text>
            <Text>{t('detail.amendmentReason', { reason: a.reason })}</Text>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}
