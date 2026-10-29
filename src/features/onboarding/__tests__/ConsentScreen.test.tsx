import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { setRepo } from '@/data';
import type { Repository } from '@/data/repository';
import { CONSENT_VERSION } from '@/domain/constants';
import type { Consent } from '@/domain/types';
import { useSession } from '@/state/session';

import { ConsentScreen } from '../ConsentScreen';
import { renderScreen, testUser } from '../test-utils';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }, Redirect: () => null }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })) }));
jest.mock('@/state/auth-actions', () => ({ signOut: jest.fn(() => Promise.resolve()) }));

function fakeRepo(consents: Consent[]) {
  const me = {
    listConsents: jest.fn(() => Promise.resolve(consents)),
    recordConsent: jest.fn((i: { kind: Consent['kind']; granted: boolean; childId?: string; version: string }) =>
      Promise.resolve({ ...i, id: 'x', userId: 'u1', at: new Date().toISOString() }),
    ),
  };
  setRepo({ me } as unknown as Repository);
  return me;
}

describe('ConsentScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ user: testUser('parent', { childIds: ['c1', 'c2'] }), activeMembershipId: 'm1', mode: 'supabase', consentDone: false });
  });

  it('needs the required box, then records consent per child and continues', async () => {
    const me = fakeRepo([]);
    await renderScreen(<ConsentScreen />);
    expect(await screen.findByText('Before you start')).toBeTruthy();
    expect(await screen.findByText(/Sunrise Learning Centre keeps about your child/)).toBeTruthy();
    expect(screen.getByText('Stored on servers in India.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('consent-continue'));
    expect(me.recordConsent).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('consent-agree'));
    await fireEvent.press(screen.getByTestId('consent-video'));
    await fireEvent.press(screen.getByTestId('consent-continue'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(me.recordConsent.mock.calls.map(([i]) => [i.kind, i.granted, i.childId, i.version])).toEqual([
      ['data_processing', true, 'c1', CONSENT_VERSION],
      ['video_upload', true, 'c1', CONSENT_VERSION],
      ['data_processing', true, 'c2', CONSENT_VERSION],
      ['video_upload', true, 'c2', CONSENT_VERSION],
    ]);
    expect(useSession.getState().consentDone).toBe(true);
  });

  it('skips the screen when consent was already given at this version', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    const base = { userId: 'u1', granted: true, at, version: CONSENT_VERSION, kind: 'data_processing' as const };
    fakeRepo([
      { ...base, id: '1', childId: 'c1' },
      { ...base, id: '2', childId: 'c2' },
    ]);
    await renderScreen(<ConsentScreen />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(useSession.getState().consentDone).toBe(true);
  });
});
