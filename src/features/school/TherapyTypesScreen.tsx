import { Pencil, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTherapyTypes } from '@/data/hooks';
import type { TherapyType } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Button, Card, Divider, EmptyState, Icon, QueryView, Screen, SkeletonList, SwitchRow, Text, toast } from '@/ui';

import { TherapyTypeSheet, type TherapyTypeForm } from './components/TherapyTypeSheet';
import { useUpsertTherapyType } from './queries';
import { canEditSchool, canViewSchool } from './settingsDraft';

export function TherapyTypesScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const active = useActive();
  const canEdit = canEditSchool(active?.role);
  const query = useTherapyTypes();
  const upsert = useUpsertTherapyType();
  const [sheet, setSheet] = useState<{ open: boolean; type: TherapyType | null }>({ open: false, type: null });

  if (!canViewSchool(active?.role)) {
    return (
      <Screen title={tr('therapyTypes.title')} back>
        <EmptyState title={tr('settings.noAccess')} />
      </Screen>
    );
  }

  const list = query.data ?? [];
  const write = (input: Omit<TherapyType, 'id'> & { id?: string }, done?: () => void) =>
    upsert.mutate(input, {
      onSuccess: () => {
        done?.();
        toast.success(tr('therapyTypes.saved'));
      },
      onError: () => toast.error(tr('therapyTypes.saveError')),
    });

  const onSave = (f: TherapyTypeForm) => {
    const base = sheet.type;
    write(
      base
        ? { ...base, name: f.name, color: f.color, icon: f.icon }
        : { organizationId: active?.orgId ?? '', key: 'custom', name: f.name, color: f.color, icon: f.icon, active: true },
      () => setSheet({ open: false, type: null }),
    );
  };

  return (
    <Screen
      title={tr('therapyTypes.title')}
      back
      testID="therapy-types-screen"
      footer={canEdit ? <Button testID="therapy-type-add" label={tr('therapyTypes.add')} icon={Plus} onPress={() => setSheet({ open: true, type: null })} fullWidth size="lg" /> : undefined}
    >
      <Text color="textMuted">{tr('therapyTypes.intro')}</Text>
      {!canEdit ? (
        <Text variant="caption" color="textMuted">
          {tr('therapyTypes.readOnly')}
        </Text>
      ) : null}
      <QueryView query={query} skeleton={<SkeletonList rows={5} height={72} />} isEmpty={(d) => d.length === 0} empty={<EmptyState title={tr('therapyTypes.empty')} />}>
        {() => (
          <Card padding={0}>
            {list.map((tt, i) => (
              <View key={tt.id} testID={`therapy-type-${tt.id}`}>
                {i > 0 ? <Divider /> : null}
                <View style={{ padding: t.space[4], gap: t.space[2] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tt.color }} />
                    <Icon name={tt.icon} size={22} tint={tt.color} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="subheading" color={tt.active ? 'text' : 'textMuted'}>
                        {therapyTypeLabel(tr, tt)}
                      </Text>
                      {tt.key === 'custom' ? <Badge label={tr('therapyTypes.custom')} tone="primary" /> : null}
                    </View>
                    {canEdit ? <Button size="sm" variant="ghost" icon={Pencil} label={tr('common:actions.edit')} onPress={() => setSheet({ open: true, type: tt })} /> : null}
                  </View>
                  <SwitchRow
                    testID={`therapy-type-${tt.id}-active`}
                    label={tr('therapyTypes.active')}
                    value={tt.active}
                    disabled={!canEdit || upsert.isPending}
                    onChange={(v) => write({ ...tt, active: v })}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}
      </QueryView>
      <Text variant="caption" color="textMuted">
        {tr('therapyTypes.inactiveNote')}
      </Text>
      <TherapyTypeSheet
        visible={sheet.open}
        initial={sheet.type}
        existing={list}
        onClose={() => setSheet({ open: false, type: null })}
        onSave={onSave}
        saving={upsert.isPending}
      />
    </Screen>
  );
}
