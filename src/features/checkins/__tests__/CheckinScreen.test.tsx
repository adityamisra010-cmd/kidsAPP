import { fireEvent, screen } from '@testing-library/react-native';

import { useOutboxStore } from '@/data/outbox';
import type { Repository } from '@/data/repository';
import type { CheckinInput } from '@/domain/types';
import { CHECKIN_KIND } from '@/features/practice/outboxLogic';
import { renderWithProviders, signInAs } from '@/features/practice/testing';

import { CheckinScreen } from '../CheckinScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
jest.mock('react-native-compressor', () => ({ Video: { compress: jest.fn() } }));

const mockRepo = {
  appointments: {
    get: jest.fn(async () => ({
      id: 'a1',
      childId: 'c1',
      childName: 'Aarav Sharma',
      therapistName: 'Ms. Riya',
      therapyTypeName: 'Speech Therapy',
      startsAt: new Date(2026, 9, 29, 10, 30).toISOString(),
      endsAt: new Date(2026, 9, 29, 11, 15).toISOString(),
    })),
  },
  checkins: { forAppointment: jest.fn(async () => null) },
} as unknown as Repository;

jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));

beforeEach(() => signInAs('parent'));

describe('CheckinScreen', () => {
  it('takes four taps (plus a note) and queues the check-in', async () => {
    await renderWithProviders(<CheckinScreen appointmentId="a1" />);
    expect(await screen.findByText('Four quick taps help Ms. Riya plan Aarav\'s session today.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('checkin-submit'));
    expect(screen.getByText('Please answer all four questions.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('sleep-poor'));
    await fireEvent.press(screen.getByTestId('breakfast-yes'));
    await fireEvent.press(screen.getByTestId('mood-okay'));
    await fireEvent.press(screen.getByTestId('change-yes'));
    await fireEvent.changeText(screen.getByTestId('checkin-note'), 'Woke up at 4 am');
    expect(screen.getByText('4 of 4 answered')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('checkin-submit'));

    expect(await screen.findByText('Thanks — Ms. Riya will see this before the session.')).toBeTruthy();
    const item = useOutboxStore.getState().items.find((i) => i.kind === CHECKIN_KIND);
    expect(item?.payload as CheckinInput).toMatchObject({
      childId: 'c1',
      appointmentId: 'a1',
      date: '2026-10-29',
      sleep: 'poor',
      ateBreakfast: true,
      mood: 'okay',
      changeFlag: true,
      changeNote: 'Woke up at 4 am',
    });
  });
});
