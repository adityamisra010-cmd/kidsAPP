import { router } from 'expo-router';
import { ArrowRight, Upload } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ImportKind, ImportSummary } from '@/domain/types';
import { useActive } from '@/state/session';
import { Button, EmptyState, ErrorState, Screen, SkeletonList, Text, toast } from '@/ui';

import { canImport, LIST_ROUTE } from './access';
import { isImportKind } from './columns';
import { CheckStep } from './components/CheckStep';
import { ChooseFileStep } from './components/ChooseFileStep';
import { DoneStep } from './components/DoneStep';
import { MatchColumnsStep } from './components/MatchColumnsStep';
import { StepHeader, type ImportStep } from './components/StepHeader';
import { pickSpreadsheet, readSpreadsheet, type PickedFile } from './file';
import { autoMap, missingRequired, type ColumnMapping } from './mapping';
import { ImportFileError, type ImportFileErrorCode, type ParsedSheet } from './parse';
import { useCommitImport, useImportContext } from './queries';
import { toImportRows, validateRows, type RefKind, type Resolutions, type ValidationResult } from './validate';

export function ImportFlowScreen({ kind }: { kind?: string }) {
  const { t } = useTranslation('import');
  const role = useActive()?.role;
  if (!isImportKind(kind)) {
    return (
      <Screen title={t('home.title')} back>
        <EmptyState title={t('flow.unknownKind')} actionLabel={t('done.backToImports')} onAction={() => router.replace('/import')} />
      </Screen>
    );
  }
  if (!canImport(role, kind)) {
    return (
      <Screen title={t('flow.title', { kind: t(`kinds.${kind}.title`) })} back>
        <EmptyState title={t('home.adminOnly')} actionLabel={t('done.backToImports')} onAction={() => router.replace('/import')} />
      </Screen>
    );
  }
  return <ImportFlow kind={kind} />;
}

function ImportFlow({ kind }: { kind: ImportKind }) {
  const { t } = useTranslation('import');
  const [step, setStep] = useState<ImportStep>('file');
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<ImportFileErrorCode | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [resolutions, setResolutions] = useState<Resolutions>({});
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const ctx = useImportContext();
  const commit = useCommitImport();

  // Validation of a big file takes a moment: run it after the Check step has painted its skeleton,
  // and keep showing the previous result while a "Did you mean" choice is re-checked.
  const [result, setResult] = useState<ValidationResult | null>(null);
  useEffect(() => {
    if (step !== 'check' || !sheet || !ctx.data) return;
    const data = ctx.data;
    const timer = setTimeout(() => setResult(validateRows(kind, sheet.rows, mapping, data, { resolutions })), 0);
    return () => clearTimeout(timer);
  }, [step, sheet, ctx.data, kind, mapping, resolutions]);

  const reset = () => {
    setStep('file');
    setPicked(null);
    setSheet(null);
    setFileError(null);
    setMapping({});
    setResolutions({});
    setSummary(null);
    setResult(null);
  };

  const pick = async () => {
    let f: PickedFile | null;
    try {
      f = await pickSpreadsheet();
    } catch {
      setFileError('unreadable');
      return;
    }
    if (!f) return;
    setPicked(f);
    setReading(true);
    setFileError(null);
    setSheet(null);
    try {
      const s = await readSpreadsheet(f, kind);
      setSheet(s);
      setMapping(autoMap(kind, s.headers));
      setResolutions({});
    } catch (e) {
      setFileError(e instanceof ImportFileError ? e.code : 'unreadable');
    } finally {
      setReading(false);
    }
  };

  const resolve = (refKind: RefKind, normalized: string, id: string) =>
    setResolutions((r) => ({ ...r, [refKind]: { ...(r[refKind] ?? {}), [normalized]: id } }));

  const runImport = () => {
    if (!result) return;
    commit.mutate(
      { kind, rows: toImportRows(result) },
      {
        onSuccess: (s) => {
          // Rows we held back (need fixing / repeated) count as skipped too.
          setSummary({ ...s, skipped: s.skipped + result.counts.error + result.counts.duplicate });
          setStep('done');
        },
        onError: () => toast.error(t('done.failed')),
      },
    );
  };

  const onBack = () => {
    if (step === 'match') setStep('file');
    else if (step === 'check') {
      setResult(null);
      setStep('match');
    }
    else if (router.canGoBack()) router.back();
    else router.replace('/import');
  };

  const missing = sheet ? missingRequired(kind, mapping) : [];
  const importable = result ? result.counts.new + result.counts.update : 0;

  let footer: ReactNode = null;
  if (step === 'file') {
    footer = <Button testID="import-next-match" label={t('file.next')} iconRight={ArrowRight} onPress={() => setStep('match')} disabled={!sheet || reading} fullWidth size="lg" />;
  } else if (step === 'match') {
    footer = (
      <>
        {missing.length ? (
          <Text variant="caption" color="danger" align="center">
            {t('match.missingSummary')}
          </Text>
        ) : null}
        <Button testID="import-next-check" label={t('match.next')} iconRight={ArrowRight} onPress={() => setStep('check')} disabled={missing.length > 0} fullWidth size="lg" />
      </>
    );
  } else if (step === 'check' && result) {
    footer = (
      <>
        <Text variant="caption" color="textMuted" align="center">
          {importable === 0 ? t('check.nothingToImport') : result.counts.error ? t('check.skipNote') : t('home.safe')}
        </Text>
        <Button testID="import-commit" label={t('check.import', { count: importable })} icon={Upload} onPress={runImport} disabled={importable === 0} loading={commit.isPending} fullWidth size="lg" />
      </>
    );
  }

  return (
    <Screen
      key={step}
      title={t('flow.title', { kind: t(`kinds.${kind}.title`) })}
      back
      onBack={onBack}
      headerExtra={<StepHeader step={step} />}
      footer={footer}
      testID="import-flow"
    >
      {step === 'file' ? <ChooseFileStep picked={picked} sheet={sheet} reading={reading} error={fileError} onPick={() => void pick()} /> : null}
      {step === 'match' && sheet ? <MatchColumnsStep kind={kind} sheet={sheet} mapping={mapping} onChange={setMapping} /> : null}
      {step === 'check' ? (
        ctx.error ? (
          <ErrorState error={ctx.error} onRetry={() => void ctx.refetch()} />
        ) : !result ? (
          <SkeletonList rows={4} />
        ) : (
          <CheckStep kind={kind} result={result} onResolve={resolve} />
        )
      ) : null}
      {step === 'done' && summary ? (
        <DoneStep
          kind={kind}
          summary={summary}
          onAnother={reset}
          onGoToList={() => router.navigate(LIST_ROUTE[kind])}
          onBackToImports={() => router.replace('/import')}
        />
      ) : null}
    </Screen>
  );
}
