// B. Session snapshot: the anchored dimensions (enabled, in school order).
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import type { RatingDimension, RatingValue, RegulationState } from '@/domain/types';
import { Card, Divider, SectionHeader, Stack } from '@/ui';

import { REGULATION_KEY } from '../../logic/draft';
import { RatingRow } from './RatingRow';
import { RegulationStateSelector } from './RegulationStateSelector';

export function SnapshotSection({
  dimensions,
  ratings,
  regulationState,
  showIssues,
  onRate,
  onRegulationState,
}: {
  /** Enabled dimensions, sorted. */
  dimensions: RatingDimension[];
  ratings: Partial<Record<string, RatingValue>>;
  regulationState?: RegulationState;
  showIssues: boolean;
  onRate: (key: string, value: RatingValue) => void;
  onRegulationState: (s: RegulationState) => void;
}) {
  const { t } = useTranslation('session');
  const hasRegulation = dimensions.some((d) => d.key === REGULATION_KEY);
  const stateSelector = <RegulationStateSelector value={regulationState} onChange={onRegulationState} invalid={showIssues} />;
  return (
    <Stack gap={2}>
      <SectionHeader title={t('logger.sections.snapshot')} subtitle={t('logger.sections.snapshotHint')} />
      <Card padding={4}>
        {hasRegulation ? null : stateSelector}
        {dimensions.map((d, i) => (
          <Fragment key={d.id}>
            {i > 0 || !hasRegulation ? <Divider /> : null}
            <RatingRow dimension={d} value={ratings[d.key]} invalid={showIssues && ratings[d.key] == null} onRate={onRate}>
              {d.key === REGULATION_KEY ? stateSelector : undefined}
            </RatingRow>
          </Fragment>
        ))}
      </Card>
    </Stack>
  );
}
