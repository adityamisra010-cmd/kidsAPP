import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { KeyRound, LogIn, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { z } from 'zod';

import { adoptProfileLanguage } from '@/features/account/language';
import { signInWithPassword } from '@/state/auth-actions';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, FormTextField, Row, Screen, Stack, Text } from '@/ui';

import { signInErrorKey } from './authErrors';
import { CheckboxRow } from './CheckboxRow';

const schema = z.object({
  email: z.string().trim().pipe(z.email({ error: 'auth:email.invalidEmail' })),
  password: z.string().min(1, { error: 'auth:email.passwordRequired' }),
});
type Values = z.input<typeof schema>;

/** Email + password fallback for staff. */
export function EmailScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setFormError(null);
    try {
      const user = await signInWithPassword(email, password);
      adoptProfileLanguage(user);
      router.replace('/');
    } catch (e) {
      setFormError(tr(signInErrorKey(e, 'password')));
    }
  });

  return (
    <Screen title={tr('auth:email.title')} back>
      <Stack gap={2} style={{ marginTop: t.space[2] }}>
        <Text variant="title" accessibilityRole="header">
          {tr('auth:email.heading')}
        </Text>
        <Text color="textMuted">{tr('auth:email.intro')}</Text>
      </Stack>
      <Stack gap={4}>
        <FormTextField
          control={control}
          name="email"
          label={tr('auth:email.email')}
          icon={Mail}
          placeholder={tr('auth:email.emailPlaceholder')}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          testID="email-input"
        />
        <FormTextField
          control={control}
          name="password"
          label={tr('auth:email.password')}
          icon={KeyRound}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="password-input"
        />
        <CheckboxRow compact label={tr('auth:email.showPassword')} checked={showPassword} onChange={setShowPassword} />
      </Stack>
      {formError ? (
        <Card tone="danger" padding={3}>
          <Text variant="label" color="danger" accessibilityLiveRegion="polite">
            {formError}
          </Text>
        </Card>
      ) : null}
      <Button testID="email-submit" label={tr('auth:email.submit')} icon={LogIn} size="lg" fullWidth loading={formState.isSubmitting} onPress={() => void submit()} />
      <Text variant="caption" color="textMuted" align="center">
        {tr('auth:email.forgot')}
      </Text>
      <Row justify="center">
        <Pressable accessibilityRole="link" onPress={() => router.replace('/phone')} hitSlop={8} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text variant="label" color="primaryText" weight="semibold">
            {tr('auth:email.usePhone')}
          </Text>
        </Pressable>
      </Row>
    </Screen>
  );
}
