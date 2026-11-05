import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repository } from '@/data/repository';
import { DEFAULT_DIMENSIONS, DEFAULT_ORG_SETTINGS, DEFAULT_THERAPY_TYPES } from '@/domain/constants';
import type { AuthUser, DataRequest, Organization, RatingDimension, Role, TherapyType } from '@/domain/types';
import { initI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ConfirmHost } from '@/ui';

import { DataRequestsScreen, sortRequests } from '../DataRequestsScreen';
import { DimensionsScreen, moveDimension } from '../DimensionsScreen';
import { isNameTaken, nextFreeSwatch } from '../palette';
import { SchoolSettingsScreen } from '../SchoolSettingsScreen';
import { TherapyTypesScreen } from '../TherapyTypesScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })) }));

const org: Organization = {
  id: 'org1',
  name: 'Sunrise Child Development Centre',
  shortName: 'Sunrise CDC',
  city: 'Noida',
  address: 'C-24, Sector 62',
  phone: '+91 120 456 7890',
  status: 'active',
  settings: { ...DEFAULT_ORG_SETTINGS },
  createdAt: '2025-01-01T00:00:00.000Z',
};

const dims = (enabled: number): RatingDimension[] =>
  DEFAULT_DIMENSIONS.slice(0, 4).map((d, i) => ({ ...d, id: `d${i + 1}`, organizationId: 'org1', enabled: i < enabled }));

const types: TherapyType[] = DEFAULT_THERAPY_TYPES.slice(0, 2).map((d, i) => ({ ...d, id: `tt${i + 1}`, organizationId: 'org1', active: true }));

const requests: DataRequest[] = [
  { id: 'r1', organizationId: 'org1', userId: 'p1', userName: 'Neha Sharma', childId: 'c1', childName: 'Aarav Sharma', kind: 'deletion', status: 'in_progress', createdAt: '2026-10-20T05:00:00.000Z' },
  { id: 'r2', organizationId: 'org1', userId: 'p2', userName: 'Lakshmi Iyer', childId: 'c2', childName: 'Diya Iyer', kind: 'export', status: 'open', createdAt: '2026-10-25T05:00:00.000Z' },
];

// Behaves like an adapter: each write returns the whole, updated organisation.
let mockSaved: Organization = org;
const mockOrgRepo = {
  get: jest.fn(() => Promise.resolve(mockSaved)),
  update: jest.fn((_id: string, patch: Partial<Organization>) => Promise.resolve((mockSaved = { ...mockSaved, ...patch }))),
  updateSettings: jest.fn((_id: string, patch: Partial<Organization['settings']>) =>
    Promise.resolve((mockSaved = { ...mockSaved, settings: { ...mockSaved.settings, ...patch } })),
  ),
  listRatingDimensions: jest.fn(() => Promise.resolve(dims(3))),
  upsertRatingDimension: jest.fn((d: RatingDimension) => Promise.resolve(d)),
  reorderRatingDimensions: jest.fn(() => Promise.resolve()),
  listTherapyTypes: jest.fn(() => Promise.resolve(types)),
  upsertTherapyType: jest.fn((t: TherapyType) => Promise.resolve({ ...t, id: t.id ?? 'new' })),
  listDataRequests: jest.fn(() => Promise.resolve(requests)),
  setDataRequestStatus: jest.fn(() => Promise.resolve()),
};
const mockRepo = { org: mockOrgRepo } as unknown as Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo }));

initI18n('en');

function signIn(role: Role) {
  const user: AuthUser = {
    profile: { id: 'u1', fullName: 'Meera Kapoor', preferredLanguage: 'en' },
    memberships: [{ id: 'm1', userId: 'u1', organizationId: 'org1', role, status: 'active' }],
    organizations: [org],
    childIds: [],
  };
  useSession.setState({ user, activeMembershipId: 'm1' });
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          {ui}
          <ConfirmHost />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSaved = org;
});

