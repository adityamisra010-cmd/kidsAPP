import { fireEvent, screen, within } from '@testing-library/react-native';

import type { Repository } from '@/data/repository';
import type { AdminDashboard } from '@/domain/types';
import { makeAppointment, makeRepo, renderWithProviders, signInAs } from '@/features/home/testing';

import { AdminDashboardScreen } from '../AdminDashboardScreen';

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));

const dashboard: AdminDashboard = {
  date: '2026-10-29',
  today: { scheduled: 24, completed: 9, logged: 7, unlogged: 2, cancelled: 1 },
  week: {
    attendanceRate: 91.4,
    homePracticeRate: 64,
    loggingCompliance: [
      { therapistId: 't1', name: 'Ms. Riya Menon', logged: 12, due: 14, percent: 85.7 },
      { therapistId: 't2', name: 'Mr. Arjun Nair', logged: 5, due: 10, percent: 50 },
    ],
  },
  childrenNeedingAttention: [
    {
      child: { id: 'c1', organizationId: 'org-1', fullName: 'Meera Joshi', dob: '2018-01-01', status: 'active', createdAt: '2026-01-01' },
      reason: 'Focus dropped 18 points below her usual',
      alertId: 'al1',
      trend: 'down',
    },
  ],
  unloggedSessions: [makeAppointment({ id: 'u1', startsAt: '2026-10-29T10:00:00+05:30', therapistName: 'Mr. Arjun Nair', childName: 'Kabir Shah' })],
  upcomingSubstitutions: [],
  needsSubstitute: [makeAppointment({ id: 'n1', startsAt: '2026-10-30T11:00:00+05:30', childName: 'Zoya Khan' })],
  pendingReschedules: [],
  workload: [
    { therapistId: 't1', name: 'Ms. Riya Menon', sessionsThisWeek: 18 },
    { therapistId: 't2', name: 'Mr. Arjun Nair', sessionsThisWeek: 11 },
  ],
};

beforeEach(() => {
  mockPush.mockClear();
  signInAs('coordinator', { name: 'Kavya Iyer' });
  mockRepo = makeRepo({
    dashboards: { admin: async () => dashboard },
    alerts: { list: async () => [{ id: 'al1' } as never, { id: 'al2' } as never] },
    notifications: { unreadCount: async () => 1 },
    messaging: { unreadCount: async () => 0 },
  });
});

describe('AdminDashboardScreen', () => {
  it('shows the school, today numbers, action items and weekly rates', async () => {
    await renderWithProviders(<AdminDashboardScreen />);
    expect(screen.getByText('Anvaya Child Development Centre')).toBeTruthy();
    expect(screen.getByText('2 things need you today')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alerts, 2' })).toBeTruthy();
    expect(within(screen.getByTestId('tile-scheduled')).getByText('24')).toBeTruthy();
    expect(within(screen.getByTestId('tile-unlogged')).getByText('Not logged')).toBeTruthy();
    expect(screen.getByText('Focus dropped 18 points below her usual')).toBeTruthy();
    expect(screen.getByText('91%')).toBeTruthy();
    expect(screen.getByText('64%')).toBeTruthy();
    expect(screen.getByText('5 of 10 logged')).toBeTruthy();
    expect(screen.getByText('18 sessions')).toBeTruthy();
    expect(screen.getByText('Needs cover')).toBeTruthy();
    expect(screen.getByText('No pending requests')).toBeTruthy();
  });

  it('lists the lowest logging compliance first', async () => {
    await renderWithProviders(<AdminDashboardScreen />);
    const week = screen.getByTestId('dash-week');
    const rows = within(week).getAllByText(/ of \d+ logged$/).map((n) => n.props.children);
    expect(rows).toEqual(['5 of 10 logged', '12 of 14 logged']);
  });

  it('reminds a therapist about an unlogged session', async () => {
    await renderWithProviders(<AdminDashboardScreen />);
    await fireEvent.press(screen.getByTestId('remind-u1'));
    expect(screen.getByText('Reminded')).toBeTruthy();
  });

  it('opens a child and the alerts list', async () => {
    await renderWithProviders(<AdminDashboardScreen />);
    await fireEvent.press(screen.getByTestId('attention-c1'));
    expect(mockPush).toHaveBeenCalledWith('/child/c1');
    await fireEvent.press(screen.getByTestId('alerts-button'));
    expect(mockPush).toHaveBeenCalledWith('/alerts');
  });
});
