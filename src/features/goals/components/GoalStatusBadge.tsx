import { useTranslation } from 'react-i18next';

import type { GoalStatus } from '@/domain/types';
import { Badge } from '@/ui';

import { parentStatusView, staffStatusView } from '../goalStatus';

/** Staff status: icon + word (Not started / Emerging / Progressing / Mastered / Maintenance / Paused). */
export function GoalStatusBadge({ status }: { status: GoalStatus }) {
  const { t } = useTranslation();
  const v = staffStatusView(status);
  return <Badge label={t(v.labelKey)} tone={v.tone} icon={v.icon} />;
}

/** Parent status: icon + plain word (Working on it / Getting there / Achieved / Paused). */
export function ParentGoalStatusBadge({ status }: { status: GoalStatus }) {
  const { t } = useTranslation();
  const v = parentStatusView(status);
  return <Badge label={t(v.labelKey)} tone={v.tone} icon={v.icon} testID={`parent-status-${v.status}`} />;
}
