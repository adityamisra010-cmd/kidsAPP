import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildDetail, useRatingDimensions, useTherapyTypes } from '@/data/hooks';
import { STAFF_ROLES, type StaffProgress, type UUID } from '@/domain/types';
import { displayName } from '@/features/children/caseload';
import { dimensionText, therapyTypeLabel } from '@/i18n/labels';
import { useRequiredActive } from '@/state/session';
import { Chip, EmptyState, QueryView, Row, Screen, SectionHeader, SegmentedControl, SkeletonList, Stack } from '@/ui';

import { computeFourSessionAverage, dimensionComparison } from '../chartData';
import { staffDimLabel } from '../labels';
import { useStaffProgress } from '../queries';
import { RANGE_PRESETS, rangeForPreset, type RangePreset } from '../ranges';
import {
  AttendanceCard,
  DimensionCompareCard,
  DimensionSparklinesCard,
  GoalAccuracyCard,
  IncidentsCard,
  ScoreTrendCard,
  SubstituteImpactCard,
  therapyColor,
} from '../sections/StaffProgressSections';

/** Staff progress charts for one child (`/progress/[childId]`). */
export function StaffProgressScreen({ childId }: { childId: UUID }) {
  const { t } = useTranslation('progress');
  const role = useRequiredActive().role;
  const detail = useChildDetail(childId);
  const typesQ = useTherapyTypes();
  const types = useMemo(() => typesQ.data ?? [], [typesQ.data]);
  const [typeId, setTypeId] = useState<UUID | null>(null);
  const [preset, setPreset] = useState<RangePreset>('3m');
  const range = useMemo(() => rangeForPreset(preset), [preset]);
  const q = useStaffProgress(childId, { therapyTypeId: typeId ?? undefined, ...range });

  const childTypes = useMemo(() => {
    const ids = [...new Set((detail.data?.therapists ?? []).map((x) => x.therapyTypeId))];
    return types.filter((x) => ids.includes(x.id));
  }, [detail.data, types]);

  const allowed = STAFF_ROLES.includes(role) && detail.data?.access !== 'brief_only' && detail.data?.access !== 'parent' && detail.data?.access !== 'none';
  const name = detail.data ? displayName(detail.data.child) : '';

  if (detail.data && !allowed) {
    return (
      <Screen back title={t('staff.title')}>
        <EmptyState title={t('staff.noAccessTitle')} body={t('staff.noAccessBody')} />
      </Screen>
    );
  }

  return (
    <Screen
      back
      title={t('staff.title')}
      subtitle={name}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
      testID="staff-progress"
    >
      <Stack gap={3}>
        <SegmentedControl options={RANGE_PRESETS.map((p) => ({ value: p, label: t(`staff.range.${p}`) }))} value={preset} onChange={setPreset} />
        {childTypes.length > 1 ? (
          <Row gap={2} wrap>
            <Chip size="sm" label={t('staff.allTherapies')} selected={!typeId} onPress={() => setTypeId(null)} />
            {childTypes.map((tt) => (
              <Chip key={tt.id} size="sm" dot={tt.color} label={therapyTypeLabel(t, tt)} selected={typeId === tt.id} onPress={() => setTypeId(typeId === tt.id ? null : tt.id)} />
            ))}
          </Row>
        ) : null}
      </Stack>
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={3} height={220} />}
        isEmpty={(d) => d.sessions.length === 0 && d.goals.length === 0}
        empty={<EmptyState title={t('staff.emptyTitle')} body={t('staff.emptyBody', { name })} />}
      >
        {(data) => <ProgressBody data={data} color={therapyColor(types, typeId)} />}
      </QueryView>
    </Screen>
  );
}

function ProgressBody({ data, color }: { data: StaffProgress; color?: string }) {
  const { t } = useTranslation('progress');
  const dimsQ = useRatingDimensions();
  const dims = useMemo(() => {
    const list = (dimsQ.data ?? []).filter((d) => d.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
    if (list.length) return list.map((d) => ({ key: d.key, label: dimensionText(t, d).label }));
    // Fallback: dimensions present in the data.
    const keys = [...new Set(data.sessions.flatMap((s) => Object.keys(s.ratings)))];
    return keys.map((k) => ({ key: k, label: staffDimLabel(t, k, k) }));
  }, [dimsQ.data, data.sessions, t]);

  const average = Object.keys(data.fourSessionAverage).length ? data.fourSessionAverage : computeFourSessionAverage(data.sessions);
  const rows = dimensionComparison(data.latest, average, dims);
  const hasComparison = !!data.latest && rows.some((r) => r.latest != null && r.average != null);

  return (
    <Stack gap={4}>
      <ScoreTrendCard sessions={data.sessions} color={color} />
      {hasComparison ? <DimensionCompareCard rows={rows} /> : null}
      <DimensionSparklinesCard sessions={data.sessions} dims={dims} color={color} />
      <SubstituteImpactCard impact={data.substituteImpact} />
      {data.goals.length ? <SectionHeader title={t('staff.goalsTitle')} subtitle={t('staff.goalsSubtitle')} /> : null}
      {data.goals.map((g, i) => (
        <GoalAccuracyCard key={g.id} goal={g} points={g.points} color={color} index={i} />
      ))}
      <AttendanceCard attendance={data.attendance} />
      <IncidentsCard byWeek={data.incidentsByWeek} />
    </Stack>
  );
}
