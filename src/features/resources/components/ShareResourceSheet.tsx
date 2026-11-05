/**
 * "Share with a family": pick a child (their parents get it in Resources) and add a short note.
 */
import { Share2, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildren } from '@/data/hooks';
import type { Resource } from '@/domain/types';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Row, Sheet, SkeletonList, Text, TextField, toast } from '@/ui';

import { ChildRadioList } from '../../practice/components/RadioList';
import { useShareResource } from '../queries';

export function ShareResourceSheet({ visible, onClose, resource }: { visible: boolean; onClose: () => void; resource: Resource }) {
  const t = useTheme();
  const { t: tr } = useTranslation('resources');
  const active = useActive();
  const children = useChildren(active?.role === 'therapist' ? { therapistId: active.user.profile.id, status: 'active' } : { status: 'active' });
  const share = useShareResource();
  const [childId, setChildId] = useState<string | undefined>();
  const [note, setNote] = useState('');

  const close = () => {
    setChildId(undefined);
    setNote('');
    onClose();
  };

  const send = () => {
    if (!childId) return;
    const name = children.data?.find((c) => c.child.id === childId)?.child;
    share.mutate(
      { resourceId: resource.id, childId, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(tr('share.sent', { name: name?.preferredName ?? name?.fullName.split(' ')[0] ?? '' }));
          close();
        },
        onError: () => toast.error(tr('errors:unknown')),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={tr('share.title')}
      subtitle={resource.title}
      testID="share-sheet"
      footer={<Button label={tr('share.send')} icon={Share2} size="lg" fullWidth disabled={!childId} loading={share.isPending} onPress={send} testID="share-send" />}
    >
      {resource.audience === 'staff' ? (
        <Row gap={2} align="flex-start">
          <TriangleAlert size={16} color={t.colors.warning} style={{ marginTop: 2 }} />
          <Text variant="caption" color="warning" style={{ flex: 1 }}>
            {tr('share.staffOnly')}
          </Text>
        </Row>
      ) : null}
      <Text variant="label">{tr('share.child')}</Text>
      {children.isPending ? <SkeletonList rows={3} height={56} /> : <ChildRadioList items={children.data ?? []} value={childId} onChange={setChildId} />}
      <TextField label={tr('share.note')} placeholder={tr('share.notePlaceholder')} multiline minLines={2} maxLength={300} value={note} onChangeText={setNote} />
    </Sheet>
  );
}
