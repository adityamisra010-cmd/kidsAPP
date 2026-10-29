import { CircleCheck, CircleDashed, Download, ExternalLink, Send, ShieldCheck, Trash } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { getRepo } from '@/data';
import { invalidate } from '@/data/queryClient';
import { CONSENT_VERSION, DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { Child, UUID } from '@/domain/types';
import { ConsentSummary } from '@/features/onboarding/ConsentSummary';
import { formatDate } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Button, Card, confirm, Divider, QueryView, Row, Screen, SectionHeader, SkeletonList, Stack, SwitchRow, Text, toast } from '@/ui';

import { latestConsent, videoConsentInputs, videoUploadsAllowed } from './consents';
import { openPrivacyPolicy } from './links';
import { useConsents, useMyChildren, useOrgSafe } from './queries';

type RequestKind = 'export' | 'deletion';
type Sent = Record<UUID, Partial<Record<RequestKind, string>>>;

function ChildDataCard({ child, sent, onRequest }: { child: Child; sent: Sent[UUID] | undefined; onRequest: (kind: RequestKind) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('settings');
  const name = child.preferredName ?? child.fullName.split(' ')[0];
  return (
    <Card testID={`privacy-child-${child.id}`}>
      <Stack gap={3}>
        <Row gap={3}>
          <Avatar name={child.fullName} uri={child.photoUrl} size={44} />
          <Text variant="subheading" style={{ flex: 1 }}>
            {child.fullName}
          </Text>
        </Row>
        {sent?.export ? (
          <Row gap={2}>
            <Send size={16} color={t.colors.success} />
            <Text variant="label" color="success" style={{ flex: 1 }}>
              {tr('privacy.exportSent', { date: formatDate(sent.export) })}
            </Text>
          </Row>
        ) : (
          <Button label={tr('privacy.download')} icon={Download} variant="outline" fullWidth onPress={() => onRequest('export')} accessibilityHint={name} />
        )}
        {sent?.deletion ? (
          <Row gap={2}>
            <Send size={16} color={t.colors.success} />
            <Text variant="label" color="success" style={{ flex: 1 }}>
              {tr('privacy.deleteSent', { date: formatDate(sent.deletion) })}
            </Text>
          </Row>
        ) : (
          <Button label={tr('privacy.delete')} icon={Trash} variant="ghost" fullWidth onPress={() => onRequest('deletion')} accessibilityHint={name} />
        )}
      </Stack>
    </Card>
  );
}

/** Consent & privacy: current choices, video toggle, data copy / deletion requests. */
export function PrivacyScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('settings');
  const active = useRequiredActive();
  const consents = useConsents();
  const isParent = active.role === 'parent';
  const children = useMyChildren(isParent);
  const org = useOrgSafe();
  const [sent, setSent] = useState<Sent>({});
  const [savingVideo, setSavingVideo] = useState(false);
  const childIds = active.user.childIds;
  const days = org.data?.settings.videoRetentionDays ?? active.organization?.settings.videoRetentionDays ?? DEFAULT_ORG_SETTINGS.videoRetentionDays;

  const setVideo = async (granted: boolean) => {
    if (!granted) {
      const ok = await confirm({
        title: tr('privacy.withdrawTitle'),
        body: tr('privacy.withdrawBody', { days }),
        confirmLabel: tr('privacy.withdrawConfirm'),
      });
      if (!ok) return;
    }
    setSavingVideo(true);
    try {
      const repo = getRepo();
      for (const input of videoConsentInputs(childIds, granted, CONSENT_VERSION)) await repo.me.recordConsent(input);
      await invalidate('me', 'homePractice');
      toast.success(tr(granted ? 'privacy.videoOnToast' : 'privacy.videoOffToast'));
    } catch {
      toast.error(tr('errors:unknown'));
    } finally {
      setSavingVideo(false);
    }
  };

  const request = async (child: Child, kind: RequestKind) => {
    const name = child.preferredName ?? child.fullName.split(' ')[0];
    const ok = await confirm({
      title: tr(kind === 'export' ? 'privacy.exportConfirmTitle' : 'privacy.deleteConfirmTitle', { name }),
      body: tr(kind === 'export' ? 'privacy.exportConfirmBody' : 'privacy.deleteConfirmBody'),
      confirmLabel: tr('privacy.sendRequest'),
      destructive: kind === 'deletion',
    });
    if (!ok) return;
    try {
      const repo = getRepo();
      const r = kind === 'export' ? await repo.me.requestDataExport(child.id) : await repo.me.requestDeletion(child.id);
      setSent((s) => ({ ...s, [child.id]: { ...s[child.id], [kind]: r.createdAt ?? new Date().toISOString() } }));
      toast.success(tr('privacy.requestSent'));
    } catch {
      toast.error(tr('errors:unknown'));
    }
  };

  return (
    <Screen title={tr('privacy.title')} back testID="privacy-screen">
      <Text color="textMuted">{tr('privacy.intro')}</Text>

      <SectionHeader title={tr('privacy.agreedTitle')} />
      <QueryView query={consents} skeleton={<SkeletonList rows={1} height={140} />}>
        {(list) => {
          const data = childIds.length ? latestConsent(list, 'data_processing', childIds[0]) : latestConsent(list, 'data_processing');
          const videoOn = videoUploadsAllowed(list, childIds);
          const videoRecord = childIds.length ? latestConsent(list, 'video_upload', childIds[0]) : latestConsent(list, 'video_upload');
          return (
            <Card padding={0}>
              <View style={{ paddingHorizontal: t.space[4] }}>
                <Row gap={3} style={{ minHeight: 64, paddingVertical: t.space[3] }} align="flex-start">
                  {data?.granted ? <CircleCheck size={22} color={t.colors.success} /> : <CircleDashed size={22} color={t.colors.textMuted} />}
                  <Stack gap={1} flex={1}>
                    <Text variant="bodyStrong">{tr('privacy.dataProcessing')}</Text>
                    <Text variant="caption" color="textMuted">
                      {data?.granted ? tr('privacy.givenOn', { date: formatDate(data.at) }) : tr('privacy.notGiven')}
                    </Text>
                  </Stack>
                </Row>
                {isParent ? (
                  <>
                    <Divider />
                    <SwitchRow
                      testID="privacy-video"
                      label={tr('privacy.videoToggle')}
                      description={tr('privacy.videoToggleBody', { days })}
                      value={videoOn}
                      disabled={savingVideo}
                      onChange={(v) => void setVideo(v)}
                    />
                    {videoRecord ? (
                      <Text variant="caption" color="textMuted" style={{ paddingBottom: t.space[3] }}>
                        {tr(videoOn ? 'privacy.videoOnSince' : 'privacy.videoOffSince', { date: formatDate(videoRecord.at) })}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            </Card>
          );
        }}
      </QueryView>

      {isParent ? (
        <>
          <SectionHeader title={tr('privacy.childDataTitle')} subtitle={tr('privacy.childDataIntro')} />
          <QueryView query={children} skeleton={<SkeletonList rows={1} height={160} />} isEmpty={(d) => d.length === 0} empty={<Text color="textMuted">{tr('privacy.noChildren')}</Text>}>
            {(list) => (
              <Stack gap={3}>
                {list.map(({ child }) => (
                  <ChildDataCard key={child.id} child={child} sent={sent[child.id]} onRequest={(kind) => void request(child, kind)} />
                ))}
              </Stack>
            )}
          </QueryView>
        </>
      ) : null}

      <SectionHeader title={tr('privacy.summaryTitle')} />
      <ConsentSummary />

      <Pressable accessibilityRole="link" onPress={() => void openPrivacyPolicy()} hitSlop={8} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={18} color={t.colors.primaryText} />
        <Text variant="label" color="primaryText" weight="semibold" style={{ flex: 1 }}>
          {tr('privacy.policy')}
        </Text>
        <ExternalLink size={16} color={t.colors.primaryText} />
      </Pressable>
    </Screen>
  );
}
