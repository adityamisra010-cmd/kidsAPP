/**
 * "More" tab menus per role (pure). Labels: `settings:more.items.<key>`, section titles:
 * `settings:more.sections.<section>`. The screen maps `icon` to a lucide icon.
 */
import type { Role } from '@/domain/types';

export type MenuItemKey =
  | 'messages'
  | 'resources'
  | 'notifications'
  | 'availability'
  | 'language'
  | 'privacy'
  | 'contact'
  | 'notificationSettings'
  | 'profile'
  | 'switchChild'
  | 'switchRole'
  | 'about'
  | 'announcements'
  | 'alerts'
  | 'substitutions'
  | 'reschedule'
  | 'goalBank'
  | 'import'
  | 'schoolSettings'
  | 'dimensions'
  | 'therapyTypes'
  | 'dataRequests'
  | 'templates';

export type MenuSectionKey = 'family' | 'work' | 'school' | 'schoolSettings' | 'platform' | 'me' | 'help';

export interface MenuItem {
  key: MenuItemKey;
  /** Route to open; items without a route are handled inline (language). */
  route?: string;
  /** Coordinators can open school settings but not change them. */
  readOnly?: boolean;
  /** Show an unread count. */
  badge?: 'messages' | 'notifications';
}

export interface MenuSection {
  key: MenuSectionKey;
  items: MenuItem[];
}

export interface MenuInput {
  role: Role;
  /** Linked children (parents). */
  childCount: number;
  /** Active memberships (role + school pairs). */
  membershipCount: number;
}

const item = (key: MenuItemKey, route?: string, extra?: Omit<MenuItem, 'key' | 'route'>): MenuItem => ({ key, route, ...extra });

const messages = item('messages', '/messages', { badge: 'messages' });
const notifications = item('notifications', '/notifications', { badge: 'notifications' });
const notificationSettings = item('notificationSettings', '/account/notifications');
const profile = item('profile', '/account/profile');
const about = item('about', '/account/about');
const resources = item('resources', '/resources');

function compact(items: (MenuItem | false)[]): MenuItem[] {
  return items.filter((i): i is MenuItem => !!i);
}

/** Sign out is always rendered last by the screen, after these sections. */
export function buildMoreMenu({ role, childCount, membershipCount }: MenuInput): MenuSection[] {
  const switchRole = membershipCount > 1 && item('switchRole', '/account/switch');

  switch (role) {
    case 'parent':
      return [
        { key: 'family', items: [messages, resources, notifications] },
        {
          key: 'me',
          items: compact([
            item('language'),
            notificationSettings,
            profile,
            childCount > 1 && item('switchChild', '/account/switch'),
            switchRole,
          ]),
        },
        { key: 'help', items: [item('privacy', '/account/privacy'), item('contact', '/account/contact'), about] },
      ];

    case 'therapist':
      return [
        { key: 'work', items: [messages, resources, item('availability', '/availability'), notifications] },
        { key: 'me', items: compact([notificationSettings, profile, switchRole]) },
        { key: 'help', items: [about] },
      ];

    case 'school_admin':
    case 'coordinator': {
      const readOnly = role === 'coordinator';
      return [
        {
          key: 'school',
          items: compact([
            item('announcements', '/announcements'),
            item('alerts', '/alerts'),
            item('substitutions', '/substitutions'),
            item('reschedule', '/reschedule/requests'),
            item('goalBank', '/goal-bank'),
            resources,
            // Importing staff, parents and schedules is a School Admin task.
            role === 'school_admin' && item('import', '/import'),
          ]),
        },
        {
          key: 'schoolSettings',
          items: [
            item('schoolSettings', '/school/settings', { readOnly }),
            item('dimensions', '/school/dimensions', { readOnly }),
            item('therapyTypes', '/school/therapy-types', { readOnly }),
            item('dataRequests', '/school/data-requests', { readOnly }),
          ],
        },
        { key: 'me', items: compact([messages, notifications, notificationSettings, profile, switchRole, about]) },
      ];
    }

    case 'platform_admin':
      return [
        { key: 'platform', items: [item('templates', '/platform/templates')] },
        { key: 'me', items: compact([profile, switchRole, about]) },
      ];
  }
}
