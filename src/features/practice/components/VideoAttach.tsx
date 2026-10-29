/**
 * Optional short video on the Log Practice screen: record / choose, compression progress,
 * preview, kind messages for problems, and a respectful note when video consent is withdrawn.
 */
import { router } from 'expo-router';
import { Camera, Images, Settings, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ProgressBar, Row, Stack, Text } from '@/ui';

import type { UseVideoAttachment } from '../video/useVideoAttachment';
import { VideoPlayer } from './VideoPlayer';

export function VideoConsentOff() {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  return (
    <Card tone="sunken" elevated={false} testID="video-consent-off">
      <Stack gap={2}>
        <Row gap={2} align="flex-start">
          <ShieldCheck size={18} color={t.colors.textMuted} style={{ marginTop: 2 }} />
          <Text color="textMuted" style={{ flex: 1 }}>
            {tr('video.consentOff')}
          </Text>
        </Row>
        <Button size="sm" variant="ghost" label={tr('video.consentLink')} onPress={() => router.push('/account/privacy')} style={{ alignSelf: 'flex-start' }} />
      </Stack>
    </Card>
  );
}

export function VideoAttach({ attachment }: { attachment: UseVideoAttachment }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const { state, record, choose, remove } = attachment;

  const pickers = (
    <Stack gap={2}>
      <Button label={tr('video.record')} icon={Camera} variant="outline" size="lg" fullWidth onPress={() => void record()} testID="video-record" />
      <Button label={tr('video.gallery')} icon={Images} variant="outline" size="lg" fullWidth onPress={() => void choose()} testID="video-gallery" />
    </Stack>
  );

  return (
    <Stack gap={3} testID="video-attach">
      <Stack gap={1}>
        <Text variant="subheading" accessibilityRole="header">
          {tr('video.title')}
        </Text>
        <Row gap={1} align="flex-start">
          <ShieldCheck size={14} color={t.colors.textMuted} style={{ marginTop: 3 }} />
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {tr('video.hint')}
          </Text>
        </Row>
      </Stack>

      {state.kind === 'idle' ? pickers : null}

      {state.kind === 'preparing' ? (
        <Card tone="sunken" elevated={false}>
          <Stack gap={2}>
            <Text variant="label" accessibilityLiveRegion="polite">
              {state.progress > 0 ? tr('video.compressing', { percent: Math.round(state.progress * 100) }) : tr('video.preparing')}
            </Text>
            <ProgressBar value={state.progress} label={tr('video.preparing')} />
          </Stack>
        </Card>
      ) : null}

      {state.kind === 'ready' ? (
        <Stack gap={2}>
          <VideoPlayer uri={state.video.localUri} testID="video-preview" />
          <Row justify="between" gap={2}>
            <Text variant="label" color="textMuted">
              {state.video.durationS > 0 ? tr('video.ready', { seconds: Math.round(state.video.durationS) }) : tr('video.readyNoLength')}
            </Text>
            <Button size="sm" variant="ghost" icon={Trash2} label={tr('video.remove')} onPress={remove} testID="video-remove" />
          </Row>
        </Stack>
      ) : null}

      {state.kind === 'problem' ? (
        <Stack gap={3}>
          <Card tone="warning" elevated={false}>
            <Stack gap={2}>
              <Text accessibilityLiveRegion="polite">{tr(`video.problem.${state.problem}`)}</Text>
              {state.problem === 'camera_blocked' ? (
                <Button size="sm" variant="outline" icon={Settings} label={tr('video.openSettings')} onPress={() => void Linking.openSettings()} style={{ alignSelf: 'flex-start' }} />
              ) : null}
            </Stack>
          </Card>
          {pickers}
        </Stack>
      ) : null}
    </Stack>
  );
}
