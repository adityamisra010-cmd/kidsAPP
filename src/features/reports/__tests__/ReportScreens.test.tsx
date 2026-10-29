import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repository } from '@/data/repository';
import type { AuthUser, ChildReportData, Role } from '@/domain/types';
import { initI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { reportData } from '../__fixtures__/reportData';
import { ChildReportScreen, resolveAudience, resolveRange } from '../ChildReportScreen';
import { exportFileName, ExportScreen } from '../ExportScreen';

const mockWritten: { name: string; content: string }[] = [];

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(() => Promise.resolve({ uri: 'file:///cache/print-123.pdf', numberOfPages: 2 })),
  printAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(() => Promise.resolve(true)), shareAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    create() {}
    write(content: string) {
      mockWritten.push({ name: this.uri, content });
      return Promise.resolve();
    }
    move() {
      return Promise.resolve();
    }
    base64() {
      return Promise.resolve('');
    }
  },
  Paths: { cache: 'file:///cache' },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
}));

const childReport = jest.fn((_id: string, opts: { audience: 'staff' | 'parent' }): Promise<ChildReportData> => Promise.resolve(reportData({ audience: opts.audience })));
const exportSessions = jest.fn(() =>
  Promise.resolve([
    { Date: '2026-10-02', Child: 'Aarav Sharma', Therapy: 'Speech Therapy', 'Session Score': 58, Substitute: false },
    { Date: '2026-10-14', Child: 'दिया अय्यर', Therapy: 'Speech Therapy', 'Session Score': 66, Substitute: true },
  ]),
);
const mockRepo = { reports: { childReport, exportSessions, exportAttendance: jest.fn(() => Promise.resolve([])) } } as unknown as Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo }));

initI18n('en');

function signIn(role: Role) {
  const user: AuthUser = {
    profile: { id: 'u1', fullName: 'Meera Kapoor', preferredLanguage: 'en' },
    memberships: [{ id: 'm1', userId: 'u1', organizationId: 'org1', role, status: 'active' }],
    organizations: [],
    childIds: ['c1'],
  };
  useSession.setState({ user, activeMembershipId: 'm1' });
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWritten.length = 0;
});

describe('Child report screen', () => {
  it('previews the staff report, lets staff edit the summary and shares a PDF', async () => {
    signIn('school_admin');
    await render(wrap(<ChildReportScreen id="c1" from="2026-10-01" to="2026-10-29" audience="staff" />));
    expect(await screen.findByText('Sunrise Child Development Centre')).toBeTruthy();
    expect(childReport).toHaveBeenCalledWith('c1', { from: '2026-10-01', to: '2026-10-29', audience: 'staff' });
    expect(screen.getAllByText('Staff copy').length).toBe(2); // toggle + header badge
    expect(screen.getByText(/Average Session Score 65\/100/)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('report-summary-input'), 'Aarav now asks for bubbles with two words.');
    await fireEvent.press(screen.getByTestId('report-create-pdf'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());

    const html = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html as string;
    expect(html).toContain('Aarav now asks for bubbles with two words.');
    expect((Print.printToFileAsync as jest.Mock).mock.calls[0][0]).toMatchObject({ width: 595, height: 842 });
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/Progress-Report_Aarav-Sharma_2026-10-01_to_2026-10-29_Staff.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('always gives parents the parent copy, read-only and without scores', async () => {
    signIn('parent');
    await render(wrap(<ChildReportScreen id="c1" from="2026-10-01" to="2026-10-29" audience="staff" />));
    expect(await screen.findByText('Family copy')).toBeTruthy();
    expect(childReport).toHaveBeenCalledWith('c1', expect.objectContaining({ audience: 'parent' }));
    expect(screen.queryByTestId('report-audience-toggle')).toBeNull();
    expect(screen.queryByTestId('report-summary-input')).toBeNull();
    expect(screen.getByText("Written by your child's therapist.")).toBeTruthy();
    expect(screen.queryByText(/Session Score/)).toBeNull();
    expect(screen.getByText('Making progress')).toBeTruthy();
  });

  it('resolves audience and range from the link', () => {
    expect(resolveAudience('parent', 'staff')).toBe('parent');
    expect(resolveAudience('coordinator', 'parent')).toBe('parent');
    expect(resolveAudience('coordinator', undefined)).toBe('staff');
    expect(resolveRange('2026-10-01', '2026-10-29')).toEqual({ from: '2026-10-01', to: '2026-10-29' });
    expect(resolveRange('2026-10-29', '2026-10-01').from).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe('Export screen', () => {
  it('previews rows and shares a UTF-8 CSV', async () => {
    signIn('coordinator');
    await render(wrap(<ExportScreen />));
    expect(await screen.findByText('2 rows')).toBeTruthy();
    expect(screen.getByText('दिया अय्यर')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('export-share'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(mockWritten).toHaveLength(1);
    expect(mockWritten[0].content.startsWith('\uFEFFDate,Child,Therapy,Session Score,Substitute\r\n')).toBe(true);
    expect(mockWritten[0].content).toContain('2026-10-14,दिया अय्यर,Speech Therapy,66,Yes');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/sessions_\d{4}-\d{2}-01_to_/), expect.objectContaining({ mimeType: 'text/csv' }));
  });

  it('is only for admins and coordinators', async () => {
    signIn('therapist');
    await render(wrap(<ExportScreen />));
    expect(screen.getByText('Exports are available to school admins and coordinators.')).toBeTruthy();
    expect(exportSessions).not.toHaveBeenCalled();
  });

  it('names export files', () => {
    expect(exportFileName('attendance', { from: '2026-10-01', to: '2026-10-31' }, 'Priya Nair')).toBe('attendance_Priya-Nair_2026-10-01_to_2026-10-31.csv');
  });
});
