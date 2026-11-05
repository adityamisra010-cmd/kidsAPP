import { router } from 'expo-router';
import { FolderLock, Info, ListOrdered, Save, Shapes } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useOrg } from '@/data/hooks';
import type { Organization } from '@/domain/types';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, confirm, Divider, EmptyState, ErrorState, ListItem, Screen, SectionHeader, SkeletonList, Stack, Text, toast } from '@/ui';

import { CalendarSection } from './components/CalendarSection';
import { DetailsSection } from './components/DetailsSection';
import { ParentsSection, RemindersSection, VideosSection } from './components/NotifySections';
import { AlertsSection, LogsSection } from './components/RulesSections';
import { useSaveSchool } from './queries';
import { buildPatches, canEditSchool, canViewSchool, draftFromOrg, isDirty, validateDraft, type SchoolDraft } from './settingsDraft';

export function SchoolSettingsScreen() {
  const { t } = useTranslation('school');
  const role = useActive()?.role;
  const org = useOrg();
  if (!canViewSchool(role)) {
    return (
      <Screen title={t('settings.title')} back>
        <EmptyState title={t('settings.noAccess')} />
      </Screen>
    );
  }
  if (org.data) return <SettingsForm key={org.data.id} org={org.data} readOnly={!canEditSchool(role)} />;
  return (
    <Screen title={t('settings.title')} back>
      {org.isPending ? <SkeletonList rows={4} height={180} /> : <ErrorState error={org.error} onRetry={() => void org.refetch()} />}
    </Screen>
  );
}

const clone = (d: SchoolDraft): SchoolDraft => ({ ...JSON.parse(JSON.stringify(d)), org: { ...d.org } });

function SettingsForm({ org, readOnly }: { org: Organization; readOnly: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const [draft, setDraft] = useState<SchoolDraft>(() => draftFromOrg(org));
  const [showErrors, setShowErrors] = useState(false);
  const save = useSaveSchool();

  const dirty = useMemo(() => !readOnly && isDirty(org, draft), [org, draft, readOnly]);
  const errors = useMemo(() => validateDraft(draft), [draft]);
  const hasErrors = Object.keys(errors).length > 0;
  const update = (fn: (d: SchoolDraft) => void) =>
    setDraft((d) => {
      const next = clone(d);
      fn(next);
      return next;
    });

  const onSave = () => {
    if (hasErrors) {
      setShowErrors(true);
      toast.error(tr('settings.fixErrors'));
      return;
    }
    save.mutate(buildPatches(org, draft), {
      onSuccess: (saved) => {
        // What the server saved becomes the new starting point.
        if (saved) setDraft(draftFromOrg(saved));
        setShowErrors(false);
        toast.success(tr('settings.saved'));
      },
      onError: () => toast.error(tr('settings.saveError')),
    });
  };

  const onBack = async () => {
    if (dirty && !(await confirm({ title: tr('settings.leaveTitle'), body: tr('settings.leaveBody'), confirmLabel: tr('settings.leaveConfirm'), destructive: true }))) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const props = { draft, update, readOnly, errors: showErrors || dirty ? errors : {} };

  return (
    <Screen
      title={tr('settings.title')}
      subtitle={org.name}
      back
      onBack={() => void onBack()}
      testID="school-settings"
      footer={
        dirty ? (
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <Button label={tr('settings.discard')} variant="ghost" onPress={() => setDraft(draftFromOrg(org))} disabled={save.isPending} />
            <Button testID="school-save" label={tr('settings.save')} icon={Save} onPress={onSave} loading={save.isPending} style={{ flex: 1 }} />
          </View>
        ) : undefined
      }
    >
      {readOnly ? (
        <Card tone="info" testID="school-readonly">
          <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'flex-start' }}>
            <Info size={20} color={t.colors.info} />
            <Text style={{ flex: 1 }}>{tr('settings.readOnly')}</Text>
          </View>
        </Card>
      ) : null}
      <DetailsSection {...props} />
      <RemindersSection {...props} />
      <ParentsSection {...props} />
      <VideosSection {...props} />
      <CalendarSection {...props} />
      <AlertsSection {...props} />
      <LogsSection {...props} />

      <SectionHeader title={tr('settings.moreTitle')} />
      <Card padding={2}>
        <Stack>
          <ListItem left={<ListOrdered size={22} color={t.colors.primaryText} />} title={tr('settings.openDimensions')} subtitle={tr('settings.openDimensionsHint')} onPress={() => router.push('/school/dimensions')} />
          <Divider inset={10} />
          <ListItem left={<Shapes size={22} color={t.colors.primaryText} />} title={tr('settings.openTherapyTypes')} subtitle={tr('settings.openTherapyTypesHint')} onPress={() => router.push('/school/therapy-types')} />
          <Divider inset={10} />
          <ListItem left={<FolderLock size={22} color={t.colors.primaryText} />} title={tr('settings.openDataRequests')} subtitle={tr('settings.openDataRequestsHint')} onPress={() => router.push('/school/data-requests')} />
        </Stack>
      </Card>
    </Screen>
  );
}
