import { screen } from '@testing-library/react-native';

import type { ParentSessionSnapshot } from '@/domain/types';
import { useSession } from '@/state/session';

import { renderScreen, signInTherapist } from '../__fixtures__/render';
import { appointment, dims, goal, sessionLog, therapistUser } from '../__fixtures__/session';
import { SessionDetailScreen } from '../screens/SessionDetailScreen';

const snapshot: ParentSessionSnapshot = {
  sessionId: 'session-1',
  date: '2026-10-29',
  therapyTypeName: 'Speech Therapy',
  therapyTypeColor: '#C66B4E',
  therapyTypeKey: 'speech',
  therapistName: 'Ms. Priya Nair',
  isSubstitute: true,
  highlights: [{ key: 'attention', label: 'Focus', icon: 'target', value: 4, change: 'better' }],
  overall: 'better',
  parentSummary: 'Aarav had a calm, settled session today.',
  goalsWorkedOn: [{ goalId: 'g1', parentText: 'Asks for help with two words' }],
};

const mockRepo = {
  org: { get: jest.fn(async () => therapistUser.organizations[0]), listRatingDimensions: jest.fn(async () => dims) },
  appointments: { get: jest.fn(async () => appointment()) },
  goals: { listForChild: jest.fn(async () => [goal('g1')]) },
  sessions: {
    get: jest.fn(async () => sessionLog({ lockedAt: new Date(Date.now() + 3_600_000).toISOString() })),
    amendments: jest.fn(async () => []),
    parentSnapshot: jest.fn(async () => snapshot),
  },
};

jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

beforeEach(() => jest.clearAllMocks());

describe('SessionDetailScreen', () => {
  it('shows staff the full log with an Edit action inside the window', async () => {
    signInTherapist();
    await renderScreen(<SessionDetailScreen id="session-1" />);
    expect(await screen.findByTestId('session-detail-staff')).toBeTruthy();
    expect(await screen.findByText('SOAP notes')).toBeTruthy();
    expect(screen.getByText('Continue g1')).toBeTruthy();
    expect(screen.getByTestId('session-edit')).toBeTruthy();
  });

  it('shows parents words and arrows, never internal notes or the score by default', async () => {
    useSession.setState({
      user: {
        ...therapistUser,
        memberships: [{ id: 'm-p', userId: 'parent-1', organizationId: 'org-1', role: 'parent', status: 'active' }],
      },
      activeMembershipId: 'm-p',
    });
    await renderScreen(<SessionDetailScreen id="session-1" />);
    expect(await screen.findByText('A better session than last time')).toBeTruthy();
    expect(screen.getByText('with Ms. Priya Nair (covering today)')).toBeTruthy();
    expect(screen.getByText('Asks for help with two words')).toBeTruthy();
    expect(screen.queryByText('SOAP notes')).toBeNull();
    expect(screen.queryByText(/Session score/)).toBeNull();
    expect(mockRepo.sessions.get).not.toHaveBeenCalled();
  });
});
