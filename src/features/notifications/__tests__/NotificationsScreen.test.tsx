import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Repository } from '@/data/repository';
import type { AppNotification } from '@/domain/types';
import { makeRepo, renderWithProviders, signInAs } from '@/features/home/testing';

import { NotificationsScreen } from '../NotificationsScreen';

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));

const list: AppNotification[] = [
  {
    id: 'n1',
    userId: 'u',
    kind: 'session_summary',
    title: "Aarav's speech session summary",
    body: 'Ms. Riya shared how today went.',
    route: '/session/s1',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    userId: 'u',
    kind: 'appointment_changed',
    title: 'Friday session moved to 11:00 AM',
    body: 'The school changed the time.',
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    readAt: new Date().toISOString(),
  },
];

describe('NotificationsScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    signInAs('parent', { childIds: ['c1'] });
  });

  it('groups Today / Earlier, opens the route and marks it read', async () => {
    const markRead = jest.fn(async () => undefined);
    mockRepo = makeRepo({ notifications: { list: async () => list, markRead, unreadCount: async () => 1 } });
    await renderWithProviders(<NotificationsScreen />);
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
    expect(screen.getByText('1 unread')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Unread\. Aarav's speech session summary/ })).toBeTruthy();

    await fireEvent.press(screen.getByTestId('notification-n1'));
    expect(markRead).toHaveBeenCalledWith('n1');
    expect(mockPush).toHaveBeenCalledWith('/session/s1');
    await waitFor(() => expect(screen.queryByTestId('mark-all')).toBeNull());
  });

  it('marks all as read', async () => {
    const markRead = jest.fn(async () => undefined);
    mockRepo = makeRepo({ notifications: { list: async () => list, markRead, unreadCount: async () => 1 } });
    await renderWithProviders(<NotificationsScreen />);
    await fireEvent.press(screen.getByTestId('mark-all'));
    expect(markRead).toHaveBeenCalledWith('all');
  });

  it('shows a calm empty state', async () => {
    mockRepo = makeRepo({ notifications: { list: async () => [], unreadCount: async () => 0 } });
    await renderWithProviders(<NotificationsScreen />);
    expect(screen.getByText("You're all caught up")).toBeTruthy();
  });
});
