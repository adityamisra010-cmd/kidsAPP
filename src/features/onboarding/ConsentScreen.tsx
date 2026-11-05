import { Redirect, router } from 'expo-router';
import { ExternalLink, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { getRepo } from '@/data';
import { invalidate } from '@/data/queryClient';
import { CONSENT_VERSION, DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import { buildConsentInputs, hasCurrentConsent } from '@/features/account/consents';
import { openPrivacyPolicy } from '@/features/account/links';
import { useConsents } from '@/features/account/queries';
import { signOut } from '@/state/auth-actions';
import { useActive, useSession } from '@/state/session';
import { BRAND } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Row, Screen, SkeletonList, Stack, Text, toast } from '@/ui';

import { CheckboxRow } from './CheckboxRow';
import { ConsentSummary } from './ConsentSummary';

/** Parent consent on first login (demo users are pre-consented and never see this). */
export function ConsentScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const active = useActive();
  const setConsentDone = useSession((s) => s.setConsentDone);
  const [agree, setAgree] = useState(false);
  const [video, setVideo] = useState(false);
  const [saving, setSaving] = useState(false);

  const childIds = active?.user.childIds ?? [];
  // A parent who already agreed (e.g. on another phone) goes straight in.
  const existing = useConsents();
  const alreadyAgreed = !!existing.data && hasCurrentConsent(existing.data, childIds, CONSENT_VERSION);

  useEffect(() => {
    if (!alreadyAgreed) return;
    setConsentDone(true);
    router.replace('/');
  }, [alreadyAgreed, setConsentDone]);

  if (!active) return <Redirect href="/welcome" />;

  const school = active.organization?.name;
  const days = active.organization?.settings.videoRetentionDays ?? DEFAULT_ORG_SETTINGS.videoRetentionDays;

  const submit = async () => {
    if (!agree || saving) return;
    setSaving(true);
    try {
      const repo = getRepo();
      for (const input of buildConsentInputs(childIds, video, CONSENT_VERSION)) {
        await repo.me.recordConsent(input);
      }
      await invalidate('me');
      setConsentDone(true);
      router.replace('/');
    } catch {
      toast.error(tr('errors:unknown'));
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    await signOut().catch(() => undefined);
    router.replace('/welcome');
  };

  if (existing.isPending || alreadyAgreed) {
    return (
      <Screen title={tr('auth:consent.title')}>
        <Text color="textMuted">{tr('auth:consent.checking')}</Text>
        <SkeletonList rows={3} height={96} />
      </Screen>
    );
  }

  return (
    <Screen
      title={tr('auth:consent.title')}
      testID="consent-screen"
      footer={
        <>
          <Button
            testID="consent-continue"
            label={tr('auth:consent.continue')}
            size="lg"
            fullWidth
            disabled={!agree}
            loading={saving}
            onPress={() => void submit()}
          />
          <Button label={tr('auth:consent.notNow')} variant="ghost" fullWidth onPress={() => void leave()} />
        </>
      }
    >
      <Row gap={3} align="flex-start">
        <ShieldCheck size={24} color={t.colors.primaryText} style={{ marginTop: 2 }} />
        <Text style={{ flex: 1 }}>
          {school
            ? tr('auth:consent.introSchool', { school, appName: BRAND.appName })
            : tr('auth:consent.intro', { appName: BRAND.appName })}
        </Text>
      </Row>
      <ConsentSummary />
      <Stack gap={3}>
        <CheckboxRow
          testID="consent-agree"
          required
          label={tr('auth:consent.agree')}
          hint={tr('auth:consent.agreeHint')}
          checked={agree}
          onChange={setAgree}
        />
        <CheckboxRow testID="consent-video" label={tr('auth:consent.video')} hint={tr('auth:consent.videoHint', { days })} checked={video} onChange={setVideo} />
      </Stack>
      <Pressable accessibilityRole="link" onPress={() => void openPrivacyPolicy()} hitSlop={8} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ExternalLink size={16} color={t.colors.primaryText} />
        <Text variant="label" color="primaryText" weight="semibold">
          {tr('auth:consent.readPolicy')}
        </Text>
      </Pressable>
    </Screen>
  );
}
