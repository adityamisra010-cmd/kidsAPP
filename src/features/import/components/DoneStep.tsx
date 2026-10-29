import { CircleCheck, CircleX, FileUp, Plus, RefreshCw, ShieldCheck, SkipForward } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ImportKind, ImportSummary } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Stack, Text } from '@/ui';

import { StatTile } from './StatTile';

export function DoneStep({
  kind,
  summary,
  onAnother,
  onGoToList,
  onBackToImports,
}: {
  kind: ImportKind;
  summary: ImportSummary;
  onAnother: () => void;
  onGoToList: () => void;
  onBackToImports: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('import');
  return (
    <Stack gap={4} testID="import-done">
      <Stack gap={2} align="center" py={4}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
          <CircleCheck size={36} color={t.colors.success} />
        </View>
        <Text variant="title" align="center" accessibilityRole="header">
          {tr('done.title')}
        </Text>
      </Stack>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
        <StatTile icon={Plus} value={summary.created} label={tr('done.created')} tone="success" />
        <StatTile icon={RefreshCw} value={summary.updated} label={tr('done.updated')} tone="info" />
        <StatTile icon={SkipForward} value={summary.skipped} label={tr('done.skipped')} tone="neutral" />
        <StatTile icon={CircleX} value={summary.errors.length} label={tr('done.errors')} tone={summary.errors.length ? 'danger' : 'neutral'} />
      </View>
      <Card tone="info">
        <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'flex-start' }}>
          <ShieldCheck size={20} color={t.colors.info} />
          <Text style={{ flex: 1 }}>{tr('done.safeAgain')}</Text>
        </View>
      </Card>
      {summary.errors.length ? (
        <Card>
          <Stack gap={2}>
            <Text variant="subheading">{tr('done.errorsTitle')}</Text>
            {summary.errors.slice(0, 50).map((e) => (
              <Text key={`${e.rowNumber}-${e.message}`} variant="label" color="danger">
                {tr('done.rowError', { n: e.rowNumber, message: e.message })}
              </Text>
            ))}
          </Stack>
        </Card>
      ) : null}
      <Stack gap={2}>
        <Button label={tr(`done.goTo.${kind}`)} onPress={onGoToList} fullWidth size="lg" />
        <Button label={tr('done.another')} icon={FileUp} variant="secondary" onPress={onAnother} fullWidth />
        <Button label={tr('done.backToImports')} variant="ghost" onPress={onBackToImports} fullWidth />
      </Stack>
    </Stack>
  );
}
