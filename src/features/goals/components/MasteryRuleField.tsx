import { useTranslation } from 'react-i18next';

import { Row, Stack, Stepper, Text } from '@/ui';

import { ACCURACY_RANGE, SESSIONS_RANGE } from '../goalForm';

/** Mastery rule: accuracy % and consecutive sessions, with the rule read back in a sentence. */
export function MasteryRuleField({
  accuracy,
  sessions,
  onChange,
  error,
}: {
  accuracy: number;
  sessions: number;
  onChange: (v: { accuracy: number; consecutiveSessions: number }) => void;
  error?: string;
}) {
  const { t } = useTranslation('goals');
  return (
    <Stack gap={2}>
      <Text variant="label">{t('form.rule')}</Text>
      <Row gap={6} wrap align="flex-start">
        <Stepper
          label={t('form.accuracy')}
          value={accuracy}
          min={ACCURACY_RANGE.min}
          max={ACCURACY_RANGE.max}
          step={ACCURACY_RANGE.step}
          suffix="%"
          onChange={(v) => onChange({ accuracy: v, consecutiveSessions: sessions })}
        />
        <Stepper
          label={t('form.sessions')}
          value={sessions}
          min={SESSIONS_RANGE.min}
          max={SESSIONS_RANGE.max}
          onChange={(v) => onChange({ accuracy, consecutiveSessions: v })}
        />
      </Row>
      <Text variant="caption" color={error ? 'danger' : 'textMuted'}>
        {error ?? t('form.ruleSentence', { accuracy, count: sessions })}
      </Text>
    </Stack>
  );
}
