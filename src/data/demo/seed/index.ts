/**
 * Builds the complete Demo Mode dataset relative to `now`: two schools, people, children with
 * About Me profiles, goals, 8 weeks of logged sessions, 4 weeks ahead, home practice, messages.
 * Deterministic: same `now` → same data and ids (seeded PRNG + stableId).
 */
import { toISODate } from '@/lib/dates';

import { emptyStore, type DemoStore } from '../store';
import { ANVAYA } from './content/anvaya';
import { SAHAJ } from './content/sahaj';
import { buildChildren } from './build/children';
import { buildThreads, finaliseReads } from './build/comms';
import type { Build } from './build/context';
import { buildExtras, buildResources } from './build/extras';
import { buildNotifications } from './build/notifications';
import { buildPeople } from './build/people';
import { buildCheckins, buildHomePractice } from './build/practice';
import { buildSchedule } from './build/schedule';
import { buildSessions } from './build/sessions';

export function buildDemoDataset(now: Date = new Date()): DemoStore {
  const b: Build = {
    now,
    today: toISODate(now),
    store: emptyStore(now.toISOString()),
    schools: [ANVAYA, SAHAJ],
    meta: { unlogged: new Set(), needsSubstitute: [] },
  };
  buildPeople(b);
  buildChildren(b);
  buildSchedule(b);
  buildCheckins(b);
  buildSessions(b);
  buildHomePractice(b);
  buildResources(b);
  buildThreads(b);
  finaliseReads(b);
  buildExtras(b);
  buildNotifications(b);
  return b.store;
}

export { ANVAYA, SAHAJ };
export { ids } from './build/context';
