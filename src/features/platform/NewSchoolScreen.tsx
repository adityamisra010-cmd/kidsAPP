import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CircleCheck, School, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Share, View } from 'react-native';

import { useRepo } from '@/data';
import type { Invite, Organization } from '@/domain/types';
import { useInvalidate } from '@/features/home/components/useRefresh';
import { BRAND } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Divider, FormTextField, ListItem, Screen, SectionHeader, Stack, Text, toast } from '@/ui';

import { EMPTY_SCHOOL_FORM, formatIndianPhone, schoolSchema, suggestShortName, toCreateSchoolInput, type SchoolFormValues } from './schoolForm';

function Created({ organization: o, invite }: { organization: Organization; invite: Invite }) {
  const theme = useTheme();
  const { t } = useTranslation('platform');
  const phone = invite.phone ? formatIndianPhone(invite.phone) : '—';
  const message = t('new.shareMessage', { name: invite.fullName, school: o.name, phone, app: BRAND.appName });
  return (
    <Screen
      testID="school-created"
      title={t('new.createdTitle')}
      back
      onBack={() => router.replace('/platform/schools')}
      footer={
        <>
          <Button label={t('new.share')} icon={Share2} variant="secondary" fullWidth onPress={() => void Share.share({ message })} />
          <Button label={t('new.openSchool')} fullWidth onPress={() => router.replace(`/platform-school/${o.id}`)} />
        </>
      }
    >
      <Card tone="success">
        <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'center' }}>
          <CircleCheck size={28} color={theme.colors.success} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{t('new.createdHeading', { name: o.name })}</Text>
            <Text color="textMuted">{t('new.createdBody')}</Text>
          </View>
        </View>
      </Card>
      <SectionHeader title={t('new.inviteTitle')} subtitle={t('new.inviteSubtitle')} />
      <Card padding={3}>
        <ListItem title={invite.fullName} subtitle={t('new.inviteRole')} />
        <Divider />
        <ListItem title={phone} subtitle={t('new.invitePhone')} />
        <Divider />
        <ListItem title={t('new.inviteStatus')} subtitle={t('new.inviteStatusLabel')} />
      </Card>
      <Text color="textMuted">{t('new.inviteHowTo')}</Text>
    </Screen>
  );
}

/** Platform admin: add a partner school and invite its first School Admin. */
export function NewSchoolScreen() {
  const { t } = useTranslation('platform');
  const repo = useRepo();
  const invalidate = useInvalidate();
  const [created, setCreated] = useState<{ organization: Organization; invite: Invite } | null>(null);
  const form = useForm<SchoolFormValues>({ resolver: zodResolver(schoolSchema), defaultValues: EMPTY_SCHOOL_FORM, mode: 'onTouched' });

  const create = useMutation({
    mutationFn: (v: SchoolFormValues) => repo.platform.createSchool(toCreateSchoolInput(v)),
    onSuccess: async (res) => {
      await invalidate('platform');
      toast.success(t('new.created'));
      setCreated(res);
    },
    onError: () => toast.error(t('new.failed')),
  });

  if (created) return <Created organization={created.organization} invite={created.invite} />;

  const onNameBlur = () => {
    if (!form.getValues('shortName').trim()) form.setValue('shortName', suggestShortName(form.getValues('name')));
  };

  return (
    <Screen
      testID="new-school"
      title={t('new.title')}
      back
      footer={
        <Button
          testID="create-school"
          label={t('new.create')}
          icon={School}
          fullWidth
          loading={create.isPending}
          onPress={() => void form.handleSubmit((v) => create.mutate(v))()}
        />
      }
    >
      <SectionHeader title={t('new.schoolSection')} />
      <Stack gap={4}>
        <FormTextField control={form.control} name="name" label={t('new.name')} placeholder={t('new.namePlaceholder')} required onEndEditing={onNameBlur} testID="name" />
        <FormTextField control={form.control} name="shortName" label={t('new.shortName')} helper={t('new.shortNameHelp')} required maxLength={24} testID="shortName" />
        <FormTextField control={form.control} name="city" label={t('new.city')} placeholder={t('new.cityPlaceholder')} required testID="city" />
        <FormTextField control={form.control} name="address" label={t('new.address')} multiline minLines={2} required testID="address" />
        <FormTextField control={form.control} name="phone" label={t('new.phone')} helper={t('new.phoneHelp')} keyboardType="phone-pad" required testID="phone" />
      </Stack>
      <SectionHeader title={t('new.adminSection')} subtitle={t('new.adminSectionHint')} />
      <Stack gap={4}>
        <FormTextField control={form.control} name="adminName" label={t('new.adminName')} required autoCapitalize="words" testID="adminName" />
        <FormTextField
          control={form.control}
          name="adminPhone"
          label={t('new.adminPhone')}
          helper={t('new.adminPhoneHelp')}
          keyboardType="phone-pad"
          required
          testID="adminPhone"
        />
      </Stack>
    </Screen>
  );
}
