/**
 * SupabaseAdapter: the real backend behind the Repository interface.
 *
 * Security lives in Postgres (RLS on every table, SECURITY DEFINER RPCs that re-check access);
 * this adapter shapes queries for the active RequestContext (school + role), batches the joins
 * that views need, and maps rows to domain types and errors to RepoError codes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Repository } from '../repository';
import { createAppointmentsRepo } from './appointments';
import { createAuthRepo } from './auth';
import { createChildrenRepo } from './children';
import { createCheckinsRepo } from './checkins';
import { appStore, createSupabaseClient } from './client';
import { AdapterContext } from './context';
import { createDashboardsRepo } from './dashboards';
import { readLocalFile } from './file-reader';
import { createGoalsRepo } from './goals';
import { createHomePracticeRepo } from './home-practice';
import { createImportsRepo } from './imports';
import { createMediaRepo, type FileReader } from './media';
import { createMeRepo } from './me';
import { createMessagingRepo } from './messaging';
import { createAlertsRepo, createNotificationsRepo } from './notifications';
import { createOrgRepo } from './org';
import { createPlatformRepo } from './platform';
import { createProgressRepo } from './progress';
import { createReportsRepo } from './reports';
import { createResourcesRepo } from './resources';
import type { KeyValueStore } from './session-storage';
import { createSessionsRepo } from './sessions';

export interface SupabaseRepositoryDeps {
  /** Non-secret key/value store (cached AuthUser for offline start). */
  store: KeyValueStore;
  /** Reads a local file for uploads. */
  readFile: FileReader;
  now?: () => Date;
}

/** Builds the repository on an existing client (tests pass a fake client and deps). */
export function createRepositoryFromClient(sb: SupabaseClient, deps: SupabaseRepositoryDeps): Repository {
  const c = new AdapterContext(sb, { now: deps.now });
  const sessions = createSessionsRepo(c);
  const messaging = createMessagingRepo(c);
  return {
    mode: 'supabase',
    setContext: (ctx) => c.setContext(ctx),
    getContext: () => c.getContext(),
    auth: createAuthRepo(c, deps.store),
    me: createMeRepo(c),
    org: createOrgRepo(c),
    platform: createPlatformRepo(c),
    children: createChildrenRepo(c),
    goals: createGoalsRepo(c),
    appointments: createAppointmentsRepo(c),
    sessions,
    checkins: createCheckinsRepo(c),
    progress: createProgressRepo(c),
    homePractice: createHomePracticeRepo(c, deps.readFile),
    media: createMediaRepo(c, deps.readFile),
    resources: createResourcesRepo(c),
    messaging,
    notifications: createNotificationsRepo(c),
    alerts: createAlertsRepo(c),
    dashboards: createDashboardsRepo(c, { unreadMessages: () => messaging.unreadCount(), unlogged: () => sessions.unlogged() }),
    reports: createReportsRepo(c),
    imports: createImportsRepo(c),
  };
}

export function createSupabaseRepository(cfg: { url: string; anonKey: string }): Repository {
  return createRepositoryFromClient(createSupabaseClient(cfg), { store: appStore, readFile: readLocalFile });
}

export type { SupabaseMediaUploadInput } from './media';
