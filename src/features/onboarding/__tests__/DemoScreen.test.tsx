import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { RepoError } from '@/data/repository';
import type { AuthUser } from '@/domain/types';
import { signInDemo } from '@/state/auth-actions';

import { DemoScreen } from '../DemoScreen';
import { renderScreen, testUser } from '../test-utils';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('@/state/auth-actions', () => ({ signInDemo: jest.fn() }));

const signIn = signInDemo as jest.Mock;

describe('DemoScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the five personas in pitch order with what to try', async () => {
    await renderScreen(<DemoScreen />);
    const names = ['Priya Sharma', 'Riya Menon', 'Sunita Bansal', 'Dr. Meera Iyer', 'Kabir Anand'];
    for (const n of names) expect(screen.getByText(n)).toBeTruthy();
    expect(screen.getByText('Mother of Aarav (8) and Anaya (5)')).toBeTruthy();
    expect(screen.getByText('All partner schools at a glance.')).toBeTruthy();
    expect(screen.getByText(/Demo data resets when the app restarts/)).toBeTruthy();
    const order = ['parent', 'therapist', 'school_admin', 'coordinator', 'platform_admin'].map((k) => screen.getByTestId(`demo-persona-${k}`));
    expect(order).toHaveLength(5);
  });

  it('signs in as the chosen persona, shows progress, then goes home', async () => {
    let resolve: (u: AuthUser) => void = () => undefined;
    signIn.mockImplementation(() => new Promise<AuthUser>((r) => (resolve = r)));
    await renderScreen(<DemoScreen />);
    await fireEvent.press(screen.getByTestId('demo-persona-therapist'));
    expect(signIn).toHaveBeenCalledWith('therapist');
    expect(screen.getByLabelText('Opening…')).toBeTruthy();
    // Other cards are disabled while one is loading.
    await fireEvent.press(screen.getByTestId('demo-persona-parent'));
    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => resolve(testUser('therapist')));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('shows a friendly error if the demo cannot start', async () => {
    signIn.mockRejectedValue(new RepoError('unknown'));
    await renderScreen(<DemoScreen />);
    await fireEvent.press(screen.getByTestId('demo-persona-parent'));
    await waitFor(() => expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy());
    expect(router.replace).not.toHaveBeenCalled();
  });
});
