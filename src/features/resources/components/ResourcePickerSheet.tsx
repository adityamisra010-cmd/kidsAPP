/**
 * "Start from library" picker used when assigning a home task. Parent-suitable resources first.
 */
import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { Resource } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Sheet, SkeletonList, Text, TextField } from '@/ui';

import { toRepoFilter } from '../logic';
import { useResources } from '../queries';
import { useDebounced } from '../useDebounced';
import { KindTile } from './ResourceRow';

export function ResourcePickerSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (r: Resource) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('resources');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const q = useResources(toRepoFilter({ search: debounced }), visible);
  // Families can't open staff-only material, so those go last.
  const items = useMemo(() => [...(q.data ?? [])].sort((a, b) => Number(a.audience === 'staff') - Number(b.audience === 'staff')), [q.data]);

  return (
    <Sheet visible={visible} onClose={onClose} title={tr('picker.title')} subtitle={tr('picker.subtitle')}>
      <TextField icon={Search} value={search} onChangeText={setSearch} placeholder={tr('search')} accessibilityLabel={tr('search')} />
      {q.isPending ? <SkeletonList rows={3} height={64} /> : null}
      {!q.isPending && !items.length ? <Text color="textMuted">{tr('emptyBody')}</Text> : null}
      {items.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => {
            onSelect(r);
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${r.title}, ${tr(`kind.${r.kind}`)}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 64, paddingVertical: t.space[2], opacity: pressed ? 0.8 : 1 })}
        >
          <KindTile kind={r.kind} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {r.title}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {r.audience === 'staff' ? `${tr(`kind.${r.kind}`)} · ${tr('audienceOpt.staff')}` : tr(`kind.${r.kind}`)}
            </Text>
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}
