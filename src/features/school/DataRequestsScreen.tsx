import { Download, ShieldAlert, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { DataRequest } from '@/domain/types';
import { formatDate } from '@/lib/dates';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, confirm, EmptyState, QueryView, Screen, SegmentedControl, SkeletonList, Stack, Text, toast, type Tone } from '@/ui';

import { useDataRequests, useSetDataRequestStatus } from './queries';
import { canEditSchool, canViewSchool } from './settingsDraft';

const STATUSES: DataRequest['status'][] = ['open', 'in_progress', 'done'];
const STATUS_TONE: Record<DataRequest['status'], Tone> = { open: 'warning', in_progress: 'info', done: 'success' };

/** Open first, then in progress, then done; newest first within each. */
export function sortRequests(list: DataRequest[]): DataRequest[] {
  return [...list].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt));
}

export function DataRequestsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const role = useActive()?.role;
  const canEdit = canEditSchool(role);
  const query = useDataRequests();
  const setStatus = useSetDataRequestStatus();

  if (!canViewSchool(role)) {
    return (
      <Screen title={tr('dataRequests.title')} back>
        <EmptyState title={tr('settings.noAccess')} />
      </Screen>
    );
  }

  const change = async (r: DataRequest, status: DataRequest['status']) => {
    if (status === r.status) return;
    if (r.kind === 'deletion' && status === 'done') {
      const ok = await confirm({
        title: tr('dataRequests.confirmDeletionTitle'),
        body: tr('dataRequests.confirmDeletionBody', { child: r.childName }),
        confirmLabel: tr('dataRequests.confirmDeletion'),
        destructive: true,
      });
      if (!ok) return;
    }
    setStatus.mutate({ id: r.id, status }, { onSuccess: () => toast.success(tr('dataRequests.updated')), onError: () => toast.error(tr('dataRequests.updateError')) });
  };

  return (
    <Screen title={tr('dataRequests.title')} back testID="data-requests-screen">
      <Text color="textMuted">{tr('dataRequests.intro')}</Text>
      <Card tone="warning">
        <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'flex-start' }}>
          <ShieldAlert size={20} color={t.colors.warning} />
          <Text variant="label" style={{ flex: 1 }}>
            {tr('dataRequests.deletionNote')}
          </Text>
        </View>
      </Card>
      {!canEdit ? (
        <Text variant="caption" color="textMuted">
          {tr('dataRequests.readOnly')}
        </Text>
      ) : null}
      <QueryView
        query={query}
        skeleton={<SkeletonList rows={3} height={140} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={tr('dataRequests.empty')} body={tr('dataRequests.emptyBody')} />}
      >
        {(list) => (
          <Stack gap={3}>
            {sortRequests(list).map((r) => (
              <Card key={r.id} testID={`data-request-${r.id}`} accent={r.kind === 'deletion' ? t.colors.danger : undefined}>
                <Stack gap={3}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.space[2], flexWrap: 'wrap' }}>
                    <Badge
                      label={r.kind === 'deletion' ? tr('dataRequests.deletion') : tr('dataRequests.export')}
                      tone={r.kind === 'deletion' ? 'danger' : 'info'}
                      icon={r.kind === 'deletion' ? Trash2 : Download}
                    />
                    <Badge label={tr(`dataRequests.status.${r.status}`)} tone={STATUS_TONE[r.status]} />
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text variant="subheading">{r.childName}</Text>
                    <Text variant="caption" color="textMuted">
                      {`${tr('dataRequests.requestedBy', { name: r.userName })} ${tr('dataRequests.requestedOn', { date: formatDate(r.createdAt) })}`}
                    </Text>
                  </View>
                  {canEdit ? (
                    <Stack gap={1}>
                      <Text variant="label" color="textMuted">
                        {tr('dataRequests.statusLabel')}
                      </Text>
                      <SegmentedControl<DataRequest['status']>
                        testID={`data-request-${r.id}-status`}
                        options={STATUSES.map((s) => ({ value: s, label: tr(`dataRequests.status.${s}`) }))}
                        value={r.status}
                        onChange={(s) => void change(r, s)}
                      />
                    </Stack>
                  ) : null}
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </QueryView>
    </Screen>
  );
}
