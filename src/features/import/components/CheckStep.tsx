import { CircleCheck, Copy, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ImportKind } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Stack, SwitchRow, Text } from '@/ui';

import type { RefKind, ValidationResult } from '../validate';
import { RowCard } from './RowCard';
import { StatTile } from './StatTile';
import { UnresolvedCard } from './UnresolvedCard';

const PAGE = 60;

export function CheckStep({
  kind,
  result,
  onResolve,
}: {
  kind: ImportKind;
  result: ValidationResult;
  onResolve: (kind: RefKind, normalized: string, id: string) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('import');
  const c = result.counts;
  const [onlyProblems, setOnlyProblems] = useState(c.error > 0);
  const [limit, setLimit] = useState(PAGE);

  const visible = useMemo(
    () => (onlyProblems ? result.rows.filter((r) => r.status === 'error' || r.warnings.length > 0) : result.rows),
    [onlyProblems, result.rows],
  );

  return (
    <Stack gap={4}>
      <Text variant="heading">{tr('check.title')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
        <StatTile testID="count-new" icon={CircleCheck} value={c.new} label={tr('check.new')} tone="success" />
        <StatTile testID="count-update" icon={RefreshCw} value={c.update} label={tr('check.update')} tone="info" />
        <StatTile testID="count-duplicate" icon={Copy} value={c.duplicate} label={tr('check.duplicate')} tone="neutral" />
        <StatTile testID="count-error" icon={TriangleAlert} value={c.error} label={tr('check.error')} tone={c.error ? 'danger' : 'neutral'} />
      </View>
      {c.update > 0 ? (
        <Text variant="label" color="textMuted">
          {tr('check.updateHint')}
        </Text>
      ) : null}

      <UnresolvedCard items={result.unresolved} onResolve={onResolve} />

      <Card padding={3}>
        <SwitchRow testID="import-only-problems" label={tr('check.showProblems')} description={tr('check.showProblemsHint')} value={onlyProblems} onChange={setOnlyProblems} />
      </Card>

      {visible.length === 0 ? (
        <Card tone="success">
          <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'center' }}>
            <CircleCheck size={20} color={t.colors.success} />
            <Text style={{ flex: 1 }}>{tr('check.noProblems')}</Text>
          </View>
        </Card>
      ) : (
        <Stack gap={2}>
          {visible.slice(0, limit).map((row) => (
            <RowCard key={row.rowNumber} kind={kind} row={row} />
          ))}
          {visible.length > limit ? (
            <Stack gap={1} align="center">
              <Text variant="caption" color="textMuted">
                {tr('check.showing', { shown: limit, total: visible.length })}
              </Text>
              <Button variant="outline" label={tr('check.showMore')} onPress={() => setLimit((l) => l + PAGE)} />
            </Stack>
          ) : null}
        </Stack>
      )}

      {c.emptyIgnored ? (
        <Text variant="caption" color="textMuted">
          {tr('check.emptyIgnored', { count: c.emptyIgnored })}
        </Text>
      ) : null}
    </Stack>
  );
}
