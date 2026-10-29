import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { RepoError } from '@/data/repository';

import { renderScreen, signInTherapist } from '../__fixtures__/render';
import { brief, dims, therapistUser } from '../__fixtures__/session';
import { HandoverBriefScreen } from '../screens/HandoverBriefScreen';

const mockRepo = {
  org: {
    get: jest.fn(async () => therapistUser.organizations[0]),
    listRatingDimensions: jest.fn(async () => dims),
  },
  sessions: { brief: jest.fn(async () => brief()) },
  children: { get: jest.fn(async () => Promise.reject(new RepoError('forbidden'))) },
  appointments: { acknowledgeBrief: jest.fn(async () => undefined) },
};

jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

beforeEach(() => {
  signInTherapist();
  jest.clearAllMocks();
});

describe('HandoverBriefScreen', () => {
  it('shows the essentials on one screen', async () => {
    await renderScreen(<HandoverBriefScreen appointmentId="appt-1" />);
    expect(await screen.findByText('Aarav')).toBeTruthy();
    expect(screen.getByText('Plan for this session')).toBeTruthy();
    expect(screen.getByText('Work on two-word requests with bubbles.')).toBeTruthy();
    expect(screen.getByText('Give a 2-minute warning before transitions')).toBeTruthy();
    expect(screen.getByText('Bubbles')).toBeTruthy();
    expect(screen.getByText('Loud sounds')).toBeTruthy();
    expect(screen.getByText('Visual schedule')).toBeTruthy();
    // Custom chips are shown as typed.
    expect(screen.getByText('Bubbles break')).toBeTruthy();
    expect(screen.getByText('Last time 70% · Verbal')).toBeTruthy();
    // Substitutes (brief-only access) never get the full profile link.
    expect(screen.queryByText('Open full profile')).toBeNull();
  });

  it('keeps logging disabled until the therapist confirms they have read it', async () => {
    await renderScreen(<HandoverBriefScreen appointmentId="appt-1" />);
    const log = await screen.findByTestId('brief-log');
    expect(log).toBeDisabled();

    await fireEvent.press(screen.getByTestId('brief-ack'));
    await waitFor(() => expect(mockRepo.appointments.acknowledgeBrief).toHaveBeenCalledWith('appt-1'));
    await waitFor(() => expect(screen.getByTestId('brief-log')).toBeEnabled());
    expect(screen.queryByTestId('brief-ack')).toBeNull();

    await fireEvent.press(screen.getByTestId('brief-log'));
    expect(router.push).toHaveBeenCalledWith('/session/log/appt-1');
  });

  it('goes straight to logging when no acknowledgement is needed', async () => {
    mockRepo.sessions.brief.mockResolvedValueOnce(brief({ mustAcknowledge: false }));
    await renderScreen(<HandoverBriefScreen appointmentId="appt-1" />);
    expect(await screen.findByTestId('brief-log')).toBeEnabled();
    expect(screen.queryByTestId('brief-ack')).toBeNull();
  });
});
