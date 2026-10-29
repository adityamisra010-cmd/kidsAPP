import { FileSpreadsheet, FileUp, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Row, Stack, Text } from '@/ui';

import type { PickedFile } from '../file';
import type { ImportFileErrorCode, ParsedSheet } from '../parse';

export function ChooseFileStep({
  picked,
  sheet,
  reading,
  error,
  onPick,
}: {
  picked: PickedFile | null;
  sheet: ParsedSheet | null;
  reading: boolean;
  error: ImportFileErrorCode | null;
  onPick: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('import');
  return (
    <Stack gap={4}>
      <Card>
        <Stack gap={3} align="center" py={3}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <FileSpreadsheet size={30} color={t.colors.primaryText} />
          </View>
          <Text variant="heading" align="center">
            {tr('file.title')}
          </Text>
          <Text color="textMuted" align="center">
            {tr('file.body')}
          </Text>
          <Button
            testID="import-choose-file"
            label={sheet || error ? tr('file.chooseAnother') : tr('file.choose')}
            icon={FileUp}
            variant={sheet ? 'outline' : 'primary'}
            size="lg"
            onPress={onPick}
            disabled={reading}
            fullWidth
          />
          <Text variant="caption" color="textMuted" align="center">
            {tr('file.tip')}
          </Text>
        </Stack>
      </Card>

      {reading ? (
        <Card tone="sunken">
          <Row gap={3}>
            <ActivityIndicator color={t.colors.primary} />
            <Text>{tr('file.reading')}</Text>
          </Row>
        </Card>
      ) : null}

      {error && !reading ? (
        <Card tone="warning" testID="import-file-error">
          <Stack gap={2}>
            <Row gap={2}>
              <TriangleAlert size={20} color={t.colors.warning} />
              <Text variant="subheading" style={{ flex: 1 }}>
                {tr('file.errorTitle')}
              </Text>
            </Row>
            {picked ? (
              <Text variant="caption" color="textMuted">
                {picked.name}
              </Text>
            ) : null}
            <Text>{tr(`file.errors.${error}`)}</Text>
          </Stack>
        </Card>
      ) : null}

      {sheet && picked && !reading && !error ? (
        <Card tone="success" testID="import-file-summary">
          <Stack gap={1}>
            <Row gap={2}>
              <FileSpreadsheet size={20} color={t.colors.success} />
              <Text variant="subheading" style={{ flex: 1 }} numberOfLines={2}>
                {picked.name}
              </Text>
            </Row>
            <Text weight="semibold">{tr('file.rows', { count: sheet.rows.length })}</Text>
            <Text variant="caption" color="textMuted">
              {[sheet.sheetCount > 1 ? tr('file.sheet', { name: sheet.sheetName }) : null, tr('file.headerRow', { row: sheet.headerRowNumber })].filter(Boolean).join(' · ')}
            </Text>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
