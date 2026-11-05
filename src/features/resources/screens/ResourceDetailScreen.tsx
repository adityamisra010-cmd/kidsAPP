/**
 * Resource detail: play videos in the app, open PDFs/links/images in the in-app browser, tags.
 * Staff can share it with a family or start a home task from it.
 */
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, ListPlus, Share2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTherapyTypes } from '@/data/hooks';
import { STAFF_ROLES } from '@/domain/types';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { timeAgo } from '@/lib/dates';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Button, Card, Chip, ErrorState, Row, Screen, SkeletonList, Stack, Text, toast, TypeTag } from '@/ui';

import { VideoPlayer } from '../../practice/components/VideoPlayer';
import { KIND_ICON, KindTile } from '../components/ResourceRow';
import { ShareResourceSheet } from '../components/ShareResourceSheet';
import { opensInPlayer } from '../logic';
import { useParentResources, useResource } from '../queries';

export function ResourceDetailScreen({ id }: { id: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('resources');
  const active = useActive();
  const isStaff = !!active && STAFF_ROLES.includes(active.role);
  const isParent = active?.role === 'parent';
  const q = useResource(id);
  const parentList = useParentResources(isParent ? active?.childId : null);
  const share = parentList.data?.find((r) => r.id === id)?.share;
  const therapyTypes = useTherapyTypes();
  const [shareOpen, setShareOpen] = useState(false);
  const types = useMemo(() => (therapyTypes.data ?? []).filter((tt) => q.data?.therapyTypeKeys.includes(tt.key)), [therapyTypes.data, q.data]);

  if (q.isPending || q.error || !q.data) {
    return (
      <Screen title={tr('title')} back>
        {q.isPending ? <SkeletonList rows={3} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Screen>
    );
  }
  const r = q.data;

  const open = async () => {
    try {
      await WebBrowser.openBrowserAsync(r.url, { toolbarColor: t.colors.surface, controlsColor: t.colors.primary });
    } catch {
      toast.error(tr('detail.openFailed'));
    }
  };

  return (
    <Screen
      title={tr('title')}
      back
      testID="resource-detail"
      footer={
        isStaff ? (
          <>
            <Button label={tr('detail.share')} icon={Share2} size="lg" fullWidth onPress={() => setShareOpen(true)} testID="resource-share" />
            <Button label={tr('detail.useInTask')} icon={ListPlus} variant="ghost" fullWidth onPress={() => router.push(`/practice/task/new?resourceId=${r.id}`)} />
          </>
        ) : undefined
      }
    >
      <Row gap={3} align="flex-start">
        <KindTile kind={r.kind} size={56} />
        <Stack gap={2} flex={1}>
          <Text variant="title" accessibilityRole="header">
            {r.title}
          </Text>
          <Row gap={2} wrap>
            <Badge label={tr(`kind.${r.kind}`)} icon={KIND_ICON[r.kind]} />
            <Badge label={r.organizationId ? tr('school') : tr('global')} tone={r.organizationId ? 'primary' : 'info'} />
            {isStaff ? <Badge label={tr(`audienceOpt.${r.audience}`)} tone="neutral" /> : null}
          </Row>
        </Stack>
      </Row>

      {r.description ? <Text>{r.description}</Text> : null}

      {share ? (
        <Card tone="primary" elevated={false}>
          <Stack gap={1}>
            <Text variant="label" weight="semibold">
              {`${tr('parent.sharedBy', { name: share.sharedByName })} · ${timeAgo(share.at)}`}
            </Text>
            {share.note ? <Text>{share.note}</Text> : null}
          </Stack>
        </Card>
      ) : null}

      {opensInPlayer(r.kind) ? (
        <VideoPlayer uri={r.url} />
      ) : (
        <Button label={tr(`detail.open.${r.kind}`)} icon={ExternalLink} variant={isStaff ? 'outline' : 'primary'} size="lg" fullWidth onPress={() => void open()} testID="resource-open" />
      )}

      {types.length || r.domains.length || r.ageBand ? (
        <Card>
          <Stack gap={3}>
            {types.length ? (
              <Stack gap={2}>
                <Text variant="overline" color="textMuted">
                  {tr('therapyType')}
                </Text>
                <Row gap={3} wrap>
                  {types.map((tt) => (
                    <TypeTag key={tt.id} name={therapyTypeLabel(tr, tt)} color={tt.color} />
                  ))}
                </Row>
              </Stack>
            ) : null}
            {r.domains.length ? (
              <Stack gap={2}>
                <Text variant="overline" color="textMuted">
                  {tr('domain')}
                </Text>
                <Row gap={2} wrap>
                  {r.domains.map((d) => (
                    <Chip key={d} size="sm" label={vocabLabel(tr, 'domains', d)} />
                  ))}
                </Row>
              </Stack>
            ) : null}
            {r.ageBand ? <Text variant="label">{tr('detail.ageBand', { band: r.ageBand })}</Text> : null}
          </Stack>
        </Card>
      ) : null}

      {r.tags.length ? (
        <Stack gap={2}>
          <Text variant="overline" color="textMuted">
            {tr('detail.tags')}
          </Text>
          <Row gap={2} wrap>
            {r.tags.map((tag) => (
              <Chip key={tag} size="sm" label={`#${tag}`} />
            ))}
          </Row>
        </Stack>
      ) : null}

      {isStaff ? <ShareResourceSheet visible={shareOpen} onClose={() => setShareOpen(false)} resource={r} /> : null}
    </Screen>
  );
}
