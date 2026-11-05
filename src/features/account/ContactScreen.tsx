import { router } from 'expo-router';
import { Clock, Mail, MapPin, MessageCircle, Phone, School } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Organization } from '@/domain/types';
import { displayPhone } from '@/features/onboarding/phone';
import { useRequiredActive } from '@/state/session';
import { BRAND } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Divider, formatClock, Row, Screen, Stack, Text } from '@/ui';

import { callPhone, sendEmail } from './links';
import { useOrgSafe } from './queries';

function InfoRow({ icon, label, value, action }: { icon: ReactNode; label: string; value: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <Row gap={3} style={{ minHeight: 64, paddingVertical: t.space[3] }}>
      {icon}
      <Stack gap={1} flex={1}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="bodyStrong" selectable>
          {value}
        </Text>
      </Stack>
      {action}
    </Row>
  );
}

function SchoolCard({ org }: { org: Organization }) {
  const t = useTheme();
  const { t: tr } = useTranslation('settings');
  const hours = org.settings.workingHours;
  const icon = (I: typeof Phone) => <I size={20} color={t.colors.primaryText} />;
  return (
    <Card padding={0}>
      <View style={{ paddingHorizontal: t.space[4] }}>
        <Row gap={3} style={{ paddingVertical: t.space[4] }}>
          <View style={{ width: 48, height: 48, borderRadius: t.radius.md, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <School size={24} color={t.colors.primaryText} />
          </View>
          <Stack gap={1} flex={1}>
            <Text variant="heading">{org.name}</Text>
            {org.city ? (
              <Text variant="label" color="textMuted">
                {org.city}
              </Text>
            ) : null}
          </Stack>
        </Row>
        {org.address ? (
          <>
            <Divider />
            <InfoRow icon={icon(MapPin)} label={tr('contact.address')} value={org.address} />
          </>
        ) : null}
        {org.phone ? (
          <>
            <Divider />
            <InfoRow
              icon={icon(Phone)}
              label={tr('contact.phone')}
              value={displayPhone(org.phone)}
              action={<Button testID="contact-call" size="sm" variant="secondary" icon={Phone} label={tr('contact.call')} onPress={() => void callPhone(org.phone)} />}
            />
          </>
        ) : null}
        {org.email ? (
          <>
            <Divider />
            <InfoRow
              icon={icon(Mail)}
              label={tr('contact.email')}
              value={org.email}
              action={<Button size="sm" variant="secondary" icon={Mail} label={tr('contact.write')} onPress={() => void sendEmail(org.email!)} />}
            />
          </>
        ) : null}
        <Divider />
        <InfoRow icon={icon(Clock)} label={tr('contact.hoursLabel')} value={`${formatClock(hours.start)} – ${formatClock(hours.end)}`} />
      </View>
    </Card>
  );
}

/** School contact details plus the care-team thread (the preferred way to reach therapists). */
export function ContactScreen() {
  const { t: tr } = useTranslation('settings');
  const active = useRequiredActive();
  const org = useOrgSafe();
  const school = org.data ?? active.organization;

  return (
    <Screen title={tr('contact.title')} back testID="contact-screen">
      {school ? (
        <SchoolCard org={school} />
      ) : (
        <Card>
          <Stack gap={2}>
            <Text variant="subheading">{tr('contact.supportTitle')}</Text>
            <Text color="textMuted">{tr('contact.supportBody')}</Text>
            <Button label={BRAND.supportEmail} icon={Mail} variant="secondary" onPress={() => void sendEmail(BRAND.supportEmail)} />
          </Stack>
        </Card>
      )}
      {active.role !== 'platform_admin' ? (
        <Card tone="primary">
          <Stack gap={3}>
            <Text variant="subheading">{tr('contact.messageTitle')}</Text>
            <Text color="textMuted">{tr('contact.messageHint')}</Text>
            <Button label={tr('contact.message')} icon={MessageCircle} fullWidth onPress={() => router.push('/messages')} />
          </Stack>
        </Card>
      ) : null}
    </Screen>
  );
}
