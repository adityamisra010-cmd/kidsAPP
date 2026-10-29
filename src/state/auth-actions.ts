/**
 * Sign-in / sign-out / role-switch actions. Screens call these; they keep the repository context,
 * session store, query cache and outbox in sync.
 */
import { createRepository, getRepo, peekRepo, setRepo, supabaseConfig } from '@/data';
import { startOutbox } from '@/data/outbox';
import { queryClient } from '@/data/queryClient';
import type { Repository } from '@/data/repository';
import type { AuthUser, DemoPersonaKey, UUID } from '@/domain/types';

import { useSession, type DataMode } from './session';

let demoRepo: Repository | null = null;
let liveRepo: Repository | null = null;

/** The demo repository lives for the whole app run, so data entered as one persona is visible to the next. */
async function repoFor(mode: DataMode): Promise<Repository> {
  if (mode === 'demo') return (demoRepo ??= await createRepository('demo'));
  return (liveRepo ??= await createRepository('supabase'));
}

function applyContext(repo: Repository) {
  const { user, activeMembershipId } = useSession.getState();
  const m = user?.memberships.find((x) => x.id === activeMembershipId);
  repo.setContext(user && m ? { userId: user.profile.id, role: m.role, organizationId: m.organizationId } : null);
}

async function activate(user: AuthUser, mode: DataMode, repo: Repository) {
  setRepo(repo);
  useSession.getState().signedIn(user, mode);
  applyContext(repo);
  queryClient.clear();
  await startOutbox({ repo: peekRepo, demo: mode === 'demo' });
}

/** Called once on app start. Restores the last session (demo persona or real login). */
export async function bootstrapSession(): Promise<void> {
  const { lastDemoPersona, mode } = useSession.getState();
  try {
    if (lastDemoPersona && mode === 'demo') {
      const repo = await repoFor('demo');
      await activate(await repo.auth.signInDemo(lastDemoPersona), 'demo', repo);
      return;
    }
    if (supabaseConfig()) {
      const repo = await repoFor('supabase');
      setRepo(repo);
      const user = await repo.auth.restore();
      if (user) {
        await activate(user, 'supabase', repo);
        return;
      }
    }
  } catch {
    // Fall through to signed-out state; the welcome screen handles it.
  }
  // Signed out: make sure a repository exists so "Try demo" works instantly.
  if (!peekRepo()) setRepo(await repoFor(supabaseConfig() ? 'supabase' : 'demo'));
  useSession.getState().signedOut();
}

export async function signInDemo(persona: DemoPersonaKey): Promise<AuthUser> {
  const repo = await repoFor('demo');
  const user = await repo.auth.signInDemo(persona);
  await activate(user, 'demo', repo);
  return user;
}

export function isLiveBackendAvailable(): boolean {
  return !!supabaseConfig();
}

export async function requestOtp(phone: string): Promise<void> {
  const repo = await repoFor('supabase');
  await repo.auth.requestOtp(phone);
}

export async function verifyOtp(phone: string, code: string): Promise<AuthUser> {
  const repo = await repoFor('supabase');
  const user = await repo.auth.verifyOtp(phone, code);
  await activate(user, 'supabase', repo);
  return user;
}

export async function signInWithPassword(email: string, password: string): Promise<AuthUser> {
  const repo = await repoFor('supabase');
  const user = await repo.auth.signInWithPassword(email, password);
  await activate(user, 'supabase', repo);
  return user;
}

/** Switch between roles/schools for users with several memberships. */
export function switchMembership(membershipId: UUID) {
  useSession.getState().setActiveMembership(membershipId);
  applyContext(getRepo());
  queryClient.clear();
}

export function switchChild(childId: UUID) {
  useSession.getState().setActiveChild(childId);
}

/** Re-fetch memberships/children (after accepting an invite, editing profile…). */
export async function refreshUser() {
  const user = await getRepo().auth.refresh();
  useSession.getState().setUser(user);
  applyContext(getRepo());
}

export async function signOut() {
  const repo = peekRepo();
  const { mode } = useSession.getState();
  try {
    if (repo && mode === 'supabase') await repo.auth.signOut();
  } finally {
    repo?.setContext(null);
    useSession.getState().signedOut();
    queryClient.clear();
    if (mode === 'supabase' && demoRepo) setRepo(demoRepo);
  }
}
