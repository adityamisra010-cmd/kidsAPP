import { act, fireEvent, screen } from '@testing-library/react-native';

import { RepoError } from '@/data/repository';

import { ChildWorkspaceScreen } from '../screens/ChildWorkspaceScreen';
import { childDetail, GOALS, renderWithApp, resetApp, signIn, THERAPY_TYPES } from '../testing/fixtures';

const mockRepo = {
  children: { get: jest.fn(), list: jest.fn(), profileHistory: jest.fn() },
  goals: { listForChild: jest.fn(), setStatus: jest.fn() },
  org: { listTherapyTypes: jest.fn() },
};

jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePreventRemove: jest.fn(),
}));

afterEach(resetApp);

beforeEach(() => {
  jest.clearAllMocks();
  signIn('therapist');
  mockRepo.children.get.mockResolvedValue(childDetail('full'));
  mockRepo.goals.listForChild.mockResolvedValue(GOALS);
  mockRepo.goals.setStatus.mockResolvedValue({ ...GOALS[0], status: 'mastered' });
  mockRepo.org.listTherapyTypes.mockResolvedValue(THERAPY_TYPES);
});

describe('Child workspace', () => {
  it('shows About Me with clinical details marked staff-only, and a call button', async () => {
    await renderWithApp(<ChildWorkspaceScreen childId="c1" />);
    expect(await screen.findByText('Give a 2-minute warning before transitions')).toBeTruthy();
    expect(screen.getByTestId('staff-only')).toBeTruthy();
    expect(screen.getByText('Peanuts')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit About Me' })).toBeTruthy();
  });

  it('confirms a suggested mastery with one calm "Goal mastered" moment', async () => {
    await renderWithApp(<ChildWorkspaceScreen childId="c1" />);
    fireEvent.press(await screen.findByRole('tab', { name: 'Goals' }));
    expect(await screen.findByText('Mastery reached — confirm?')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm mastered' }));
    // Confirm dialog, then confirm.
    expect(await screen.findByText('Mark this goal as mastered?')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Confirm mastered' });
    await act(async () => {
      fireEvent.press(buttons[buttons.length - 1]);
    });

    expect(mockRepo.goals.setStatus).toHaveBeenCalledWith('g1', 'mastered');
    expect(await screen.findByTestId('mastered-moment')).toBeTruthy();
    expect(screen.getByText('Goal mastered')).toBeTruthy();
  });

  it('limits a substitute to brief-safe sections without family phone numbers', async () => {
    mockRepo.children.get.mockResolvedValue(childDetail('brief_only'));
    await renderWithApp(<ChildWorkspaceScreen childId="c1" />);
    expect(await screen.findByTestId('brief-only-notice')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['About Me', 'Goals']);
    expect(screen.queryByRole('button', { name: 'Call' })).toBeNull();
    expect(screen.queryByTestId('clinical-section')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit About Me' })).toBeNull();
  });

  it('shows a friendly message when the child is not accessible', async () => {
    mockRepo.children.get.mockRejectedValue(new RepoError('forbidden'));
    await renderWithApp(<ChildWorkspaceScreen childId="c1" />);
    expect(await screen.findByText("This profile isn't available to you")).toBeTruthy();
  });
});
