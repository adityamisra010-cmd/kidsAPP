import { Bell, HeartHandshake, Moon, Video } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Card, Stack, SwitchRow, Text } from '@/ui';

import { REMINDER_OPTIONS, RETENTION_OPTIONS } from '../settingsDraft';
import type { SectionProps } from './DetailsSection';
import { ChoiceChips, Section, TimeInput } from './fields';

export function RemindersSection({ draft, update, readOnly, errors }: SectionProps) {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const s = draft.settings;
  return (
    <Section icon={Bell} title={tr('reminders.title')} body={tr('reminders.body')} testID="school-reminders">
      <ChoiceChips
        testID="school-reminder-chips"
        label={tr('reminders.before')}
        readOnly={readOnly}
        options={REMINDER_OPTIONS.map((h) => ({ value: String(h), label: tr('reminders.hours', { count: h }) }))}
        value={s.reminderHoursBefore.map(String)}
        onChange={(v) =>
          update((d) => {
            d.settings.reminderHoursBefore = v.map(Number);
          })
        }
      />
      {s.reminderHoursBefore.length === 0 ? (
        <Text variant="caption" color="warning">
          {tr('reminders.none')}
        </Text>
      ) : null}
      <TimeInput
        label={tr('reminders.agenda')}
        value={s.dailyAgendaTime}
        readOnly={readOnly}
        start="05:00"
        end="11:00"
        onChange={(v) =>
          update((d) => {
            d.settings.dailyAgendaTime = v;
          })
        }
      />
      <Stack gap={2}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <Moon size={18} color={t.colors.textMuted} />
          <Text variant="subheading">{tr('reminders.quietTitle')}</Text>
        </View>
        <Text variant="caption" color="textMuted">
          {tr('reminders.quietBody')}
        </Text>
        <View style={{ flexDirection: 'row', gap: t.space[3] }}>
          <View style={{ flex: 1 }}>
            <TimeInput
              label={tr('reminders.quietStart')}
              value={s.quietHours.start}
              readOnly={readOnly}
              stepMin={30}
              onChange={(v) =>
                update((d) => {
                  d.settings.quietHours.start = v;
                })
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeInput
              label={tr('reminders.quietEnd')}
              value={s.quietHours.end}
              readOnly={readOnly}
              stepMin={30}
              error={errors.quietHours ? tr(errors.quietHours) : undefined}
              onChange={(v) =>
                update((d) => {
                  d.settings.quietHours.end = v;
                })
              }
            />
          </View>
        </View>
      </Stack>
    </Section>
  );
}

export function ParentsSection({ draft, update, readOnly }: SectionProps) {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const s = draft.settings;
  return (
    <Section icon={HeartHandshake} title={tr('parents.title')} testID="school-parents">
      <SwitchRow
        testID="school-numeric-score"
        label={tr('parents.numericScore')}
        description={tr('parents.numericScoreHelp')}
        value={s.parentsSeeNumericScore}
        disabled={readOnly}
        onChange={(v) =>
          update((d) => {
            d.settings.parentsSeeNumericScore = v;
          })
        }
      />
      <Card tone="sunken" padding={3} elevated={false}>
        <Text variant="label" tint={t.colors.textMuted}>
          {tr('parents.whyWords')}
        </Text>
      </Card>
      <SwitchRow
        testID="school-checkin"
        label={tr('parents.checkin')}
        description={tr('parents.checkinHelp')}
        value={s.checkinEnabled}
        disabled={readOnly}
        onChange={(v) =>
          update((d) => {
            d.settings.checkinEnabled = v;
          })
        }
      />
    </Section>
  );
}

export function VideosSection({ draft, update, readOnly }: SectionProps) {
  const { t: tr } = useTranslation('school');
  return (
    <Section icon={Video} title={tr('videos.title')} body={tr('videos.help')} testID="school-videos">
      <ChoiceChips
        single
        label={tr('videos.retention')}
        readOnly={readOnly}
        options={RETENTION_OPTIONS.map((n) => ({ value: String(n), label: tr('videos.days', { count: n }) }))}
        value={[String(draft.settings.videoRetentionDays)]}
        onChange={(v) =>
          update((d) => {
            d.settings.videoRetentionDays = Number(v[0]);
          })
        }
      />
    </Section>
  );
}
