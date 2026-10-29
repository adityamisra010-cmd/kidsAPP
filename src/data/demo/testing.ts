/** Helpers for Demo Mode tests (kept out of __tests__ so Jest does not treat it as a suite). */
import type { DemoPersonaKey, UUID } from '@/domain/types';

import { createDemoRepository, type DemoRepository } from './index';

/** Wednesday 28 Oct 2026, 12:40 local time: a school day with past and upcoming sessions. */
export const DEMO_NOW = new Date(2026, 9, 28, 12, 40);

export function demoRepo(now: Date = DEMO_NOW): DemoRepository {
  return createDemoRepository({ now, latencyMs: 0 });
}

export async function signedIn(persona: DemoPersonaKey, now: Date = DEMO_NOW): Promise<DemoRepository> {
  const repo = demoRepo(now);
  await repo.auth.signInDemo(persona);
  return repo;
}

/** Switch the request context to any seeded user (first active membership). */
export function actAs(repo: DemoRepository, userId: UUID): void {
  const m = repo.demo.store.memberships.find((x) => x.userId === userId && x.status === 'active');
  if (!m) throw new Error(`No membership for ${userId}`);
  repo.setContext({ userId, role: m.role, organizationId: m.organizationId });
}

export function userByName(repo: DemoRepository, fullName: string): UUID {
  const p = repo.demo.store.profiles.find((x) => x.fullName === fullName);
  if (!p) throw new Error(`No profile named ${fullName}`);
  return p.id;
}

export function childByName(repo: DemoRepository, fullName: string): UUID {
  const c = repo.demo.store.children.find((x) => x.fullName === fullName);
  if (!c) throw new Error(`No child named ${fullName}`);
  return c.id;
}
