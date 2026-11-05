import { fireEvent, screen } from '@testing-library/react-native';

import type { Repository } from '@/data/repository';
import type { HomeTask } from '@/domain/types';

import { ParentPracticeScreen } from '../screens/ParentPracticeScreen';
import { makeLog, makeTask, renderWithProviders, signInAs } from '../testing';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
jest.mock('react-native-compressor', () => ({ Video: { compress: jest.fn() } }));

const mockRouter = jest.requireMock<{ router: Record<'push', jest.Mock> }>('expo-router').router;

let mockTasks: HomeTask[] = [];
const mockRepo = {
  homePractice: {
    listTasks: jest.fn(async () => mockTasks),
    weeklyCompletion: jest.fn(async () => ({ childId: 'c1', weekStart: '2026-10-26', expected: 5, done: 2, partly: 1, percent: 50 })),
    listLogs: jest.fn(async () => [
      makeLog({ id: 'l1' }),
      makeLog({ id: 'l2', outcome: 'partly' }),
      makeLog({
        id: 'l3',
        reviewReaction: 'great_job',
        reviewComment: 'Lovely waiting. Try three bubbles next time.',
        reviewedByName: 'Ms. Riya',
        reviewedAt: new Date().toISOString(),
      }),
    ]),
  },
  children: {
    get: jest.fn(async () => ({ child: { id: 'c1', fullName: 'Aarav Sharma', preferredName: 'Aarav' }, profile: {}, guardians: [], therapists: [], access: 'parent' })),
    list: jest.fn(async () => []),
  },
  goals: { listForChild: jest.fn(async () => [{ id: 'g1', parentText: 'Asking for "more" using a word or sign', staffText: 'Mands for more', status: 'progressing' }]) },
} as unknown as Repository;

jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));

beforeEach(() => {
  signInAs('parent');
});

describe('ParentPracticeScreen', () => {
  it("shows this week's progress, the task with its goal, and therapist feedback", async () => {
    mockTasks = [makeTask()];
    await renderWithProviders(<ParentPracticeScreen />);

    expect(await screen.findByText('3 of 5 done')).toBeTruthy();
    expect(screen.getByText('More than halfway there. Lovely work.')).toBeTruthy();
    expect(await screen.findByText('Bubbles and "more"')).toBeTruthy();
    expect(await screen.findByText('Asking for "more" using a word or sign')).toBeTruthy();
    expect(screen.getByText('5 times a week')).toBeTruthy();
    expect(screen.getAllByText('3 of 5 this week').length).toBeGreaterThan(0);

    expect(screen.getByText('Feedback from therapists')).toBeTruthy();
    expect(screen.getByText('Great job')).toBeTruthy();
    expect(screen.getByText('Lovely waiting. Try three bubbles next time.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('task-0-log'));
    expect(mockRouter.push).toHaveBeenCalledWith('/practice/log/t1');
  });

  it('shows a friendly empty state when there are no tasks', async () => {
    mockTasks = [];
    await renderWithProviders(<ParentPracticeScreen />);
    expect(await screen.findByText('No practice activities yet')).toBeTruthy();
  });
});
