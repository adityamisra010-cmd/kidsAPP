import { router } from 'expo-router';
import { CalendarClock, ChevronRight, FileText, Info, Phone, PlayCircle, ShieldCheck, Video, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openPrivacyPolicy } from '@/features/account/links';
import { isLiveBackendAvailable } from '@/state/auth-actions';
import { BRAND } from '@/theme/brand';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Row, Stack, Text } from '@/ui';

import { AppMark } from './AppMark';
import { LanguageToggle } from './LanguageToggle';

const POINTS: { icon: LucideIcon; key: string }[] = [
  { icon: CalendarClock, key: 'schedule' },
  { icon: FileText, key: 'notes' },
  { icon: Video, key: 'practice' },
];

/** First screen in every pitch: calm brand block, one clear next step, and the demo. */
export function WelcomeScreen() {
  const t = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation('auth');
  const live = isLiveBackendAvailable();

  const demoCard = (
    <Card
      testID="welcome-demo"
      tone={live ? 'default' : 'primary'}
      onPress={live ? () => router.push('/demo') : undefined}
      accessibilityLabel={live ? `${tr('welcome.demoTitle')}. ${tr('welcome.demoBody')}` : undefined}
    >
      <Stack gap={3}>
        <Row gap={3} align="flex-start">
          <View style={[s.iconTile, { backgroundColor: live ? t.colors.primarySoft : t.colors.surface }]}>
            <PlayCircle size={22} color={t.colors.primaryText} />
          </View>
          <Stack gap={1} flex={1}>
            <Text variant="subheading">{tr('welcome.demoTitle')}</Text>
            <Text variant="body" color="textMuted">
              {tr('welcome.demoBody')}
            </Text>
          </Stack>
          {live ? <ChevronRight size={20} color={t.colors.textSubtle} style={{ marginTop: 10 }} /> : null}
        </Row>
        {live ? null : (
          <Button testID="welcome-demo-cta" label={tr('welcome.demoCta')} icon={PlayCircle} size="lg" fullWidth onPress={() => router.push('/demo')} />
        )}
      </Stack>
    </Card>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]} testID="welcome-screen">
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + t.space[6] }]} keyboardShouldPersistTaps="handled">
        <View style={s.topBar}>
          <LanguageToggle width={200} testID="welcome-language" />
        </View>

        <Stack gap={4} style={s.brand}>
          <AppMark size={76} />
          <Stack gap={2}>
            <Text variant="display" accessibilityRole="header">
              {BRAND.appName}
            </Text>
            <Text variant="body" color="textMuted" style={s.tagline}>
              {tr('welcome.tagline')}
            </Text>
          </Stack>
          <Stack gap={3} style={{ marginTop: t.space[2] }}>
            {POINTS.map(({ icon: Icon, key }) => (
              <Row key={key} gap={3}>
                <View style={s.pointIcon}>
                  <Icon size={18} color={t.colors.primaryText} />
                </View>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {tr(`welcome.points.${key}`)}
                </Text>
              </Row>
            ))}
          </Stack>
        </Stack>

        <View style={{ flexGrow: 1, minHeight: t.space[6] }} />

        <Stack gap={3}>
          {live ? (
            <>
              <Button testID="welcome-phone" label={tr('welcome.continueWithPhone')} icon={Phone} size="lg" fullWidth onPress={() => router.push('/phone')} />
              <Pressable testID="welcome-email" accessibilityRole="link" onPress={() => router.push('/email')} hitSlop={8} style={s.link}>
                <Text variant="label" color="primaryText" weight="semibold">
                  {tr('welcome.staffEmail')}
                </Text>
              </Pressable>
              {demoCard}
            </>
          ) : (
            <>
              {demoCard}
              <Row gap={2} align="flex-start" style={{ paddingHorizontal: t.space[1] }}>
                <Info size={16} color={t.colors.textMuted} style={{ marginTop: 2 }} />
                <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
                  {tr('welcome.inviteNote')}
                </Text>
              </Row>
            </>
          )}
        </Stack>

        <Pressable testID="welcome-privacy" accessibilityRole="link" onPress={() => void openPrivacyPolicy()} hitSlop={8} style={[s.link, s.footer]}>
          <ShieldCheck size={16} color={t.colors.textMuted} />
          <Text variant="label" color="textMuted">
            {tr('welcome.privacy')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: t.space[5] },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: t.space[3] },
  brand: { marginTop: t.space[8] },
  tagline: { maxWidth: 420 },
  pointIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: { width: 44, height: 44, borderRadius: t.radius.md, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.space[2] },
  footer: { marginTop: t.space[4] },
}));
