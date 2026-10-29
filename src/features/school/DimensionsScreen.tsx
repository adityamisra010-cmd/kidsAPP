import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Scale } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useRatingDimensions } from '@/data/hooks';
import { key } from '@/data/queryClient';
import type { RatingDimension } from '@/domain/types';
import { dimensionText } from '@/i18n/labels';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Button, Card, EmptyState, Icon, QueryView, Screen, SkeletonList, Stack, SwitchRow, Text, toast } from '@/ui';

import { DimensionEditSheet } from './components/DimensionEditSheet';
import { NumberInput } from './components/fields';
import { useReorderDimensions, useUpsertDimension } from './queries';
import { canEditSchool, canViewSchool } from './settingsDraft';

export const MIN_ENABLED = 3;

/** Moves one item up/down and renumbers sortOrder 1..n. */
export function moveDimension(list: RatingDimension[], id: string, dir: -1 | 1): RatingDimension[] {
  const i = list.findIndex((d) => d.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((d, idx) => ({ ...d, sortOrder: idx + 1 }));
}

export function DimensionsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const active = useActive();
  const role = active?.role;
  const canEdit = canEditSchool(role);
  const query = useRatingDimensions();
  const qc = useQueryClient();
  const upsert = useUpsertDimension();
  const reorder = useReorderDimensions();
  const [editing, setEditing] = useState<RatingDimension | null>(null);
  const list = useMemo(() => [...(query.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [query.data]);
  const enabledCount = list.filter((d) => d.enabled).length;
  const cacheKey = key('org', active?.orgId ?? null, 'dimensions');

  if (!canViewSchool(role)) {
    return (
      <Screen title={tr('dimensions.title')} back>
        <EmptyState title={tr('settings.noAccess')} />
      </Screen>
    );
  }

  const setCache = (next: RatingDimension[]) => qc.setQueryData(cacheKey, next);
  const save = (d: RatingDimension, opts?: { closeSheet?: boolean }) => {
    const prev = list;
    setCache(list.map((x) => (x.id === d.id ? d : x)));
    upsert.mutate(d, {
      onSuccess: () => {
        if (opts?.closeSheet) {
          setEditing(null);
          toast.success(tr('dimensions.saved'));
        }
      },
      onError: () => {
        setCache(prev);
        toast.error(tr('dimensions.saveError'));
      },
    });
  };
  const toggle = (d: RatingDimension, enabled: boolean) => {
    if (!enabled && enabledCount <= MIN_ENABLED) {
      toast.info(tr('dimensions.minEnabled'));
      return;
    }
    save({ ...d, enabled });
  };
  const move = (d: RatingDimension, dir: -1 | 1) => {
    const prev = list;
    const next = moveDimension(list, d.id, dir);
    if (next === list) return;
    setCache(next);
    reorder.mutate(
      next.map((x) => x.id),
      {
        onError: () => {
          setCache(prev);
          toast.error(tr('dimensions.saveError'));
        },
      },
    );
  };

  return (
    <Screen title={tr('dimensions.title')} back testID="dimensions-screen">
      <Card tone="primary">
        <Stack gap={2}>
          <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'center' }}>
            <Scale size={20} color={t.colors.primaryText} />
            <Text variant="subheading" style={{ flex: 1 }}>
              {tr('dimensions.intro')}
            </Text>
          </View>
          <Text variant="label" color="textMuted">
            {tr('dimensions.introBody')}
          </Text>
        </Stack>
      </Card>
      {!canEdit ? (
        <Text variant="caption" color="textMuted">
          {tr('dimensions.readOnly')}
        </Text>
      ) : null}
      <QueryView query={query} skeleton={<SkeletonList rows={5} height={150} />} isEmpty={(d) => d.length === 0} empty={<EmptyState title={tr('dimensions.empty')} />}>
        {() => (
          <Stack gap={3}>
            {list.map((d, i) => {
              const text = dimensionText(tr, d);
              return (
                <Card key={d.id} testID={`dimension-${d.key}`}>
                  <Stack gap={3}>
                    <View style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'center' }}>
                      <Icon name={d.icon} size={22} color={d.enabled ? 'primaryText' : 'textSubtle'} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="subheading" color={d.enabled ? 'text' : 'textMuted'}>
                          {text.label}
                        </Text>
                        <Text variant="caption" color="textMuted" numberOfLines={2}>
                          {text.description}
                        </Text>
                      </View>
                      {!d.enabled ? <Badge label={tr('dimensions.off')} /> : null}
                    </View>
                    <SwitchRow testID={`dimension-${d.key}-enabled`} label={tr('dimensions.enabled')} value={d.enabled} disabled={!canEdit} onChange={(v) => toggle(d, v)} />
                    <NumberInput
                      testID={`dimension-${d.key}-weight`}
                      label={tr('dimensions.weight')}
                      value={d.weight}
                      min={0.5}
                      max={3}
                      step={0.5}
                      readOnly={!canEdit}
                      onChange={(weight) => save({ ...d, weight: Math.round(weight * 2) / 2 })}
                    />
                    {canEdit ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                        <Button size="sm" variant="outline" icon={ArrowUp} label={tr('dimensions.moveUp')} accessibilityHint={tr('dimensions.moveUpA11y', { label: text.label })} disabled={i === 0} onPress={() => move(d, -1)} />
                        <Button
                          size="sm"
                          variant="outline"
                          icon={ArrowDown}
                          label={tr('dimensions.moveDown')}
                          accessibilityHint={tr('dimensions.moveDownA11y', { label: text.label })}
                          disabled={i === list.length - 1}
                          onPress={() => move(d, 1)}
                        />
                        <Button testID={`dimension-${d.key}-edit`} size="sm" variant="secondary" icon={Pencil} label={tr('dimensions.edit')} onPress={() => setEditing(d)} style={{ flexGrow: 1 }} />
                      </View>
                    ) : null}
                  </Stack>
                </Card>
              );
            })}
            <Text variant="caption" color="textMuted">
              {tr('dimensions.weightHelp')}
            </Text>
          </Stack>
        )}
      </QueryView>
      <DimensionEditSheet dimension={editing} onClose={() => setEditing(null)} onSave={(d) => save(d, { closeSheet: true })} saving={upsert.isPending} />
    </Screen>
  );
}
