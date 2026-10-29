import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View, type TextInputInstance } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

import { formatIndianMobile, INDIA_DIAL_CODE, normalizeIndianMobile } from './phone';

/** +91 prefix and a 10-digit number shown as "98765 43210". Accepts pasted numbers in any format. */
export const PhoneField = forwardRef<
  TextInputInstance,
  { label: string; digits: string; onChangeDigits: (d: string) => void; error?: string; onSubmit?: () => void; editable?: boolean }
>(function PhoneField({ label, digits, onChangeDigits, error, onSubmit, editable = true }, ref) {
  const t = useTheme();
  const { t: tr } = useTranslation('auth');
  const [focused, setFocused] = useState(false);
  const border = error ? t.colors.danger : focused ? t.colors.primary : t.colors.border;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          borderWidth: 1.5,
          borderColor: border,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surface,
          minHeight: 56,
          overflow: 'hidden',
        }}
      >
        <View
          accessibilityLabel={tr('phone.countryA11y')}
          style={{
            paddingHorizontal: t.space[4],
            justifyContent: 'center',
            backgroundColor: t.colors.surfaceAlt,
            borderRightWidth: 1,
            borderRightColor: t.colors.border,
          }}
        >
          <Text variant="subheading">{INDIA_DIAL_CODE}</Text>
        </View>
        <TextInput
          ref={ref}
          testID="phone-input"
          value={formatIndianMobile(digits)}
          onChangeText={(s) => onChangeDigits(normalizeIndianMobile(s))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmit}
          editable={editable}
          keyboardType="phone-pad"
          inputMode="tel"
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          returnKeyType="done"
          placeholder={tr('phone.placeholder')}
          placeholderTextColor={t.colors.textSubtle}
          accessibilityLabel={label}
          maxFontSizeMultiplier={1.6}
          style={{
            flex: 1,
            paddingHorizontal: t.space[4],
            color: t.colors.text,
            fontFamily: t.fonts.semibold,
            fontSize: 20,
            letterSpacing: 1,
          }}
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});
