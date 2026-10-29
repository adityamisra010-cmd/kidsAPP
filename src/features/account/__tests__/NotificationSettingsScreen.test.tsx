import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { setRepo } from '@/data';
import type { Repository } from '@/data/repository';
import type { NotificationKind } from '@/domain/types';
import { renderScreen, testOrg, testUser } from '@/features/onboarding/test-utils';
import { useSession } from '@/state/session';

import { NotificationSettingsScreen } from '../NotificationSettingsScreen';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('@/features/push', () => {
  const { create } = jest.requireActual('zustand');
  return {
    usePushPermission: create(() => ({ state: 'granted', canAskAgain: true })),
    refreshPermission: jest.fn(() => Promise.resolve({ state: 'granted', canAskAgain: true })),
    requestPermission: jest.fn(),
  };
});

describe('NotificationSettingsScreen', () => {
  it('saves muted kinds and keeps schedule changes locked on', async () => {
    let stored: NotificationKind[] = ['announcement'];
    const setMuted = jest.fn((k: NotificationKind[]) => {
      stored = k;
      return Promise.resolve();
    });
    setRepo({
      me: { getMutedNotificationKinds: jest.fn(() => Promise.resolve(stored)), setMutedNotificationKinds: setMuted },
      org: { get: jest.fn(() => Promise.resolve(testOrg)) },
    } as unknown as Repository);
    useSession.setState({ user: testUser('parent'), activeMembershipId: 'm1', mode: 'supabase' });

    await renderScreen(<NotificationSettingsScreen />);
    expect(await screen.findByText('Session reminders')).toBeTruthy();
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.getByText('Home practice')).toBeTruthy();
    expect(screen.queryByText('Morning agenda')).toBeNull(); // therapist-only

    const locked = screen.getByTestId('notif-kind-appointment_changed');
    expect(locked.props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    expect(screen.getByTestId('notif-kind-announcement').props.accessibilityState).toMatchObject({ checked: false });
    expect(await screen.findByText(/Quiet hours: 9:00 PM – 8:00 AM/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('notif-kind-new_message'));
    await waitFor(() => expect(setMuted).toHaveBeenCalledWith(['announcement', 'new_message']));
    await waitFor(() => expect(screen.getByTestId('notif-kind-new_message').props.accessibilityState).toMatchObject({ checked: false }));

    await fireEvent.press(screen.getByTestId('notif-kind-announcement'));
    await waitFor(() => expect(setMuted).toHaveBeenLastCalledWith(['new_message']));
  });
});
