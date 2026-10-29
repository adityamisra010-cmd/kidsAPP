/**
 * Test helpers shared by the home/today/dashboard/messages/notifications/alerts/platform tests.
 * Not imported by app code.
 */
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repository } from '@/data/repository';
import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { AppointmentView, AuthUser, Organization, Role } from '@/domain/types';
import { initI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { ThemeProvider } from '@/theme/ThemeProvider';

export type RepoOverrides = { [K in keyof Repository]?: Partial<Repository[K]> };

const SECTIONS = [
  'auth',
  'me',
  'org',
  'platform',
  'children',
  'goals',
  'appointments',
  'sessions',
  'checkins',
  'progress',
  'homePractice',
  'media',
  'resources',
  'messaging',
  'notifications',
  'alerts',
  'dashboards',
  'reports',
  'imports',
] as const;

/** A repository where only the given methods exist; anything else rejects with "not mocked". */
export function makeRepo(overrides: RepoOverrides): Repository {
  const repo: Record<string, unknown> = {
    mode: 'demo',
    setContext: () => undefined,
    getContext: () => null,
  };
  for (const section of SECTIONS) {
    const given = (overrides[section] ?? {}) as Record<string, unknown>;
    repo[section] = new Proxy(given, {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        return () => Promise.reject(new Error(`not mocked: ${section}.${prop}`));
      },
    });
  }
  return repo as unknown as Repository;
}

export const testOrg: Organization = {
  id: 'org-1',
  name: 'Anvaya Child Development Centre',
  shortName: 'Anvaya',
  city: 'Pune',
  address: '12 FC Road, Pune',
  phone: '+912025550101',
  status: 'active',
  settings: DEFAULT_ORG_SETTINGS,
  createdAt: '2026-01-10T09:00:00+05:30',
};

export function signInAs(role: Role, opts: { name?: string; childIds?: string[]; userId?: string } = {}): AuthUser {
  const user: AuthUser = {
    profile: { id: opts.userId ?? `user-${role}`, fullName: opts.name ?? 'Priya Sharma', preferredLanguage: 'en' },
    memberships: [{ id: `m-${role}`, userId: opts.userId ?? `user-${role}`, organizationId: role === 'platform_admin' ? null : testOrg.id, role, status: 'active' }],
    organizations: role === 'platform_admin' ? [] : [testOrg],
    childIds: opts.childIds ?? [],
  };
  useSession.setState({ user, activeMembershipId: `m-${role}`, activeChildId: opts.childIds?.[0] ?? null, mode: 'demo' });
  return user;
}

export function makeAppointment(p: Partial<AppointmentView> & Pick<AppointmentView, 'id' | 'startsAt'>): AppointmentView {
  const start = new Date(p.startsAt);
  return {
    organizationId: testOrg.id,
    childId: 'child-aarav',
    therapistId: 'user-therapist',
    therapyTypeId: 'tt-speech',
    endsAt: new Date(start.getTime() + 45 * 60_000).toISOString(),
    status: 'scheduled',
    wasRescheduled: false,
    createdAt: '2026-10-01T09:00:00+05:30',
    childName: 'Aarav Mehta',
    therapistName: 'Ms. Riya Menon',
    therapyTypeName: 'Speech Therapy',
    therapyTypeColor: '#C66B4E',
    therapyTypeIcon: 'message-circle',
    displayStatus: 'confirmed',
    logState: 'upcoming',
    isSubstitute: false,
    briefRequired: false,
    briefAcknowledged: false,
    hasCheckin: false,
    ...p,
  };
}

let i18nReady = false;

// Deliver query results synchronously so React updates land inside RNTL's act() scopes.
notifyManager.setScheduler((cb) => cb());

/**
 * Renders inside theme + safe area + a fresh query client (no retries) and, by default, waits until
 * every query has settled so tests see loaded content and no updates leak into the next test.
 */
export async function renderWithProviders(ui: ReactElement, opts: { settle?: boolean } = {}) {
  if (!i18nReady) {
    initI18n('en');
    i18nReady = true;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const result = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  if (opts.settle !== false) {
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return { ...result, client };
}
