// D. Behaviour log (optional): incidents via chips only, plus breaks taken.
import { Plus, TriangleAlert, X } from 'lucide-react-native';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { CHIPS, INCIDENT_TYPES } from '@/domain/constants';
import type { BehaviourIncident, IncidentType } from '@/domain/types';
import { chipLabel, vocabLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ChipGroup, Divider, Row, SectionHeader, Stack, Stepper, Text } from '@/ui';

import { bucketForSeconds, DURATION_BUCKETS, type DurationBucket } from '../../logic/draft';

export function useIncidentText() {
  const { t } = useTranslation('session');
  return (inc: BehaviourIncident) => {
    const parts = [vocabLabel(t, 'incidents', inc.type)];
    const bucket = bucketForSeconds(inc.durationSeconds);
    if (bucket) parts.push(t(`duration.${bucket}`));
    if (inc.antecedentTags.length) {
      parts.push(
        t('logger.behaviour.after', { list: inc.antecedentTags.map((a) => chipLabel(t, 'antecedents', a)).join(', ') }),
      );
    }
    return parts.join(' · ');
  };
}

function IncidentEditor({ onAdd, onCancel }: { onAdd: (i: BehaviourIncident) => void; onCancel: () => void }) {
  const { t } = useTranslation('session');
  const [type, setType] = useState<IncidentType | undefined>();
  const [bucket, setBucket] = useState<DurationBucket | undefined>();
  const [antecedents, setAntecedents] = useState<string[]>([]);
  return (
    <Card tone="sunken" testID="incident-editor">
      <Stack gap={3}>
        <Text variant="label">{t('logger.behaviour.type')}</Text>
        <ChipGroup
          single
          options={INCIDENT_TYPES.map((v) => ({ value: v, label: vocabLabel(t, 'incidents', v) }))}
          value={type ? [type] : []}
          onChange={(v) => setType(v[0] as IncidentType | undefined)}
        />
        <Text variant="label">{t('logger.behaviour.duration')}</Text>
        <ChipGroup
          single
          options={DURATION_BUCKETS.map((b) => ({ value: b.key, label: t(`durationChip.${b.key}`) }))}
          value={bucket ? [bucket] : []}
          onChange={(v) => setBucket(v[0] as DurationBucket | undefined)}
        />
        <Text variant="label">{t('logger.behaviour.antecedent')}</Text>
        <ChipGroup
          options={CHIPS.antecedents.map((v) => ({ value: v, label: chipLabel(t, 'antecedents', v) }))}
          value={antecedents}
          onChange={setAntecedents}
        />
        <Row gap={2} justify="end">
          <Button label={t('logger.behaviour.cancel')} variant="ghost" onPress={onCancel} />
          <Button
            label={t('logger.behaviour.confirm')}
            icon={Plus}
            disabled={!type}
            testID="incident-confirm"
            onPress={() => {
              if (!type) return;
              const seconds = DURATION_BUCKETS.find((b) => b.key === bucket)?.seconds;
              onAdd({ type, antecedentTags: antecedents, ...(seconds != null ? { durationSeconds: seconds } : {}) });
            }}
          />
        </Row>
      </Stack>
    </Card>
  );
}

function BehaviourSectionBase({
  incidents,
  breaksCount,
  onAddIncident,
  onRemoveIncident,
  onBreaks,
}: {
  incidents: BehaviourIncident[];
  breaksCount: number;
  onAddIncident: (i: BehaviourIncident) => void;
  onRemoveIncident: (index: number) => void;
  onBreaks: (n: number) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const [editing, setEditing] = useState(false);
  const describe = useIncidentText();
  const summary = tr('logger.behaviour.summary', {
    incidents: incidents.length
      ? tr('logger.behaviour.incidents', { count: incidents.length })
      : tr('logger.behaviour.noIncidents'),
    breaks: tr('logger.behaviour.breaks', { count: breaksCount }),
  });
  return (
    <Stack gap={2}>
      <SectionHeader title={tr('logger.sections.behaviour')} subtitle={summary} />
      <Card padding={4}>
        <Stack gap={3}>
          {incidents.map((inc, i) => {
            const text = describe(inc);
            return (
              <View key={`${inc.type}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                <TriangleAlert size={18} color={t.colors.warning} />
                <Text style={{ flex: 1 }}>{text}</Text>
                <Pressable
                  onPress={() => onRemoveIncident(i)}
                  accessibilityRole="button"
                  accessibilityLabel={tr('logger.behaviour.removeA11y', { incident: text })}
                  hitSlop={8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 40 }}
                >
                  <X size={16} color={t.colors.textMuted} />
                  <Text variant="caption" color="textMuted">
                    {tr('logger.behaviour.remove')}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {editing ? (
            <IncidentEditor
              onCancel={() => setEditing(false)}
              onAdd={(inc) => {
                onAddIncident(inc);
                setEditing(false);
              }}
            />
          ) : (
            <Button
              label={tr('logger.behaviour.add')}
              icon={Plus}
              variant="outline"
              onPress={() => setEditing(true)}
              testID="add-incident"
            />
          )}
          <Divider />
          <Stepper
            label={tr('logger.behaviour.breaksLabel')}
            value={breaksCount}
            onChange={onBreaks}
            min={0}
            max={20}
          />
        </Stack>
      </Card>
    </Stack>
  );
}

export const BehaviourSection = memo(BehaviourSectionBase);
