/**
 * Calm video player (expo-video) with visible loading and error states.
 * `VideoPlayer` plays a uri (local preview or resource link). `MediaPlayer` resolves a private
 * media id to a short-lived signed URL first; it never uses public links.
 */
import { RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayerStatus } from 'expo-video';

import type { UUID } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Row, Skeleton, Text } from '@/ui';

import { usePlaybackUrl } from '../queries';

function Overlay({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space[2],
        padding: t.space[4],
        backgroundColor: t.colors.surfaceAlt,
      }}
    >
      {children}
    </View>
  );
}

export function VideoPlayer({ uri, onError, testID }: { uri: string; onError?: () => void; testID?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  const [status, setStatus] = useState<VideoPlayerStatus>(player.status);

  useEffect(() => {
    const sub = player.addListener('statusChange', (e) => setStatus(e.status));
    return () => sub.remove();
  }, [player]);

  return (
    <View
      testID={testID}
      style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt }}
    >
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%' }}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        accessibilityLabel={tr('video.playerLabel')}
      />
      {status === 'loading' ? (
        <Overlay>
          <ActivityIndicator color={t.colors.primary} />
          <Text variant="label" color="textMuted">
            {tr('video.loading')}
          </Text>
        </Overlay>
      ) : null}
      {status === 'error' ? (
        <Overlay>
          <Text variant="label" color="textMuted" align="center">
            {tr('video.error')}
          </Text>
          {onError ? <Button size="sm" variant="outline" icon={RefreshCw} label={tr('common:actions.retry')} onPress={onError} /> : null}
        </Overlay>
      ) : null}
    </View>
  );
}

/** Private uploaded video: signed URL → player, with skeleton and retry. */
export function MediaPlayer({ mediaId, retentionDays }: { mediaId: UUID; retentionDays?: number }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const q = usePlaybackUrl(mediaId);
  const [attempt, setAttempt] = useState(0);

  let body: ReactNode;
  if (q.isPending) {
    body = (
      <View accessibilityLabel={tr('video.loading')}>
        <Skeleton height={190} radius={t.radius.lg} />
      </View>
    );
  } else if (q.error || !q.data) {
    body = (
      <View style={{ aspectRatio: 16 / 9, borderRadius: t.radius.lg, backgroundColor: t.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: t.space[2], padding: t.space[4] }}>
        <Text variant="label" color="textMuted" align="center">
          {tr('video.error')}
        </Text>
        <Button size="sm" variant="outline" icon={RefreshCw} label={tr('common:actions.retry')} onPress={() => void q.refetch()} />
      </View>
    );
  } else {
    // A fresh signed URL on retry: the old one may have expired.
    body = (
      <VideoPlayer
        key={`${q.data}-${attempt}`}
        uri={q.data}
        onError={() => {
          setAttempt((a) => a + 1);
          void q.refetch();
        }}
      />
    );
  }

  return (
    <View style={{ gap: t.space[2] }}>
      {body}
      <Row gap={1}>
        <ShieldCheck size={14} color={t.colors.textMuted} />
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
          {retentionDays ? tr('video.privateRetention', { days: retentionDays }) : tr('video.private')}
        </Text>
      </Row>
    </View>
  );
}
