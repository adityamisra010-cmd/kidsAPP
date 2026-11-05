import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { UpcomingAppointmentCard } from '@/components/cards/UpcomingAppointmentCard';
import type { Repository } from '@/data/repository';
import { initI18n } from '@/i18n';

import { AppointmentDetailScreen } from '../screens/AppointmentDetailScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { appointment, fakeRepo, fromNow, member, signInAs, Wrapper } from '../testing/fixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default);

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));

initI18n('en');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CalendarScreen', () => {
  it('shows today’s sessions for a parent and groups them in the List view', async () => {
    signInAs('parent');
    const list = jest.fn(async () => [
      appointment({ id: 'a1', startsAt: fromNow(1) }),
      appointment({ id: 'a2', startsAt: fromNow(26), therapistName: 'Mr. Arjun Mehta', displayStatus: 'substitute', isSubstitute: true, originalTherapistName: 'Ms. Riya Kapoor' }),
    ]);
    mockRepo = fakeRepo({ appointments: { list } });
    await render(
      <Wrapper>
        <CalendarScreen />
      </Wrapper>,
    );

    // Month view: today's agenda lists the session with the therapist (parent perspective).
    expect(await screen.findByTestId('agenda-row-a1')).toBeTruthy();
    expect(screen.getByTestId('month-view')).toBeTruthy();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ includeCancelled: true }));

    await fireEvent.press(screen.getByRole('tab', { name: 'List' }));
    expect(await screen.findByTestId('list-view')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('agenda-row-a2')).toBeTruthy());
    expect(screen.getByText('Taking over from Ms. Riya Kapoor')).toBeTruthy();
    expect(screen.getByText(/^Today/)).toBeTruthy();
  });

  it('gives coordinators quick links with counts and a New schedule button', async () => {
    signInAs('coordinator');
    mockRepo = fakeRepo({
      appointments: {
        list: async () => [],
        needingSubstitute: async () => [appointment({ id: 'n1' }), appointment({ id: 'n2' })],
        listRescheduleRequests: async () => [],
      },
    });
    await render(
      <Wrapper>
        <CalendarScreen />
      </Wrapper>,
    );
    expect(await screen.findByText('2 sessions need cover')).toBeTruthy();
    expect(screen.getByText('All clear')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('new-schedule'));
    expect(router.push).toHaveBeenCalledWith('/appointment/new');
  });
});

describe('AppointmentDetailScreen', () => {
  it('offers parents check-in, a change request and cancellation', async () => {
    signInAs('parent');
    const a = appointment({ startsAt: fromNow(0.5) });
    mockRepo = fakeRepo({ appointments: { get: async () => a } });
    await render(
      <Wrapper>
        <AppointmentDetailScreen id={a.id} />
      </Wrapper>,
    );
    expect(await screen.findByTestId('appointment-header')).toBeTruthy();
    // Check-in is the main action on the day; the others are listed below.
    const today = new Date(a.startsAt).getDate() === new Date().getDate();
    if (today) expect(screen.getByTestId('action-checkin')).toBeTruthy();
    expect(screen.getByTestId('action-request_change')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('action-request_change'));
    expect(router.push).toHaveBeenCalledWith(`/reschedule/${a.id}`);

    await fireEvent.press(screen.getByTestId('action-cant_make_it'));
    expect(await screen.findByTestId('cancel-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cancel-submit'));
    expect(await screen.findByText('Please choose a reason.')).toBeTruthy();
  });

  it('asks a substitute to read the brief before logging', async () => {
    signInAs('therapist');
    const a = appointment({ startsAt: fromNow(-0.25), briefRequired: true, isSubstitute: true, originalTherapistName: 'Ms. Kavya Iyer' });
    mockRepo = fakeRepo({ appointments: { get: async () => a } });
    await render(
      <Wrapper>
        <AppointmentDetailScreen id={a.id} />
      </Wrapper>,
    );
    expect(await screen.findByTestId('brief-first')).toBeTruthy();
    expect(screen.getByText('Taking over from Ms. Kavya Iyer')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('action-open_brief'));
    expect(router.push).toHaveBeenCalledWith(`/brief/${a.id}`);
    // The log row is shown but not pressable until the brief is acknowledged.
    await fireEvent.press(screen.getByTestId('action-log_session'));
    expect(router.push).not.toHaveBeenCalledWith(`/session/log/${a.id}`);
  });

  it('lets a coordinator assign a free, qualified substitute', async () => {
    signInAs('coordinator');
    const a = appointment({ startsAt: fromNow(24) });
    const assignSubstitute = jest.fn(async () => undefined);
    mockRepo = fakeRepo({
      appointments: {
        get: async () => a,
        substituteCandidates: async () => [{ ...member('ther2', 'Mr. Arjun Mehta', ['tt-speech']), freeAtTime: true, knowsChild: true }],
        assignSubstitute,
      },
    });
    await render(
      <Wrapper>
        <AppointmentDetailScreen id={a.id} />
      </Wrapper>,
    );
    await fireEvent.press(await screen.findByTestId('action-assign_substitute'));
    expect(await screen.findByText('Free at this time')).toBeTruthy();
    expect(screen.getByText('Knows this child')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('assign-ther2'));
    await waitFor(() => expect(assignSubstitute).toHaveBeenCalledWith(a.id, 'ther2'));
    expect(await screen.findByText('Mr. Arjun Mehta will take this session. The parent and Mr. Arjun Mehta have been notified.')).toBeTruthy();
  });
});

describe('UpcomingAppointmentCard', () => {
  it('shows the child, therapist, substitute note and a subtle start hint', async () => {
    const a = appointment({ startsAt: fromNow(0.5), displayStatus: 'substitute', isSubstitute: true, originalTherapistName: 'Ms. Kavya Iyer' });
    await render(
      <Wrapper>
        <UpcomingAppointmentCard appointment={a} />
      </Wrapper>,
    );
    expect(screen.getByText('Aarav Sharma')).toBeTruthy();
    expect(screen.getByText('Ms. Riya Kapoor')).toBeTruthy();
    expect(screen.getByText('Taking over from Ms. Kavya Iyer')).toBeTruthy();
    expect(screen.getByText('Substitute')).toBeTruthy();
    const sameDay = new Date(a.startsAt).getDate() === new Date().getDate();
    if (sameDay) expect(screen.getByText(/Starts in \d+ min/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`upcoming-${a.id}`));
    expect(router.push).toHaveBeenCalledWith(`/appointment/${a.id}`);
  });
});
