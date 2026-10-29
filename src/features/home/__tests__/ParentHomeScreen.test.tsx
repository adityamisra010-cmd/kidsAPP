import { fireEvent, screen } from '@testing-library/react-native';

import type { Repository } from '@/data/repository';
import type { ChildSummary, ParentSessionSnapshot } from '@/domain/types';

import { ParentHomeScreen } from '../ParentHomeScreen';
import { makeAppointment, makeRepo, renderWithProviders, signInAs } from '../testing';

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));

const aarav: ChildSummary = {
  child: { id: 'child-aarav', organizationId: 'org-1', fullName: 'Aarav Mehta', preferredName: 'Aarav', dob: '2019-04-02', status: 'active', createdAt: '2026-01-01' },
  therapists: [],
  guardians: [],
  openAlerts: 0,
};

const snapshot: ParentSessionSnapshot = {
  sessionId: 's1',
  date: '2026-10-28',
  therapyTypeName: 'Speech Therapy',
  therapyTypeColor: '#C66B4E',
  therapistName: 'Ms. Riya Menon',
  isSubstitute: false,
  highlights: [{ key: 'attention', label: 'Focus', icon: 'target', value: 4, change: 'better' }],
  overall: 'better',
  parentSummary: 'Aarav named five animals with picture cards today.',
  goalsWorkedOn: [],
};

const next = makeAppointment({ id: 'a1', startsAt: '2026-11-02T10:00:00+05:30', therapistName: 'Ms. Riya Menon' });

function repoWith(over: { upcoming?: unknown[]; snapshots?: unknown[]; expected?: number } = {}) {
  return makeRepo({
    children: { list: async () => [aarav] },
    checkins: { pendingForToday: async () => [makeAppointment({ id: 'today-1', startsAt: new Date().toISOString(), childName: 'Aarav Mehta' })] },
    appointments: { upcoming: async () => (over.upcoming ?? [next]) as never },
    sessions: { parentSnapshots: async () => (over.snapshots ?? [snapshot]) as never },
    homePractice: {
      weeklyCompletion: async () => ({ childId: 'child-aarav', weekStart: '2026-10-26', expected: over.expected ?? 5, done: 2, partly: 1, percent: 40 }),
    },
    messaging: {
      unreadCount: async () => 2,
      listAnnouncements: async () => [
        {
          id: 'n1',
          organizationId: 'org-1',
          title: 'Diwali break: 1–5 Nov',
          body: 'The centre is closed for Diwali.',
          audience: 'everyone',
          urgent: false,
          createdBy: 'u',
          createdByName: 'Ms. Kavya',
          createdAt: new Date().toISOString(),
        },
      ],
    },
    notifications: { unreadCount: async () => 3 },
  });
}

beforeEach(() => {
  mockPush.mockClear();
  signInAs('parent', { name: 'Priya Sharma', childIds: ['child-aarav'] });
});

describe('ParentHomeScreen', () => {
  it('shows greeting, next session, latest session, practice, announcement and quick links', async () => {
    mockRepo = repoWith();
    await renderWithProviders(<ParentHomeScreen />);

    expect(screen.getByText(/Priya$/)).toBeTruthy();
    expect(screen.getByText('Anvaya Child Development Centre')).toBeTruthy();
    expect(await screen.findByText("Aarav's next session")).toBeTruthy();
    expect(await screen.findByText('Aarav named five animals with picture cards today.')).toBeTruthy();
    expect(await screen.findByText('Diwali break: 1–5 Nov')).toBeTruthy();
    expect(await screen.findByTestId('checkin-prompt')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Updates, 3' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Messages, 2' })).toBeTruthy();
    // No raw score anywhere for parents.
    expect(screen.queryByText(/\/ ?100/)).toBeNull();
  });

  it('navigates within one tap', async () => {
    mockRepo = repoWith();
    await renderWithProviders(<ParentHomeScreen />);
    await fireEvent.press(await screen.findByText('See calendar'));
    expect(mockPush).toHaveBeenCalledWith('/parent/calendar');
    await fireEvent.press(screen.getByRole('button', { name: 'Updates, 3' }));
    expect(mockPush).toHaveBeenCalledWith('/notifications');
    await fireEvent.press(screen.getByTestId('quick-contact'));
    expect(mockPush).toHaveBeenCalledWith('/account/contact');
  });

  it('shows calm empty states', async () => {
    mockRepo = repoWith({ upcoming: [], snapshots: [], expected: 0 });
    await renderWithProviders(<ParentHomeScreen />);
    expect(await screen.findByText('No sessions booked yet')).toBeTruthy();
    expect(await screen.findByText('No session notes yet')).toBeTruthy();
    expect(await screen.findByText('No practice set this week')).toBeTruthy();
  });

  it('asks the school to link a child when none is linked', async () => {
    signInAs('parent', { name: 'Priya Sharma', childIds: [] });
    mockRepo = repoWith();
    await renderWithProviders(<ParentHomeScreen />);
    expect(screen.getByText('No child linked yet')).toBeTruthy();
  });
});
