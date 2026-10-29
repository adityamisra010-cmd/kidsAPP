import { router } from 'expo-router';
import {
  ArrowLeftRight,
  Baby,
  Bell,
  BellRing,
  BookOpen,
  CalendarOff,
  ClipboardList,
  Database,
  FileSpreadsheet,
  Info,
  Languages,
  Layers,
  LibraryBig,
  LogOut,
  Megaphone,
  MessageCircle,
  Phone,
  Repeat,
  School,
  ShieldCheck,
  SlidersHorizontal,
  Shapes,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useUnreadCounts } from '@/data/hooks';
import { LanguageToggle } from '@/features/onboarding/LanguageToggle';
import { useRequiredActive, useSession } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Card, Divider, ListItem, Row, Screen, SectionHeader, Text } from '@/ui';

import { buildMoreMenu, type MenuItem, type MenuItemKey } from './menu';
import { ProfileCard } from './ProfileCard';
import { useMyChildren } from './queries';
import { confirmSignOut } from './signOutFlow';

const ICONS: Record<MenuItemKey, LucideIcon> = {
  messages: MessageCircle,
  resources: BookOpen,
  notifications: Bell,
  availability: CalendarOff,
  language: Languages,
  privacy: ShieldCheck,
  contact: Phone,
  notificationSettings: BellRing,
  profile: UserRound,
  switchChild: Baby,
  switchRole: ArrowLeftRight,
  about: Info,
  announcements: Megaphone,
  alerts: TriangleAlert,
  substitutions: Repeat,
  reschedule: ClipboardList,
  goalBank: LibraryBig,
  import: FileSpreadsheet,
  schoolSettings: School,
  dimensions: SlidersHorizontal,
  therapyTypes: Shapes,
  dataRequests: Database,
  templates: Layers,
};

function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  const t = useTheme();
  return (
    <View style={{ width: 40, height: 40, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={20} color={t.colors.primaryText} />
    </View>
  );
}

/** The More tab for every role (parent, therapist, coordinator/school admin, platform). */
export function MoreScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const active = useRequiredActive();
  const isDemo = useSession((s) => s.mode === 'demo');
  const unread = useUnreadCounts();
  const children = useMyChildren(active.role === 'parent');
  const activeChildId = useSession((s) => s.activeChildId);

  const childCount = active.role === 'parent' ? Math.max(active.user.childIds.length, children.data?.length ?? 0) : 0;
  const membershipCount = active.user.memberships.filter((m) => m.status === 'active').length;
  const sections = buildMoreMenu({ role: active.role, childCount, membershipCount });
  const activeChild = children.data?.find((c) => c.child.id === activeChildId)?.child;

  const subtitleFor = (item: MenuItem): string | undefined => {
    if (item.readOnly) return tr('settings:more.viewOnly');
    if (item.key === 'switchChild' && activeChild) return tr('settings:more.hints.switchChild', { name: activeChild.preferredName ?? activeChild.fullName });
    if (item.key === 'switchRole') return tr('settings:more.hints.switchRole', { role: tr(`common:roles.${active.role}`) });
    if (item.key === 'contact' && active.organization) return active.organization.name;
    return tr(`settings:more.hints.${item.key}`, { defaultValue: '' }) || undefined;
  };

  const renderItem = (item: MenuItem) => {
    const title = tr(`settings:more.items.${item.key}`);
    if (item.key === 'language') {
      return (
        <View style={{ gap: t.space[2], paddingVertical: t.space[2] }}>
          <Row gap={3}>
            <MenuIcon icon={ICONS.language} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {title}
            </Text>
          </Row>
          <View style={{ paddingLeft: 52 }}>
            <LanguageToggle persist width={240} testID="more-language" />
          </View>
        </View>
      );
    }
    const count = item.badge ? unread[item.badge] : 0;
    return (
      <ListItem
        testID={`more-item-${item.key}`}
        title={title}
        subtitle={subtitleFor(item)}
        left={<MenuIcon icon={ICONS[item.key]} />}
        right={count > 0 ? <Badge label={count > 99 ? '99+' : String(count)} tone="primary" /> : undefined}
        onPress={() => item.route && router.push(item.route)}
      />
    );
  };

  return (
    <Screen title={tr('settings:more.title')} testID="more-screen">
      <ProfileCard active={active} isDemo={isDemo} />
      {sections.map((section) => (
        <View key={section.key} style={{ gap: t.space[2] }}>
          <SectionHeader title={tr(`settings:more.sections.${section.key}`)} />
          <Card padding={0}>
            <View style={{ paddingHorizontal: t.space[4] }}>
              {section.items.map((item, i) => (
                <Fragment key={item.key}>
                  {i > 0 ? <Divider inset={0} /> : null}
                  {renderItem(item)}
                </Fragment>
              ))}
            </View>
          </Card>
        </View>
      ))}
      <Pressable
        testID="more-sign-out"
        accessibilityRole="button"
        accessibilityLabel={tr('settings:more.signOut')}
        onPress={() => void confirmSignOut(tr)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[2],
          minHeight: 56,
          borderRadius: t.radius.lg,
          borderWidth: 1.5,
          borderColor: t.colors.border,
          backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
          marginTop: t.space[2],
        })}
      >
        <LogOut size={20} color={t.colors.danger} />
        <Text variant="subheading" color="danger">
          {tr('settings:more.signOut')}
        </Text>
      </Pressable>
    </Screen>
  );
}
