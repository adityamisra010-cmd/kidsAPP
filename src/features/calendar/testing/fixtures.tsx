/**
 * Test fixtures for calendar component tests (imported only by tests).
 * The repository is a minimal fake: tests override the methods they exercise.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repository } from '@/data/repository';
import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { AppointmentView, AuthUser, Member, Organization, Role } from '@/domain/types';
import { useSession } from '@/state/session';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ConfirmHost, ToastHost } from '@/ui';

export const ORG: Organization = {
  id: 'org1',
  name: 'Sunrise Child Development Centre',
  shortName: 'Sunrise',
  city: 'Pune',
  address: 'Baner Road',
  phone: '+91 20 0000 0000',
  status: 'active',
  settings: { ...DEFAULT_ORG_SETTINGS, workingHours: { start: '08:00', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6] } },
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** A timestamp `hours` from now, rounded to the minute. */
export function fromNow(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  d.setSeconds(0, 0);
  return d.toISOString();
}

export function appointment(over: Partial<AppointmentView> = {}): AppointmentView {
  const startsAt = over.startsAt ?? fromNow(2);
  return {
    id: 'appt1',
    organizationId: ORG.id,
    childId: 'child1',
    therapistId: 'ther1',
    therapyTypeId: 'tt-speech',
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 45 * 60_000).toISOString(),
    status: 'scheduled',
    wasRescheduled: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    childName: 'Aarav Sharma',
    therapistName: 'Ms. Riya Kapoor',
    therapyTypeName: 'Speech Therapy',
    therapyTypeColor: '#C66B4E',
    therapyTypeIcon: 'message-circle',
    displayStatus: 'confirmed',
    logState: 'upcoming',
    isSubstitute: false,
    briefRequired: false,
    briefAcknowledged: false,
    hasCheckin: false,
    room: 'Therapy Room 2',
    ...over,
  };
}

export function member(id: string, fullName: string, therapyTypeIds: string[], role: Role = 'therapist'): Member {
  return {
    profile: { id, fullName, preferredLanguage: 'en', title: 'Speech Therapist' },
    membership: { id: `m-${id}`, userId: id, organizationId: ORG.id, role, status: 'active' },
    therapyTypeIds,
  };
}

/** Signs a fake user in with one membership of the given role. */
export function signInAs(role: Role, userId = role === 'therapist' ? 'ther1' : `${role}-user`) {
  const user: AuthUser = {
    profile: { id: userId, fullName: role === 'parent' ? 'Sunita Sharma' : 'Ms. Riya Kapoor', preferredLanguage: 'en' },
    memberships: [{ id: `mem-${role}`, userId, organizationId: ORG.id, role, status: 'active' }],
    organizations: [ORG],
    childIds: role === 'parent' ? ['child1'] : [],
  };
  useSession.setState({ user, activeMembershipId: `mem-${role}`, activeChildId: user.childIds[0] ?? null });
  return user;
}

type DeepPartialRepo = { [K in keyof Repository]?: Partial<Repository[K]> };

/** A repository whose unimplemented methods reject, merged with per-test overrides. */
export function fakeRepo(over: DeepPartialRepo = {}): Repository {
  const reject = () => Promise.reject(new Error('not implemented in fake'));
  const area = <T extends object>(o: Partial<T> | undefined): T =>
    new Proxy((o ?? {}) as T, { get: (target, prop) => (prop in target ? target[prop as keyof T] : reject) });
  return {
    mode: 'demo',
    setContext: () => undefined,
    getContext: () => null,
    auth: area(over.auth),
    me: area(over.me),
    org: area({
      get: async () => ORG,
      listTherapyTypes: async () => [
        { id: 'tt-speech', organizationId: ORG.id, key: 'speech', name: 'Speech Therapy', color: '#C66B4E', icon: 'message-circle', active: true },
        { id: 'tt-ot', organizationId: ORG.id, key: 'occupational', name: 'Occupational Therapy', color: '#C9A227', icon: 'hand', active: true },
      ],
      listMembers: async () => [member('ther1', 'Ms. Riya Kapoor', ['tt-speech']), member('ther2', 'Mr. Arjun Mehta', ['tt-speech', 'tt-ot'])],
      ...over.org,
    }),
    platform: area(over.platform),
    children: area({ list: async () => [], ...over.children }),
    goals: area(over.goals),
    appointments: area({
      list: async () => [],
      listRescheduleRequests: async () => [],
      needingSubstitute: async () => [],
      listUnavailability: async () => [],
      checkConflicts: async () => [],
      ...over.appointments,
    }),
    sessions: area(over.sessions),
    checkins: area(over.checkins),
    progress: area(over.progress),
    homePractice: area(over.homePractice),
    media: area(over.media),
    resources: area(over.resources),
    messaging: area(over.messaging),
    notifications: area(over.notifications),
    alerts: area(over.alerts),
    dashboards: area(over.dashboards),
    reports: area(over.reports),
    imports: area(over.imports),
  };
}

export function Wrapper({ children }: { children: ReactNode }) {
  // gcTime Infinity: no cache-eviction timers left running after a test ends.
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } }),
  );
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          {children}
          <ToastHost />
          <ConfirmHost />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
