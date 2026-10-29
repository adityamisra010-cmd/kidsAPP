import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useOutboxStore } from '@/data/outbox';
import type { SessionInput } from '@/domain/types';

import { renderScreen, signInTherapist } from '../__fixtures__/render';
import { appointment, dims, goal, summary, therapistUser } from '../__fixtures__/session';
import { SessionLoggerScreen } from '../screens/SessionLoggerScreen';

const mockRepo = {
  org: {
    get: jest.fn(async () => therapistUser.organizations[0]),
    listRatingDimensions: jest.fn(async () => dims),
  },
  appointments: { get: jest.fn(async () => appointment()) },
  goals: {
    listForChild: jest.fn(async () => [goal('g1'), goal('g2', { status: 'paused' })]),
    progress: jest.fn(async () => []),
  },
  sessions: {
    listForChild: jest.fn(async () => [summary('s0', '2026-10-27', 50, 3)]),
    previous: jest.fn(async () => summary('s0', '2026-10-27', 50, 3)),
    get: jest.fn(async () => ({ id: 's0', therapistName: 'Ms. Priya Nair', notes: { planNext: 'Continue g1', planGoalIds: ['g1'] } })),
    save: jest.fn(),
  },
  checkins: { forAppointment: jest.fn(async () => null) },
};

jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

function queuedSessions(): SessionInput[] {
  return useOutboxStore
    .getState()
    .items.filter((i) => i.kind === 'session.save')
    .map((i) => i.payload as SessionInput);
}

beforeEach(() => {
  signInTherapist();
  useOutboxStore.setState({ items: [] });
});

describe('SessionLoggerScreen', () => {
  it('shows what is missing instead of saving an incomplete log', async () => {
    await renderScreen(<SessionLoggerScreen appointmentId="appt-1" />);
    await fireEvent.press(await screen.findByTestId('save-session'));
    expect(await screen.findByTestId('missing-banner')).toBeTruthy();
    expect(screen.getByText(/10 things left\. First: rate Engagement/)).toBeTruthy();
    expect(screen.getAllByText('Please rate this').length).toBe(8);
    expect(queuedSessions()).toHaveLength(0);
  });

  it('rates every dimension, saves through the outbox and shows the result', async () => {
    await renderScreen(<SessionLoggerScreen appointmentId="appt-1" />);
    await screen.findByTestId('session-logger');
    expect(screen.getByTestId('progress-pill')).toHaveTextContent('0 of 8 rated');

    // The planned goal from the previous session is pre-added (counts start at zero).
    await screen.findByTestId('goal-trial-g1');
    await fireEvent.press(screen.getByTestId('quick-tries-g1-10'));
    await fireEvent.press(screen.getByText('7'));

    for (const d of dims) await fireEvent.press(screen.getByTestId(`rate-${d.key}-4`));
    await fireEvent.press(screen.getByTestId('regulation-state-regulated'));
    expect(screen.getByTestId('progress-pill')).toHaveTextContent('All 8 rated');

    // The anchor of the selected value is shown under the row.
    expect(screen.getByText('Participated well with occasional redirection')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('plan-field'), 'Keep two-word requests; use bubbles.');
    await fireEvent.press(screen.getByTestId('save-session'));

    await screen.findByTestId('session-saved');
    const [input] = queuedSessions();
    expect(input.appointmentId).toBe('appt-1');
    expect(Object.values(input.ratings)).toEqual(Array(8).fill(4));
    expect(input.regulationState).toBe('regulated');
    expect(input.goalTrials).toEqual([{ goalId: 'g1', attempted: 10, successful: 7, promptLevel: 4 }]);
    expect(input.notes.planNext).toBe('Keep two-word requests; use bubbles.');
    expect(input.notes.objective).toContain('Snapshot: Engagement 4/5');
    expect(input.notes.parentSummary.startsWith('Aarav Sharma had')).toBe(true);
    expect(input.comparedToLast).toBe('same');

    // Instant offline metrics: all 4s → 75, previous session 50 → +25.
    expect(screen.getByTestId('saved-score')).toHaveTextContent('75');
    expect(screen.getByText('+25')).toBeTruthy();
    expect(screen.getByText('Saved on this phone, syncing')).toBeTruthy();
  });

  it('asks for the handover brief first when it must be acknowledged', async () => {
    mockRepo.appointments.get.mockResolvedValueOnce(appointment({ briefRequired: true, briefAcknowledged: false, isSubstitute: true }));
    await renderScreen(<SessionLoggerScreen appointmentId="appt-1" />);
    expect(await screen.findByTestId('brief-gate')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('session-logger')).toBeNull());
  });
});
