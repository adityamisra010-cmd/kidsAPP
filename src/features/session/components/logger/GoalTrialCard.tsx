// One goal targeted this session: tries/correct counts (tap-only), accuracy, prompt level, note.
import { NotebookPen, X } from 'lucide-react-native';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { PROMPT_LEVELS } from '@/domain/constants';
import type { GoalWithStats, PromptLevel } from '@/domain/types';
import { vocabLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Chip, ChipGroup, Row, Stack, Stepper, Text, TextField } from '@/ui';

import { promptLabel } from '../../labels';
import { issueId, trialAccuracyPercent, type TrialDraft } from '../../logic/draft';
import { useTargetRef } from './scrollTargets';

const QUICK_TRIES = [5, 10, 15, 20];
/** Show one-tap "correct" counts up to this many tries; steppers handle the rest. */
const MAX_PICK = 10;

function GoalTrialCardBase({
  goal,
  trial,
  planned,
  fallbackPrompt,
  invalid,
  onChange,
  onRemove,
}: {
  goal: GoalWithStats;
  trial: TrialDraft;
  planned: boolean;
  fallbackPrompt?: PromptLevel;
  invalid: boolean;
  onChange: (goalId: string, patch: Partial<TrialDraft>) => void;
  onRemove: (goalId: string) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const ref = useTargetRef(issueId.trial(goal.id));
  const [noteOpen, setNoteOpen] = useState(trial.note.length > 0);
  const accuracy = trialAccuracyPercent(trial);
  const setTries = (attempted: number) => onChange(goal.id, { attempted, successful: Math.min(trial.successful, attempted) });

  return (
    <View ref={ref}>
      <Card padding={4} testID={`goal-trial-${goal.id}`}>
        <Stack gap={3}>
          <Row gap={2} align="flex-start">
            <Stack gap={1} flex={1}>
              <Text variant="subheading">{goal.staffText}</Text>
              <Row gap={2} wrap>
                {planned ? <Badge label={tr('logger.goals.planned')} tone="primary" /> : null}
                <Text variant="caption" color="textMuted">
                  {vocabLabel(tr, 'domains', goal.domain)}
                </Text>
                {goal.lastAccuracy != null ? (
                  <Text variant="caption" color="textMuted">
                    {`· ${tr('logger.goals.lastAccuracy', { value: Math.round(goal.lastAccuracy) })}`}
                  </Text>
                ) : null}
              </Row>
            </Stack>
            <Pressable
              onPress={() => onRemove(goal.id)}
              accessibilityRole="button"
              accessibilityLabel={tr('logger.goals.removeA11y', { goal: goal.staffText })}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 40, paddingHorizontal: 4 }}
            >
              <X size={16} color={t.colors.textMuted} />
              <Text variant="caption" color="textMuted" weight="medium">
                {tr('logger.goals.remove')}
              </Text>
            </Pressable>
          </Row>

          <Row gap={6} wrap>
            <Stepper testID={`tries-${goal.id}`} label={tr('logger.goals.tries')} value={trial.attempted} onChange={setTries} min={0} max={99} />
            <Stepper
              testID={`correct-${goal.id}`}
              label={tr('logger.goals.correct')}
              value={trial.successful}
              onChange={(successful) => onChange(goal.id, { successful })}
              min={0}
              max={trial.attempted}
            />
          </Row>

          <Stack gap={2}>
            <Text variant="caption" color="textMuted">
              {tr('logger.goals.quickTries')}
            </Text>
            <Row gap={2} wrap>
              {QUICK_TRIES.map((n) => (
                <Chip key={n} label={String(n)} selected={trial.attempted === n} onPress={() => setTries(n)} testID={`quick-tries-${goal.id}-${n}`} />
              ))}
            </Row>
          </Stack>

          {trial.attempted > 0 && trial.attempted <= MAX_PICK ? (
            <Stack gap={2}>
              <Text variant="caption" color="textMuted">
                {tr('logger.goals.pickCorrect')}
              </Text>
              <Row gap={2} wrap>
                {Array.from({ length: trial.attempted + 1 }, (_, n) => (
                  <Chip key={n} label={String(n)} selected={trial.successful === n} onPress={() => onChange(goal.id, { successful: n })} />
                ))}
              </Row>
            </Stack>
          ) : null}

          <Text variant="bodyStrong" color={accuracy == null ? 'textMuted' : 'text'} accessibilityLiveRegion="polite">
            {accuracy == null ? tr('logger.goals.noTries') : tr('logger.goals.accuracy', { value: accuracy })}
          </Text>

          <Stack gap={2}>
            <Text variant="label">{tr('logger.goals.prompt')}</Text>
            <ChipGroup
              single
              options={PROMPT_LEVELS.map((p) => ({ value: String(p), label: promptLabel(tr, p) }))}
              value={trial.promptLevel ? [String(trial.promptLevel)] : []}
              onChange={(v) => onChange(goal.id, { promptLevel: v[0] ? (Number(v[0]) as PromptLevel) : undefined })}
            />
            {trial.promptLevel == null && trial.attempted > 0 ? (
              invalid ? (
                <Text variant="label" color="danger" weight="semibold">
                  {tr('logger.goals.promptNeeded')}
                </Text>
              ) : fallbackPrompt ? (
                <Text variant="caption" color="textMuted">
                  {tr('logger.goals.promptFallback', { level: promptLabel(tr, fallbackPrompt) })}
                </Text>
              ) : null
            ) : null}
          </Stack>

          {noteOpen ? (
            <TextField
              label={tr('logger.goals.note')}
              placeholder={tr('logger.goals.notePlaceholder')}
              value={trial.note}
              onChangeText={(note) => onChange(goal.id, { note })}
              multiline
              minLines={2}
            />
          ) : (
            <Pressable
              onPress={() => setNoteOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={tr('logger.goals.addNote')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, alignSelf: 'flex-start' }}
            >
              <NotebookPen size={16} color={t.colors.primaryText} />
              <Text variant="label" color="primaryText" weight="semibold">
                {tr('logger.goals.addNote')}
              </Text>
            </Pressable>
          )}
        </Stack>
      </Card>
    </View>
  );
}

export const GoalTrialCard = memo(GoalTrialCardBase);
