import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Repository } from '@/data/repository';
import { DEFAULT_DIMENSIONS, DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { GoalBankItem, SchoolSummary } from '@/domain/types';
import { makeRepo, renderWithProviders, signInAs } from '@/features/home/testing';

import { filterGoalBank, validateGoalDraft } from '../goalBankForm';
import { NewSchoolScreen } from '../NewSchoolScreen';
import { SchoolDetailScreen } from '../SchoolDetailScreen';
import { SchoolsScreen } from '../SchoolsScreen';
import { TemplatesScreen } from '../TemplatesScreen';

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/ui/Feedback', () => {
  const actual = jest.requireActual('@/ui/Feedback');
  return { ...actual, confirm: jest.fn(async () => true) };
});

const school = (id: string, name: string, status: 'active' | 'suspended', children: number): SchoolSummary => ({
  organization: {
    id,
    name,
    shortName: name.split(' ')[0],
    city: 'Pune',
    address: '12 FC Road, Pune',
    phone: '+912025550101',
    status,
    settings: DEFAULT_ORG_SETTINGS,
    createdAt: '2026-01-10T09:00:00+05:30',
  },
  activeChildren: children,
  staffCount: 9,
  sessionsThisMonth: children * 8,
  activeParentsPercent: 72.4,
  lastActivityAt: new Date().toISOString(),
});

const schools = [school('s2', 'Sahaj Special School', 'suspended', 20), school('s1', 'Anvaya Child Development Centre', 'active', 48)];

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  signInAs('platform_admin', { name: 'Devyansh Misra' });
});

describe('SchoolsScreen', () => {
  it('lists schools with status, usage and totals', async () => {
    mockRepo = makeRepo({ platform: { listSchools: async () => schools } });
    await renderWithProviders(<SchoolsScreen />);
    expect(screen.getByText('1 active of 2')).toBeTruthy();
    expect(screen.getByText('Suspended')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getAllByText('72%').length).toBe(2);
    const names = screen.getAllByText(/Anvaya Child Development Centre|Sahaj Special School/).map((n) => n.props.children);
    expect(names).toEqual(['Anvaya Child Development Centre', 'Sahaj Special School']);
    await fireEvent.press(screen.getByTestId('school-s1'));
    expect(mockPush).toHaveBeenCalledWith('/platform-school/s1');
  });
});

describe('SchoolDetailScreen', () => {
  it('suspends after confirmation', async () => {
    const setSchoolStatus = jest.fn(async () => undefined);
    mockRepo = makeRepo({ platform: { listSchools: async () => schools, setSchoolStatus } });
    await renderWithProviders(<SchoolDetailScreen id="s1" />);
    expect(screen.getByText('+91 20255 50101')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('toggle-status'));
    await waitFor(() => expect(setSchoolStatus).toHaveBeenCalledWith('s1', 'suspended'));
  });

  it('offers to reactivate a suspended school', async () => {
    mockRepo = makeRepo({ platform: { listSchools: async () => schools } });
    await renderWithProviders(<SchoolDetailScreen id="s2" />);
    expect(screen.getByText('Reactivate school')).toBeTruthy();
  });
});

