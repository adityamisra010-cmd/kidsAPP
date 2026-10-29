import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SessionSnapshotCard } from '@/components/cards/SessionSnapshotCard';
import type { UUID } from '@/domain/types';
import { Button, EmptyState, QueryView, SkeletonList, Stack } from '@/ui';

import { useParentSnapshots } from '../queries';

const PAGE = 10;

/** Parent session history: plain-language snapshot cards, newest first. */
export function ParentSessions({ childId, name }: { childId: UUID; name: string }) {
  const { t } = useTranslation('child');
  const [limit, setLimit] = useState(PAGE);
  const q = useParentSnapshots(childId, limit);
  return (
    <QueryView
      query={q}
      skeleton={<SkeletonList rows={3} height={160} />}
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState title={t('parent.sessionsEmptyTitle')} body={t('parent.sessionsEmptyBody', { name })} />}
    >
      {(snapshots) => (
        <Stack gap={3} testID="parent-sessions">
          {[...snapshots]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((s) => (
              <SessionSnapshotCard key={s.sessionId} snapshot={s} />
            ))}
          {snapshots.length >= limit ? (
            <Button label={t('parent.showMore')} icon={ChevronDown} variant="ghost" onPress={() => setLimit((l) => l + PAGE)} />
          ) : null}
        </Stack>
      )}
    </QueryView>
  );
}
