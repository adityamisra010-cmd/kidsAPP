import { FileDown, RotateCcw } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChildReportData, ISODate } from '@/domain/types';
import { formatDate } from '@/lib/dates';
import { useActive } from '@/state/session';
import { BRAND } from '@/theme/brand';
import { Button, Card, QueryView, Screen, SegmentedControl, SkeletonList, Stack, Text, TextField, toast } from '@/ui';

import { ReportHeader, ReportPreview } from './components/ReportPreview';
import { isValidRange, presetRange } from './dateRanges';
import { useChildReport } from './queries';
import { buildReportHtml } from './reportHtml';
import { buildReportModel, reportFileName, type Audience } from './reportModel';
import { logoForPrint, sharePdf, ShareUnavailableError } from './share';

export interface ChildReportParams {
  id?: string;
  from?: string;
  to?: string;
  audience?: string;
}

/** Parents always get the parent copy, whatever the link says. */
export function resolveAudience(role: string | undefined, requested: string | undefined): Audience {
  if (role === 'parent') return 'parent';
  return requested === 'parent' ? 'parent' : 'staff';
}

export function resolveRange(from?: string, to?: string): { from: ISODate; to: ISODate } {
  const r = { from: from ?? '', to: to ?? '' };
  return isValidRange(r) ? r : presetRange('this_month');
}

export function ChildReportScreen({ id, from, to, audience: requested }: ChildReportParams) {
  const { t, i18n } = useTranslation('reports');
  const role = useActive()?.role;
  const isParent = role === 'parent';
  const [audience, setAudience] = useState<Audience>(() => resolveAudience(role, requested));
  const range = useMemo(() => resolveRange(from, to), [from, to]);
  const query = useChildReport(id, { ...range, audience });
  // Edited summaries per audience, so switching copies doesn't lose what was typed.
  const [edits, setEdits] = useState<Partial<Record<Audience, string>>>({});
  const summary = edits[audience] ?? query.data?.therapistSummary ?? '';

  return (
    <Screen
      title={t('child.title')}
      subtitle={query.data?.child.fullName}
      back
      testID="child-report"
      headerExtra={
        isParent ? undefined : (
          <SegmentedControl<Audience>
            testID="report-audience-toggle"
            options={[
              { value: 'parent', label: t('child.audienceParent') },
              { value: 'staff', label: t('child.audienceStaff') },
            ]}
            value={audience}
            onChange={setAudience}
          />
        )
      }
      footer={query.data ? <CreatePdfButton data={query.data} audience={audience} summary={summary} lang={i18n.language === 'hi' ? 'hi' : 'en'} /> : undefined}
    >
      <QueryView query={query} skeleton={<SkeletonList rows={5} height={120} />}>
        {(data) => (
          <ReportBody
            data={data}
            audience={audience}
            summary={summary}
            onSummaryChange={(v) => setEdits((e) => ({ ...e, [audience]: v }))}
            canEditSummary={!isParent}
          />
        )}
      </QueryView>
    </Screen>
  );
}

function ReportBody({
  data,
  audience,
  summary,
  onSummaryChange: update,
  canEditSummary,
}: {
  data: ChildReportData;
  audience: Audience;
  summary: string;
  onSummaryChange: (v: string) => void;
  canEditSummary: boolean;
}) {
  const { t } = useTranslation('reports');
  const model = useMemo(() => buildReportModel(data, { audience }), [data, audience]);
  return (
    <Stack gap={4}>
      <ReportHeader m={model} />
      {audience === 'staff' ? (
        <Text variant="caption" color="warning">
          {t('child.staffOnlyNote')}
        </Text>
      ) : null}
      <ReportPreview m={model} />
      <Card testID="report-summary">
        <Stack gap={3}>
          <Text variant="heading" accessibilityRole="header">
            {t('pdf.summaryTitle')}
          </Text>
          {canEditSummary ? (
            <>
              <TextField
                testID="report-summary-input"
                accessibilityLabel={t('pdf.summaryTitle')}
                multiline
                minLines={5}
                value={summary}
                onChangeText={update}
                placeholder={t('child.summaryPlaceholder')}
                helper={t('child.summaryHint')}
              />
              {summary !== data.therapistSummary ? (
                <Button size="sm" variant="ghost" icon={RotateCcw} label={t('child.resetSummary')} onPress={() => update(data.therapistSummary)} />
              ) : null}
            </>
          ) : (
            <>
              <Text>{data.therapistSummary || t('pdf.noSummary')}</Text>
              <Text variant="caption" color="textMuted">
                {t('child.summaryReadOnly')}
              </Text>
            </>
          )}
        </Stack>
      </Card>
      <Text variant="caption" color="textMuted" align="center">
        {`${t('child.previewNote')} ${t('pdf.generated', { app: BRAND.appName, date: formatDate(data.generatedAt) })}`}
      </Text>
    </Stack>
  );
}

function CreatePdfButton({ data, audience, summary, lang }: { data: ChildReportData; audience: Audience; summary: string; lang: 'en' | 'hi' }) {
  const { t } = useTranslation('reports');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const model = buildReportModel(data, { audience });
      const html = buildReportHtml(model, {
        t: (key, vars) => t(key, vars),
        appName: BRAND.appName,
        lang,
        therapistSummary: summary,
        formatDate,
        logoSrc: await logoForPrint(model.school.logoUrl),
      });
      await sharePdf(html, reportFileName(model), t('child.shareTitle'));
    } catch (e) {
      toast.error(e instanceof ShareUnavailableError ? t('share.unavailable') : t('child.pdfError'));
    } finally {
      setBusy(false);
    }
  };
  return <Button testID="report-create-pdf" label={t('child.createPdf')} icon={FileDown} onPress={() => void create()} loading={busy} fullWidth size="lg" />;
}
