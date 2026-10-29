import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ParentChildScreen } from '../screens/ParentChildScreen';
import { CHILD_SUMMARY, childDetail, GOALS, PARENT_PROGRESS, renderWithApp, resetApp, signIn, SNAPSHOT, THERAPY_TYPES } from '../testing/fixtures';

const mockRepo = {
  children: { get: jest.fn(), list: jest.fn() },
  sessions: { parentSnapshots: jest.fn() },
  goals: { listForChild: jest.fn(), wins: jest.fn() },
  org: { listTherapyTypes: jest.fn() },
  progress: { parent: jest.fn() },
};

jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePreventRemove: jest.fn(),
}));

afterEach(resetApp);

beforeEach(() => {
  signIn('parent');
  mockRepo.children.get.mockResolvedValue(childDetail('parent'));
  mockRepo.children.list.mockResolvedValue([CHILD_SUMMARY]);
  mockRepo.sessions.parentSnapshots.mockResolvedValue([SNAPSHOT]);
  mockRepo.goals.listForChild.mockResolvedValue(GOALS);
  mockRepo.goals.wins.mockResolvedValue([]);
  mockRepo.org.listTherapyTypes.mockResolvedValue(THERAPY_TYPES);
  mockRepo.progress.parent.mockResolvedValue(PARENT_PROGRESS);
});

describe('Parent "My Child"', () => {
  it('shows the child, their sessions and parent-friendly goals', async () => {
    await renderWithApp(<ParentChildScreen />);

    expect(await screen.findByText('Aarav')).toBeTruthy();
    expect(await screen.findByText('Aarav asked for bubbles using two words today.')).toBeTruthy();

    fireEvent.press(screen.getByRole('tab', { name: 'Goals' }));
    expect(await screen.findByText('Asks for things using two words')).toBeTruthy();
    expect(screen.getByText('Getting there')).toBeTruthy();
    expect(screen.getByText('Working on it')).toBeTruthy();
    // Staff wording and numbers never reach parents.
    expect(screen.queryByText('Requests items using 2-word phrases in 4/5 trials')).toBeNull();
    expect(screen.queryByText(/85%/)).toBeNull();
  });

  it('shows a warm empty state for wins', async () => {
    await renderWithApp(<ParentChildScreen />);
    fireEvent.press(await screen.findByRole('tab', { name: 'Wins' }));
    expect(await screen.findByText('Wins will appear here as goals are achieved.')).toBeTruthy();
  });

  it('shows progress in words, counts and home-practice percent only', async () => {
    await renderWithApp(<ParentChildScreen />);
    fireEvent.press(await screen.findByRole('tab', { name: 'Progress' }));

    expect(await screen.findByText('8 of 9 sessions attended')).toBeTruthy();
    expect(screen.getByText('Getting better')).toBeTruthy();
    expect(screen.getByText('1 achieved · 2 in progress')).toBeTruthy();
    expect(screen.getByText('72% of home practice done')).toBeTruthy();
    expect(screen.getByText('1 session was cancelled by the school')).toBeTruthy();
    expect(mockRepo.progress.parent).toHaveBeenCalledWith('c1', 'month');

    fireEvent.press(screen.getByRole('tab', { name: 'Quarterly' }));
    await waitFor(() => expect(mockRepo.progress.parent).toHaveBeenLastCalledWith('c1', 'quarter'));
  });

  it('shows About Me without clinical details', async () => {
    await renderWithApp(<ParentChildScreen />);
    fireEvent.press(await screen.findByRole('tab', { name: 'About' }));
    expect(await screen.findByText('How Aarav communicates')).toBeTruthy();
    expect(screen.getByText('Quiet corner with his blue blanket')).toBeTruthy();
    expect(screen.queryByText('Clinical details')).toBeNull();
    expect(screen.getByRole('button', { name: 'Suggest a change' })).toBeTruthy();
  });
});
