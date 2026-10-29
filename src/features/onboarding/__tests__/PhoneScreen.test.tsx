import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { RepoError } from '@/data/repository';
import { requestOtp, verifyOtp } from '@/state/auth-actions';

import { PhoneScreen } from '../PhoneScreen';
import { renderScreen, testUser } from '../test-utils';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('@/state/auth-actions', () => ({ requestOtp: jest.fn(), verifyOtp: jest.fn() }));

describe('PhoneScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requestOtp as jest.Mock).mockResolvedValue(undefined);
  });

  it('formats the number, sends the code and verifies a pasted OTP', async () => {
    (verifyOtp as jest.Mock).mockResolvedValue(testUser('parent'));
    await renderScreen(<PhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '+91 98765-43210');
    expect(screen.getByTestId('phone-input').props.value).toBe('98765 43210');
    await fireEvent.press(screen.getByTestId('phone-send'));
    await waitFor(() => expect(requestOtp).toHaveBeenCalledWith('+919876543210'));

    expect(await screen.findByText('We sent a 6-digit code to +91 98765 43210.')).toBeTruthy();
    expect(screen.getByText(/You can ask for a new code in 0:(30|29)/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('otp-input'), 'Code: 123 456');
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith('+919876543210', '123456'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });

  it('explains invalid numbers without calling the server', async () => {
    await renderScreen(<PhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '1234567890');
    await fireEvent.press(screen.getByTestId('phone-send'));
    expect(await screen.findByText('Indian mobile numbers start with 6, 7, 8 or 9.')).toBeTruthy();
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it('shows a wrong-code message and clears the boxes', async () => {
    (verifyOtp as jest.Mock).mockRejectedValue(new RepoError('otp_invalid'));
    await renderScreen(<PhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '9876543210');
    await fireEvent.press(screen.getByTestId('phone-send'));
    await screen.findByText('Enter the code');
    await fireEvent.changeText(screen.getByTestId('otp-input'), '000000');
    expect(await screen.findByText("That code didn't match. Please check and try again.")).toBeTruthy();
    expect(screen.getByTestId('otp-input').props.value).toBe('');
  });

  it('guides people whose number is not linked to a school', async () => {
    (verifyOtp as jest.Mock).mockRejectedValue(new RepoError('no_membership'));
    await renderScreen(<PhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '9876543210');
    await fireEvent.press(screen.getByTestId('phone-send'));
    await screen.findByText('Enter the code');
    await fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    expect(await screen.findByText("This number isn't linked to a school yet")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Explore the demo instead' }));
    expect(router.replace).toHaveBeenCalledWith('/demo');
  });
});
