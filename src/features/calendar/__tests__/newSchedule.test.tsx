import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { Repository } from '@/data/repository';
import type { ChildSummary, Conflict } from '@/domain/types';
import { initI18n } from '@/i18n';

import { NewScheduleScreen } from '../screens/NewScheduleScreen';
import { ORG, fakeRepo, signInAs, Wrapper } from '../testing/fixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default);

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));

initI18n('en');

const child: ChildSummary = {
  child: { id: 'child1', organizationId: ORG.id, fullName: 'Aarav Sharma', dob: '2019-04-02', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', classGroup: 'Sunflower' },
  therapists: [{ userId: 'ther2', name: 'Mr. Arjun Mehta', therapyTypeId: 'tt-speech', isLead: true }],
  guardians: [],
  openAlerts: 0,
};

const clash: Conflict = { kind: 'therapist_double_booked', date: '2027-01-04', message: 'Mr. Arjun Mehta is already booked Mon 4 Jan 10:30' };

describe('NewScheduleScreen', () => {
  it('suggests the usual therapist, shows clashes before saving and lets an admin save anyway', async () => {
    signInAs('coordinator');
    const checkConflicts = jest.fn(async () => [clash]);
    const createSeries = jest.fn(async () => ({ seriesId: 's1', created: 12, conflicts: [clash] }));
    mockRepo = fakeRepo({ children: { list: async () => [child] }, appointments: { checkConflicts, createSeries } });

    await render(
      <Wrapper>
        <NewScheduleScreen childId="child1" date="2027-01-04" />
      </Wrapper>,
    );

    expect(await screen.findByText('Aarav Sharma')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Speech Therapy, not selected' }));
    // The child's usual speech therapist is pre-selected and marked.
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Mr. Arjun Mehta' }).props.accessibilityState).toMatchObject({ checked: true }));
    expect(screen.getByText('Usual therapist')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Start time: Select' }));
    await fireEvent.press(screen.getByRole('button', { name: '10:30 AM' }));

    // 4 Jan 2027 is a Monday: preselected from the date; 12 weeks → 13 Mondays.
    expect(screen.getByTestId('schedule-summary').props.children).toBe('This creates 13 sessions between Mon, 4 Jan and Mon, 29 Mar.');
    expect(await screen.findByText(clash.message)).toBeTruthy();
    expect(checkConflicts).toHaveBeenCalledWith(expect.objectContaining({ therapistId: 'ther2', weekdays: [1], startTime: '10:30', durationMinutes: 45 }));

    await fireEvent.press(screen.getByTestId('save-schedule'));
    const confirmButtons = await screen.findAllByRole('button', { name: 'Save anyway' });
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(createSeries).toHaveBeenCalledWith(expect.objectContaining({ childId: 'child1', endDate: '2027-03-29' }), { force: true }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });
});
