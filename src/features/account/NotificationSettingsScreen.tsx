import { BellOff, BellRing, Moon } from 'lucide-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import type { NotificationKind } from '@/domain/types';
import { refreshPermission, requestPermission, usePushPermission } from '@/features/push';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Divider, EmptyState, formatClock, QueryView, Row, Screen, SectionHeader, SkeletonList, Stack, SwitchRow, Text, toast } from '@/ui';

import { isKindEnabled, isLockedKind, notificationGroupsFor, setKindEnabled } from './notificationKinds';
import { useMutedKinds, useOrgSafe, useSetMutedKinds } from './queries';

function PermissionCard() {
  const t = useTheme();
  const { t: tr } = useTranslation('settings');
  const state = usePushPermission((s) => s.state);
  const canAskAgain = usePushPermission((s) => s.canAskAgain);

  useEffect(() => {
    void refreshPermission();
  }, []);

  if (Platform.OS === 'web') {
    return (
      <Card tone="sunken" padding={3}>
        <Text variant="label" color="textMuted">
          {tr('notifications.permissionWeb')}
        </Text>
      </Card>
    );
  }
  if (state === 'granted' || state === 'unknown') return null;
  return (
    <Card tone="warning" testID="notif-permission-off">
      <Stack gap={3}>
        <Row gap={3} align="flex-start">
          <BellOff size={22} color={t.colors.warning} />
          <Stack gap={1} flex={1}>
            <Text variant="subheading">{tr('notifications.permissionOff')}</Text>
            <Text variant="label" color="textMuted">
              {tr('notifications.permissionOffBody')}
            </Text>
          </Stack>
        </Row>
        <Button
          label={canAskAgain ? tr('notifications.turnOn') : tr('notifications.openSettings')}
          icon={BellRing}
          onPress={() => void requestPermission()}
        />
      </Stack>
    </Card>
  );
}

/** Per-kind switches, grouped. Schedule changes are locked on. */
export function NotificationSettingsScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('settings');
  const active = useRequiredActive();
  const muted = useMutedKinds();
  const setMuted = useSetMutedKinds();
  const org = useOrgSafe();
  const groups = notificationGroupsFor(active.role);
  const quiet = org.data?.settings.quietHours ?? active.organization?.settings.quietHours;

  const toggle = (current: NotificationKind[], kind: NotificationKind, enabled: boolean) => {
    setMuted.mutate(setKindEnabled(current, kind, enabled), { onError: () => toast.error(tr('notifications.saveError')) });
  };

  return (
    <Screen title={tr('notifications.title')} back testID="notification-settings">
      <Text color="textMuted">{tr('notifications.intro')}</Text>
      <PermissionCard />
      {groups.length === 0 ? (
        <EmptyState compact title={tr('notifications.none')} />
      ) : (
        <QueryView query={muted} skeleton={<SkeletonList rows={4} height={64} />}>
          {(current) => (
            <>
              {groups.map((g) => (
                <View key={g.key} style={{ gap: t.space[2] }}>
                  <SectionHeader title={tr(`notifications.groups.${g.key}`)} />
                  <Card padding={0}>
                    <View style={{ paddingHorizontal: t.space[4] }}>
                      {g.kinds.map((kind, i) => {
                        const locked = isLockedKind(kind);
                        return (
                          <View key={kind}>
                            {i > 0 ? <Divider /> : null}
                            <SwitchRow
                              testID={`notif-kind-${kind}`}
                              label={tr(`notifications.kinds.${kind}`)}
                              description={locked ? tr('notifications.locked') : tr(`notifications.kindHints.${kind}`, { defaultValue: '' }) || undefined}
                              value={isKindEnabled(current, kind)}
                              disabled={locked}
                              onChange={(v) => toggle(current, kind, v)}
                            />
                          </View>
                        );
                      })}
                    </View>
                  </Card>
                </View>
              ))}
            </>
          )}
        </QueryView>
      )}
      {quiet ? (
        <Row gap={2} align="flex-start">
          <Moon size={16} color={t.colors.textMuted} style={{ marginTop: 2 }} />
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {tr('notifications.quiet', { start: formatClock(quiet.start), end: formatClock(quiet.end) })}
          </Text>
        </Row>
      ) : null}
    </Screen>
  );
}
