import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Send } from 'lucide-react-native';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { AnnouncementCard } from '@/components/cards/AnnouncementCard';
import { useRepo } from '@/data';
import { useTherapyTypes } from '@/data/hooks';
import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import { ADMIN_ROLES, type Announcement } from '@/domain/types';
import { useInvalidate } from '@/features/home/components/useRefresh';
import { therapyTypeLabel } from '@/i18n/labels';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, ChipGroup, confirm, EmptyState, formatClock, FormTextField, Screen, SectionHeader, Stack, SwitchRow, Text, toast } from '@/ui';

import { announcementSchema, AUDIENCES, EMPTY_ANNOUNCEMENT, toAnnouncementInput, type AnnouncementFormValues } from './announcementForm';
import { audienceText } from './labels';

/** Coordinator / admin: write a notice, pick who gets it, preview, then send. */
export function NewAnnouncementScreen() {
  const { t } = useTranslation('messages');
  const theme = useTheme();
  const active = useRequiredActive();
  const repo = useRepo();
  const invalidate = useInvalidate();
  const therapyTypes = useTherapyTypes();
  const form = useForm<AnnouncementFormValues>({ resolver: zodResolver(announcementSchema), defaultValues: EMPTY_ANNOUNCEMENT, mode: 'onTouched' });
  const [title, body, audience, therapyTypeId, urgent] = useWatch({ control: form.control, name: ['title', 'body', 'audience', 'therapyTypeId', 'urgent'] });
  const values = { title, body, audience, therapyTypeId, urgent };
  const quiet = active.organization?.settings.quietHours ?? DEFAULT_ORG_SETTINGS.quietHours;

  const create = useMutation({
    mutationFn: (v: AnnouncementFormValues) => repo.messaging.createAnnouncement(toAnnouncementInput(v)),
    onSuccess: async () => {
      await invalidate('messaging', 'notifications');
      toast.success(t('new.sent'));
      if (router.canGoBack()) router.back();
      else router.replace('/announcements');
    },
    onError: () => toast.error(t('new.failed')),
  });

  if (!ADMIN_ROLES.includes(active.role)) {
    return (
      <Screen title={t('new.title')} back>
        <EmptyState title={t('new.notAllowedTitle')} body={t('new.notAllowedBody')} />
      </Screen>
    );
  }

  const audienceLabel = audienceText(t, values, therapyTypes.data);
  const submit = form.handleSubmit(async (v) => {
    const ok = await confirm({
      title: t('new.confirmTitle', { audience: audienceText(t, v, therapyTypes.data) }),
      body: v.urgent ? t('new.confirmUrgent') : t('new.confirmBody'),
      confirmLabel: t('new.send'),
    });
    if (ok) create.mutate(v);
  });

  const preview: Announcement = {
    id: 'preview',
    organizationId: active.orgId ?? '',
    title: values.title.trim() || t('new.previewTitle'),
    body: values.body.trim() || t('new.previewBody'),
    audience: values.audience,
    therapyTypeId: values.therapyTypeId,
    urgent: values.urgent,
    createdBy: active.user.profile.id,
    createdByName: active.user.profile.fullName,
    createdAt: new Date().toISOString(),
  };

  return (
    <Screen
      testID="new-announcement"
      title={t('new.title')}
      back
      footer={<Button testID="send-announcement" label={t('new.send')} icon={Send} fullWidth loading={create.isPending} onPress={() => void submit()} />}
    >
      <Stack gap={4} style={{ paddingTop: theme.space[2] }}>
        <FormTextField control={form.control} name="title" label={t('new.titleLabel')} placeholder={t('new.titlePlaceholder')} required maxLength={80} testID="title" />
        <FormTextField control={form.control} name="body" label={t('new.bodyLabel')} placeholder={t('new.bodyPlaceholder')} required multiline minLines={4} maxLength={1000} testID="body" />

        <Stack gap={2}>
          <Text variant="label">{t('new.audienceLabel')}</Text>
          <Controller
            control={form.control}
            name="audience"
            render={({ field }) => (
              <ChipGroup
                single
                testID="audience"
                value={[field.value]}
                onChange={(next) => next[0] && field.onChange(next[0])}
                options={AUDIENCES.map((a) => ({ value: a, label: t(`audience.${a}`) }))}
              />
            )}
          />
        </Stack>

        {values.audience === 'therapy_type' ? (
          <Stack gap={2}>
            <Text variant="label">{t('new.groupLabel')}</Text>
            <Controller
              control={form.control}
              name="therapyTypeId"
              render={({ field, fieldState }) => (
                <>
                  <ChipGroup
                    single
                    testID="therapy-group"
                    value={field.value ? [field.value] : []}
                    onChange={(next) => field.onChange(next[0])}
                    options={(therapyTypes.data ?? []).filter((tt) => tt.active).map((tt) => ({ value: tt.id, label: therapyTypeLabel(t, tt), dot: tt.color }))}
                  />
                  {fieldState.error?.message ? (
                    <Text variant="caption" color="danger">
                      {t(fieldState.error.message)}
                    </Text>
                  ) : null}
                </>
              )}
            />
          </Stack>
        ) : null}

        <Controller
          control={form.control}
          name="urgent"
          render={({ field }) => (
            <SwitchRow
              testID="urgent"
              label={t('new.urgentLabel')}
              description={t('new.urgentHint', { start: formatClock(quiet.start), end: formatClock(quiet.end) })}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <SectionHeader title={t('new.preview')} subtitle={t('new.previewHint')} />
        <AnnouncementCard announcement={preview} onPress={null} full audienceLabel={audienceLabel} testID="preview" />
      </Stack>
    </Screen>
  );
}
