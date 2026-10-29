import { router } from 'expo-router';
import { ArrowLeftRight, ChevronRight, Sparkles } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { ActiveContext } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Button, Card, Row, Stack, Text } from '@/ui';

import { switchDemoRole } from './signOutFlow';

/** Top of every More tab: who you are, where, and (in the demo) a quick way to switch roles. */
export function ProfileCard({ active, isDemo }: { active: ActiveContext; isDemo: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { profile } = active.user;
  const role = tr(`common:roles.${active.role}`);
  const where = active.organization?.name ?? (active.role === 'platform_admin' ? tr('settings:more.allSchools') : undefined);
  // Always show the role (people with several roles need to know which one is active); a staff
  // title like "Speech Therapist" is added when it says something the role doesn't.
  const title = active.role !== 'parent' && profile.title && profile.title !== role ? profile.title : undefined;
  const subtitle = [title ? `${role}, ${title}` : role, where].filter(Boolean).join(' · ');

  return (
    <Card padding={4} testID="more-profile-card">
      <Stack gap={4}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('settings:more.profileA11y', { name: profile.fullName, role: subtitle })}
          onPress={() => router.push('/account/profile')}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <Row gap={3}>
            <Avatar name={profile.fullName} uri={profile.avatarUrl} size={56} />
            <Stack gap={1} flex={1}>
              <Text variant="heading" numberOfLines={2}>
                {profile.fullName}
              </Text>
              <Text variant="label" color="textMuted" numberOfLines={2}>
                {subtitle}
              </Text>
              {isDemo ? <Badge label={tr('common:demoBadge')} tone="primary" icon={Sparkles} testID="more-demo-badge" /> : null}
            </Stack>
            <ChevronRight size={20} color={t.colors.textSubtle} />
          </Row>
        </Pressable>
        {isDemo ? (
          <View style={{ gap: t.space[2] }}>
            <Text variant="caption" color="textMuted">
              {tr('settings:more.demoNote')}
            </Text>
            <Button
              testID="more-switch-demo"
              label={tr('settings:more.switchDemoRole')}
              icon={ArrowLeftRight}
              variant="secondary"
              fullWidth
              onPress={() => void switchDemoRole()}
            />
          </View>
        ) : null}
      </Stack>
    </Card>
  );
}
