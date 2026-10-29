/**
 * Resource list row: kind icon tile, title, description, where it comes from and (for parents)
 * who shared it with a note.
 */
import { FileText, Image as ImageIcon, Link, Video, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Resource, ResourceKind, ResourceShare } from '@/domain/types';
import { timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Row, Stack, Text } from '@/ui';

export const KIND_ICON: Record<ResourceKind, LucideIcon> = { pdf: FileText, video: Video, link: Link, image: ImageIcon };

export function KindTile({ kind, size = 48 }: { kind: ResourceKind; size?: number }) {
  const t = useTheme();
  const Icon = KIND_ICON[kind];
  return (
    <View style={{ width: size, height: size, borderRadius: t.radius.md, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size * 0.46} color={t.colors.primaryText} />
    </View>
  );
}

export function ResourceRow({
  resource,
  share,
  onPress,
  showSource,
  testID,
}: {
  resource: Resource;
  share?: ResourceShare;
  onPress: () => void;
  showSource?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('resources');
  return (
    <Card onPress={onPress} testID={testID} accessibilityLabel={`${resource.title}, ${tr(`kind.${resource.kind}`)}`} accessibilityHint={tr('common:a11y.opensDetails')}>
      <Row gap={3} align="flex-start">
        <KindTile kind={resource.kind} />
        <Stack gap={1} flex={1}>
          <Text variant="subheading" numberOfLines={2}>
            {resource.title}
          </Text>
          {resource.description ? (
            <Text variant="label" color="textMuted" numberOfLines={2}>
              {resource.description}
            </Text>
          ) : null}
          <Row gap={2} wrap style={{ marginTop: 2 }}>
            <Badge label={tr(`kind.${resource.kind}`)} tone="neutral" icon={KIND_ICON[resource.kind]} />
            {showSource ? <Badge label={resource.organizationId ? tr('school') : tr('global')} tone={resource.organizationId ? 'primary' : 'info'} /> : null}
          </Row>
          {share ? (
            <Stack gap={1} style={{ marginTop: t.space[1] }}>
              <Text variant="caption" color="textMuted">
                {`${tr('parent.sharedBy', { name: share.sharedByName })} · ${timeAgo(share.at)}`}
              </Text>
              {share.note ? <Text variant="label" style={{ borderLeftWidth: 3, borderLeftColor: t.colors.accent, paddingLeft: t.space[2] }}>{share.note}</Text> : null}
            </Stack>
          ) : null}
        </Stack>
      </Row>
    </Card>
  );
}
