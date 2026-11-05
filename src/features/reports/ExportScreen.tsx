import { Baby, FileSpreadsheet, Share2, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { ADMIN_ROLES, type ExportRow, type UUID } from '@/domain/types';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Button, Card, EmptyState, QueryView, Screen, SegmentedControl, SkeletonList, Stack, Text, toast } from '@/ui';

import { ChildPickerSheet, TherapistPickerSheet } from './components/PickerSheets';
import { initialRange, RangePicker, type RangeValue } from './components/RangePicker';
import { SelectField } from './components/SelectField';
import { csvColumns, toCsv } from './csv';
import { isValidRange } from './dateRanges';
import { useExportRows, type ExportDataset } from './queries';
import { CSV_SHARE, shareTextFile, ShareUnavailableError } from './share';

type Filter = 'everyone' | 'child' | 'therapist';
const PREVIEW_ROWS = 3;

export function exportFileName(dataset: ExportDataset, range: { from: string; to: string }, who?: string): string {
  const slug = who ? `_${who.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}` : '';
  return `${dataset}${slug}_${range.from}_to_${range.to}.csv`;
}

function PreviewTable({ rows }: { rows: ExportRow[] }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const displayCell = (v: ExportRow[string] | undefined) =>
    v == null || v === '' ? '—' : typeof v === 'boolean' ? (v ? tr('common:actions.yes') : tr('common:actions.no')) : String(v);
  const cols = csvColumns(rows);
  const cell = { minWidth: 110, maxWidth: 200, paddingVertical: 6, paddingHorizontal: 8 } as const;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={cols.join(', ')}>
      <View>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: t.colors.borderStrong }}>
          {cols.map((c) => (
            <View key={c} style={cell}>
              <Text variant="caption" weight="semibold" color="textMuted" numberOfLines={1}>
                {c}
              </Text>
            </View>
          ))}
        </View>
        {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
            {cols.map((c) => (
              <View key={c} style={cell}>
                <Text variant="caption" numberOfLines={2}>
                  {displayCell(r[c])}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function ExportScreen() {
  const { t } = useTranslation('reports');
  const role = useActive()?.role;
  const [dataset, setDataset] = useState<ExportDataset>('sessions');
  const [range, setRange] = useState<RangeValue>(() => initialRange('this_month'));
  const [filter, setFilter] = useState<Filter>('everyone');
  const [child, setChild] = useState<{ id: UUID; name: string } | null>(null);
  const [therapist, setTherapist] = useState<{ id: UUID; name: string } | null>(null);
  const [picker, setPicker] = useState<'child' | 'therapist' | null>(null);
  const [sharing, setSharing] = useState(false);

  const target = filter === 'child' ? child : filter === 'therapist' ? therapist : null;
  const ready = isValidRange(range) && (filter === 'everyone' || !!target);
  const opts = {
    from: range.from,
    to: range.to,
    childId: filter === 'child' ? child?.id : undefined,
    therapistId: filter === 'therapist' ? therapist?.id : undefined,
  };
  const query = useExportRows(dataset, opts, ready && !!role && ADMIN_ROLES.includes(role));

  if (!role || !ADMIN_ROLES.includes(role)) {
    return (
      <Screen title={t('export.title')} back>
        <EmptyState title={t('export.noAccess')} />
      </Screen>
    );
  }

  const rows = query.data ?? [];
  const share = async () => {
    setSharing(true);
    try {
      await shareTextFile(exportFileName(dataset, range, target?.name), toCsv(rows), { ...CSV_SHARE, dialogTitle: t('export.shareTitle') });
    } catch (e) {
      toast.error(e instanceof ShareUnavailableError ? t('share.unavailable') : t('export.shareError'));
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen
      title={t('export.title')}
      back
      testID="export-screen"
      footer={
        <>
          <Text variant="caption" color="textMuted" align="center">
            {t('export.excelNote')}
          </Text>
          <Button testID="export-share" label={t('export.share')} icon={Share2} onPress={() => void share()} disabled={!ready || rows.length === 0} loading={sharing} fullWidth size="lg" />
        </>
      }
    >
      <Card>
        <Stack gap={4}>
          <Stack gap={2}>
            <Text variant="label">{t('export.dataset')}</Text>
            <SegmentedControl<ExportDataset>
              testID="export-dataset"
              options={[
                { value: 'sessions', label: t('export.sessions') },
                { value: 'attendance', label: t('export.attendance') },
              ]}
              value={dataset}
              onChange={setDataset}
            />
            <Text variant="caption" color="textMuted">
              {dataset === 'sessions' ? t('export.sessionsHint') : t('export.attendanceHint')}
            </Text>
          </Stack>
          <RangePicker label={t('home.period')} value={range} onChange={setRange} />
          <Stack gap={2}>
            <Text variant="label">{t('export.filter')}</Text>
            <SegmentedControl<Filter>
              testID="export-filter"
              options={[
                { value: 'everyone', label: t('export.everyone') },
                { value: 'child', label: t('export.oneChild') },
                { value: 'therapist', label: t('export.oneTherapist') },
              ]}
              value={filter}
              onChange={setFilter}
            />
            {filter === 'child' ? (
              <SelectField label={t('home.child')} value={child?.name} placeholder={t('home.chooseChild')} icon={Baby} onPress={() => setPicker('child')} />
            ) : null}
            {filter === 'therapist' ? (
              <SelectField label={t('export.oneTherapist')} value={therapist?.name} placeholder={t('export.chooseTherapist')} icon={UserRound} onPress={() => setPicker('therapist')} />
            ) : null}
          </Stack>
        </Stack>
      </Card>

      {ready ? (
        <QueryView
          query={query}
          skeleton={<SkeletonList rows={1} height={160} />}
          isEmpty={(d) => d.length === 0}
          empty={<EmptyState compact title={t('export.empty')} body={t('export.emptyBody')} />}
        >
          {(data) => (
            <Card testID="export-preview">
              <Stack gap={3}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text variant="heading">{t('export.previewTitle')}</Text>
                  <Badge label={t('export.rows', { count: data.length })} tone="primary" icon={FileSpreadsheet} />
                </View>
                <Text variant="caption" color="textMuted">
                  {t('export.previewFirst', { count: Math.min(PREVIEW_ROWS, data.length) })}
                </Text>
                <PreviewTable rows={data} />
              </Stack>
            </Card>
          )}
        </QueryView>
      ) : null}

      <ChildPickerSheet visible={picker === 'child'} onClose={() => setPicker(null)} onPick={setChild} />
      <TherapistPickerSheet visible={picker === 'therapist'} onClose={() => setPicker(null)} onPick={setTherapist} />
    </Screen>
  );
}
