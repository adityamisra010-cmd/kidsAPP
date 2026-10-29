import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import i18n from '@/i18n';
import { isLiveBackendAvailable } from '@/state/auth-actions';
import { usePreferences } from '@/state/preferences';
import { BRAND } from '@/theme/brand';

import { renderScreen } from '../test-utils';
import { WelcomeScreen } from '../WelcomeScreen';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })) }));
jest.mock('@/state/auth-actions', () => ({ isLiveBackendAvailable: jest.fn(() => false) }));

const live = isLiveBackendAvailable as jest.Mock;

describe('WelcomeScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('without a backend: brand, demo as the main action, invite note', async () => {
    live.mockReturnValue(false);
    await renderScreen(<WelcomeScreen />);
    expect(screen.getByText(BRAND.appName)).toBeTruthy();
    expect(screen.getByText(/in one place for your school and family/)).toBeTruthy();
    expect(screen.queryByText('Continue with phone number')).toBeNull();
    expect(screen.getByText("Your school will send you an invite when it's set up.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('welcome-demo-cta'));
    expect(router.push).toHaveBeenCalledWith('/demo');
  });

  it('with a backend: phone first, staff email link, demo card', async () => {
    live.mockReturnValue(true);
    await renderScreen(<WelcomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with phone number' }));
    expect(router.push).toHaveBeenCalledWith('/phone');
    await fireEvent.press(screen.getByText('Staff? Sign in with email'));
    expect(router.push).toHaveBeenCalledWith('/email');
    await fireEvent.press(screen.getByTestId('welcome-demo'));
    expect(router.push).toHaveBeenCalledWith('/demo');
    expect(screen.queryByText("Your school will send you an invite when it's set up.")).toBeNull();
  });

  it('opens the privacy policy', async () => {
    await renderScreen(<WelcomeScreen />);
    await fireEvent.press(screen.getByText('Privacy policy'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(BRAND.privacyPolicyUrl);
  });

  it('switches the language to Hindi', async () => {
    await renderScreen(<WelcomeScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'हिंदी' }));
    expect(usePreferences.getState().language).toBe('hi');
    expect(i18n.language).toBe('hi');
    expect(await screen.findByText('डेमो देखें')).toBeTruthy();
  });
});
