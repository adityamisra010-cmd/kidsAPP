import { router } from 'expo-router';
import { Check, ClipboardList, Globe, HeartHandshake, School, Stethoscope, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Role } from '@/domain/types';
import { ageLabel } from '@/lib/dates';
import { switchChild, switchMembership } from '@/state/auth-actions';
import { useRequiredActive, useSession } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Card, Divider, ListItem, QueryView, Screen, SectionHeader, SkeletonList, toast } from '@/ui';

import { useMyChildren } from './queries';

const ROLE_ICONS: Record<Role, LucideIcon> = {
  parent: HeartHandshake,
  therapist: Stethoscope,
  school_admin: School,
  coordinator: ClipboardList,
  platform_admin: Globe,
};

/** Switch role/school (several memberships) and, for parents, the child shown across the app. */
export function SwitchScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const active = useRequiredActive();
  const activeChildId = useSession((s) => s.activeChildId);
  const isParent = active.role === 'parent';
  const children = useMyChildren(isParent);
  const memberships = active.user.memberships.filter((m) => m.status === 'active');
  const current = <Badge label={tr('settings:switch.current')} tone="success" icon={Check} />;

  const orgName = (orgId: string | null) =>
    orgId ? (active.user.organizations.find((o) => o.id === orgId)?.name ?? '') : tr('settings:more.allSchools');

  return (
    <Screen title={tr(isParent && memberships.length < 2 ? 'settings:switch.titleChild' : 'settings:switch.title')} back testID="switch-screen">
      {memberships.length > 1 ? (
        <>
          <SectionHeader title={tr('settings:switch.roles')} />
          <Card padding={0}>
            <View style={{ paddingHorizontal: t.space[4] }}>
              {memberships.map((m, i) => {
                const Icon = ROLE_ICONS[m.role];
                const isCurrent = m.id === active.membership.id;
                const role = tr(`common:roles.${m.role}`);
                return (
                  <View key={m.id}>
                    {i > 0 ? <Divider /> : null}
                    <ListItem
                      testID={`switch-membership-${m.id}`}
                      title={role}
                      subtitle={orgName(m.organizationId)}
                      left={
                        <View style={{ width: 44, height: 44, borderRadius: t.radius.md, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={22} color={t.colors.primaryText} />
                        </View>
                      }
                      right={isCurrent ? current : undefined}
                      chevron={!isCurrent}
                      onPress={
                        isCurrent
                          ? undefined
                          : () => {
                              switchMembership(m.id);
                              toast.success(tr('settings:switch.switchedRole', { role }));
                              router.replace('/');
                            }
                      }
                    />
                  </View>
                );
              })}
            </View>
          </Card>
        </>
      ) : null}

      {isParent ? (
        <>
          <SectionHeader title={tr('settings:switch.children')} />
          <QueryView query={children} skeleton={<SkeletonList rows={2} height={64} />}>
            {(list) => (
              <Card padding={0}>
                <View style={{ paddingHorizontal: t.space[4] }}>
                  {list.map(({ child }, i) => {
                    const isCurrent = child.id === activeChildId;
                    const name = child.preferredName ?? child.fullName;
                    return (
                      <View key={child.id}>
                        {i > 0 ? <Divider /> : null}
                        <ListItem
                          testID={`switch-child-${child.id}`}
                          title={child.fullName}
                          subtitle={ageLabel(child.dob)}
                          left={<Avatar name={child.fullName} uri={child.photoUrl} size={44} />}
                          right={isCurrent ? <Badge label={tr('settings:switch.showing')} tone="success" icon={Check} /> : undefined}
                          chevron={!isCurrent}
                          onPress={
                            isCurrent
                              ? undefined
                              : () => {
                                  switchChild(child.id);
                                  toast.success(tr('settings:switch.switchedChild', { name }));
                                  router.replace('/');
                                }
                          }
                        />
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}
          </QueryView>
        </>
      ) : null}
    </Screen>
  );
}
