import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { LANGUAGES } from '@/domain/languages';
import i18n from '@/i18n';
import { usePreferences } from '@/state/preferences';

import { renderScreen } from '../../onboarding/test-utils';
import { LanguageScreen } from '../LanguageScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

describe('LanguageScreen', () => {
  it('lists English and the 22 scheduled languages in their own scripts', async () => {
    await renderScreen(<LanguageScreen />);
    expect(LANGUAGES).toHaveLength(23);
    expect(screen.getByText('தமிழ்')).toBeTruthy();
    expect(screen.getByText('ᱥᱟᱱᱛᱟᱲᱤ')).toBeTruthy();
  });

  it('searches by English name and switches language', async () => {
    await renderScreen(<LanguageScreen />);
    await fireEvent.changeText(screen.getByTestId('language-search'), 'tam');
    expect(screen.queryByText('বাংলা')).toBeNull();
    await fireEvent.press(screen.getByTestId('language-ta'));
    expect(usePreferences.getState().language).toBe('ta');
    expect(i18n.language).toBe('ta');
    expect(router.back).toHaveBeenCalled();
  });
});
