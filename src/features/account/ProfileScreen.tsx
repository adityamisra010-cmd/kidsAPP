import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Mail, Phone, Save, UserRound } from 'lucide-react-native';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { getRepo } from '@/data';
import { invalidate } from '@/data/queryClient';
import { displayPhone } from '@/features/onboarding/phone';
import { refreshUser } from '@/state/auth-actions';
import { useRequiredActive, useSession } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, FormTextField, Row, Screen, SectionHeader, Stack, Text, TextField, toast } from '@/ui';


const schema = z.object({
  fullName: z.string().trim().min(2, { error: 'settings:profile.nameRequired' }),
  // Optional: empty is fine, anything else must look like an email.
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.email().safeParse(v).success, { error: 'settings:profile.emailInvalid' }),
});
type Values = z.input<typeof schema>;

/** Name, email and read-only phone. Language, appearance and app details live in Settings. */
export function ProfileScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const active = useRequiredActive();
  const isDemo = useSession((s) => s.mode === 'demo');
  const { profile } = active.user;

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

    </Screen>
  );
}
