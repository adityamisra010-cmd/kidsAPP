/** Candidates for covering a session: free now? knows the child? qualified. One tap to assign. */
import { Award, CalendarCheck, CalendarX, Heart } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRepo } from '@/data';
import type { AppointmentView } from '@/domain/types';
import { formatDay, formatTimeRange } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Button, Card, EmptyState, errorMessageKey, ErrorState, Row, Sheet, SkeletonList, Stack, Text, toast } from '@/ui';

import { useScheduleMutation, useSubstituteCandidates } from '../queries';

export function SubstituteSheet({
  appointment: a,
  visible,
  onClose,
}: {
  appointment: AppointmentView | null;
  visible: boolean;
  onClose: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const repo = useRepo();
  const candidates = useSubstituteCandidates(visible && a ? a.id : null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const assign = useScheduleMutation((v: { appointmentId: string; therapistId: string }) => repo.appointments.assignSubstitute(v.appointmentId, v.therapistId));

  if (!a) return null;
  const onAssign = async (therapistId: string, name: string) => {
    setAssigning(therapistId);
    try {
      await assign.mutateAsync({ appointmentId: a.id, therapistId });
      toast.success(tr('substitute.assigned', { name }));
      onClose();
    } catch (e) {
      toast.error(tr(errorMessageKey(e)));
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('substitute.title')}
      subtitle={tr('substitute.subtitle', { therapy: a.therapyTypeName, child: a.childName, time: `${formatDay(a.startsAt)}, ${formatTimeRange(a.startsAt, a.endsAt)}` })}
      testID="substitute-sheet"
    >
      {candidates.isPending ? (
        <SkeletonList rows={3} height={92} />
      ) : candidates.error ? (
        <ErrorState compact error={candidates.error} onRetry={() => void candidates.refetch()} />
      ) : !candidates.data?.length ? (
        <EmptyState compact title={tr('substitute.emptyTitle')} body={tr('substitute.emptyBody')} />
      ) : (
        candidates.data.map((m) => (
          <Card key={m.profile.id} padding={3} elevated={false} testID={`candidate-${m.profile.id}`}>
            <Row gap={3} align="flex-start">
              <Avatar name={m.profile.fullName} uri={m.profile.avatarUrl} size={44} />
              <Stack gap={2} flex={1}>
                <Stack gap={0}>
                  <Text variant="subheading" numberOfLines={1}>
                    {m.profile.fullName}
                  </Text>
                  {m.profile.title ? (
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {m.profile.title}
                    </Text>
                  ) : null}
                </Stack>
                <Row gap={2} wrap>
                  {m.freeAtTime ? (
                    <Badge label={tr('substitute.free')} tone="success" icon={CalendarCheck} />
                  ) : (
                    <Badge label={tr('substitute.busy')} tone="warning" icon={CalendarX} />
                  )}
                  {m.knowsChild ? <Badge label={tr('substitute.knowsChild')} tone="info" icon={Heart} /> : null}
                  <Badge label={tr('substitute.qualified', { therapy: a.therapyTypeName })} tone="neutral" icon={Award} />
                </Row>
              </Stack>
            </Row>
            <Button
              label={tr('substitute.assign')}
              accessibilityHint={tr('substitute.assignA11y', { name: m.profile.fullName })}
              variant={m.freeAtTime ? 'primary' : 'outline'}
              size="sm"
              loading={assigning === m.profile.id}
              disabled={!!assigning && assigning !== m.profile.id}
              onPress={() => void onAssign(m.profile.id, m.profile.fullName)}
              style={{ marginTop: t.space[3], alignSelf: 'flex-end', minWidth: 120 }}
              testID={`assign-${m.profile.id}`}
            />
          </Card>
        ))
      )}
    </Sheet>
  );
}
