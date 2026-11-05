import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repository } from '@/data/repository';
import type { AuthUser, ImportContext, ImportRow, Role } from '@/domain/types';
import { initI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { ImportFlowScreen } from '../ImportFlowScreen';
import { ImportHomeScreen } from '../ImportHomeScreen';

const mockFile = { name: 'students.csv', text: '' };

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(() =>
    Promise.resolve({ canceled: false, assets: [{ name: mockFile.name, uri: 'file:///cache/students.csv', mimeType: 'text/csv', size: 120, lastModified: 0 }] }),
  ),
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    text() {
      return Promise.resolve(mockFile.text);
    }
    base64() {
      return Promise.resolve('');
    }
  },
  Paths: { cache: '/cache' },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const ctx: ImportContext = {
  therapists: [{ id: 't1', name: 'Ms. Priya Nair', phone: '+919820145678' }],
  children: [{ id: 'c1', fullName: 'Aarav Sharma', dob: '2019-03-14' }],
  therapyTypes: [{ id: 'tt1', name: 'Speech Therapy', key: 'speech' }],
  parents: [],
};

const commit = jest.fn((kind: string, rows: ImportRow[]) =>
  Promise.resolve({ kind, created: rows.filter((r) => !r.values.existingId).length, updated: rows.filter((r) => r.values.existingId).length, skipped: 0, errors: [] }),
);

const mockRepo = { imports: { context: jest.fn(() => Promise.resolve(ctx)), commit } } as unknown as Repository;

jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo }));

initI18n('en');

function signIn(role: Role) {
  const user: AuthUser = {
    profile: { id: 'u1', fullName: 'Meera Kapoor', preferredLanguage: 'en' },
    memberships: [{ id: 'm1', userId: 'u1', organizationId: 'org1', role, status: 'active' }],
    organizations: [],
    childIds: [],
  };
  useSession.setState({ user, activeMembershipId: 'm1' });
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  commit.mockClear();
  signIn('school_admin');
});

