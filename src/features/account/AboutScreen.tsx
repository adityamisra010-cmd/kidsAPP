import { ExternalLink, LifeBuoy, MapPin, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppMark } from '@/features/onboarding/AppMark';
import { useSession } from '@/state/session';
import { BRAND } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Divider, ListItem, Row, Screen, Stack, Text } from '@/ui';

import { appVersion, openPrivacyPolicy, sendEmail } from './links';

export function AboutScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('settings');
  const isDemo = useSession((s) => s.mode === 'demo');
  const { version, build } = appVersion();
  const icon = (I: typeof ShieldCheck) => (
    <View style={{ width: 40, height: 40, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <I size={20} color={t.colors.primaryText} />
    </View>
  );

  return (
    <Screen title={tr('about.title')} back testID="about-screen">
      <Stack gap={3} align="center" style={{ paddingVertical: t.space[5] }}>
        <AppMark size={80} />
        <Text variant="title" align="center">
          {BRAND.appName}
        </Text>
        <Text variant="label" color="textMuted" align="center">
          {build ? tr('about.versionBuild', { version, build }) : tr('about.version', { version })}
        </Text>
        {isDemo ? <Badge label={tr('about.demoMode')} tone="primary" icon={Sparkles} /> : null}
      </Stack>
      <Card>
        <Stack gap={3}>
          <Text>{tr('about.description', { appName: BRAND.appName })}</Text>
          <Row gap={2}>
            <MapPin size={16} color={t.colors.primaryText} />
            <Text variant="label" color="primaryText" weight="semibold">
              {tr('about.madeFor')}
            </Text>
          </Row>
        </Stack>
      </Card>
      <Card padding={0}>
        <View style={{ paddingHorizontal: t.space[4] }}>
          <ListItem
            title={tr('about.privacy')}
            left={icon(ShieldCheck)}
            right={<ExternalLink size={18} color={t.colors.textSubtle} />}
            chevron={false}
            onPress={() => void openPrivacyPolicy()}
          />
          <Divider />
          <ListItem
            title={tr('about.support')}
            subtitle={BRAND.supportEmail}
            left={icon(LifeBuoy)}
            onPress={() => void sendEmail(BRAND.supportEmail, BRAND.appName)}
          />
        </View>
      </Card>
    </Screen>
  );
}
