import { router } from 'expo-router';
import { CalendarClock, Download, FileUp, ShieldCheck, Smile, UserCog, Users, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ImportKind } from '@/domain/types';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, EmptyState, Row, Screen, Stack, Text, toast } from '@/ui';

import { canImport, canOpenImports } from './access';
import { IMPORT_COLUMNS, IMPORT_KINDS } from './columns';
import { templateFileName, TEMPLATES } from './templates';
import { UTF8_BOM } from '../reports/csv';
import { CSV_SHARE, shareTextFile } from '../reports/share';

const ICONS: Record<ImportKind, LucideIcon> = { staff: UserCog, children: Smile, parents: Users, schedule: CalendarClock };

function KindCard({ kind, order, allowed }: { kind: ImportKind; order: number; allowed: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation('import');
  const Icon = ICONS[kind];
  const download = async () => {
    try {
      await shareTextFile(templateFileName(kind), UTF8_BOM + TEMPLATES[kind], { ...CSV_SHARE, dialogTitle: tr('home.templateShareTitle') });
    } catch {
      toast.error(tr('home.templateError'));
    }
  };
  return (
    <Card testID={`import-card-${kind}`}>
      <Stack gap={3}>
        <Row gap={3} align="flex-start">
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={22} color={t.colors.primaryText} />
          </View>
          <Stack gap={1} flex={1}>
            <Text variant="overline" color="primaryText">
              {tr('home.step', { n: order })}
            </Text>
            <Text variant="heading">{tr(`kinds.${kind}.title`)}</Text>
            <Text color="textMuted">{tr(`kinds.${kind}.body`)}</Text>
          </Stack>
        </Row>
        <Text variant="caption" color="textMuted">
          {tr('home.columns', { list: IMPORT_COLUMNS[kind].map((c) => (c.required ? `${c.header}*` : c.header)).join(', ') })}
        </Text>
        <Row gap={2} wrap>
          <Button label={tr('home.downloadTemplate')} icon={Download} variant="outline" onPress={() => void download()} style={{ flexGrow: 1 }} />
          <Button
            testID={`import-start-${kind}`}
            label={tr('home.importFile')}
            icon={FileUp}
            onPress={() => router.push(`/import/${kind}`)}
            disabled={!allowed}
            style={{ flexGrow: 1 }}
          />
        </Row>
        {!allowed ? (
          <Text variant="caption" color="textMuted">
            {tr('home.adminOnly')}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

export function ImportHomeScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('import');
  const role = useActive()?.role;
  if (!canOpenImports(role)) {
    return (
      <Screen title={tr('home.title')} back>
        <EmptyState title={tr('home.noAccess')} />
      </Screen>
    );
  }
  return (
    <Screen title={tr('home.title')} subtitle={tr('home.subtitle')} back testID="import-home">
      <Text color="textMuted">{tr('home.intro')}</Text>
      <Card tone="info">
        <Row gap={2} align="flex-start">
          <ShieldCheck size={20} color={t.colors.info} />
          <Text style={{ flex: 1 }}>{tr('home.safe')}</Text>
        </Row>
      </Card>
      <Stack gap={1}>
        <Text variant="subheading">{tr('home.orderTitle')}</Text>
        <Text variant="label" color="textMuted">
          {IMPORT_KINDS.map((k, i) => `${i + 1} ${tr(`kinds.${k}.title`)}`).join('  →  ')}
        </Text>
        <Text variant="caption" color="textMuted">
          {tr('home.orderBody')}
        </Text>
      </Stack>
      {IMPORT_KINDS.map((k, i) => (
        <KindCard key={k} kind={k} order={i + 1} allowed={canImport(role, k)} />
      ))}
    </Screen>
  );
}
