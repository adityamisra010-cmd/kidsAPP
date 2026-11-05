/**
 * Dynamic list of short steps: type, add, remove, move up/down. Buttons carry words, not just icons.
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Button, Row, Text, TextField } from '@/ui';

import { addStep, MAX_STEP_LENGTH, MAX_STEPS, moveStep, removeStep, updateStep } from '../logic';

export function StepsEditor({ steps, onChange, error }: { steps: string[]; onChange: (s: string[]) => void; error?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  return (
    <View style={{ gap: t.space[3] }}>
      <View style={{ gap: 2 }}>
        <Text variant="label">{tr('assign.steps')}</Text>
        <Text variant="caption" color="textMuted">
          {tr('assign.stepsHint')}
        </Text>
      </View>
      {steps.map((s, i) => (
        <View key={i} style={{ gap: t.space[1] }}>
          <Row gap={2} align="flex-start">
            <View style={{ width: 28, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="subheading" color="primaryText">
                {String(i + 1)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                value={s}
                onChangeText={(text) => onChange(updateStep(steps, i, text))}
                placeholder={tr('assign.stepPlaceholder', { n: i + 1 })}
                accessibilityLabel={tr('task.stepLabel', { n: i + 1 })}
                maxLength={MAX_STEP_LENGTH}
                returnKeyType="next"
                testID={`step-${i}`}
              />
            </View>
          </Row>
          {steps.length > 1 ? (
            <Row gap={1} justify="end">
              <Button size="sm" variant="ghost" icon={ArrowUp} label={tr('assign.moveUp')} disabled={i === 0} onPress={() => onChange(moveStep(steps, i, -1))} />
              <Button size="sm" variant="ghost" icon={ArrowDown} label={tr('assign.moveDown')} disabled={i === steps.length - 1} onPress={() => onChange(moveStep(steps, i, 1))} />
              <Button size="sm" variant="ghost" icon={Trash2} label={tr('assign.removeStep')} onPress={() => onChange(removeStep(steps, i))} />
            </Row>
          ) : null}
        </View>
      ))}
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {steps.length < MAX_STEPS ? (
        <Button variant="outline" icon={Plus} label={tr('assign.addStep')} onPress={() => onChange(addStep(steps))} testID="add-step" />
      ) : null}
    </View>
  );
}
