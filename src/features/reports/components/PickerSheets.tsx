import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildren, useMembers } from '@/data/hooks';
import type { UUID } from '@/domain/types';
import { ageLabel } from '@/lib/dates';
import { Avatar, Divider, ListItem, QueryView, Sheet, SkeletonList, Stack, Text, TextField } from '@/ui';

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const MAX = 80;

/** Searchable list of the school's children. */
export function ChildPickerSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (c: { id: UUID; name: string }) => void }) {
  const { t } = useTranslation('reports');
  const [query, setQuery] = useState('');
  const children = useChildren();
  const filtered = useMemo(() => {
    const q = fold(query);
    const list = (children.data ?? []).filter((c) => !q || fold(`${c.child.fullName} ${c.child.preferredName ?? ''}`).includes(q));
    return list.sort((a, b) => a.child.fullName.localeCompare(b.child.fullName));
  }, [children.data, query]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('picker.title')} testID="child-picker">
      <TextField icon={Search} placeholder={t('picker.search')} accessibilityLabel={t('picker.search')} value={query} onChangeText={setQuery} autoCorrect={false} />
      <QueryView query={children} skeleton={<SkeletonList rows={4} height={56} />}>
        {() =>
          filtered.length ? (
            <Stack>
              {filtered.slice(0, MAX).map((c, i) => (
                <Stack key={c.child.id}>
                  {i > 0 ? <Divider inset={10} /> : null}
                  <ListItem
                    title={c.child.fullName}
                    subtitle={[ageLabel(c.child.dob), c.child.classGroup].filter(Boolean).join(' · ')}
                    left={<Avatar name={c.child.fullName} uri={c.child.photoUrl} size={40} />}
                    chevron={false}
                    onPress={() => {
                      onPick({ id: c.child.id, name: c.child.fullName });
                      setQuery('');
                      onClose();
                    }}
                  />
                </Stack>
              ))}
            </Stack>
          ) : (
            <Text color="textMuted">{query ? t('picker.noMatch', { query }) : t('picker.noChildren')}</Text>
          )
        }
      </QueryView>
    </Sheet>
  );
}

/** List of therapists in the school. */
export function TherapistPickerSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (m: { id: UUID; name: string }) => void }) {
  const { t } = useTranslation('reports');
  const members = useMembers(['therapist']);
  return (
    <Sheet visible={visible} onClose={onClose} title={t('export.therapistPickerTitle')}>
      <QueryView query={members} skeleton={<SkeletonList rows={4} height={56} />}>
        {(list) => (
          <Stack>
            {[...list]
              .sort((a, b) => a.profile.fullName.localeCompare(b.profile.fullName))
              .map((m, i) => (
                <Stack key={m.profile.id}>
                  {i > 0 ? <Divider inset={10} /> : null}
                  <ListItem
                    title={m.profile.fullName}
                    subtitle={m.profile.title}
                    left={<Avatar name={m.profile.fullName} uri={m.profile.avatarUrl} size={40} />}
                    chevron={false}
                    onPress={() => {
                      onPick({ id: m.profile.id, name: m.profile.fullName });
                      onClose();
                    }}
                  />
                </Stack>
              ))}
          </Stack>
        )}
      </QueryView>
    </Sheet>
  );
}
