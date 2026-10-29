import { router } from 'expo-router';
import { ArrowRight, Baby, FileSpreadsheet, FileText } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ADMIN_ROLES, type UUID } from '@/domain/types';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, EmptyState, Row, Screen, SegmentedControl, Stack, Text } from '@/ui';

import { ChildPickerSheet } from './components/PickerSheets';
import { initialRange, RangePicker, type RangeValue } from './components/RangePicker';
import { SelectField } from './components/SelectField';
import { isValidRange } from './dateRanges';
import type { Audience } from './reportModel';

function CardTitle({ icon: Icon, title, body }: { icon: typeof FileText; title: string; body: string }) {
  const t = useTheme();
  return (
    <Row gap={3} align="flex-start">
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={22} color={t.colors.primaryText} />
      </View>
      <Stack gap={1} flex={1}>
        <Text variant="heading">{title}</Text>
        <Text color="textMuted">{body}</Text>
      </Stack>
    </Row>
  );
}

export function childReportHref(childId: UUID, range: { from: string; to: string }, audience: Audience): string {
  return `/reports/child/${childId}?from=${range.from}&to=${range.to}&audience=${audience}`;
}

export function ReportsHomeScreen() {
  const { t } = useTranslation('reports');
  const role = useActive()?.role;
  const [child, setChild] = useState<{ id: UUID; name: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [range, setRange] = useState<RangeValue>(() => initialRange('last_month'));
  const [audience, setAudience] = useState<Audience>('parent');

  if (!role || !ADMIN_ROLES.includes(role)) {
    return (
      <Screen title={t('home.title')}>
        <EmptyState title={t('home.noAccess')} />
      </Screen>
    );
  }

  const ready = !!child && isValidRange(range);

  return (
    <Screen title={t('home.title')} subtitle={t('home.subtitle')} testID="reports-home">
      <Card>
        <Stack gap={4}>
          <CardTitle icon={FileText} title={t('home.childCardTitle')} body={t('home.childCardBody')} />
          <SelectField testID="report-child" label={t('home.child')} value={child?.name} placeholder={t('home.chooseChild')} icon={Baby} onPress={() => setPicking(true)} />
          <RangePicker label={t('home.period')} value={range} onChange={setRange} />
          <Stack gap={2}>
            <Text variant="label">{t('home.audience')}</Text>
            <SegmentedControl<Audience>
              testID="report-audience"
              options={[
                { value: 'parent', label: t('home.audienceParent') },
                { value: 'staff', label: t('home.audienceStaff') },
              ]}
              value={audience}
              onChange={setAudience}
            />
            <Text variant="caption" color="textMuted">
              {audience === 'parent' ? t('home.audienceParentHint') : t('home.audienceStaffHint')}
            </Text>
          </Stack>
          <Button
            testID="report-preview"
            label={t('home.preview')}
            iconRight={ArrowRight}
            disabled={!ready}
            onPress={() => child && router.push(childReportHref(child.id, range, audience))}
            fullWidth
          />
          {!child ? (
            <Text variant="caption" color="textMuted" align="center">
              {t('home.chooseChildFirst')}
            </Text>
          ) : null}
        </Stack>
      </Card>

      <Card>
        <Stack gap={4}>
          <CardTitle icon={FileSpreadsheet} title={t('home.exportCardTitle')} body={t('home.exportCardBody')} />
          <Button testID="report-open-export" label={t('home.openExport')} variant="secondary" iconRight={ArrowRight} onPress={() => router.push('/reports/export')} fullWidth />
        </Stack>
      </Card>

      <ChildPickerSheet visible={picking} onClose={() => setPicking(false)} onPick={setChild} />
    </Screen>
  );
}