describe('School settings', () => {
  it('lets the school admin change details and settings, saving only what changed', async () => {
    signIn('school_admin');
    await render(wrap(<SchoolSettingsScreen />));
    await fireEvent.changeText(await screen.findByTestId('school-name'), 'Sunrise Centre, Noida');
    await fireEvent.press(screen.getByTestId('school-numeric-score'));
    await fireEvent.press(screen.getByTestId('school-save'));
    await waitFor(() => expect(mockOrgRepo.updateSettings).toHaveBeenCalled());
    expect(mockOrgRepo.update).toHaveBeenCalledWith('org1', { name: 'Sunrise Centre, Noida' });
    expect(mockOrgRepo.updateSettings).toHaveBeenCalledWith('org1', { parentsSeeNumericScore: true });
    await waitFor(() => expect(useSession.getState().user?.organizations[0].name).toBe('Sunrise Centre, Noida'));
  });

  it('blocks saving with a plain message when a required field is empty', async () => {
    signIn('school_admin');
    await render(wrap(<SchoolSettingsScreen />));
    await fireEvent.changeText(await screen.findByTestId('school-name'), '  ');
    expect(screen.getByText('Please enter the school name.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('school-save'));
    expect(mockOrgRepo.update).not.toHaveBeenCalled();
  });

  it('shows coordinators a read-only view', async () => {
    signIn('coordinator');
    await render(wrap(<SchoolSettingsScreen />));
    expect(await screen.findByTestId('school-readonly')).toBeTruthy();
    expect(screen.getByTestId('school-name')).toHaveProp('editable', false);
    expect(screen.getByTestId('school-numeric-score')).toBeDisabled();
    expect(screen.queryByTestId('school-save')).toBeNull();
    expect(screen.queryByText('Choose logo')).toBeNull();
  });
});

describe('Rating scales', () => {
  it('keeps at least three scales on', async () => {
    signIn('school_admin');
    await render(wrap(<DimensionsScreen />));
    expect(screen.getByText('Clear anchors keep scoring consistent when therapists change.')).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('dimension-engagement-enabled'));
    expect(mockOrgRepo.upsertRatingDimension).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('dimension-mood-enabled'));
    await waitFor(() => expect(mockOrgRepo.upsertRatingDimension).toHaveBeenCalledWith(expect.objectContaining({ key: 'mood', enabled: true })));
  });

  it('edits anchor wording with a live preview and can reset to default', async () => {
    signIn('school_admin');
    await render(wrap(<DimensionsScreen />));
    await fireEvent.press(await screen.findByTestId('dimension-attention-edit'));
    expect(screen.getByText('Preview')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('dim-anchor-3'), 'Stayed with the task for about 5 minutes');
    expect(screen.getAllByText('Stayed with the task for about 5 minutes').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('dim-save'));
    await waitFor(() =>
      expect(mockOrgRepo.upsertRatingDimension).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'attention', anchors: expect.objectContaining({ 3: 'Stayed with the task for about 5 minutes' }) }),
      ),
    );
  });

  it('reorders by renumbering', () => {
    const list = dims(4);
    const next = moveDimension(list, 'd2', -1);
    expect(next.map((d) => [d.id, d.sortOrder])).toEqual([
      ['d2', 1],
      ['d1', 2],
      ['d3', 3],
      ['d4', 4],
    ]);
    expect(moveDimension(list, 'd1', -1)).toBe(list);
  });
});

describe('Therapy types', () => {
  it('adds a custom type with a fresh colour', async () => {
    signIn('school_admin');
    await render(wrap(<TherapyTypesScreen />));
    expect(await screen.findByText('Speech Therapy')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('therapy-type-add'));
    await fireEvent.press(screen.getByTestId('therapy-type-save'));
    expect(screen.getByText('Please enter a name.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('therapy-type-name'), '  Music   Therapy ');
    await fireEvent.press(screen.getByRole('radio', { name: 'Heart' }));
    await fireEvent.press(screen.getByTestId('therapy-type-save'));
    await waitFor(() =>
      expect(mockOrgRepo.upsertTherapyType).toHaveBeenCalledWith({ organizationId: 'org1', key: 'custom', name: 'Music Therapy', color: '#6F9A7A', icon: 'heart', active: true }),
    );
  });

  it('checks names and picks unused colours', () => {
    expect(isNameTaken('speech  therapy', types)).toBe(true);
    expect(isNameTaken('Speech Therapy', types, 'tt1')).toBe(false);
    expect(nextFreeSwatch(['#C66B4E', '#c9a227'])).toBe('#6F9A7A');
  });
});

describe('Data requests', () => {
  it('lists requests open first and confirms before marking a deletion done', async () => {
    signIn('school_admin');
    await render(wrap(<DataRequestsScreen />));
    expect(await screen.findByText('Diya Iyer')).toBeTruthy();
    expect(screen.getByText(/Deleting a child's data can't be undone/)).toBeTruthy();
    const doneTabs = screen.getAllByRole('tab', { name: 'Done' });
    // r1 (in progress, deletion) is second because open requests come first.
    await fireEvent.press(doneTabs[1]);
    expect(await screen.findByText('Mark deletion as done?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: "Yes, it's deleted" }));
    await waitFor(() => expect(mockOrgRepo.setDataRequestStatus).toHaveBeenCalledWith('r1', 'done'));
  });

  it('sorts by status then newest', () => {
    expect(sortRequests(requests).map((r) => r.id)).toEqual(['r2', 'r1']);
  });
});
