import type { LucideIcon } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  icon?: LucideIcon;
  /** Multi-line notes field. Voice dictation works via the system keyboard mic. */
  multiline?: boolean;
  minLines?: number;
}

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, helper, error, required, icon: IconCmp, multiline, minLines = 3, onFocus, onBlur, ...rest },
  ref,
) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [focused, setFocused] = useState(false);
  const border = error ? t.colors.danger : focused ? t.colors.primary : t.colors.border;
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="label" color="text">
          {label}
          {required ? <Text variant="label" color="danger">{` *`}</Text> : null}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: t.space[2],
          borderWidth: 1.5,
          borderColor: border,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surface,
          paddingHorizontal: t.space[3],
          minHeight: multiline ? 24 * minLines + 20 : 52,
        }}
      >
        {IconCmp ? (
          <View style={{ paddingTop: multiline ? 14 : 0 }}>
            <IconCmp size={20} color={t.colors.textMuted} />
          </View>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={t.colors.textSubtle}
          accessibilityLabel={label}
          accessibilityHint={required ? tr('common:required') : undefined}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          maxFontSizeMultiplier={1.6}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            flex: 1,
            color: t.colors.text,
            fontFamily: t.fonts.regular,
            fontSize: 16,
            paddingVertical: multiline ? 12 : 10,
            minHeight: multiline ? 24 * minLines : undefined,
          }}
          {...rest}
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" color="textMuted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

/** TextField bound to react-hook-form. Error messages are i18n keys or plain text. */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  ...props
}: Omit<TextFieldProps, 'value' | 'onChangeText' | 'error'> & { control: Control<T>; name: FieldPath<T> }) {
  const { t } = useTranslation();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...props}
          value={field.value == null ? '' : String(field.value)}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message ? t(fieldState.error.message, { defaultValue: fieldState.error.message }) : undefined}
        />
      )}
    />
  );
}
