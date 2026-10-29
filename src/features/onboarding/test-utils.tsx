/**
 * Test helpers for onboarding/account screens (imported by tests only; never by app code).
 * Usage: `await renderScreen(<WelcomeScreen />)`.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { queryClient } from '@/data/queryClient';
import type { AuthUser, Membership, Organization, Role } from '@/domain/types';
import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import { initI18n } from '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ConfirmHost, ToastHost } from '@/ui';

/**
 * Renders with the app's own query client (so `invalidate()` from screens reaches the same cache),
 * cleared and switched to test-friendly defaults: no retries, no GC timers left running.
 */
export function renderScreen(ui: ReactElement) {
  initI18n('en');
  queryClient.clear();
  queryClient.setDefaultOptions({
    queries: { retry: false, gcTime: Infinity, staleTime: 0, refetchInterval: false },
    mutations: { retry: false, gcTime: Infinity },
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {ui}
        <ToastHost />
        <ConfirmHost />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

export const testOrg: Organization = {
  id: 'org1',
  name: 'Sunrise Learning Centre',
  shortName: 'Sunrise',
  city: 'Noida',
  address: 'B-12, Sector 62, Noida',
  phone: '+919810012345',
  email: 'hello@sunrise.example',
  status: 'active',
  settings: DEFAULT_ORG_SETTINGS,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export function testUser(role: Role, opts: { childIds?: string[]; extraMemberships?: Membership[] } = {}): AuthUser {
  return {
    profile: { id: 'u1', fullName: 'Priya Sharma', phone: '+919876543210', preferredLanguage: 'en' },
    memberships: [{ id: 'm1', userId: 'u1', organizationId: role === 'platform_admin' ? null : 'org1', role, status: 'active' }, ...(opts.extraMemberships ?? [])],
    organizations: [testOrg],
    childIds: opts.childIds ?? (role === 'parent' ? ['c1'] : []),
  };
}
