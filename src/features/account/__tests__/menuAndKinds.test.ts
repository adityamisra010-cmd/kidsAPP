import { UNMUTABLE_NOTIFICATION_KINDS } from '@/domain/types';

import { buildMoreMenu, type MenuSection } from '../menu';
import { isKindEnabled, notificationGroupsFor, sanitizeMuted, setKindEnabled } from '../notificationKinds';

const keys = (sections: MenuSection[]) => sections.flatMap((s) => s.items.map((i) => i.key));

describe('More menus', () => {
  it('parent: family items, settings, help; switch child only with 2+ children', () => {
    const one = buildMoreMenu({ role: 'parent', childCount: 1, membershipCount: 1 });
    expect(one.map((s) => s.key)).toEqual(['family', 'me', 'help']);
    expect(keys(one)).toEqual([
      'messages',
      'resources',
      'notifications',
      'language',
      'notificationSettings',
      'profile',
      'privacy',
      'contact',
      'about',
    ]);
    const two = buildMoreMenu({ role: 'parent', childCount: 2, membershipCount: 1 });
    expect(keys(two)).toContain('switchChild');
    expect(two.flatMap((s) => s.items).find((i) => i.key === 'switchChild')?.route).toBe('/account/switch');
  });

  it('therapist: work items include availability; no school settings', () => {
    const k = keys(buildMoreMenu({ role: 'therapist', childCount: 0, membershipCount: 1 }));
    expect(k).toEqual(['messages', 'resources', 'availability', 'notifications', 'notificationSettings', 'profile', 'about']);
  });

  it('school admin can import and edit settings; coordinator sees settings read-only and no import', () => {
    const admin = buildMoreMenu({ role: 'school_admin', childCount: 0, membershipCount: 1 });
    const coord = buildMoreMenu({ role: 'coordinator', childCount: 0, membershipCount: 1 });
    expect(keys(admin)).toContain('import');
    expect(keys(coord)).not.toContain('import');
    const settings = (s: MenuSection[]) => s.find((x) => x.key === 'schoolSettings')!.items;
    expect(settings(admin).every((i) => !i.readOnly)).toBe(true);
    expect(settings(coord).every((i) => i.readOnly)).toBe(true);
    expect(settings(admin).map((i) => i.route)).toEqual(['/school/settings', '/school/dimensions', '/school/therapy-types', '/school/data-requests']);
    expect(admin.find((s) => s.key === 'school')!.items.map((i) => i.route)).toEqual([
      '/announcements',
      '/alerts',
      '/substitutions',
      '/reschedule/requests',
      '/goal-bank',
      '/resources',
      '/import',
    ]);
  });

  it('platform admin: templates, profile, about', () => {
    expect(keys(buildMoreMenu({ role: 'platform_admin', childCount: 0, membershipCount: 1 }))).toEqual(['templates', 'profile', 'about']);
  });

  it('offers "Switch role or school" only with several memberships', () => {
    for (const role of ['parent', 'therapist', 'coordinator', 'school_admin', 'platform_admin'] as const) {
      expect(keys(buildMoreMenu({ role, childCount: 0, membershipCount: 1 }))).not.toContain('switchRole');
      expect(keys(buildMoreMenu({ role, childCount: 0, membershipCount: 2 }))).toContain('switchRole');
    }
  });

  it('every item with a route uses an absolute path', () => {
    for (const role of ['parent', 'therapist', 'coordinator', 'school_admin', 'platform_admin'] as const) {
      for (const item of buildMoreMenu({ role, childCount: 3, membershipCount: 2 }).flatMap((s) => s.items)) {
        if (item.key === 'language') expect(item.route).toBeUndefined();
        else expect(item.route).toMatch(/^\//);
      }
    }
  });
});

describe('notification kinds', () => {
  it('groups kinds by role and drops empty groups', () => {
    const parent = notificationGroupsFor('parent');
    expect(parent.map((g) => g.key)).toEqual(['schedule', 'sessions', 'practice', 'messages', 'announcements']);
    expect(parent[0].kinds).toEqual(['appointment_reminder', 'appointment_changed', 'substitute_assigned', 'reschedule_response']);
    expect(notificationGroupsFor('therapist')[0].kinds).toContain('daily_agenda');
    expect(notificationGroupsFor('coordinator').find((g) => g.key === 'sessions')!.kinds).toContain('child_alert');
    expect(notificationGroupsFor('platform_admin')).toEqual([]);
  });

  it('never mutes schedule changes', () => {
    let muted = setKindEnabled([], 'appointment_changed', false);
    expect(muted).toEqual([]);
    muted = setKindEnabled(muted, 'announcement', false);
    muted = setKindEnabled(muted, 'announcement', false);
    expect(muted).toEqual(['announcement']);
    expect(setKindEnabled(muted, 'announcement', true)).toEqual([]);
    expect(sanitizeMuted([...UNMUTABLE_NOTIFICATION_KINDS, 'new_message', 'new_message'])).toEqual(['new_message']);
    for (const k of UNMUTABLE_NOTIFICATION_KINDS) expect(isKindEnabled([k], k)).toBe(true);
    expect(isKindEnabled(['new_message'], 'new_message')).toBe(false);
  });
});
