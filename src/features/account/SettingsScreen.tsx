import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Bell, Languages, LifeBuoy, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useOutbox, useOutboxStore } from '@/data/outbox';
import { isLanguage, languageInfo } from '@/domain/languages';
import { timeAgo } from '@/lib/dates';
import { usePreferences, type ThemePreference } from '@/state/preferences';
import { useRequiredActive, useSession } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Divider, ListItem, Screen, SectionHeader, SegmentedControl, Stack, SwitchRow, Text } from '@/ui';

import { BRAND } from '@/theme/brand';

import { appVersion, openPrivacyPolicy, sendEmail } from './links';

function InfoRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return <ListItem testID={testID} title={label} right={<Text variant="label" color="textMuted" style={{ maxWidth: '60%', textAlign: 'right' }}>{value}</Text>} />;
}

/** Language, appearance, video uploads and links; then everything useful to know about this install. */
export function SettingsScreen() {
  const t = useTheme();
  const { t: tr, i18n } = useTranslation();
  const active = useRequiredActive();
  const mode = useSession((s) => s.mode);
  const theme = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const wifiOnly = usePreferences((s) => s.uploadOnWifiOnly);
  const setWifiOnly = usePreferences((s) => s.setUploadOnWifiOnly);
  const { pending } = useOutbox();
  const lastSyncedAt = useOutboxStore((s) => s.lastSyncedAt);
  const { version, build } = appVersion();
  const lang = languageInfo(isLanguage(i18n.language) ? i18n.language : 'en');
  const device = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ');
  const os = [Device.osName, Device.osVersion].filter(Boolean).join(' ');

  return (
    <Screen title={tr('settings:app.title')} back testID="settings-screen">
      <SectionHeader title={tr('settings:app.sectionGeneral')} />
      <Card padding={0}>
        <View style={{ paddingHorizontal: t.space[4] }}>
          <ListItem
            testID="settings-language"
            left={<Languages size={22} color={t.colors.primaryText} />}
            title={tr('settings:app.language')}
            subtitle={lang.native === lang.english ? lang.native : `${lang.native} · ${lang.english}`}
            onPress={() => router.push('/language')}
          />
          <Divider />
          <View style={{ paddingVertical: t.space[3], gap: t.space[2] }}>
            <Text variant="bodyStrong">{tr('settings:app.appearance')}</Text>
            <SegmentedControl<ThemePreference>
              testID="settings-theme"
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
            <>
              <Divider />
              <Stack gap={1} style={{ paddingVertical: t.space[1] }}>
                <SwitchRow testID="settings-wifi-only" label={tr('settings:profile.wifiOnly')} description={tr('settings:profile.wifiOnlyBody')} value={wifiOnly} onChange={setWifiOnly} />
              </Stack>
            </>
          ) : null}
          <Divider />
          <ListItem left={<Bell size={22} color={t.colors.primaryText} />} title={tr('settings:more.items.notificationSettings')} onPress={() => router.push('/account/notifications')} />
          {active.role === 'parent' ? (
            <>
              <Divider />
              <ListItem left={<ShieldCheck size={22} color={t.colors.primaryText} />} title={tr('settings:more.items.privacy')} onPress={() => router.push('/account/privacy')} />
            </>
          ) : null}
        </View>
      </Card>

      <SectionHeader title={tr('settings:app.sectionAbout')} />
      <Card padding={0} tone="sunken">
        <View style={{ paddingHorizontal: t.space[4] }}>
          <InfoRow testID="settings-version" label={tr('settings:app.version')} value={version} />
          {build ? <InfoRow label={tr('settings:app.build')} value={build} /> : null}
          <InfoRow label={tr('settings:app.data')} value={mode === 'demo' ? tr('settings:app.dataDemo') : tr('settings:app.dataLive')} />
          {active.organization ? <InfoRow label={tr('settings:app.school')} value={active.organization.name} /> : null}
          <InfoRow label={tr('settings:app.signedInAs')} value={`${active.user.profile.fullName} · ${tr(`common:roles.${active.role}`)}`} />
          <InfoRow label={tr('settings:app.appLanguage')} value={lang.english} />
          {device || os ? <InfoRow label={tr('settings:app.device')} value={[device, os].filter(Boolean).join(' · ')} /> : null}
          <InfoRow
            label={tr('settings:app.sync')}
            value={pending.length ? tr('settings:app.pending', { count: pending.length }) : lastSyncedAt ? `${tr('settings:app.synced')} · ${timeAgo(lastSyncedAt)}` : tr('settings:app.synced')}
          />
          <Divider />
          <ListItem left={<ShieldCheck size={20} color={t.colors.textMuted} />} title={tr('settings:app.privacy')} onPress={() => void openPrivacyPolicy()} />
          <ListItem left={<LifeBuoy size={20} color={t.colors.textMuted} />} title={tr('settings:app.support')} onPress={() => void sendEmail(BRAND.supportEmail, BRAND.appName)} />
        </View>
      </Card>
    </Screen>
  );
}
