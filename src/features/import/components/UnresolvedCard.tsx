import { SearchX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Divider, Stack, Text } from '@/ui';

import type { RefKind, UnresolvedRef } from '../validate';

/** "Names we couldn't find" with one-tap "Use Priya Nair" fixes that apply to every matching row. */
export function UnresolvedCard({ items, onResolve }: { items: UnresolvedRef[]; onResolve: (kind: RefKind, normalized: string, id: string) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('import');
  if (!items.length) return null;
  return (
    <Card tone="warning" testID="import-unresolved">
      <Stack gap={3}>
        <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'center' }}>
          <SearchX size={20} color={t.colors.warning} />
          <Text variant="subheading" style={{ flex: 1 }}>
            {tr('check.unresolvedTitle')}
          </Text>
        </View>
        <Text variant="label" color="textMuted">
          {tr('check.unresolvedBody')}
        </Text>
        {items.map((u, i) => (
          <View key={`${u.refKind}|${u.column}|${u.normalized}`} style={{ gap: t.space[2] }}>
            {i > 0 ? <Divider /> : null}
            <View style={{ gap: 2 }}>
              <Text variant="overline" color="textMuted">
                {tr(`check.refKind.${u.refKind}`)}
              </Text>
              <Text variant="bodyStrong">“{u.raw}”</Text>
              <Text variant="caption" color="textMuted">
                {`${tr('check.rowsAffected', { count: u.rowNumbers.length })} · ${u.rowNumbers
                  .slice(0, 6)
                  .map((n) => tr('check.row', { n }))
                  .join(', ')}${u.rowNumbers.length > 6 ? '…' : ''}`}
              </Text>
            </View>
            {u.suggestions.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                {u.suggestions.map((s) => (
                  <Button key={s.id} size="sm" variant="secondary" label={tr('check.useMatch', { name: s.label })} onPress={() => onResolve(u.refKind, u.normalized, s.id)} />
                ))}
              </View>
            ) : (
              <Text variant="caption">{tr('check.noSuggestion')}</Text>
            )}
          </View>
        ))}
      </Stack>
    </Card>
  );
}
