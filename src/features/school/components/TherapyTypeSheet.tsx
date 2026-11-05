import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { TherapyType } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Icon, Sheet, Stack, Text, TextField } from '@/ui';

import { isNameTaken, nextFreeSwatch, THERAPY_ICONS, THERAPY_SWATCHES } from '../palette';

export interface TherapyTypeForm {
  id?: string;
  name: string;
  color: string;
  icon: string;
}

export function TherapyTypeSheet({
  visible,
  initial,
  existing,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  /** null = new type. */
  initial: TherapyType | null;
  existing: TherapyType[];
  onClose: () => void;
  onSave: (f: TherapyTypeForm) => void;
  saving: boolean;
}) {
  const { t: tr } = useTranslation('school');
  return (
    <Sheet visible={visible} onClose={onClose} title={initial ? tr('therapyTypes.editTitle') : tr('therapyTypes.addTitle')} testID="therapy-type-sheet">
      {visible ? <Form key={initial?.id ?? 'new'} initial={initial} existing={existing} onSave={onSave} onCancel={onClose} saving={saving} /> : null}
    </Sheet>
  );
}

function Form({ initial, existing, onSave, onCancel, saving }: { initial: TherapyType | null; existing: TherapyType[]; onSave: (f: TherapyTypeForm) => void; onCancel: () => void; saving: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const [f, setF] = useState<TherapyTypeForm>(() =>
    initial
      ? { id: initial.id, name: initial.name, color: initial.color, icon: initial.icon }
      : { name: '', color: nextFreeSwatch(existing.map((e) => e.color)), icon: 'puzzle' },
  );
  const [touched, setTouched] = useState(false);
  const error = !f.name.trim() ? tr('therapyTypes.nameRequired') : isNameTaken(f.name, existing, f.id) ? tr('therapyTypes.nameTaken') : undefined;

  return (
    <Stack gap={4}>
      <TextField
        testID="therapy-type-name"
        label={tr('therapyTypes.name')}
        required
        value={f.name}
        onChangeText={(name) => setF({ ...f, name })}
        placeholder={tr('therapyTypes.namePlaceholder')}
        error={touched ? error : undefined}
        autoCapitalize="words"
      />
      <Stack gap={2}>
        <Text variant="label">{tr('therapyTypes.colour')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {THERAPY_SWATCHES.map((s) => {
            const selected = s.color.toLowerCase() === f.color.toLowerCase();
            return (
              <Pressable
                key={s.key}
                onPress={() => setF({ ...f, color: s.color })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={tr(`therapyTypes.colours.${s.key}`)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: s.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: selected ? 3 : 0,
                  borderColor: t.colors.text,
                }}
              >
                {selected ? <Check size={22} color={t.colors.surface} strokeWidth={3} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Stack>
      <Stack gap={2}>
        <Text variant="label">{tr('therapyTypes.icon')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {THERAPY_ICONS.map((name) => {
            const selected = name === f.icon;
            return (
              <Pressable
                key={name}
                onPress={() => setF({ ...f, icon: name })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={tr(`therapyTypes.icons.${name}`)}
                style={{
                  minWidth: 72,
                  minHeight: 64,
                  paddingHorizontal: t.space[2],
                  borderRadius: t.radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  borderWidth: 1.5,
                  borderColor: selected ? t.colors.primary : t.colors.border,
                  backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
                }}
              >
                <Icon name={name} size={22} tint={f.color} />
                <Text variant="caption" tint={selected ? t.colors.primaryText : t.colors.textMuted} numberOfLines={1}>
                  {tr(`therapyTypes.icons.${name}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Stack>
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Button label={tr('common:actions.cancel')} variant="ghost" onPress={onCancel} />
        <Button
          testID="therapy-type-save"
          label={tr('common:actions.save')}
          loading={saving}
          style={{ flex: 1 }}
          onPress={() => {
            setTouched(true);
            if (!error) onSave({ ...f, name: f.name.trim().replace(/\s+/g, ' ') });
          }}
        />
      </View>
    </Stack>
  );
}
