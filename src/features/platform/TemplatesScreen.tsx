import { ChevronDown, ChevronUp, FileText, Image as ImageIcon, Info, Link, Video, type LucideIcon } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import type { RatingDimension, RatingValue, Resource } from '@/domain/types';
import { InlineEmpty } from '@/features/home/components/Blocks';
import { useRefresh } from '@/features/home/components/useRefresh';
import { dimensionText } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Divider, EmptyState, Icon, QueryView, Row, Screen, SegmentedControl, SkeletonList, Stack, Text } from '@/ui';

import { GoalBankTab } from './GoalBankTab';
import { useGlobalDimensions, useGlobalResources } from './queries';

type Tab = 'dimensions' | 'goals' | 'resources';
const VALUES: RatingValue[] = [1, 2, 3, 4, 5];

function DimensionCard({ d }: { d: RatingDimension }) {
  const theme = useTheme();
  const { t } = useTranslation('platform');
  const [open, setOpen] = useState(false);
  const text = dimensionText(t, d);
  return (
    <Card testID={`dimension-${d.key}`}>
      <Stack gap={2}>
        <Row gap={3} align="flex-start">
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={d.icon} size={18} color="primaryText" />
          </View>
          <Stack gap={1} flex={1}>
            <Text variant="subheading">{text.label}</Text>
            <Text variant="caption" color="textMuted">
              {t('templates.parentsSee', { label: text.parentLabel })}
            </Text>
          </Stack>
          {!d.enabled ? <Badge label={t('templates.off')} /> : null}
        </Row>
        <Text color="textMuted">{text.description}</Text>
        <Pressable
          testID={`anchors-${d.key}`}
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 }}
        >
          {open ? <ChevronUp size={18} color={theme.colors.primaryText} /> : <ChevronDown size={18} color={theme.colors.primaryText} />}
          <Text variant="label" color="primaryText" weight="semibold">
            {open ? t('templates.hideAnchors') : t('templates.showAnchors')}
          </Text>
        </Pressable>
        {open
          ? VALUES.map((v) => (
              <Row key={v} gap={3} align="flex-start">
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.scale[v - 1], alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="label" weight="bold" tint={theme.scheme === 'dark' ? theme.colors.bg : theme.colors.text}>
                    {v}
                  </Text>
                </View>
                <Text style={{ flex: 1 }}>{text.anchor(v)}</Text>
              </Row>
            ))
          : null}
      </Stack>
    </Card>
  );
}

function DimensionsTab() {
  const { t } = useTranslation('platform');
  const q = useGlobalDimensions();
  return (
    <>
      <InlineEmpty icon={Info} title={t('templates.dimensionsNoteTitle')} body={t('templates.dimensionsNote')} />
      <QueryView query={q} skeleton={<SkeletonList rows={4} height={110} />} isEmpty={(d) => d.length === 0} empty={<EmptyState title={t('templates.emptyDimensions')} />}>
        {(list) => [...list].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => <DimensionCard key={d.id} d={d} />)}
      </QueryView>
    </>
  );
}

const KIND_ICON: Record<Resource['kind'], LucideIcon> = { pdf: FileText, image: ImageIcon, video: Video, link: Link };

function ResourcesTab() {
  const theme = useTheme();
  const { t } = useTranslation('platform');
  const q = useGlobalResources();
  return (
    <QueryView query={q} skeleton={<SkeletonList rows={4} height={80} />} isEmpty={(d) => d.length === 0} empty={<EmptyState title={t('templates.emptyResources')} />}>
      {(list) => (
        <Card padding={3}>
          {list.map((r, i) => {
            const KindIcon = KIND_ICON[r.kind] ?? FileText;
            return (
              <Fragment key={r.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  testID={`resource-${r.id}`}
                  onPress={() => void Linking.openURL(r.url)}
                  accessibilityRole="link"
                  accessibilityLabel={`${r.title}, ${t(`templates.kinds.${r.kind}`)}`}
                  style={({ pressed }) => ({ flexDirection: 'row', gap: theme.space[3], paddingVertical: theme.space[3], opacity: pressed ? 0.85 : 1 })}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <KindIcon size={20} color={theme.colors.textMuted} />
                  </View>
                  <Stack gap={1} flex={1}>
                    <Text variant="bodyStrong">{r.title}</Text>
                    {r.description ? (
                      <Text variant="caption" color="textMuted" numberOfLines={2}>
                        {r.description}
                      </Text>
                    ) : null}
                    <Row gap={2} wrap>
                      <Badge label={t(`templates.kinds.${r.kind}`)} />
                      <Badge label={t(`templates.audience.${r.audience}`)} tone="info" />
                    </Row>
                  </Stack>
                </Pressable>
              </Fragment>
            );
          })}
        </Card>
      )}
    </QueryView>
  );
}

/** Platform templates every new school starts from: rating scales, goal bank, resources. */
export function TemplatesScreen() {
  const { t } = useTranslation('platform');
  const [tab, setTab] = useState<Tab>('dimensions');
  const { refreshing, onRefresh } = useRefresh(['platform']);
  return (
    <Screen
      testID="templates"
      title={t('templates.title')}
      subtitle={t('templates.subtitle')}
      refreshing={refreshing}
      onRefresh={onRefresh}
      headerExtra={
        <SegmentedControl
          testID="template-tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'dimensions', label: t('templates.tabs.dimensions') },
            { value: 'goals', label: t('templates.tabs.goals') },
            { value: 'resources', label: t('templates.tabs.resources') },
          ]}
        />
      }
    >
      {tab === 'dimensions' ? <DimensionsTab /> : tab === 'goals' ? <GoalBankTab /> : <ResourcesTab />}
    </Screen>
  );
}
