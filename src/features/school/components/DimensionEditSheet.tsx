import { RotateCcw } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { DEFAULT_DIMENSIONS } from '@/domain/constants';
import type { RatingDimension, RatingValue } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Sheet, Stack, Text, TextField, toast } from '@/ui';

const VALUES: RatingValue[] = [1, 2, 3, 4, 5];

type Wording = Pick<RatingDimension, 'label' | 'parentLabel' | 'description' | 'anchors'>;

export function wordingErrors(w: Wording): { label?: boolean; anchors: RatingValue[] } {
  return { label: !w.label.trim() || undefined, anchors: VALUES.filter((v) => !w.anchors[v]?.trim()) };
}

/** The five pills exactly as therapists see them, with the anchor for the chosen value. */
export function AnchorPreview({ anchors }: { anchors: Record<RatingValue, string> }) {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const [value, setValue] = useState<RatingValue>(3);
  return (
    <Card tone="sunken" elevated={false} padding={3}>
      <Stack gap={2}>
        <Text variant="label">{tr('dimensions.preview')}</Text>
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          {VALUES.map((v) => {
            const active = v === value;
            return (
              <Pressable
                key={v}
                onPress={() => setValue(v)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${v}: ${anchors[v]}`}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: t.radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? t.colors.scale[v - 1] : t.colors.surface,
                  borderWidth: 2,
                  borderColor: active ? t.colors.text : t.colors.scale[v - 1],
                }}
              >
                <Text variant="heading" tint={t.colors.text}>
                  {v}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text accessibilityLiveRegion="polite">{anchors[value] || '—'}</Text>
        <Text variant="caption" color="textMuted">
          {tr('dimensions.previewHint')}
        </Text>
      </Stack>
    </Card>
  );
}

export function DimensionEditSheet({
  dimension,
  onClose,
  onSave,
  saving,
}: {
  dimension: RatingDimension | null;
  onClose: () => void;
  onSave: (d: RatingDimension) => void;
  saving: boolean;
}) {
  const { t: tr } = useTranslation('school');
  return (
    <Sheet visible={!!dimension} onClose={onClose} title={dimension ? tr('dimensions.editTitle', { label: dimension.label }) : ''} testID="dimension-sheet">
      {dimension ? <EditForm key={dimension.id} dimension={dimension} onSave={onSave} saving={saving} onCancel={onClose} /> : null}
    </Sheet>
  );
}

function EditForm({ dimension, onSave, saving, onCancel }: { dimension: RatingDimension; onSave: (d: RatingDimension) => void; saving: boolean; onCancel: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const [w, setW] = useState<Wording>({ label: dimension.label, parentLabel: dimension.parentLabel, description: dimension.description, anchors: { ...dimension.anchors } });
  const [touched, setTouched] = useState(false);
  const def = DEFAULT_DIMENSIONS.find((d) => d.key === dimension.key);
  const errs = wordingErrors(w);
  const invalid = !!errs.label || errs.anchors.length > 0;

  const save = () => {
    setTouched(true);
    if (invalid) return;
    onSave({
      ...dimension,
      label: w.label.trim(),
      parentLabel: w.parentLabel.trim() || w.label.trim(),
      description: w.description.trim(),
      anchors: { 1: w.anchors[1].trim(), 2: w.anchors[2].trim(), 3: w.anchors[3].trim(), 4: w.anchors[4].trim(), 5: w.anchors[5].trim() },
    });
  };

  return (
    <Stack gap={4}>
      <TextField
        testID="dim-label"
        label={tr('dimensions.label')}
        required
        value={w.label}
        onChangeText={(label) => setW({ ...w, label })}
        error={touched && errs.label ? tr('dimensions.labelRequired') : undefined}
      />
      <TextField label={tr('dimensions.parentLabel')} helper={tr('dimensions.parentLabelHelp')} value={w.parentLabel} onChangeText={(parentLabel) => setW({ ...w, parentLabel })} />
      <TextField label={tr('dimensions.description')} multiline minLines={2} value={w.description} onChangeText={(description) => setW({ ...w, description })} />
      {VALUES.map((v) => (
        <View key={v} style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start' }}>
          <View style={{ width: 36, height: 36, marginTop: 28, borderRadius: 18, backgroundColor: t.colors.scale[v - 1], alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="subheading" tint={t.colors.text}>
              {v}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              testID={`dim-anchor-${v}`}
              label={tr('dimensions.anchor', { value: v })}
              required
              multiline
              minLines={2}
              value={w.anchors[v]}
              onChangeText={(text) => setW({ ...w, anchors: { ...w.anchors, [v]: text } })}
              error={touched && errs.anchors.includes(v) ? tr('dimensions.anchorRequired', { value: v }) : undefined}
            />
          </View>
        </View>
      ))}
      <AnchorPreview anchors={w.anchors} />
      {def ? (
        <Button
          variant="ghost"
          icon={RotateCcw}
          label={tr('dimensions.reset')}
          onPress={() => {
            setW({ label: def.label, parentLabel: def.parentLabel, description: def.description, anchors: { ...def.anchors } });
            toast.info(tr('dimensions.resetDone'));
          }}
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Button label={tr('common:actions.cancel')} variant="ghost" onPress={onCancel} />
        <Button testID="dim-save" label={tr('common:actions.save')} onPress={save} loading={saving} style={{ flex: 1 }} />
      </View>
    </Stack>
  );
}
