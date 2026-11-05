import { CircleAlert, CircleCheck, Copy, Info, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ImportKind } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Stack, Text, type Tone } from '@/ui';

import { issueText, rowSubtitle, rowTitle } from '../display';
import type { RowStatus, ValidatedRow } from '../validate';

export const STATUS_UI: Record<RowStatus, { icon: LucideIcon; tone: Tone }> = {
  new: { icon: CircleCheck, tone: 'success' },
  update: { icon: RefreshCw, tone: 'info' },
  duplicate: { icon: Copy, tone: 'neutral' },
  error: { icon: TriangleAlert, tone: 'danger' },
};

function IssueLine({ text, kind }: { text: string; kind: 'error' | 'warning' | 'info' }) {
  const t = useTheme();
  const Icon = kind === 'error' ? CircleAlert : Info;
  const color = kind === 'error' ? t.colors.danger : kind === 'warning' ? t.colors.warning : t.colors.textMuted;
  return (
    <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'flex-start' }}>
      <View style={{ paddingTop: 2 }}>
        <Icon size={16} color={color} />
      </View>
      <Text variant="label" tint={kind === 'error' ? t.colors.danger : t.colors.text} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

export const RowCard = memo(function RowCard({ kind, row }: { kind: ImportKind; row: ValidatedRow }) {
  const t = useTheme();
  const { t: tr } = useTranslation('import');
  const ui = STATUS_UI[row.status];
  const accent = row.status === 'error' ? t.colors.danger : row.warnings.length ? t.colors.warning : undefined;
  const subtitle = rowSubtitle(tr, kind, row);
  return (
    <Card accent={accent} padding={3} elevated={false} testID={`import-row-${row.rowNumber}`}>
      <Stack gap={2}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[2] }}>
          <Text variant="overline" color="textMuted">
            {tr('check.row', { n: row.rowNumber })}
          </Text>
          <Badge label={tr(`check.status.${row.status}`)} tone={ui.tone} icon={ui.icon} />
        </View>
        <View style={{ gap: 2 }}>
          <Text variant="subheading" numberOfLines={2}>
            {rowTitle(kind, row)}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {row.errors.length || row.warnings.length || row.duplicateOf != null ? (
          <Stack gap={1}>
            {row.errors.map((e, i) => (
              <IssueLine key={`e${i}`} kind="error" text={issueText(tr, kind, e)} />
            ))}
            {row.duplicateOf != null && !row.errors.length ? <IssueLine kind="info" text={tr('check.duplicateOf', { row: row.duplicateOf })} /> : null}
            {row.warnings.map((w, i) => (
              <IssueLine key={`w${i}`} kind="warning" text={issueText(tr, kind, w)} />
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
});
