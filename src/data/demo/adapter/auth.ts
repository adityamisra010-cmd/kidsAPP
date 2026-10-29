/** Demo auth: persona sign-in, OTP (code 123456) and staff email/password (Demo@1234). */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AuthRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import type { AuthUser, UUID } from '@/domain/types';
import { uuid } from '@/lib/id';

import { clone, type DemoCore } from './core';

export const DEMO_OTP = '123456';
export const DEMO_PASSWORD = 'Demo@1234';
const STORAGE_KEY = 'mykidstracker.demo.session';

/** "+91 98000 00001", "09800000001", "9800000001" → "+919800000001". */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return raw.trim();
}

const validPhone = (p: string) => /^\+91[6-9]\d{9}$/.test(p);

export function authUser(core: DemoCore, userId: UUID): AuthUser {
  const st = core.db;
  const profile = st.profiles.find((p) => p.id === userId);
  if (!profile) throw new RepoError('not_found', 'User not found.');
  const memberships = st.memberships.filter((m) => m.userId === userId && m.status !== 'suspended');
  const orgIds = new Set(memberships.map((m) => m.organizationId).filter((id): id is UUID => id != null));
  return {
    profile,
    memberships,
    organizations: st.organizations.filter((o) => orgIds.has(o.id)),
    childIds: st.guardians.filter((g) => g.userId === userId).map((g) => g.childId),
    demoPersona: st.personas.find((p) => p.userId === userId)?.key,
  };
}

async function persist(userId: UUID | null): Promise<void> {
  try {
    if (userId) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ userId }));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is a convenience only; the demo works without it.
  }
}

export function createAuthRepo(core: DemoCore): AuthRepo {
  const st = core.db;

  const signIn = async (userId: UUID): Promise<AuthUser> => {
    const membership = st.memberships.find((m) => m.userId === userId && m.status === 'active');
    if (!membership) throw new RepoError('no_membership', 'This account is not linked to a school yet.');
    core.currentUserId = userId;
    core.ctx = { userId, role: membership.role, organizationId: membership.organizationId };
    await persist(userId);
    return clone(authUser(core, userId));
  };

  /** Accepts a pending invite for this phone: creates the profile, membership and child links. */
  const acceptInvite = (phone: string): UUID | undefined => {
    const invite = st.invites.find((i) => i.status === 'pending' && i.phone && normalisePhone(i.phone) === phone);
    if (!invite) return undefined;
    let profile = st.profiles.find((p) => p.phone === phone);
    if (!profile) {
      profile = { id: uuid(), fullName: invite.fullName, phone, email: invite.email, preferredLanguage: 'en' };
      st.profiles.push(profile);
    }
    if (!st.memberships.some((m) => m.userId === profile!.id && m.organizationId === invite.organizationId)) {
      st.memberships.push({ id: uuid(), userId: profile.id, organizationId: invite.organizationId, role: invite.role, status: 'active' });
    }
    for (const childId of invite.childIds) {
      if (!core.isGuardian(profile.id, childId)) st.guardians.push({ childId, userId: profile.id, relation: invite.relation ?? 'Guardian', isPrimary: false });
    }
    invite.status = 'accepted';
    return profile.id;
  };

  return {
    requestOtp: (phone) =>
      core.run(() => {
        if (!validPhone(normalisePhone(phone))) throw new RepoError('validation', 'Enter a 10-digit Indian mobile number.');
      }),
    verifyOtp: async (phone, code) => {
      await core.delay();
      if (code.trim() !== DEMO_OTP) throw new RepoError('otp_invalid', 'That code is not right. In the demo, use 123456.');
      const normalised = normalisePhone(phone);
      const existing = st.profiles.find((p) => p.phone === normalised);
      const userId = existing && st.memberships.some((m) => m.userId === existing.id) ? existing.id : acceptInvite(normalised);
      if (!userId) throw new RepoError('no_membership', 'No school has invited this number yet.');
      return signIn(userId);
    },
    signInWithPassword: async (email, password) => {
      await core.delay();
      const cred = st.credentials.find((c) => c.email.toLowerCase() === email.trim().toLowerCase());
      if (!cred || password !== DEMO_PASSWORD) throw new RepoError('not_authenticated', 'Email or password is incorrect.');
      return signIn(cred.userId);
    },
    signInDemo: async (persona) => {
      await core.delay();
      const p = st.personas.find((x) => x.key === persona);
      if (!p) throw new RepoError('not_found', 'Unknown demo persona.');
      return signIn(p.userId);
    },
    restore: async () => {
      await core.delay(0);
      if (core.currentUserId) return clone(authUser(core, core.currentUserId));
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const userId = raw ? (JSON.parse(raw) as { userId?: UUID }).userId : undefined;
        if (userId && st.profiles.some((p) => p.id === userId)) return await signIn(userId);
      } catch {
        // Corrupt or unavailable storage: start signed out.
      }
      return null;
    },
    refresh: () =>
      core.run(() => {
        if (!core.currentUserId) throw new RepoError('not_authenticated', 'Please sign in first.');
        return authUser(core, core.currentUserId);
      }),
    signOut: async () => {
      core.currentUserId = null;
      core.ctx = null;
      await persist(null);
    },
  };
}
