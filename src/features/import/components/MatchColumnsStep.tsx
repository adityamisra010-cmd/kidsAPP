import { Check, ChevronDown, CircleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { ImportKind } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Divider, Sheet, Stack, Text } from '@/ui';

import { IMPORT_COLUMNS, type ImportColumn } from '../columns';
import { columnLabel } from '../display';
import { setMapping, unusedHeaders, type ColumnMapping } from '../mapping';
import { sampleValue, type ParsedSheet } from '../parse';

function Option({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[3],
        paddingVertical: t.space[2],
        paddingHorizontal: t.space[3],
        borderRadius: t.radius.md,
        backgroundColor: selected ? t.colors.primarySoft : pressed ? t.colors.surfaceAlt : 'transparent',
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" tint={selected ? t.colors.primaryText : undefined}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={20} color={t.colors.primaryText} strokeWidth={2.6} /> : null}
    </Pressable>
  );
}

export function MatchColumnsStep({ kind, sheet, mapping, onChange }: { kind: ImportKind; sheet: ParsedSheet; mapping: ColumnMapping; onChange: (m: ColumnMapping) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('import');
  const [editing, setEditing] = useState<ImportColumn | null>(null);
  const ignored = unusedHeaders(sheet.headers, mapping);

  return (
    <Stack gap={3}>
      <Stack gap={1}>
        <Text variant="heading">{tr('match.title')}</Text>
        <Text color="textMuted">{tr('match.body')}</Text>
      </Stack>
      <Card padding={0}>
        {IMPORT_COLUMNS[kind].map((col, i) => {
          const idx = mapping[col.key];
          const label = columnLabel(tr, kind, col.key);
          const missing = col.required && idx == null;
          const sample = idx != null ? sampleValue(sheet, idx) : undefined;
          return (
            <View key={col.key}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                testID={`map-${col.key}`}
                onPress={() => setEditing(col)}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${idx != null ? sheet.headers[idx] : tr('match.notInFile')}`}
                accessibilityHint={tr('match.pickTitle', { name: label })}
                style={({ pressed }) => ({ padding: t.space[4], gap: 6, backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent' })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], flexWrap: 'wrap' }}>
                  <Text variant="subheading">{label}</Text>
                  {col.required ? <Badge label={tr('match.required')} tone={missing ? 'danger' : 'neutral'} /> : null}
                </View>
                <Text variant="caption" color="textMuted">
                  {tr(`columns.${kind}.${col.key}.help`)}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.space[2],
                    minHeight: 48,
                    paddingHorizontal: t.space[3],
                    borderRadius: t.radius.md,
                    borderWidth: 1.5,
                    borderColor: missing ? t.colors.danger : t.colors.border,
                    backgroundColor: t.colors.surface,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" color={idx != null ? 'text' : 'textSubtle'} numberOfLines={1}>
                      {idx != null ? sheet.headers[idx] : tr('match.notInFile')}
                    </Text>
                    {sample ? (
                      <Text variant="caption" color="textMuted" numberOfLines={1}>
                        {tr('match.example', { value: sample })}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronDown size={20} color={t.colors.textMuted} />
                </View>
                {missing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CircleAlert size={16} color={t.colors.danger} />
                    <Text variant="caption" color="danger">
                      {tr('match.missingRequired', { name: label.toLowerCase() })}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </Card>
      {ignored.length ? (
        <Text variant="caption" color="textMuted">
          {tr('match.ignored', { list: ignored.join(', ') })}
        </Text>
      ) : null}

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? tr('match.pickTitle', { name: columnLabel(tr, kind, editing.key) }) : ''}
        subtitle={editing ? tr(`columns.${kind}.${editing.key}.help`) : undefined}
      >
        {editing ? (
          <Stack gap={1}>
            {sheet.headers.map((h, idx) => (
              <Option
                key={`${h}-${idx}`}
                label={h}
                hint={sampleValue(sheet, idx) ? tr('match.example', { value: sampleValue(sheet, idx) }) : undefined}
                selected={mapping[editing.key] === idx}
                onPress={() => {
                  onChange(setMapping(mapping, editing.key, idx));
                  setEditing(null);
                }}
              />
            ))}
            <Divider />
            <Option
              label={tr('match.notInFile')}
              selected={mapping[editing.key] == null}
              onPress={() => {
                onChange(setMapping(mapping, editing.key, null));
                setEditing(null);
              }}
            />
          </Stack>
        ) : null}
      </Sheet>
    </Stack>
  );
}
