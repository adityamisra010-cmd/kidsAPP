import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { GoalWithStats, UUID } from '@/domain/types';
import { confirm, errorMessageKey, toast } from '@/ui';

import { useSetGoalStatus } from './queries';

/**
 * Therapist confirms an auto-suggested mastery. On success the caller shows the single
 * "Goal mastered" moment (`celebrating` holds the goal until the moment finishes).
 */
export function useConfirmMastery() {
  const { t } = useTranslation('goals');
  const setStatus = useSetGoalStatus();
  const [celebrating, setCelebrating] = useState<{ goalId: UUID; text: string } | null>(null);

  const confirmMastery = async (goal: Pick<GoalWithStats, 'id' | 'staffText' | 'masteryRule'>) => {
    const ok = await confirm({
      title: t('mastery.confirmTitle'),
      body: t('mastery.confirmBody', { accuracy: goal.masteryRule.accuracy, count: goal.masteryRule.consecutiveSessions }),
      confirmLabel: t('mastery.confirm'),
    });
    if (!ok) return;
    try {
      await setStatus.mutateAsync({ goalId: goal.id, status: 'mastered' });
      setCelebrating({ goalId: goal.id, text: goal.staffText });
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  return {
    confirmMastery,
    pendingGoalId: setStatus.isPending ? setStatus.variables?.goalId : undefined,
    celebrating,
    endCelebration: () => setCelebrating(null),
    celebrate: (goalId: UUID, text: string) => setCelebrating({ goalId, text }),
  };
}
