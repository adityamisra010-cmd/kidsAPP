/**
 * Test-only helpers for practice / check-in / resources component tests (not imported by app code).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { AuthUser, HomeLog, HomeTask, Organization, Role } from '@/domain/types';
import { initI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { ThemeProvider } from '@/theme/ThemeProvider';

export const ORG: Organization = {
  id: 'org1',
  name: 'Sunrise Special School',
  shortName: 'Sunrise',
  city: 'Pune',
  address: 'Baner Road',
  phone: '+91 98200 00000',
  status: 'active',
  settings: DEFAULT_ORG_SETTINGS,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export function signInAs(role: Role, childId: string | null = 'c1') {
  const user: AuthUser = {
    profile: { id: `u-${role}`, fullName: role === 'parent' ? 'Priya Sharma' : 'Riya Menon', preferredLanguage: 'en' },
    memberships: [{ id: 'm1', userId: `u-${role}`, organizationId: ORG.id, role, status: 'active' }],
    organizations: [ORG],
    childIds: childId ? [childId] : [],
  };
  useSession.setState({ user, activeMembershipId: 'm1', activeChildId: childId });
}

export function makeTask(over: Partial<HomeTask> = {}): HomeTask {
  return {
    id: 't1',
    organizationId: ORG.id,
    childId: 'c1',
    goalId: 'g1',
    assignedBy: 'u-therapist',
    assignedByName: 'Ms. Riya',
    title: 'Bubbles and "more"',
    steps: ['Sit facing each other', 'Blow bubbles twice', 'Wait for him to ask for more'],
    frequencyPerWeek: 5,
    durationMinutes: 10,
    activeFrom: '2026-10-26',
    activeTo: '2026-11-09',
    status: 'active',
    createdAt: '2026-10-26T09:00:00.000Z',
    ...over,
  };
}

export function makeLog(over: Partial<HomeLog> = {}): HomeLog {
  return {
    id: 'l1',
    organizationId: ORG.id,
    taskId: 't1',
    taskTitle: 'Bubbles and "more"',
    childId: 'c1',
    childName: 'Aarav Sharma',
    loggedBy: 'u-parent',
    loggedByName: 'Priya Sharma',
    outcome: 'done',
    difficulty: 'easy',
    note: '',
    createdAt: new Date().toISOString(),
    useInNextSession: false,
    ...over,
  };
}

export async function renderWithProviders(ui: ReactElement) {
  initI18n('en');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}
