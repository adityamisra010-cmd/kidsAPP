import { fireEvent, screen } from '@testing-library/react-native';

import type { Repository } from '@/data/repository';
import type { TherapistToday } from '@/domain/types';
import { makeAppointment, makeRepo, renderWithProviders, signInAs } from '@/features/home/testing';

import { TherapistTodayScreen } from '../TherapistTodayScreen';

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));

const at = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString();

function today(over: Partial<TherapistToday> = {}): TherapistToday {
  return {
    date: new Date().toISOString().slice(0, 10),
    pendingReviews: 4,
    unreadMessages: 2,
    unloggedCount: 1,
    appointments: [
      makeAppointment({ id: 'done', startsAt: at(-180), endsAt: at(-135), logState: 'logged', sessionId: 'sess-1', childName: 'Ishaan Rao' }),
      makeAppointment({ id: 'missed', startsAt: at(-120), endsAt: at(-75), logState: 'not_logged', childName: 'Meera Joshi' }),
      makeAppointment({ id: 'now', startsAt: at(-10), endsAt: at(35), logState: 'in_progress', childName: 'Aarav Mehta', hasCheckin: true }),
      makeAppointment({
        id: 'sub',
        startsAt: at(60),
        endsAt: at(105),
        childName: 'Zoya Khan',
        isSubstitute: true,
        originalTherapistName: 'Mr. Arjun Nair',
        briefRequired: true,
        briefAcknowledged: false,
      }),
    ],
    ...over,
  };
}

function setup(data: TherapistToday) {
  mockRepo = makeRepo({
    dashboards: { therapistToday: async () => data },
    sessions: { unlogged: async () => [makeAppointment({ id: 'older', startsAt: at(-48 * 60), childName: 'Kabir Shah', logState: 'not_logged' })] },
    notifications: { unreadCount: async () => 0 },
    messaging: { unreadCount: async () => 2 },
  });
}

beforeEach(() => {
  mockPush.mockClear();
  signInAs('therapist', { name: 'Ms. Riya Menon' });
});

describe('TherapistTodayScreen', () => {
  it('shows counters and the agenda in time order with status words', async () => {
    setup(today());
    await renderWithProviders(<TherapistTodayScreen />);
    expect(screen.getByText(/Riya$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '4 Reviews waiting' })).toBeTruthy();
    expect(screen.getByText('1 of 4 sessions logged today')).toBeTruthy();

    const names = screen.getAllByText(/Ishaan Rao|Meera Joshi|Aarav Mehta|Zoya Khan/).map((n) => n.props.children);
    expect(names).toEqual(['Ishaan Rao', 'Meera Joshi', 'Aarav Mehta', 'Zoya Khan']);
    expect(screen.getByText('Logged')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByTestId('focus-now')).toBeTruthy();
    expect(screen.getByTestId('focus-sub')).toBeTruthy();
    expect(screen.getByText('Check-in received')).toBeTruthy();
  });

  it('blocks logging for a substitute until the brief is read', async () => {
    setup(today());
    await renderWithProviders(<TherapistTodayScreen />);
    expect(screen.getByText('Substitute')).toBeTruthy();
    expect(screen.getByText('Brief required')).toBeTruthy();
    expect(screen.getByText('Covering for Mr. Arjun Nair')).toBeTruthy();
    expect(screen.getByText('Read the brief first')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('log-sub'));
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('brief-sub'));
    expect(mockPush).toHaveBeenCalledWith('/brief/sub');
  });

  it('opens the log or the saved log', async () => {
    setup(today());
    await renderWithProviders(<TherapistTodayScreen />);
    await fireEvent.press(screen.getByTestId('log-now'));
    expect(mockPush).toHaveBeenCalledWith('/session/log/now');
    await fireEvent.press(screen.getByTestId('view-done'));
    expect(mockPush).toHaveBeenCalledWith('/session/sess-1');
  });

  it('filters to sessions still to log, including earlier days', async () => {
    setup(today());
    await renderWithProviders(<TherapistTodayScreen />);
    await fireEvent.press(screen.getByTestId('tile-unlogged'));
    expect(await screen.findByText('Kabir Shah')).toBeTruthy();
    expect(screen.getByText('Meera Joshi')).toBeTruthy();
    expect(screen.queryByText('Aarav Mehta')).toBeNull();
    expect(screen.getByText('Showing sessions still to log')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('show-all'));
    expect(screen.getByText('Aarav Mehta')).toBeTruthy();
  });

  it('shows a calm empty day', async () => {
    setup(today({ appointments: [], unloggedCount: 0, pendingReviews: 0, unreadMessages: 0 }));
    await renderWithProviders(<TherapistTodayScreen />);
    expect(screen.getByText('No sessions today')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open calendar'));
    expect(mockPush).toHaveBeenCalledWith('/therapist/calendar');
  });
});
