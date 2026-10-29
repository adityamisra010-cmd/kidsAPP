/**
 * Vertical single-choice lists with big rows: children (avatar + class) and goals (long text).
 * Used inline in sheets and forms where chips would truncate.
 */
import { Circle, CircleCheck, Search } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { ChildSummary, UUID } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Text, TextField } from '@/ui';

export function RadioRow({ selected, onPress, title, subtitle, left, testID }: { selected: boolean; onPress: () => void; title: string; subtitle?: string; left?: ReactNode; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[3],
        minHeight: 56,
        paddingVertical: t.space[2],
        paddingHorizontal: t.space[3],
        borderRadius: t.radius.md,
        borderWidth: 1.5,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" tint={selected ? t.colors.primaryText : undefined}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? <CircleCheck size={22} color={t.colors.primary} /> : <Circle size={22} color={t.colors.borderStrong} />}
    </Pressable>
  );
}

const SEARCH_FROM = 8;

export function ChildRadioList({ items, value, onChange }: { items: ChildSummary[]; value?: UUID; onChange: (id: UUID) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => a.child.fullName.localeCompare(b.child.fullName));
    return s ? sorted.filter((c) => `${c.child.fullName} ${c.child.preferredName ?? ''}`.toLowerCase().includes(s)) : sorted;
  }, [items, search]);
  return (
    <View style={{ gap: t.space[2] }}>
      {items.length > SEARCH_FROM ? <TextField icon={Search} value={search} onChangeText={setSearch} placeholder={tr('assign.searchChild')} accessibilityLabel={tr('assign.searchChild')} /> : null}
      {visible.map((c) => (
        <RadioRow
          key={c.child.id}
          testID={`child-${c.child.id}`}
          selected={c.child.id === value}
          onPress={() => onChange(c.child.id)}
          title={c.child.fullName}
          subtitle={c.child.classGroup}
          left={<Avatar name={c.child.fullName} uri={c.child.photoUrl} size={40} />}
        />
      ))}
      {!visible.length ? <Text color="textMuted">{tr('assign.noChildren')}</Text> : null}
    </View>
  );
}