describe('NewSchoolScreen', () => {
  it('validates, creates the school and shows the invite', async () => {
    const createSchool = jest.fn(async (input: { name: string; shortName: string; adminName: string; adminPhone: string }) => ({
      organization: { ...schools[1].organization, id: 'new-1', name: input.name, shortName: input.shortName },
      invite: {
        id: 'inv-1',
        organizationId: 'new-1',
        role: 'school_admin' as const,
        fullName: input.adminName,
        phone: input.adminPhone,
        childIds: [],
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        createdBy: 'user-platform_admin',
      },
    }));
    mockRepo = makeRepo({ platform: { createSchool } });
    await renderWithProviders(<NewSchoolScreen />);

    await fireEvent.press(screen.getByTestId('create-school'));
    expect(await screen.findByText("Enter the school's full name")).toBeTruthy();
    expect(createSchool).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('name'), 'Sahaj Special School');
    await fireEvent.changeText(screen.getByTestId('shortName'), 'Sahaj');
    await fireEvent.changeText(screen.getByTestId('city'), 'Jaipur');
    await fireEvent.changeText(screen.getByTestId('address'), '14 MI Road, Jaipur');
    await fireEvent.changeText(screen.getByTestId('phone'), '0141 255 0199');
    await fireEvent.changeText(screen.getByTestId('adminName'), 'Meenakshi Rao');
    await fireEvent.changeText(screen.getByTestId('adminPhone'), '98290 11223');
    await fireEvent.press(screen.getByTestId('create-school'));

    await waitFor(() => expect(createSchool).toHaveBeenCalledWith(expect.objectContaining({ phone: '+911412550199', adminPhone: '+919829011223' })));
    expect(await screen.findByText('Sahaj Special School is ready')).toBeTruthy();
    expect(screen.getByText('+91 98290 11223')).toBeTruthy();
    expect(screen.getByText('Waiting to sign in')).toBeTruthy();
  });
});

describe('TemplatesScreen', () => {
  const bank: GoalBankItem[] = [
    { id: 'g1', organizationId: null, domain: 'communication', therapyTypeKey: 'speech', staffText: 'Requests 5 items using 2-word phrases', parentText: 'Asking for things with two words' },
    { id: 'g2', organizationId: null, domain: 'fine_motor', therapyTypeKey: 'occupational', staffText: 'Uses tripod grasp for 2 minutes', parentText: 'Holding a crayon the grown-up way' },
  ];

  it('shows rating scales with anchors, then the goal bank', async () => {
    mockRepo = makeRepo({
      platform: {
        listGlobalDimensions: async () => DEFAULT_DIMENSIONS.map((d, i) => ({ ...d, id: `d${i}`, organizationId: null })),
        listGlobalGoalBank: async () => bank,
      },
    });
    await renderWithProviders(<TemplatesScreen />);
    expect(screen.getByText('Attention / Focus')).toBeTruthy();
    expect(screen.getByText('Parents see: Focus')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('anchors-attention'));
    expect(screen.getByText('Sustained attention through full activity blocks')).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: 'Goal bank' }));
    expect(await screen.findByText('Requests 5 items using 2-word phrases')).toBeTruthy();
    expect(screen.getByText('2 goals')).toBeTruthy();
  });
});

describe('goal bank helpers', () => {
  it('validates drafts and returns field errors', () => {
    const bad = validateGoalDraft({ domain: '', therapyTypeKey: 'speech', staffText: 'short', parentText: 'Asking for things' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toEqual({ domain: 'platform:goalBank.errors.domain', staffText: 'platform:goalBank.errors.staffText' });
    const good = validateGoalDraft({ id: 'g1', domain: 'social', therapyTypeKey: 'behaviour', staffText: ' Takes turns in a 2-person game ', parentText: 'Taking turns when playing' });
    expect(good).toEqual({ ok: true, value: { id: 'g1', domain: 'social', therapyTypeKey: 'behaviour', staffText: 'Takes turns in a 2-person game', parentText: 'Taking turns when playing' } });
  });

  it('filters by area and search text', () => {
    const list: GoalBankItem[] = [
      { id: 'a', organizationId: null, domain: 'communication', therapyTypeKey: 'speech', staffText: 'Names 10 pictures', parentText: 'Naming pictures' },
      { id: 'b', organizationId: null, domain: 'social', therapyTypeKey: 'behaviour', staffText: 'Waits for turn', parentText: 'Waiting for a turn' },
    ];
    expect(filterGoalBank(list, 'social', '').map((g) => g.id)).toEqual(['b']);
    expect(filterGoalBank(list, 'all', 'PICTURE').map((g) => g.id)).toEqual(['a']);
  });
});
