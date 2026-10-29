/**
 * Demo Mode backend: a seeded, in-memory implementation of `Repository` that enforces the same
 * scoping rules as the production RLS policies. Writes persist for the app session.
 */
import type { Repository } from '@/data/repository';

import { createAuthRepo } from './adapter/auth';
import { createCheckinsRepo, createProgressRepo } from './adapter/care';
import { createChildrenRepo } from './adapter/children';
import { createAlertsRepo, createMessagingRepo, createNotificationsRepo, createResourcesRepo } from './adapter/comms';
import { DemoCore, type DemoOptions } from './adapter/core';
import { createGoalsRepo } from './adapter/goals';
import { createImportsRepo } from './adapter/imports';
import { createDashboardsRepo, createReportsRepo } from './adapter/insights';
import { createMeRepo, createOrgRepo } from './adapter/meOrg';
import { createPlatformRepo } from './adapter/platform';
import { createHomePracticeRepo, createMediaRepo } from './adapter/practice';
import { createSessionsRepo } from './adapter/sessions';
import { createCalendarRepo } from './adapter/appointments';
import { createSubstitutionRepo } from './adapter/substitution';
import type { DemoStore } from './store';

export { DEMO_PERSONAS, type DemoPersona } from './personas';
export { DEMO_OTP, DEMO_PASSWORD } from './adapter/auth';
export type { DemoOptions } from './adapter/core';

/** Test/QA hooks; not part of the Repository contract. */
export interface DemoControls {
  readonly store: DemoStore;
  /** Moves the (frozen) demo clock, e.g. to test the 24-hour lock. */
  setNow(date: Date): void;
  now(): Date;
}

export type DemoRepository = Repository & { readonly demo: DemoControls };

export function createDemoRepository(opts: DemoOptions = {}): DemoRepository {
  const core = new DemoCore(opts);
  return {
    mode: 'demo',
    setContext: (ctx) => {
      core.ctx = ctx;
      if (ctx) core.currentUserId = ctx.userId;
    },
    getContext: () => (core.ctx ? { ...core.ctx } : null),
    auth: createAuthRepo(core),
    me: createMeRepo(core),
    org: createOrgRepo(core),
    platform: createPlatformRepo(core),
    children: createChildrenRepo(core),
    goals: createGoalsRepo(core),
    appointments: { ...createCalendarRepo(core), ...createSubstitutionRepo(core) },
    sessions: createSessionsRepo(core),
    checkins: createCheckinsRepo(core),
    progress: createProgressRepo(core),
    homePractice: createHomePracticeRepo(core),
    media: createMediaRepo(core),
    resources: createResourcesRepo(core),
    messaging: createMessagingRepo(core),
    notifications: createNotificationsRepo(core),
    alerts: createAlertsRepo(core),
    dashboards: createDashboardsRepo(core),
    reports: createReportsRepo(core),
    imports: createImportsRepo(core),
    demo: {
      get store() {
        return core.store;
      },
      setNow: (date) => core.setNow(date),
      now: () => core.now(),
    },
  };
}
