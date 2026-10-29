/**
 * Log practice (parent, also usable by staff): three big outcome choices, difficulty, optional note
 * and optional short private video. Saves through the outbox so text logs work fully offline.
 */
import { router } from 'expo-router';
import { CircleCheck, Save } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useChildDetail } from '@/data/hooks';
import { enqueue, useOutboxStore } from '@/data/outbox';
import type { HomeLogDifficulty, HomeLogOutcome } from '@/domain/types';
import { uuid } from '@/lib/id';
import { usePreferences } from '@/state/preferences';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, confirm, ErrorState, Screen, SkeletonList, Stack, SyncBadge, Text, TextField } from '@/ui';

import { DIFFICULTY_META, OUTCOME_META } from '../components/badges';
import { ChoiceTiles, type ChoiceOption } from '../components/ChoiceTiles';
import { PendingUploads } from '../components/PendingUploads';
import { VideoAttach, VideoConsentOff } from '../components/VideoAttach';
import { buildHomeLogInput, DIFFICULTIES, firstName, OUTCOMES, videoConsentGranted, type LogDraft } from '../logic';
import { registerPracticeOutbox } from '../outbox';
import { HOME_LOG_KIND, type HomeLogPayload } from '../outboxLogic';
import { useConsents, useTask } from '../queries';
import { useVideoAttachment } from '../video/useVideoAttachment';

registerPracticeOutbox();

type SavedKind = 'text' | 'offline' | 'video' | 'videoWifi';

function SavedView({ kind, taskId, childName }: { kind: SavedKind; taskId: string; childName: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const body =
    kind === 'video'
      ? tr('log.savedVideo')
      : kind === 'videoWifi'
        ? tr('log.savedVideoWifi')
        : kind === 'offline'
          ? tr('log.savedOffline')
          : tr('log.savedBody', { name: childName });
  return (
    <Screen back footer={<Button label={tr('common:actions.done')} size="lg" fullWidth onPress={() => (router.canGoBack() ? router.back() : router.replace('/parent/practice'))} />}>
      <Stack gap={4} align="center" style={{ paddingTop: t.space[8] }} testID="log-saved">
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: t.colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
          <CircleCheck size={44} color={t.colors.success} strokeWidth={2.2} />
        </View>
        <Text variant="title" align="center" accessibilityRole="header">
          {tr('log.savedTitle')}
        </Text>
        <Text align="center" color="textMuted" accessibilityLiveRegion="polite">
          {body}
        </Text>
        <SyncBadge alwaysShow />
      </Stack>
      <PendingUploads taskId={taskId} />
    </Screen>
  );
}

export function LogPracticeScreen({ taskId }: { taskId: string }) {
  const { t } = useTranslation('practice');
  const active = useActive();
  const task = useTask(taskId);
  const child = useChildDetail(task.data?.childId);
  const consents = useConsents();
  const [clientId] = useState(uuid);
  const [draft, setDraft] = useState<LogDraft>({ note: '' });
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedKind | null>(null);

  const explainCamera = useCallback(
    () => confirm({ title: t('video.permissionTitle'), body: t('video.permissionBody'), confirmLabel: t('video.permissionAllow') }),
    [t],
  );
  const attachment = useVideoAttachment(clientId, explainCamera);

  const childName = firstName(child.data?.child.preferredName ?? child.data?.child.fullName ?? '');
  const outcomeOptions: ChoiceOption<HomeLogOutcome>[] = OUTCOMES.map((o) => ({ value: o, label: t(`outcome.${o}`), icon: OUTCOME_META[o].icon }));
  const difficultyOptions: ChoiceOption<HomeLogDifficulty>[] = DIFFICULTIES.map((d) => ({ value: d, label: t(`difficulty.${d}`), icon: DIFFICULTY_META[d].icon }));

  // Consent: wait for the answer; if it can't load (e.g. offline) the server still enforces it.
  const videoAllowed = consents.isPending ? null : videoConsentGranted(consents.data ?? [], task.data?.childId ?? active?.childId);
  const preparing = attachment.state.kind === 'preparing';
  const video = attachment.state.kind === 'ready' && videoAllowed ? attachment.state.video : undefined;
  const incomplete = !draft.outcome || !draft.difficulty;

  const submit = async () => {
    const input = buildHomeLogInput(taskId, { ...draft, video }, clientId);
    if (!input) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      const payload: HomeLogPayload = { ...input, childId: task.data?.childId, childName, taskTitle: task.data?.title };
      await enqueue(HOME_LOG_KIND, payload, `${task.data?.title ?? t('log.title')}${childName ? ` · ${childName}` : ''}`);
      attachment.handOver();
      const { online, onWifi } = useOutboxStore.getState();
      const wifiOnly = usePreferences.getState().uploadOnWifiOnly;
      setSaved(input.video ? (wifiOnly && !onWifi ? 'videoWifi' : 'video') : online ? 'text' : 'offline');
    } finally {
      setSaving(false);
    }
  };

  if (saved) return <SavedView kind={saved} taskId={taskId} childName={childName} />;

  if (task.isPending) {
    return (
      <Screen title={t('log.title')} back>
        <SkeletonList rows={3} height={110} />
      </Screen>
    );
  }
  if (task.error || !task.data) {
    return (
      <Screen title={t('log.title')} back>
        <ErrorState error={task.error} onRetry={() => void task.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('log.title')}
      subtitle={task.data.title}
      back
      testID="log-practice"
      footer={
        <>
          {showErrors && incomplete ? (
            <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
              {t('log.needChoices')}
            </Text>
          ) : preparing ? (
            <Text variant="caption" color="textMuted" align="center">
              {t('log.waitVideo')}
            </Text>
          ) : null}
          <Button label={t('log.submit')} icon={Save} size="lg" fullWidth loading={saving} disabled={preparing} onPress={() => void submit()} testID="log-submit" />
        </>
      }
    >
      <ChoiceTiles label={t('log.howDidItGo')} options={outcomeOptions} value={draft.outcome} onChange={(outcome) => setDraft((d) => ({ ...d, outcome }))} testID="outcome" />
      <ChoiceTiles label={t('log.howHard')} options={difficultyOptions} value={draft.difficulty} onChange={(difficulty) => setDraft((d) => ({ ...d, difficulty }))} testID="difficulty" />
      <TextField
        label={t('log.note')}
        placeholder={t('log.notePlaceholder')}
        helper={t('log.noteHelper')}
        multiline
        minLines={3}
        maxLength={500}
        value={draft.note}
        onChangeText={(note) => setDraft((d) => ({ ...d, note }))}
        testID="log-note"
      />
      {videoAllowed === true ? <VideoAttach attachment={attachment} /> : null}
      {videoAllowed === false ? <VideoConsentOff /> : null}
      <SyncBadge />
    </Screen>
  );
}
