// F. SOAP notes (short) + the parent-facing message with a "What parents will see" preview.
import { Eye, Lock, RotateCcw, Share2, Repeat } from 'lucide-react-native';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SessionSnapshotCard } from '@/components/cards/SessionSnapshotCard';
import type { GoalWithStats, ParentSessionSnapshot, UUID } from '@/domain/types';
import { Badge, Button, Card, ChipGroup, Divider, Row, SectionHeader, Sheet, Stack, Text, TextField } from '@/ui';

import { issueId, type LoggerDraft } from '../../logic/draft';
import { useTargetRef } from './scrollTargets';

type NotesPatch = Partial<Pick<LoggerDraft, 'subjective' | 'objective' | 'assessment' | 'planNext' | 'planGoalIds' | 'parentSummary'>>;

function NotesSectionBase({
  subjective,
  objective,
  assessment,
  planNext,
  planGoalIds,
  parentSummary,
  goals,
  canContinueGoals,
  planInvalid,
  onChange,
  onRegenerateObjective,
  onRegenerateParent,
  onContinueGoals,
  buildPreview,
}: {
  subjective: string;
  /** Text shown (draft or the therapist's edit). */
  objective: string;
  assessment: string;
  planNext: string;
  planGoalIds: UUID[];
  parentSummary: string;
  goals: GoalWithStats[];
  canContinueGoals: boolean;
  planInvalid: boolean;
  onChange: (patch: NotesPatch) => void;
  onRegenerateObjective: () => void;
  onRegenerateParent: () => void;
  onContinueGoals: () => void;
  buildPreview: () => ParentSessionSnapshot;
}) {
  const { t } = useTranslation('session');
  const planRef = useTargetRef(issueId.planNext);
  const [preview, setPreview] = useState<ParentSessionSnapshot | null>(null);

  return (
    <Stack gap={2}>
      <SectionHeader title={t('logger.sections.notes')} />
      <Card padding={4}>
        <Stack gap={4}>
          <Row justify="end">
            <Badge label={t('logger.notes.staffOnly')} icon={Lock} />
          </Row>
          <TextField label={t('logger.notes.s')} placeholder={t('logger.notes.optional')} value={subjective} onChangeText={(v) => onChange({ subjective: v })} multiline minLines={2} />
          <Stack gap={2}>
            <TextField
              testID="objective-field"
              label={t('logger.notes.o')}
              helper={t('logger.notes.oHint')}
              value={objective}
              onChangeText={(v) => onChange({ objective: v })}
              multiline
              minLines={4}
            />
            <Button label={t('logger.notes.regenerate')} icon={RotateCcw} variant="ghost" size="sm" onPress={onRegenerateObjective} style={{ alignSelf: 'flex-start' }} />
          </Stack>
          <TextField label={t('logger.notes.a')} placeholder={t('logger.notes.aPlaceholder')} value={assessment} onChangeText={(v) => onChange({ assessment: v })} multiline minLines={2} />
          <View ref={planRef} style={{ gap: 8 }}>
            <TextField
              testID="plan-field"
              label={t('logger.notes.p')}
              required
              placeholder={t('logger.notes.pPlaceholder')}
              helper={t('logger.notes.pHint')}
              error={planInvalid ? t('logger.notes.pNeeded') : undefined}
              value={planNext}
              onChangeText={(v) => onChange({ planNext: v })}
              multiline
              minLines={3}
            />
            {goals.length ? (
              <Stack gap={2}>
                <Text variant="label">{t('logger.notes.pGoals')}</Text>
                <ChipGroup
                  options={goals.map((g) => ({ value: g.id, label: g.staffText }))}
                  value={planGoalIds}
                  onChange={(planGoalIds) => onChange({ planGoalIds })}
                />
                {canContinueGoals ? (
                  <Button label={t('logger.notes.continueGoals')} icon={Repeat} variant="secondary" size="sm" onPress={onContinueGoals} style={{ alignSelf: 'flex-start' }} />
                ) : null}
              </Stack>
            ) : null}
          </View>
        </Stack>
      </Card>

      <Card padding={4} tone="primary">
        <Stack gap={3}>
          <Row justify="between" gap={2}>
            <Text variant="subheading" style={{ flex: 1 }}>
              {t('logger.notes.parentSummary')}
            </Text>
            <Badge label={t('logger.notes.sharedWithParents')} icon={Share2} tone="primary" />
          </Row>
          <TextField
            testID="parent-summary-field"
            accessibilityLabel={t('logger.notes.parentSummary')}
            helper={t('logger.notes.parentHint')}
            value={parentSummary}
            onChangeText={(v) => onChange({ parentSummary: v })}
            multiline
            minLines={3}
          />
          <Divider />
          <Row gap={2} wrap>
            <Button label={t('logger.notes.preview')} icon={Eye} variant="outline" size="sm" onPress={() => setPreview(buildPreview())} testID="parent-preview" />
            <Button label={t('logger.notes.regenerate')} icon={RotateCcw} variant="ghost" size="sm" onPress={onRegenerateParent} />
          </Row>
        </Stack>
      </Card>

      <Sheet visible={!!preview} onClose={() => setPreview(null)} title={t('logger.notes.preview')} subtitle={t('logger.notes.previewSubtitle')}>
        {preview ? <SessionSnapshotCard snapshot={preview} preview /> : null}
      </Sheet>
    </Stack>
  );
}

export const NotesSection = memo(NotesSectionBase);
