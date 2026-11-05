/**
 * "Sending your practice" card: queued home logs with honest status (uploading 40%, waiting for
 * Wi-Fi, waiting for signal, didn't send + retry). Hidden when nothing is waiting.
 */
import { CloudUpload, RefreshCw, TriangleAlert, Wifi } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { retryFailed, useOutboxStore } from '@/data/outbox';
import { usePreferences } from '@/state/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ProgressBar, Row, Stack, Text } from '@/ui';

import { usePendingHomeLogs } from '../queries';
import { useUploadStore } from '../uploadStore';

export function PendingUploads({ taskId }: { taskId?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const pending = usePendingHomeLogs(taskId);
  const progress = useUploadStore((s) => s.progress);
  const online = useOutboxStore((s) => s.online);
  const onWifi = useOutboxStore((s) => s.onWifi);
  const wifiOnly = usePreferences((s) => s.uploadOnWifiOnly);
  if (!pending.length) return null;
  const anyFailed = pending.some((p) => p.failed);

  return (
    <Card tone="sunken" elevated={false} testID="pending-uploads">
      <Stack gap={3}>
        <Row gap={2}>
          <CloudUpload size={20} color={t.colors.primaryText} />
          <Text variant="subheading">{tr('uploads.title')}</Text>
        </Row>
        {pending.map(({ id, payload, failed }) => {
          const p = progress[payload.clientId];
          const hasVideo = !!payload.video;
          let status: string;
          if (failed) status = tr('uploads.failed');
          else if (p?.phase === 'uploading') status = tr('video.uploading', { percent: Math.round(p.value * 100) });
          else if (p?.phase === 'saving') status = tr('uploads.saving');
          else if (!online) status = tr('uploads.offline');
          else if (hasVideo && wifiOnly && !onWifi) status = tr('video.waitingWifi');
          else status = tr('uploads.waiting');
          return (
            <Stack key={id} gap={1}>
              <Row justify="between" gap={2}>
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {payload.taskTitle ?? tr('uploads.item')}
                </Text>
                {failed ? <TriangleAlert size={16} color={t.colors.danger} /> : hasVideo && wifiOnly && !onWifi ? <Wifi size={16} color={t.colors.textMuted} /> : null}
              </Row>
              <Text variant="caption" color={failed ? 'danger' : 'textMuted'}>
                {status}
              </Text>
              {p?.phase === 'uploading' ? <ProgressBar value={p.value} height={6} label={status} /> : null}
            </Stack>
          );
        })}
        {anyFailed ? <Button size="sm" variant="outline" icon={RefreshCw} label={tr('common:actions.retry')} onPress={() => void retryFailed()} /> : null}
      </Stack>
    </Card>
  );
}
