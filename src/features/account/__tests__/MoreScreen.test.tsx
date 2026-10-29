import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { setRepo } from '@/data';
import type { Repository } from '@/data/repository';
import type { ChildSummary } from '@/domain/types';
import { renderScreen, testUser } from '@/features/onboarding/test-utils';
import { clearReminders } from '@/features/push';
import { signOut } from '@/state/auth-actions';
import { useSession } from '@/state/session';

import { MoreScreen } from '../MoreScreen';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@/features/push', () => ({ clearReminders: jest.fn(() => Promise.resolve()) }));
jest.mock('@/state/auth-actions', () => ({ signOut: jest.fn(() => Promise.resolve()), switchChild: jest.fn() }));

const child = (id: string, fullName: string): ChildSummary => ({
  child: { id, organizationId: 'org1', fullName, dob: '2018-05-01', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' },
  therapists: [],
  guardians: [],
  openAlerts: 0,
});

function fakeRepo() {
  setRepo({
    notifications: { unreadCount: jest.fn(() => Promise.resolve(3)) },
    messaging: { unreadCount: jest.fn(() => Promise.resolve(0)) },
    children: { list: jest.fn(() => Promise.resolve([child('c1', 'Aarav Sharma'), child('c2', 'Anaya Sharma')])) },
    me: { updateProfile: jest.fn(() => Promise.resolve({})) },
  } as unknown as Repository);
}

describe('MoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeRepo();
  });

  it('parent in the demo: profile card, demo badge, grouped items, switch child', async () => {
    useSession.setState({ user: testUser('parent', { childIds: ['c1', 'c2'] }), activeMembershipId: 'm1', activeChildId: 'c1', mode: 'demo' });
    await renderScreen(<MoreScreen />);
    expect(screen.getByText('Priya Sharma')).toBeTruthy();
    expect(screen.getByText('Parent · Sunrise Learning Centre')).toBeTruthy();
    expect(screen.getByTestId('more-demo-badge')).toBeTruthy();
    for (const label of ['Messages', 'Resources', 'Notifications', 'Language', 'Consent & privacy', 'Contact school', 'Notification settings', 'Profile & app settings', 'About']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(await screen.findByText('Switch child')).toBeTruthy();
    expect(await screen.findByText('Showing Aarav Sharma')).toBeTruthy();
    // Items without a hint show no subtitle (never a raw i18n key).
    expect(screen.queryByText(/settings:/)).toBeNull();
    expect(screen.getByText('Sunrise Learning Centre')).toBeTruthy(); // Contact school subtitle
    // Unread notifications badge.
    expect(await screen.findByText('3')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('more-item-privacy'));
    expect(router.push).toHaveBeenCalledWith('/account/privacy');

    await fireEvent.press(screen.getByTestId('more-switch-demo'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/demo'));
    expect(signOut).toHaveBeenCalled();
    expect(clearReminders).toHaveBeenCalled();
  });

  it('coordinator: school tools, read-only settings, no Excel import, sign out asks first', async () => {
    useSession.setState({ user: testUser('coordinator'), activeMembershipId: 'm1', mode: 'supabase' });
    await renderScreen(<MoreScreen />);
    expect(await screen.findByText('3')).toBeTruthy(); // unread notifications loaded
    expect(screen.queryByTestId('more-demo-badge')).toBeNull();
    for (const key of ['announcements', 'alerts', 'substitutions', 'reschedule', 'goalBank', 'schoolSettings', 'dimensions', 'therapyTypes', 'dataRequests']) {
      expect(screen.getByTestId(`more-item-${key}`)).toBeTruthy();
    }
    expect(screen.queryByText('Import from Excel')).toBeNull();
    expect(screen.getAllByText('View only')).toHaveLength(4);

    await fireEvent.press(screen.getByTestId('more-sign-out'));
    expect(await screen.findByText('Sign out?')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Sign out' }).at(-1)!);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
    expect(signOut).toHaveBeenCalled();
  });
});