describe('Import flow', () => {
  it('takes a children file from picking to a finished import', async () => {
    mockFile.text = 'School list 2026,,\nS.No.,Name of Child,D.O.B\n1,Aarav Sharma,14/03/2019\n2,Kabir Singh,05-06-2019\n3,Zoya Ali,31/02/2019\n4,Kabir  singh,2019-06-05\n';
    await render(wrap(<ImportFlowScreen kind="children" />));

    expect(screen.getAllByText('Choose file').length).toBe(2); // stepper + button
    await fireEvent.press(screen.getByTestId('import-choose-file'));
    expect(await screen.findByText('4 rows found')).toBeTruthy();
    expect(screen.getByText('students.csv')).toBeTruthy();

    // Step 2: columns were matched automatically.
    await fireEvent.press(screen.getByTestId('import-next-match'));
    expect(await screen.findByText('Match your columns')).toBeTruthy();
    expect(screen.getAllByText('Name of Child').length).toBeGreaterThan(0);
    expect(screen.getByText('Not used: S.No.')).toBeTruthy();

    // Step 3: plain-language problems and counts.
    await fireEvent.press(screen.getByTestId('import-next-check'));
    expect(await screen.findByText('Check before importing')).toBeTruthy();
    expect(screen.getByTestId('count-new')).toHaveProp('accessibilityLabel', 'Ready to add: 1');
    expect(screen.getByTestId('count-update')).toHaveProp('accessibilityLabel', 'Will update: 1');
    expect(screen.getByTestId('count-duplicate')).toHaveProp('accessibilityLabel', 'Repeated in file: 1');
    expect(screen.getByTestId('count-error')).toHaveProp('accessibilityLabel', 'Need fixing: 1');
    // "Show only problems" starts on when something needs fixing.
    expect(screen.getByText(/isn't a date we can read/)).toBeTruthy();
    expect(screen.queryByText('Aarav Sharma')).toBeNull();
    await fireEvent.press(screen.getByTestId('import-only-problems'));
    expect(screen.getByText('Aarav Sharma')).toBeTruthy();
    expect(screen.getByText('Same as row 4, so it will be imported once.')).toBeTruthy();

    // Step 4: commit only the good rows.
    await fireEvent.press(screen.getByTestId('import-commit'));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(commit.mock.calls[0][0]).toBe('children');
    expect(commit.mock.calls[0][1]).toEqual([
      { rowNumber: 3, values: { fullName: 'Aarav Sharma', dob: '2019-03-14', existingId: 'c1' } },
      { rowNumber: 4, values: { fullName: 'Kabir Singh', dob: '2019-06-05' } },
    ]);
    expect(await screen.findByTestId('import-done')).toBeTruthy();
    expect(screen.getByText('Import finished')).toBeTruthy();
    expect(screen.getByText(/update these records instead of adding them twice/)).toBeTruthy();
  });

  it('lets the admin accept a "Did you mean" suggestion without editing the file', async () => {
    mockFile.text = 'Parent Name,Mobile,Child Name\nNeha Sharma,99100 23456,Arav Sharma\nVikram Sharma,9910065432,arav sharma\n';
    await render(wrap(<ImportFlowScreen kind="parents" />));
    await fireEvent.press(screen.getByTestId('import-choose-file'));
    await screen.findByText('2 rows found');
    await fireEvent.press(screen.getByTestId('import-next-match'));
    await fireEvent.press(await screen.findByTestId('import-next-check'));
    expect(await screen.findByText('Names we couldn’t find'.replace('’', "'"))).toBeTruthy();
    expect(screen.getByTestId('count-error')).toHaveProp('accessibilityLabel', 'Need fixing: 2');

    await fireEvent.press(screen.getByRole('button', { name: 'Use Aarav Sharma' }));
    await waitFor(() => expect(screen.getByTestId('count-error')).toHaveProp('accessibilityLabel', 'Need fixing: 0'));
    expect(screen.getByTestId('count-new')).toHaveProp('accessibilityLabel', 'Ready to add: 2');
    expect(screen.getByRole('button', { name: 'Import 2 rows' })).toBeTruthy();
  });

  it('explains an unusable file kindly', async () => {
    mockFile.text = '   \n';
    await render(wrap(<ImportFlowScreen kind="staff" />));
    await fireEvent.press(screen.getByTestId('import-choose-file'));
    expect(await screen.findByText("We couldn't use this file")).toBeTruthy();
    expect(screen.getByText('This file looks empty.')).toBeTruthy();
    expect(screen.getByTestId('import-next-match')).toBeDisabled();
  });

  it('keeps coordinators to the schedule import', async () => {
    signIn('coordinator');
    await render(wrap(<ImportFlowScreen kind="staff" />));
    expect(screen.getByText('Only the school admin can import this.')).toBeTruthy();
  });

  it('handles an unknown import type', async () => {
    await render(wrap(<ImportFlowScreen kind="teachers" />));
    expect(screen.getByText("This import type doesn't exist.")).toBeTruthy();
  });
});

describe('Import home', () => {
  it('shows the four imports in the suggested order with templates', async () => {
    await render(wrap(<ImportHomeScreen />));
    expect(screen.getByText('1 Staff  →  2 Children  →  3 Parents  →  4 Recurring schedule')).toBeTruthy();
    for (const kind of ['staff', 'children', 'parents', 'schedule']) expect(screen.getByTestId(`import-card-${kind}`)).toBeTruthy();
    expect(screen.getAllByText('Download template')).toHaveLength(4);
    expect(screen.queryByText('Only the school admin can import this.')).toBeNull();
  });

  it('tells coordinators which imports are admin-only', async () => {
    signIn('coordinator');
    await render(wrap(<ImportHomeScreen />));
    expect(screen.getAllByText('Only the school admin can import this.')).toHaveLength(3);
    expect(screen.getByTestId('import-start-schedule')).not.toBeDisabled();
    expect(screen.getByTestId('import-start-staff')).toBeDisabled();
  });
});
