/**
 * Morning check-in (parent, ~15 seconds): four one-tap questions with icons + words.
 * Saved through the outbox so it works on a weak morning connection.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  CircleCheck,
  Frown,
  Meh,
  MessageSquareText,
  Send,
  Smile,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useRepo } from '@/data';
import { useAppointment } from '@/data/hooks';
import { enqueue } from '@/data/outbox';
import { key } from '@/data/queryClient';
import { formatTime } from '@/lib/dates';
import { uuid } from '@/lib/id';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, ErrorState, Screen, SkeletonList, Stack, SyncBadge, Text, TextField } from '@/ui';

import { ChoiceTiles } from '../practice/components/ChoiceTiles';
import { firstName } from '../practice/logic';
import { registerPracticeOutbox } from '../practice/outbox';
import { CHECKIN_KIND } from '../practice/outboxLogic';
import { answeredCount, buildCheckinInput, CHANGE_NOTE_MAX, EMPTY_ANSWERS, type CheckinAnswers, type MoodAnswer, type SleepAnswer } from './logic';

registerPracticeOutbox();

type YesNo = 'yes' | 'no';
const yn = (v: boolean | undefined): YesNo | undefined => (v === undefined ? undefined : v ? 'yes' : 'no');

function DoneView({ title, body }: { title: string; body: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  return (
    <Screen back footer={<Button label={tr('checkin.backHome')} size="lg" fullWidth onPress={() => (router.canGoBack() ? router.back() : router.replace('/parent/home'))} />}>
      <Stack gap={4} align="center" style={{ paddingTop: t.space[8] }} testID="checkin-done">
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: t.colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
          <CircleCheck size={44} color={t.colors.success} />
        </View>
        <Text variant="title" align="center" accessibilityRole="header">
          {title}
        </Text>
        <Text align="center" color="textMuted" accessibilityLiveRegion="polite">
          {body}
        </Text>
        <SyncBadge />
      </Stack>
    </Screen>
  );
}

export function CheckinScreen({ appointmentId }: { appointmentId: string }) {
  const { t } = useTranslation('practice');
  const repo = useRepo();
  const appt = useAppointment(appointmentId);
  const existing = useQuery({ queryKey: key('checkins', 'appointment', appointmentId), queryFn: () => repo.checkins.forAppointment(appointmentId) });
  const [answers, setAnswers] = useState<CheckinAnswers>(EMPTY_ANSWERS);
  const [clientId] = useState(uuid);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const set = (patch: Partial<CheckinAnswers>) => setAnswers((a) => ({ ...a, ...patch }));

  if (appt.isPending) {
    return (
      <Screen title={t('checkin.title')} back>
        <SkeletonList rows={4} height={110} />
      </Screen>
    );
  }
  if (appt.error || !appt.data) {
    return (
      <Screen title={t('checkin.title')} back>
        <ErrorState error={appt.error} onRetry={() => void appt.refetch()} />
      </Screen>
    );
  }

  const a = appt.data;
  const child = firstName(a.childName);
  const thanks = t('checkin.thanks', { therapist: a.therapistName });
  if (sent) return <DoneView title={t('checkin.thanksTitle')} body={thanks} />;
  if (existing.data) return <DoneView title={t('checkin.already')} body={thanks} />;

  const submit = async () => {
    const input = buildCheckinInput(a, answers, clientId);
    if (!input) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      await enqueue(CHECKIN_KIND, input, `${t('checkin.title')} · ${child}`);
      setSent(true);
    } finally {
      setSaving(false);
    }
  };

  const count = answeredCount(answers);

  return (
    <Screen
      title={t('checkin.title')}
      subtitle={`${child} · ${formatTime(a.startsAt)}`}
      back
      testID="checkin"
      footer={
        <>
          <Text variant="caption" color={showErrors && count < 4 ? 'danger' : 'textMuted'} align="center" accessibilityLiveRegion="polite">
            {showErrors && count < 4 ? t('checkin.needAll') : t('checkin.progress', { count })}
          </Text>
          <Button label={t('checkin.submit')} icon={Send} size="lg" fullWidth loading={saving} onPress={() => void submit()} testID="checkin-submit" />
        </>
      }
    >
      <Text color="textMuted">{t('checkin.intro', { name: child, therapist: a.therapistName })}</Text>
      <ChoiceTiles<SleepAnswer>
        label={t('checkin.sleep')}
        testID="sleep"
        value={answers.sleep}
        onChange={(sleep) => set({ sleep })}
        options={[
          { value: 'good', label: t('checkin.sleepOpt.good'), icon: BatteryFull },
          { value: 'ok', label: t('checkin.sleepOpt.ok'), icon: BatteryMedium },
          { value: 'poor', label: t('checkin.sleepOpt.poor'), icon: BatteryLow },
        ]}
      />
      <ChoiceTiles<YesNo>
        label={t('checkin.breakfast')}
        testID="breakfast"
        value={yn(answers.ateBreakfast)}
        onChange={(v) => set({ ateBreakfast: v === 'yes' })}
        options={[
          { value: 'yes', label: t('common:actions.yes'), icon: Utensils },
          { value: 'no', label: t('common:actions.no'), icon: UtensilsCrossed },
        ]}
      />
      <ChoiceTiles<MoodAnswer>
        label={t('checkin.mood')}
        testID="mood"
        value={answers.mood}
        onChange={(mood) => set({ mood })}
        options={[
          { value: 'happy', label: t('checkin.moodOpt.happy'), icon: Smile },
          { value: 'okay', label: t('checkin.moodOpt.okay'), icon: Meh },
          { value: 'upset', label: t('checkin.moodOpt.upset'), icon: Frown },
        ]}
      />
      <ChoiceTiles<YesNo>
        label={t('checkin.change')}
        testID="change"
        value={yn(answers.changeFlag)}
        onChange={(v) => set({ changeFlag: v === 'yes' })}
        options={[
          { value: 'no', label: t('common:actions.no'), icon: CircleCheck },
          { value: 'yes', label: t('common:actions.yes'), icon: MessageSquareText },
        ]}
      />
      {answers.changeFlag ? (
        <TextField
          label={t('checkin.changeNote')}
          placeholder={t('checkin.changePlaceholder')}
          multiline
          minLines={2}
          maxLength={CHANGE_NOTE_MAX}
          value={answers.changeNote}
          onChangeText={(changeNote) => set({ changeNote })}
          testID="checkin-note"
        />
      ) : null}
    </Screen>
  );
}
