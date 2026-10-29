import { ArrowDown, ArrowUp, CircleCheck, CircleX, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Button, LabeledIconButton, Row, Stack, Text, TextField } from '@/ui';

import { addBullet, MAX_BULLET_LENGTH, MAX_BULLETS, moveBullet, removeBullet, updateBullet } from '../bulletList';

/**
 * Short Do / Don't rules: edit in place, add, remove and reorder (most important first, because the
 * Handover Brief shows the top 3).
 */
export function BulletListEditor({
  label,
  helper,
  items,
  onChange,
  kind,
  placeholder,
  testID,
}: {
  label: string;
  helper?: string;
  items: string[];
  onChange: (next: string[]) => void;
  kind: 'do' | 'dont';
  placeholder: string;
  testID?: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation('child');
  const [draft, setDraft] = useState('');
  const Icon = kind === 'do' ? CircleCheck : CircleX;
  const color = kind === 'do' ? theme.colors.success : theme.colors.danger;
  const full = items.length >= MAX_BULLETS;

  const add = () => {
    const next = addBullet(items, draft);
    if (next !== items) onChange(next);
    setDraft('');
  };

  return (
    <Stack gap={3} testID={testID}>
      <Stack gap={1}>
        <Row gap={2}>
          <Icon size={18} color={color} />
          <Text variant="subheading">{label}</Text>
        </Row>
        {helper ? (
          <Text variant="caption" color="textMuted">
            {helper}
          </Text>
        ) : null}
      </Stack>

      {items.map((item, i) => (
        <View key={i} style={{ gap: theme.space[1], borderLeftWidth: 3, borderLeftColor: color, paddingLeft: theme.space[3] }}>
          <TextField
            value={item}
            onChangeText={(v) => onChange(updateBullet(items, i, v))}
            accessibilityLabel={t('edit.ruleN', { n: i + 1, label })}
            maxLength={MAX_BULLET_LENGTH}
            multiline
            minLines={1}
          />
          <Row gap={1} justify="end">
            <LabeledIconButton icon={ArrowUp} label={t('edit.moveUp')} onPress={() => onChange(moveBullet(items, i, i - 1))} />
            <LabeledIconButton icon={ArrowDown} label={t('edit.moveDown')} onPress={() => onChange(moveBullet(items, i, i + 1))} />
            <LabeledIconButton icon={Trash2} label={t('common:actions.remove')} onPress={() => onChange(removeBullet(items, i))} />
          </Row>
        </View>
      ))}

      {full ? (
        <Text variant="caption" color="textMuted">
          {t('edit.listFull', { max: MAX_BULLETS })}
        </Text>
      ) : (
        <Row gap={2} align="flex-end">
          <View style={{ flex: 1 }}>
            <TextField
              value={draft}
              onChangeText={setDraft}
              placeholder={placeholder}
              accessibilityLabel={t('edit.addTo', { label })}
              maxLength={MAX_BULLET_LENGTH}
              onSubmitEditing={add}
              returnKeyType="done"
              submitBehavior="submit"
            />
          </View>
          <Button label={t('common:actions.add')} icon={Plus} variant="secondary" onPress={add} disabled={!draft.trim()} style={{ height: 52 }} />
        </Row>
      )}
    </Stack>
  );
}
