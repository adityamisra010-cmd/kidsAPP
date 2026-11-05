import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AuthUser, DemoPersonaKey, Membership, Organization, Role, UUID } from '@/domain/types';

export type DataMode = 'demo' | 'supabase';

interface SessionState {
  mode: DataMode;
  user: AuthUser | null;
  /** Active membership (role + school). Users with several roles can switch. */
  activeMembershipId: UUID | null;
  /** Parents with several children pick one; screens default to it. */
  activeChildId: UUID | null;
  /** Remembered so reopening the app returns to the same demo role. */
  lastDemoPersona: DemoPersonaKey | null;
  /** Parent consent has been recorded for this user (gates the parent app). */
  consentDone: boolean;

  signedIn: (user: AuthUser, mode: DataMode) => void;
  setUser: (user: AuthUser) => void;
  setActiveMembership: (id: UUID) => void;
  setActiveChild: (id: UUID) => void;
  setConsentDone: (v: boolean) => void;
  signedOut: () => void;
}

function pickMembership(user: AuthUser, preferred?: UUID | null): Membership | undefined {
  const active = user.memberships.filter((m) => m.status === 'active');
  return active.find((m) => m.id === preferred) ?? active[0];
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      mode: 'demo',
      user: null,
      activeMembershipId: null,
      activeChildId: null,
      lastDemoPersona: null,
      consentDone: false,

      signedIn: (user, mode) => {
        const membership = pickMembership(user, get().activeMembershipId);
        set({
          user,
          mode,
          activeMembershipId: membership?.id ?? null,
          activeChildId: user.childIds.includes(get().activeChildId ?? '') ? get().activeChildId : (user.childIds[0] ?? null),
          lastDemoPersona: user.demoPersona ?? null,
          // Demo users are pre-consented so pitches flow; real parents see the consent screen.
          consentDone: mode === 'demo' ? true : get().consentDone,
        });
      },
      setUser: (user) => set({ user }),
      setActiveMembership: (id) => set({ activeMembershipId: id }),
      setActiveChild: (id) => set({ activeChildId: id }),
      setConsentDone: (consentDone) => set({ consentDone }),
      signedOut: () => set({ user: null, activeMembershipId: null, activeChildId: null, lastDemoPersona: null, consentDone: false }),
    }),
    {
      name: 'mkt.session',
      storage: createJSONStorage(() => AsyncStorage),
      // The user object is re-fetched on start; only persist identifiers.
      partialize: (s) => ({
        mode: s.mode,
        activeMembershipId: s.activeMembershipId,
        activeChildId: s.activeChildId,
        lastDemoPersona: s.lastDemoPersona,
        consentDone: s.consentDone,
      }),
    },
  ),
);

export interface ActiveContext {
  user: AuthUser;
  membership: Membership;
  role: Role;
  organization: Organization | undefined;
  orgId: UUID | null;
  childId: UUID | null;
}

/** Convenience hook: the signed-in user's active role/school/child. Null when signed out. */
export function useActive(): ActiveContext | null {
  const user = useSession((s) => s.user);
  const membershipId = useSession((s) => s.activeMembershipId);
  const childId = useSession((s) => s.activeChildId);
  if (!user) return null;
  const membership = pickMembership(user, membershipId);
  if (!membership) return null;
  return {
    user,
    membership,
    role: membership.role,
    organization: user.organizations.find((o) => o.id === membership.organizationId),
    orgId: membership.organizationId,
    childId,
  };
}

/** Same as useActive but throws when used outside the signed-in app (screens under (app)/). */
export function useRequiredActive(): ActiveContext {
  const a = useActive();
  if (!a) throw new Error('useRequiredActive used while signed out');
  return a;
}

export function homeRouteFor(role: Role): string {
  switch (role) {
    case 'parent':
      return '/parent/home';
    case 'therapist':
      return '/therapist/today';
    case 'coordinator':
    case 'school_admin':
      return '/admin/dashboard';
    case 'platform_admin':
      return '/platform/schools';
  }
}
