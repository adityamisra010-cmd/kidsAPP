import { Save, Users } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { GoalWithStats } from '@/domain/types';
import { Button, errorMessageKey, Sheet, TextField, toast } from '@/ui';

import { MAX_GOAL_TEXT, validateGoalDraft } from '../goalForm';
import { useUpdateGoal } from '../queries';
import { MasteryRuleField } from './MasteryRuleField';

/** Edit wording, baseline and mastery rule of an existing goal. Mount it only while open (fresh form each time). */
export function GoalEditSheet({ goal, visible, onClose }: { goal: GoalWithStats; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation('goals');
  const update = useUpdateGoal(goal.id);
  const [staffText, setStaffText] = useState(goal.staffText);
  const [parentText, setParentText] = useState(goal.parentText);
  const [baseline, setBaseline] = useState(goal.baseline);
  const [rule, setRule] = useState(goal.masteryRule);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const e = validateGoalDraft({
      therapyTypeId: goal.therapyTypeId,
      domain: goal.domain,
      staffText,
      parentText,
      baseline,
      accuracy: rule.accuracy,
      consecutiveSessions: rule.consecutiveSessions,
      startDate: goal.startDate,
      status: goal.status,
    });
    setErrors(e as Record<string, string>);
    if (Object.keys(e).length) return;
    try {
      await update.mutateAsync({ staffText: staffText.trim(), parentText: parentText.trim(), baseline: baseline.trim(), masteryRule: rule });
      toast.success(t('detail.saved'));
      onClose();
    } catch (ex) {
      toast.error(t(errorMessageKey(ex)));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('detail.editTitle')}
      footer={<Button label={t('common:actions.save')} icon={Save} onPress={() => void save()} loading={update.isPending} fullWidth />}
    >
      <TextField label={t('form.staffText')} required multiline minLines={2} maxLength={MAX_GOAL_TEXT} value={staffText} onChangeText={setStaffText} error={errors.staffText ? t(errors.staffText) : undefined} />
      <TextField
        label={t('form.parentText')}
        required
        multiline
        minLines={2}
        icon={Users}
        maxLength={MAX_GOAL_TEXT}
        value={parentText}
        onChangeText={setParentText}
        helper={t('form.parentTextHelp')}
        error={errors.parentText ? t(errors.parentText) : undefined}
      />
      <TextField label={t('form.baseline')} value={baseline} onChangeText={setBaseline} />
      <MasteryRuleField accuracy={rule.accuracy} sessions={rule.consecutiveSessions} onChange={setRule} />
    </Sheet>
  );
}
