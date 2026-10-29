import { Lock, Siren } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/ui';

import { LOCK_OPTIONS } from '../settingsDraft';
import type { SectionProps } from './DetailsSection';
import { ChoiceChips, NumberInput, Section } from './fields';

export function AlertsSection({ draft, update, readOnly }: SectionProps) {
  const { t: tr } = useTranslation('school');
  const s = draft.settings;
  return (
    <Section icon={Siren} title={tr('alerts.title')} body={tr('alerts.body')} testID="school-alerts">
      <NumberInput
        testID="school-drop-threshold"
        label={tr('alerts.drop')}
        value={s.alertDropThreshold}
        min={5}
        max={40}
        step={5}
        suffix={tr('alerts.dropSuffix')}
        readOnly={readOnly}
        onChange={(v) =>
          update((d) => {
            d.settings.alertDropThreshold = v;
          })
        }
      />
      <Text variant="caption" color="textMuted">
        {tr('alerts.dropHelp')}
      </Text>
      <NumberInput
        testID="school-incident-threshold"
        label={tr('alerts.incidents')}
        value={s.alertIncidentThreshold}
        min={1}
        max={10}
        suffix={tr('alerts.incidentsSuffix')}
        readOnly={readOnly}
        onChange={(v) =>
          update((d) => {
            d.settings.alertIncidentThreshold = v;
          })
        }
      />
    </Section>
  );
}

export function LogsSection({ draft, update, readOnly }: SectionProps) {
  const { t: tr } = useTranslation('school');
  return (
    <Section icon={Lock} title={tr('logs.title')} body={tr('logs.help')} testID="school-logs">
      <ChoiceChips
        single
        label={tr('logs.lock')}
        readOnly={readOnly}
        options={LOCK_OPTIONS.map((n) => ({ value: String(n), label: tr('logs.hours', { count: n }) }))}
        value={[String(draft.settings.logLockHours)]}
        onChange={(v) =>
          update((d) => {
            d.settings.logLockHours = Number(v[0]);
          })
        }
      />
    </Section>
  );
}
