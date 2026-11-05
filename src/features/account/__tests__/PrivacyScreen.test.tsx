import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { setRepo } from '@/data';
import type { Repository } from '@/data/repository';
import { CONSENT_VERSION } from '@/domain/constants';
import type { ChildSummary, Consent, DataRequest } from '@/domain/types';
import { renderScreen, testOrg, testUser } from '@/features/onboarding/test-utils';
import { useSession } from '@/state/session';

import { PrivacyScreen } from '../PrivacyScreen';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const at = '2026-10-12T10:00:00.000Z';
const consent = (kind: Consent['kind'], childId: string, granted = true): Consent => ({ id: `${kind}-${childId}`, userId: 'u1', kind, childId, granted, at, version: CONSENT_VERSION });

function setup() {
  const consents: Consent[] = [consent('data_processing', 'c1'), consent('video_upload', 'c1')];
  const me = {
    listConsents: jest.fn(() => Promise.resolve([...consents])),
    recordConsent: jest.fn((i: { kind: Consent['kind']; granted: boolean; childId?: string; version: string }) => {
      const c = { ...i, id: `n${consents.length}`, userId: 'u1', at: '2026-10-20T10:00:00.000Z' } as Consent;
      consents.push(c);
      return Promise.resolve(c);
    }),
    requestDeletion: jest.fn(
      (childId: string): Promise<DataRequest> =>
        Promise.resolve({ id: 'r1', organizationId: 'org1', userId: 'u1', userName: 'Priya', childId, childName: 'Aarav Sharma', kind: 'deletion', status: 'open', createdAt: '2026-10-21T10:00:00.000Z' }),
    ),
    requestDataExport: jest.fn(),
  };
  const child: ChildSummary = {
    child: { id: 'c1', organizationId: 'org1', fullName: 'Aarav Sharma', preferredName: 'Aarav', dob: '2018-05-01', status: 'active', createdAt: at },
    therapists: [],
    guardians: [],
    openAlerts: 0,
  };
  setRepo({ me, children: { list: jest.fn(() => Promise.resolve([child])) }, org: { get: jest.fn(() => Promise.resolve(testOrg)) } } as unknown as Repository);
  useSession.setState({ user: testUser('parent', { childIds: ['c1'] }), activeMembershipId: 'm1', mode: 'supabase' });
  return me;
}

describe('PrivacyScreen', () => {
  it('shows current consent and asks before turning video uploads off', async () => {
    const me = setup();
    await renderScreen(<PrivacyScreen />);
    expect(await screen.findByText('Agreed on 12 Oct 2026')).toBeTruthy();
    expect(screen.getByTestId('privacy-video').props.accessibilityState).toMatchObject({ checked: true });

    await fireEvent.press(screen.getByTestId('privacy-video'));
    expect(await screen.findByText('Turn off video uploads?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(me.recordConsent).toHaveBeenCalledWith({ kind: 'video_upload', granted: false, childId: 'c1', version: CONSENT_VERSION }));
    await waitFor(() => expect(screen.getByTestId('privacy-video').props.accessibilityState).toMatchObject({ checked: false }));
  });

  it('sends a deletion request after confirmation and says when the school will reply', async () => {
    const me = setup();
    await renderScreen(<PrivacyScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Request deletion' }));
    expect(await screen.findByText("Ask to delete Aarav's information?")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(me.requestDeletion).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('Deletion requested on 21 Oct 2026. Your school will contact you within 7 days.')).toBeTruthy();
    expect(me.requestDataExport).not.toHaveBeenCalled();
  });
});
