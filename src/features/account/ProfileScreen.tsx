import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Mail, Phone, Save, UserRound } from 'lucide-react-native';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { z } from 'zod';

import { getRepo } from '@/data';
import { invalidate } from '@/data/queryClient';
import { displayPhone } from '@/features/onboarding/phone';
import { LanguageToggle } from '@/features/onboarding/LanguageToggle';
import { refreshUser } from '@/state/auth-actions';
import { usePreferences, type ThemePreference } from '@/state/preferences';
import { useRequiredActive, useSession } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, FormTextField, ListItem, Row, Screen, SectionHeader, SegmentedControl, Stack, SwitchRow, Text, TextField, toast } from '@/ui';

import { appVersion } from './links';

const schema = z.object({
  fullName: z.string().trim().min(2, { error: 'settings:profile.nameRequired' }),
  // Optional: empty is fine, anything else must look like an email.
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.email().safeParse(v).success, { error: 'settings:profile.emailInvalid' }),
});
type Values = z.input<typeof schema>;

/** Name, email, read-only phone, language, appearance, video upload setting, version. */
export function ProfileScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const active = useRequiredActive();
  const isDemo = useSession((s) => s.mode === 'demo');
  const theme = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const wifiOnly = usePreferences((s) => s.uploadOnWifiOnly);
  const setWifiOnly = usePreferences((s) => s.setUploadOnWifiOnly);
  const { profile } = active.user;
  const { version, build } = appVersion();

  const { control, handleSubmit, formState, reset } = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: profile.fullName, email: profile.email ?? '' },
  });

  const save = handleSubmit(async (v) => {
    try {
      await getRepo().me.updateProfile({ fullName: v.fullName, email: v.email || undefined });
      await refreshUser().catch(() => undefined);
      await invalidate('me', 'org');
      reset(v);
      toast.success(tr('settings:profile.saved'));
    } catch {
      toast.error(tr('errors:unknown'));
    }
  });

  return (
    <Screen title={tr('settings:profile.title')} back testID="profile-screen">
      <SectionHeader title={tr('settings:profile.sectionProfile')} />
      <Card>
        <Stack gap={4}>
          <FormTextField control={control} name="fullName" label={tr('settings:profile.name')} icon={UserRound} autoComplete="name" textContentType="name" required />
          <FormTextField
            control={control}
            name="email"
            label={tr('settings:profile.email')}
            helper={tr('settings:profile.emailOptional')}
            icon={Mail}
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
          <TextField
            label={tr('settings:profile.phone')}
            icon={Phone}
            value={displayPhone(profile.phone) || '—'}
            editable={false}
            helper={tr('settings:profile.phoneLocked')}
          />
          <Button
            label={tr('settings:profile.save')}
            icon={Save}
            loading={formState.isSubmitting}
            disabled={!formState.isDirty}
            onPress={() => void save()}
          />
          {isDemo ? (
            <Row gap={2} align="flex-start">
              <Info size={16} color={t.colors.textMuted} style={{ marginTop: 2 }} />
              <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
                {tr('settings:profile.demoProfile')}
              </Text>
            </Row>
          ) : null}
        </Stack>
      </Card>

      <SectionHeader title={tr('settings:profile.sectionApp')} />
      <Card>
        <Stack gap={4}>
          <View style={{ gap: t.space[2] }}>
            <Text variant="bodyStrong">{tr('settings:profile.language')}</Text>
            <LanguageToggle persist width={260} testID="profile-language" />
          </View>
          <View style={{ gap: t.space[2] }}>
            <Text variant="bodyStrong">{tr('settings:profile.theme')}</Text>
            <SegmentedControl<ThemePreference>
              testID="profile-theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: tr('settings:profile.themeSystem') },
                { value: 'light', label: tr('settings:profile.themeLight') },
                { value: 'dark', label: tr('settings:profile.themeDark') },
              ]}
            />
          </View>
          {active.role === 'parent' ? (
            <SwitchRow
              testID="profile-wifi-only"
              label={tr('settings:profile.wifiOnly')}
              description={tr('settings:profile.wifiOnlyBody')}
              value={wifiOnly}
              onChange={setWifiOnly}
            />
          ) : null}
        </Stack>
      </Card>

      <Card tone="sunken" padding={0}>
        <View style={{ paddingHorizontal: t.space[4] }}>
          <ListItem
            title={tr('settings:profile.version')}
            right={
              <Text variant="label" color="textMuted">
                {build ? tr('settings:profile.versionValue', { version, build }) : version}
              </Text>
            }
          />
        </View>
      </Card>
    </Screen>
  );
}
