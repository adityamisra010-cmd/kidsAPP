/**
 * Auth: phone OTP (parents and most staff), email + password (staff fallback), session restore.
 * After every sign-in the user's pending invites are accepted (accept_pending_invites links the
 * verified phone/email to the school and children), then the AuthUser is loaded. A user without
 * any active membership gets RepoError('no_membership') and is signed out locally.
 */
import type { AuthUser, Membership, Organization, Profile, UUID } from '@/domain/types';

import { RepoError, type AuthRepo } from '../repository';
import type { AdapterContext } from './context';
import { normalizePhone } from './derive-local';
import { toRepoError } from './errors';
import { membershipFromRow, organizationFromRow, profileFromRow } from './mappers';
import { many, maybe, rpc } from './query';
import type { KeyValueStore } from './session-storage';
import type { MembershipRow, OrganizationRow, ProfileRow } from './rows';

/** Non-secret copy of the last AuthUser so the app can open offline. Cleared on sign-out. */
export const LAST_USER_KEY = 'mkt.supabase.lastUser';

/** E.164 for Indian numbers ("98765 43210" → "+919876543210"); validation error otherwise. */
export function toE164(phone: string): string {
  const e164 = normalizePhone(phone);
  if (!e164 || !/^\+\d{10,15}$/.test(e164)) throw new RepoError('validation', 'Enter a valid mobile number');
  return e164;
}

interface SessionInfo {
  userId: UUID;
  phone?: string;
  email?: string;
  fullName?: string;
}

async function currentSession(c: AdapterContext): Promise<SessionInfo | null> {
  const { data, error } = await c.sb.auth.getSession();
  if (error) throw toRepoError(error);
  const u = data.session?.user;
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as { full_name?: unknown };
  return {
    userId: u.id,
    phone: normalizePhone(u.phone),
    email: u.email ?? undefined,
    fullName: typeof meta.full_name === 'string' ? meta.full_name : undefined,
  };
}

/** Loads profile, memberships, schools and linked children for the signed-in user. */
export async function loadAuthUser(c: AdapterContext, opts: { acceptInvites: boolean }): Promise<AuthUser> {
  const session = await currentSession(c);
  if (!session) throw new RepoError('not_authenticated', 'Not signed in');
  const uid = session.userId;
  if (opts.acceptInvites) await rpc(c.sb, 'accept_pending_invites');

  const [profileRow, membershipRows, guardianRows] = await Promise.all([
    maybe<ProfileRow>(c.sb.from('profiles').select('*').eq('id', uid)),
    many<MembershipRow>(c.sb.from('memberships').select('id,user_id,organization_id,role,status').eq('user_id', uid)),
    many<{ child_id: UUID }>(c.sb.from('child_guardians').select('child_id').eq('user_id', uid)),
  ]);
  const memberships: Membership[] = membershipRows.map(membershipFromRow);
  const active = memberships.filter((m) => m.status === 'active');
  if (active.length === 0) throw new RepoError('no_membership', 'No active school membership');

  const orgIds = [...new Set(active.map((m) => m.organizationId).filter((x): x is UUID => !!x))];
  const organizations: Organization[] = orgIds.length
    ? (await many<OrganizationRow>(c.sb.from('organizations').select('*').in('id', orgIds))).map(organizationFromRow)
    : [];

  const profile: Profile = profileRow
    ? profileFromRow(profileRow)
    : { id: uid, fullName: session.fullName ?? '', phone: session.phone, email: session.email, preferredLanguage: 'en' };

  const user: AuthUser = { profile, memberships, organizations, childIds: [...new Set(guardianRows.map((g) => g.child_id))] };
  c.setUser(user);
  return user;
}

export function createAuthRepo(c: AdapterContext, store: KeyValueStore): AuthRepo {
  async function remember(user: AuthUser): Promise<AuthUser> {
    try {
      await store.setItem(LAST_USER_KEY, JSON.stringify(user));
    } catch {
      // Offline start is a convenience; never fail a sign-in over it.
    }
    return user;
  }

  async function cachedUser(): Promise<AuthUser | null> {
    try {
      const raw = await store.getItem(LAST_USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }

  async function localSignOut(): Promise<void> {
    c.setUser(null);
    c.setContext(null);
    try {
      await c.sb.auth.signOut({ scope: 'local' });
    } catch {
      // nothing to revoke locally
    }
    try {
      await store.removeItem(LAST_USER_KEY);
    } catch {
      // ignore
    }
  }

  /** After a successful credential check: accept invites and load the user. */
  async function afterSignIn(): Promise<AuthUser> {
    try {
      return await remember(await loadAuthUser(c, { acceptInvites: true }));
    } catch (e) {
      const err = toRepoError(e);
      if (err.code === 'no_membership') await localSignOut();
      throw err;
    }
  }

  return {
    async requestOtp(phone) {
      const { error } = await c.sb.auth.signInWithOtp({ phone: toE164(phone), options: { shouldCreateUser: true, channel: 'sms' } });
      if (error) throw toRepoError(error);
    },

    async verifyOtp(phone, code) {
      const token = code.replace(/\D+/g, '');
      if (token.length < 4) throw new RepoError('otp_invalid', 'Enter the code from the SMS');
      const { error } = await c.sb.auth.verifyOtp({ phone: toE164(phone), token, type: 'sms' });
      if (error) throw toRepoError(error);
      return afterSignIn();
    },

    async signInWithPassword(email, password) {
      const { error } = await c.sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw toRepoError(error);
      return afterSignIn();
    },

    async signInDemo() {
      throw new RepoError('validation', 'Demo personas are only available in demo mode');
    },

    async restore() {
      let session: SessionInfo | null;
      try {
        session = await currentSession(c);
      } catch (e) {
        const err = toRepoError(e);
        if (err.code !== 'offline') {
          await localSignOut();
          return null;
        }
        // Token refresh failed for lack of network: open with the last known user.
        const cached = await cachedUser();
        if (cached) c.setUser(cached);
        return cached;
      }
      if (!session) return null;
      try {
        return await remember(await loadAuthUser(c, { acceptInvites: true }));
      } catch (e) {
        const err = toRepoError(e);
        if (err.code === 'offline') {
          const cached = await cachedUser();
          if (cached && cached.profile.id === session.userId) {
            c.setUser(cached);
            return cached;
          }
          throw err;
        }
        if (err.code === 'not_authenticated' || err.code === 'no_membership') {
          await localSignOut();
          return null;
        }
        throw err;
      }
    },

    async refresh() {
      return remember(await loadAuthUser(c, { acceptInvites: true }));
    },

    async signOut() {
      try {
        // Revokes the refresh token on the server; offline this fails and we sign out locally.
        const { error } = await c.sb.auth.signOut();
        if (error) throw error;
      } catch {
        // fall through to the local sign-out
      }
      await localSignOut();
    },
  };
}
