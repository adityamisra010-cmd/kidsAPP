import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Repository } from '@/data/repository';
import type { Alert } from '@/domain/types';
import { makeRepo, renderWithProviders, signInAs } from '@/features/home/testing';

import { AlertsScreen } from '../AlertsScreen';

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));

const alert = (id: string, status: Alert['status'], kind: Alert['kind'] = 'score_drop'): Alert => ({
  id,
  organizationId: 'org-1',
  childId: 'child-meera',
  childName: 'Meera Joshi',
  kind,
  payload: {},
  message: 'Session Score 18 points below her 4-session average',
  status,
  createdAt: new Date().toISOString(),
});

describe('AlertsScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    signInAs('coordinator', { name: 'Kavya Iyer' });
  });

  it('lists open alerts with kind word and acts on them', async () => {
    const store: Alert[] = [alert('a1', 'open'), alert('a2', 'acknowledged', 'incident_spike')];
    const acknowledge = jest.fn(async (id: string) => {
      store.find((a) => a.id === id)!.status = 'acknowledged';
    });
    mockRepo = makeRepo({
      alerts: { list: async (f) => store.filter((a) => !f?.status || f.status.includes(a.status)), acknowledge, resolve: async () => undefined },
    });
    await renderWithProviders(<AlertsScreen />);
    expect(screen.getByText('Score drop')).toBeTruthy();
    expect(screen.queryByText('More incidents')).toBeNull();

    await fireEvent.press(screen.getByTestId('child-a1'));
    expect(mockPush).toHaveBeenCalledWith('/child/child-meera');

    await fireEvent.press(screen.getByTestId('ack-a1'));
    expect(acknowledge).toHaveBeenCalledWith('a1');
    await waitFor(() => expect(screen.getByText('No open alerts')).toBeTruthy());

    await fireEvent.press(screen.getByRole('tab', { name: 'Acknowledged' }));
    expect(await screen.findByText('More incidents')).toBeTruthy();
    expect(screen.queryByTestId('ack-a2')).toBeNull();
    expect(screen.getByTestId('resolve-a2')).toBeTruthy();
  });
});
