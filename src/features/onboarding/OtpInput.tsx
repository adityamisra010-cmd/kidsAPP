import { useEffect, useRef, useState } from 'react';
import { TextInput, View, type TextInputInstance } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

import { normalizeOtp, OTP_LENGTH } from './phone';

/**
 * Six boxes backed by ONE hidden TextInput laid over them, so SMS autofill
 * (`oneTimeCode` / `sms-otp`), long-press paste and the number pad all work natively.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  label,
  error,
  autoFocus = true,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  label: string;
  error?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  const ref = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => ref.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  return (
    <View style={{ alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', gap: t.space[2], justifyContent: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Array.from({ length: OTP_LENGTH }).map((_, i) => {
          const digit = value[i] ?? '';
          const isActive = focused && (i === value.length || (i === OTP_LENGTH - 1 && value.length === OTP_LENGTH));
          const border = error ? t.colors.danger : isActive ? t.colors.primary : digit ? t.colors.borderStrong : t.colors.border;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                maxWidth: 52,
                height: 60,
                borderRadius: t.radius.md,
                borderWidth: isActive ? 2 : 1.5,
                borderColor: border,
                backgroundColor: disabled ? t.colors.surfaceAlt : t.colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="title" maxFontSizeMultiplier={1.3}>
                {digit}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        testID="otp-input"
        value={value}
        editable={!disabled}
        onChangeText={(s) => {
          const v = normalizeOtp(s);
          onChange(v);
          if (v.length === OTP_LENGTH && v !== value) onComplete?.(v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        importantForAutofill="yes"
        caretHidden
        contextMenuHidden={false}
        accessibilityLabel={label}
        accessibilityValue={{ text: value.split('').join(' ') }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          // Nearly invisible but still touchable (iOS ignores touches at opacity 0).
          opacity: 0.02,
          color: 'transparent',
          fontSize: 1,
        }}
      />
    </View>
  );
}
