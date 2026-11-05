/**
 * Database test runner (invoked by scripts/test-db.sh after the shim, migrations and
 * scripts/db/fixtures.sql are loaded).
 *
 * Proves, against a real Postgres:
 *   - RLS is on for every table and every table is covered by the isolation checks
 *   - School A users cannot read ANY School B rows (and vice versa), nor write into School B
 *   - parents see only their children and never internal notes / clinical / staff-only threads
 *   - therapists: full detail for assigned children, brief-only inside the substitute window,
 *     nothing otherwise
 *   - session logs lock after the window; amendments are recorded
 *   - metric parity: SQL compute_session_metrics == src/domain/metrics.ts on fixtures, and the
 *     save_session pipeline stores the same numbers the TS engine computes
 *   - platform admin, invites, storage policies, reminders and guard triggers
 *
 * Usage: DATABASE_URL=... npx tsx scripts/db/run-tests.ts [--write-fixtures]
 */
/* eslint-disable no-console -- CLI test runner: the PASS/FAIL report is its output. */
import fs from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import {
  checkAlerts,
  computeSessionMetrics,
  masteryMet,
  trialAccuracy,
  type MetricsInput,
  type PreviousSession,
} from '../../src/domain/metrics';
import type { RatingValue, SessionMetrics } from '../../src/domain/types';

// ---------------------------------------------------------------------------
// Fixture ids (keep in sync with scripts/db/fixtures.sql)
// ---------------------------------------------------------------------------
type School = 'a' | 'b';
const id = (p: School, n: number): string => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PLATFORM_ADMIN = 'f0000000-0000-4000-8000-000000000001';

const people = (p: School) => ({
  admin: id(p, 1),
  coord: id(p, 2),
  t1: id(p, 3),
  t2: id(p, 4),
  t3: id(p, 5),
  p1: id(p, 6),
  p2: id(p, 7),
  t4: id(p, 8),
});
type PersonKey = keyof ReturnType<typeof people>;

const things = (p: School) => ({
  org: id(p, 0),
  speech: id(p, 21),
  child1: id(p, 31),
  child2: id(p, 32),
  child3: id(p, 33),
  goal1: id(p, 61),
  goal2: id(p, 62),
  goal3: id(p, 63),
  apptLogged: id(p, 41),
  apptSub: id(p, 42),
  apptFar: id(p, 43),
  apptChild2: id(p, 44),
  apptToLog: id(p, 45),
  apptCancelled: id(p, 46),
  apptUnlogged: id(p, 47),
  apptParentCancel: id(p, 48),
  session1: id(p, 51),
  session2: id(p, 52),
  thread: id(p, 71),
  staffThread: id(p, 72),
  homeTask: id(p, 81),
  homeLog: id(p, 82),
  media: id(p, 83),
  staffResource: id(p, 84),
  parentResource: id(p, 88),
});

const FIXTURES_FILE = path.resolve(process.cwd(), 'src/domain/__fixtures__/metrics-cases.json');

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------
interface Result {
  section: string;
  name: string;
  ok: boolean;
  detail?: string;
}
const results: Result[] = [];
let currentSection = '';

function section(name: string): void {
  currentSection = name;
  console.log(`\n== ${name}`);
}

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ section: currentSection, name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `\n        ${detail}` : ''}`);
}

function errText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const err = e as { code?: string; message: string; detail?: string };
    return `${err.code ?? ''} ${err.message}${err.detail && err.detail !== err.message ? ` (${err.detail})` : ''}`.trim();
  }
  return String(e);
}

async function expectError(name: string, fn: () => Promise<unknown>, match: RegExp): Promise<void> {
  try {
    await fn();
    check(name, false, 'expected an error, got success');
  } catch (e) {
    const msg = errText(e);
    check(name, match.test(msg), `unexpected error: ${msg}`);
  }
}

/** Order-insensitive deep equality on JSON values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao).sort();
    const bk = Object.keys(bo).sort();
    return deepEqual(ak, bk) && ak.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

/** JSON round-trip: drops undefined keys, like the SQL side drops nulls. */
function plain<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v));
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------
type Row = pg.QueryResultRow;
type Query = <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<T[]>;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

/** Superuser query (bypasses RLS) for setup and assertions about stored state. */
const su: Query = async <T extends Row = Row>(sql: string, params: unknown[] = []) =>
  (await client.query<T>(sql, params)).rows;

type ApiRole = 'authenticated' | 'anon' | 'service_role';

/**
 * Runs `fn` as an API user the way PostgREST does: inside a transaction, `set local role`, and
 * the JWT claims in request.jwt.claim(s). Rolls back unless `commit` is set.
 */
async function as<T>(
  user: string | null,
  fn: (q: Query) => Promise<T>,
  opts: { role?: ApiRole; commit?: boolean } = {},
): Promise<T> {
  const role = opts.role ?? 'authenticated';
  await client.query('begin');
  try {
    await client.query(`set local role ${role}`);
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`,
      [user ?? '', JSON.stringify(user ? { sub: user, role } : { role })],
    );
    const out = await fn(su);
    await client.query(opts.commit ? 'commit' : 'rollback');
    return out;
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}

async function count(user: string | null, sql: string, params: unknown[] = []): Promise<number> {
  return as(user, async (q) =>
    Number((await q<{ n: string }>(`select count(*)::text as n from (${sql}) x`, params))[0].n),
  );
}

async function rpc<T = unknown>(
  user: string | null,
  fn: string,
  args: unknown[],
  opts: { commit?: boolean; role?: ApiRole } = {},
): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  return as(user, async (q) => (await q<{ r: T }>(`select public.${fn}(${placeholders}) as r`, args))[0].r, opts);
}

async function suCount(sql: string, params: unknown[] = []): Promise<number> {
  return Number((await su<{ n: string }>(`select count(*)::text as n from (${sql}) x`, params))[0].n);
}

// ---------------------------------------------------------------------------
// Metric fixture cases
// ---------------------------------------------------------------------------
interface MetricCase {
  name: string;
  description: string;
  input: MetricsInput;
  expected: SessionMetrics;
}

const DEFAULT_KEYS = [
  'engagement',
  'attention',
  'regulation',
  'mood',
  'cooperation',
  'independence',
  'communication',
  'transitions',
];
const defaultDims = DEFAULT_KEYS.map((key) => ({ key, weight: 1, enabled: true }));
const allDims = (v: RatingValue): Record<string, RatingValue> => Object.fromEntries(DEFAULT_KEYS.map((k) => [k, v]));
const ratingsOf = (values: number[]): Record<string, RatingValue> =>
  Object.fromEntries(DEFAULT_KEYS.map((k, i) => [k, values[i % values.length] as RatingValue]));
const prevOf = (sessionScore: number, ratings: Record<string, number>, deltaRolling?: number): PreviousSession => ({
  sessionScore,
  ratings,
  deltaRolling,
});

function buildCases(): Omit<MetricCase, 'expected'>[] {
  return [
    {
      name: 'first_session',
      description: 'No previous sessions: no deltas, no rolling average, flat trend.',
      input: {
        ratings: ratingsOf([4, 3, 5, 4, 3, 2, 4, 5]),
        goalTrials: [{ attempted: 10, successful: 7 }],
        incidents: [],
        dimensions: defaultDims,
        previous: [],
      },
    },
    {
      name: 'one_previous',
      description: 'One previous session: deltaLast only (rolling needs 2).',
      input: {
        ratings: allDims(4),
        goalTrials: [],
        incidents: [],
        dimensions: defaultDims,
        previous: [prevOf(50, allDims(3))],
      },
    },
    {
      name: 'two_previous',
      description: 'Two previous: rolling average defined; 3-point trend.',
      input: {
        ratings: ratingsOf([4, 4, 3, 5, 4, 3, 4, 4]),
        goalTrials: [{ attempted: 6, successful: 4 }],
        incidents: [],
        dimensions: defaultDims,
        previous: [
          prevOf(59.4, ratingsOf([3, 4, 3, 4, 4, 3, 3, 4])),
          prevOf(46.9, ratingsOf([3, 3, 3, 3, 3, 3, 3, 4])),
        ],
      },
    },
    {
      name: 'four_previous',
      description: 'Exactly the 4-session rolling window.',
      input: {
        ratings: ratingsOf([5, 4, 4, 5, 4, 4, 5, 4]),
        goalTrials: [
          { attempted: 10, successful: 9 },
          { attempted: 5, successful: 3 },
        ],
        incidents: [],
        dimensions: defaultDims,
        previous: [
          prevOf(71.9, ratingsOf([4, 4, 4, 4, 4, 3, 4, 4])),
          prevOf(65.6, ratingsOf([4, 3, 4, 4, 3, 3, 4, 4])),
          prevOf(62.5, ratingsOf([3, 4, 3, 4, 4, 3, 4, 3])),
          prevOf(56.3, ratingsOf([3, 3, 4, 3, 3, 3, 4, 3])),
        ],
      },
    },
    {
      name: 'five_previous_window_cap',
      description: '5 previous: rolling uses 4, trend uses 5 + current; the oldest only feeds the trend.',
      input: {
        ratings: allDims(4),
        goalTrials: [],
        incidents: [],
        dimensions: defaultDims,
        previous: [
          prevOf(50, allDims(3)),
          prevOf(50, allDims(3)),
          prevOf(25, allDims(2)),
          prevOf(25, allDims(2)),
          prevOf(0, allDims(1)),
        ],
      },
    },
    {
      name: 'seven_previous_trend_window',
      description: '7 previous: trend only sees the newest 5 previous + current.',
      input: {
        ratings: allDims(3),
        goalTrials: [],
        incidents: [],
        dimensions: defaultDims,
        previous: [
          prevOf(50, allDims(3)),
          prevOf(50, allDims(3)),
          prevOf(50, allDims(3)),
          prevOf(50, allDims(3)),
          prevOf(50, allDims(3)),
          prevOf(100, allDims(5)),
          prevOf(0, allDims(1)),
        ],
      },
    },
    {
      name: 'weighted_dimensions',
      description: 'Per-school weights (3, 1, 2, 0.5) change the score.',
      input: {
        ratings: { engagement: 5, attention: 2, regulation: 4, mood: 1 },
        goalTrials: [],
        incidents: [],
        dimensions: [
          { key: 'engagement', weight: 3, enabled: true },
          { key: 'attention', weight: 1, enabled: true },
          { key: 'regulation', weight: 2, enabled: true },
          { key: 'mood', weight: 0.5, enabled: true },
        ],
        previous: [
          prevOf(60.2, { engagement: 4, attention: 3, regulation: 3, mood: 2 }),
          prevOf(55.1, { engagement: 3, attention: 3, regulation: 3, mood: 3 }),
        ],
      },
    },
    {
      name: 'disabled_and_zero_weight_dimensions',
      description:
        'Disabled dims are ignored everywhere; an enabled weight-0 dim is excluded from the score but still gets deltas.',
      input: {
        ratings: { engagement: 4, attention: 1, mood: 2, transitions: 5 },
        goalTrials: [],
        incidents: [],
        dimensions: [
          { key: 'engagement', weight: 1, enabled: true },
          { key: 'attention', weight: 1, enabled: false },
          { key: 'mood', weight: 0, enabled: true },
          { key: 'transitions', weight: 2, enabled: true },
        ],
        previous: [
          prevOf(80, { engagement: 3, attention: 5, mood: 4, transitions: 4 }),
          prevOf(70, { engagement: 3, attention: 5, mood: 3, transitions: 4 }),
        ],
      },
    },
    {
      name: 'negative_deltas_half_rounding',
      description:
        'Negative .x5 values round away from zero (-1.25 -> -1.3); rolling 62.55 -> 62.6; goal accuracy 6.25 -> 6.3.',
      input: {
        ratings: allDims(2),
        goalTrials: [
          { attempted: 16, successful: 1 },
          { attempted: 2, successful: 1 },
        ],
        incidents: [],
        dimensions: defaultDims,
        previous: [
          prevOf(62.6, allDims(3)),
          prevOf(62.5, allDims(3)),
          prevOf(62.5, allDims(4)),
          prevOf(62.5, allDims(3)),
        ],
      },
    },
    {
      name: 'trend_up',
      description: 'Steadily rising scores: up.',
      input: {
        ratings: allDims(5),
        goalTrials: [],
        incidents: [],
        dimensions: defaultDims,
        previous: [prevOf(87.5, allDims(4)), prevOf(75, allDims(4)), prevOf(62.5, allDims(3)), prevOf(50, allDims(3))],
      },
    },
    {
      name: 'trend_down',
      description: 'Steadily falling scores: down, with negative deltas.',
      input: {
        ratings: allDims(1),
        goalTrials: [],
        incidents: [],
        dimensions: defaultDims,
        previous: [
          prevOf(25, allDims(2)),
          prevOf(43.8, allDims(3)),
          prevOf(56.3, allDims(3)),
          prevOf(68.8, allDims(4)),
          prevOf(81.3, allDims(4)),
        ],
      },
    },
    {
      name: 'trend_flat_noisy',
      description: 'Noisy but level series: flat.',
      input: {
        ratings: ratingsOf([3, 4, 3, 3, 4, 3, 3, 3]),
        goalTrials: [],
        incidents: [],
        dimensions: defaultDims,
        previous: [
          prevOf(56.3, ratingsOf([4, 3, 3, 4, 3, 3, 3, 3])),
          prevOf(53.1, ratingsOf([3, 3, 4, 3, 3, 3, 4, 3])),
          prevOf(59.4, ratingsOf([4, 4, 3, 3, 4, 3, 3, 3])),
        ],
      },
    },
    {
      name: 'trend_threshold_float_edge',
      description:
        'Series 38.8, 36.3, 33.8, 31.3 has an exact slope of -2.5 but JS doubles give -2.499999999999999 (flat). SQL uses float8 in the same order, so both say flat.',
      input: {
        ratings: { engagement: 3, mood: 2 },
        goalTrials: [],
        incidents: [],
        dimensions: [
          { key: 'engagement', weight: 1, enabled: true },
          { key: 'mood', weight: 3, enabled: true },
        ],
        previous: [
          prevOf(33.8, { engagement: 3, mood: 2 }),
          prevOf(36.3, { engagement: 3, mood: 3 }),
          prevOf(38.8, { engagement: 3, mood: 3 }),
        ],
      },
    },
    {
      name: 'incidents_and_trial_edges',
      description: '3 incidents; trials with 0 attempts are skipped; successful > attempted is capped.',
      input: {
        ratings: allDims(2),
        goalTrials: [
          { attempted: 0, successful: 0 },
          { attempted: 3, successful: 5 },
          { attempted: 3, successful: 1 },
        ],
        incidents: [
          { type: 'meltdown', durationSeconds: 120, antecedentTags: ['transition'] },
          { type: 'aggression', antecedentTags: ['demand'] },
          { type: 'refusal', antecedentTags: [] },
        ],
        dimensions: defaultDims,
        previous: [prevOf(50, allDims(3), -2), prevOf(50, allDims(3))],
      },
    },
    {
      name: 'sparse_previous_dimensions',
      description:
        'A dimension missing from older sessions: deltaLast from the last session only, rolling from the values that exist.',
      input: {
        ratings: { engagement: 4, attention: 4, communication: 3 },
        goalTrials: [],
        incidents: [],
        dimensions: [
          { key: 'engagement', weight: 1, enabled: true },
          { key: 'attention', weight: 1, enabled: true },
          { key: 'communication', weight: 1, enabled: true },
        ],
        previous: [
          prevOf(66.7, { engagement: 4, attention: 3 }),
          prevOf(58.3, { engagement: 3, attention: 3, communication: 2 }),
          prevOf(50, { engagement: 3, attention: 3, communication: 3 }),
          prevOf(41.7, { engagement: 2, attention: 3, communication: 3 }),
          prevOf(41.7, { engagement: 2, attention: 3, communication: 2 }),
        ],
      },
    },
    {
      name: 'nothing_rated',
      description: 'No ratings at all: score 0 and no dimension entries.',
      input: {
        ratings: {},
        goalTrials: [],
        incidents: [],
        dimensions: defaultDims,
        previous: [prevOf(50, allDims(3)), prevOf(40, allDims(3))],
      },
    },
  ];
}

function loadOrWriteCases(): MetricCase[] {
  const write = process.argv.includes('--write-fixtures') || !fs.existsSync(FIXTURES_FILE);
  if (write) {
    const cases: MetricCase[] = buildCases().map((c) => ({
      ...c,
      expected: plain(computeSessionMetrics(c.input)) as SessionMetrics,
    }));
    fs.mkdirSync(path.dirname(FIXTURES_FILE), { recursive: true });
    fs.writeFileSync(FIXTURES_FILE, `${JSON.stringify(cases, null, 2)}\n`);
    console.log(`  wrote ${cases.length} cases to ${path.relative(process.cwd(), FIXTURES_FILE)}`);
    return cases;
  }
  return JSON.parse(fs.readFileSync(FIXTURES_FILE, 'utf8')) as MetricCase[];
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
const USER_SCOPED_TABLES: Record<string, string> = {
  profiles: 'id',
  push_tokens: 'user_id',
  notification_mutes: 'user_id',
};

async function tenantTables(): Promise<string[]> {
  const rows = await su<{ table_name: string }>(
    `select c.table_name from information_schema.columns c
     join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'organization_id' and t.table_type = 'BASE TABLE'
     order by 1`,
  );
  return rows.map((r) => r.table_name);
}

async function testStructure(): Promise<void> {
  section('Structure');
  const tables = await su<{ name: string; rls: boolean }>(
    `select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by 1`,
  );
  const noRls = tables.filter((t) => !t.rls).map((t) => t.name);
  check(`RLS enabled on all ${tables.length} public tables`, noRls.length === 0, noRls.join(', '));

  const tenant = new Set(await tenantTables());
  const uncovered = tables
    .map((t) => t.name)
    .filter((t) => !tenant.has(t) && !(t in USER_SCOPED_TABLES) && t !== 'organizations');
  check(
    'every table is covered by an isolation rule (organization_id or user-scoped)',
    uncovered.length === 0,
    uncovered.join(', '),
  );

  const storageRls = await su<{ rls: boolean }>(
    `select relrowsecurity as rls from pg_class where oid = 'storage.objects'::regclass`,
  );
  check('RLS enabled on storage.objects', storageRls[0].rls === true);

  const buckets = await su<{ id: string; public: boolean }>(`select id, public from storage.buckets order by id`);
  check(
    'buckets avatars, media, org-assets, resources exist and none is public',
    buckets.map((b) => b.id).join(',') === 'avatars,media,org-assets,resources' && buckets.every((b) => !b.public),
    JSON.stringify(buckets),
  );
  const media = await su<{ file_size_limit: string; allowed_mime_types: string[] }>(
    `select file_size_limit::text, allowed_mime_types from storage.buckets where id = 'media'`,
  );
  check(
    'media bucket: 25 MB, video/* + image/*',
    media[0].file_size_limit === '26214400' && media[0].allowed_mime_types.join(',') === 'video/*,image/*',
  );

  await expectError(
    'anon cannot read any table',
    () => as(null, (q) => q('select * from public.children'), { role: 'anon' }),
    /permission denied/,
  );
  await expectError(
    'anon cannot call RPCs',
    () => as(null, (q) => q(`select public.parent_session_snapshot($1)`, [things('a').session1]), { role: 'anon' }),
    /permission denied/,
  );
}

async function testTenantIsolation(): Promise<void> {
  section('Tenant isolation (School A vs School B)');
  const tables = await tenantTables();
  for (const [mine, other] of [
    ['a', 'b'],
    ['b', 'a'],
  ] as [School, School][]) {
    const otherOrg = things(other).org;
    if (mine === 'a') {
      const empty: string[] = [];
      for (const t of tables) {
        if ((await suCount(`select 1 from public.${t} where organization_id = $1`, [otherOrg])) === 0) empty.push(t);
      }
      check(
        `fixtures have School B rows in all ${tables.length} tenant tables`,
        empty.length === 0,
        `no rows: ${empty.join(', ')}`,
      );
    }
    const unionSql = tables
      .map((t) => `select '${t}' as t, count(*) as n from public.${t} where organization_id = $1`)
      .join(' union all ');
    const otherUsers = Object.values(people(other));
    for (const [role, uid] of Object.entries(people(mine)) as [PersonKey, string][]) {
      const leaks = await as(uid, async (q) => {
        const rows = await q<{ t: string; n: string }>(unionSql, [otherOrg]);
        const found = rows.filter((r) => Number(r.n) > 0).map((r) => `${r.t}=${r.n}`);
        const orgs = await q(`select 1 from public.organizations where id = $1`, [otherOrg]);
        if (orgs.length) found.push('organizations');
        for (const [t, col] of Object.entries(USER_SCOPED_TABLES)) {
          const n = await q(`select 1 from public.${t} where ${col} = any($1::uuid[])`, [otherUsers]);
          if (n.length) found.push(`${t}=${n.length}`);
        }
        const objs = await q(`select 1 from storage.objects where name like $1`, [`${otherOrg}/%`]);
        if (objs.length) found.push(`storage.objects=${objs.length}`);
        return found;
      });
      check(
        `${role}@${mine.toUpperCase()} reads 0 rows of School ${other.toUpperCase()} (${tables.length} tables + profiles/tokens/mutes/storage)`,
        leaks.length === 0,
        leaks.join(', '),
      );
    }
  }

  const A = things('a');
  const B = things('b');
  const pa = people('a');
  await expectError(
    'A admin cannot call admin_dashboard for School B',
    () => rpc(pa.admin, 'admin_dashboard', [B.org, null]),
    /forbidden/,
  );
  await expectError(
    'A therapist cannot open a School B handover brief',
    () => rpc(pa.t1, 'handover_brief', [B.apptSub]),
    /forbidden|not_found/,
  );
  await expectError(
    'A parent cannot read a School B parent snapshot',
    () => rpc(pa.p1, 'parent_session_snapshot', [B.session1]),
    /not_found/,
  );
  await expectError(
    'A parent cannot read School B parent goals',
    () => rpc(pa.p1, 'parent_goals', [B.child1]),
    /not_found/,
  );
  await expectError(
    'A admin cannot assign a substitute in School B',
    () => rpc(pa.admin, 'assign_substitute', [B.apptFar, pa.t2]),
    /not_found/,
  );
  await expectError(
    'A therapist cannot log a School B session',
    () => rpc(pa.t1, 'save_session', [JSON.stringify(sessionPayload(B.apptToLog, B.goal1, [4]))]),
    /not_found/,
  );
  await expectError(
    'A admin cannot insert a child into School B',
    () =>
      as(pa.admin, (q) =>
        q(`insert into public.children (organization_id, full_name, dob) values ($1, 'X', '2020-01-01')`, [B.org]),
      ),
    /row-level security/,
  );
  const updated = await as(
    pa.admin,
    async (q) =>
      (await q(`update public.children set full_name = 'hacked' where organization_id = $1 returning id`, [B.org]))
        .length,
  );
  check('A admin updates 0 School B children', updated === 0);
  await expectError(
    'rows cannot be moved to another school',
    () =>
      as(pa.admin, (q) => q(`update public.therapy_types set organization_id = $1 where id = $2`, [B.org, A.speech])),
    /organization_id cannot be changed/,
  );
  await expectError(
    'A therapist cannot add a goal to a School B child',
    () =>
      as(pa.t1, (q) =>
        q(`insert into public.goals (child_id, therapy_type_id, domain, staff_text) values ($1, $2, 'social', 'x')`, [
          B.child1,
          A.speech,
        ]),
      ),
    /row-level security|validation|forbidden/,
  );
  await expectError(
    'A admin cannot schedule a School B therapist',
    () =>
      as(pa.admin, (q) =>
        q(
          `insert into public.appointments (child_id, therapist_id, therapy_type_id, starts_at, ends_at) values ($1, $2, $3, now() + interval '1 day', now() + interval '1 day 45 minutes')`,
          [A.child1, people('b').t1, A.speech],
        ),
      ),
    /validation/,
  );
  await expectError(
    'A admin cannot create memberships directly (only via invites)',
    () =>
      as(pa.admin, (q) =>
        q(`insert into public.memberships (user_id, organization_id, role) values ($1, $2, 'parent')`, [
          people('b').p1,
          A.org,
        ]),
      ),
    /row-level security/,
  );
}

async function testParents(): Promise<void> {
  section('Parent scoping');
  const A = things('a');
  const pa = people('a');
  const kids = await as(pa.p1, async (q) =>
    (await q<{ id: string }>(`select id from public.children order by id`)).map((r) => r.id),
  );
  check('parent 1 sees exactly their child', deepEqual(kids, [A.child1]), JSON.stringify(kids));
  const kids2 = await as(pa.p2, async (q) =>
    (await q<{ id: string }>(`select id from public.children order by id`)).map((r) => r.id),
  );
  check('parent 2 sees exactly their child', deepEqual(kids2, [A.child2]), JSON.stringify(kids2));

  for (const t of [
    'child_clinical',
    'session_notes',
    'sessions',
    'session_ratings',
    'goal_trials',
    'behaviour_incidents',
    'goals',
    'alerts',
    'amendments',
    'audit_log',
    'profile_edits',
  ]) {
    check(
      `parent reads 0 rows from ${t} (own child included)`,
      (await count(pa.p1, `select * from public.${t}`)) === 0,
    );
  }
  check(
    'parent cannot select session_notes.subjective for own child',
    (await count(pa.p1, `select subjective from public.session_notes where session_id = $1`, [A.session1])) === 0,
  );
  check(
    'parent reads About Me of own child',
    (await count(pa.p1, `select * from public.child_profiles where child_id = $1`, [A.child1])) === 1,
  );
  check(
    'parent cannot read About Me of other child',
    (await count(pa.p1, `select * from public.child_profiles where child_id = $1`, [A.child2])) === 0,
  );

  const threads = await as(pa.p1, async (q) =>
    (await q<{ id: string }>(`select id from public.threads order by id`)).map((r) => r.id),
  );
  check(
    'parent sees the care-team thread but not the staff-only thread',
    deepEqual(threads, [A.thread]),
    JSON.stringify(threads),
  );
  const secretMsgs = await count(pa.p1, `select * from public.messages where body like 'STAFF-ONLY-SECRET%'`);
  check('parent cannot read staff-only messages', secretMsgs === 0);
  await expectError(
    'a parent can never be added to a staff-only thread',
    () => su(`insert into public.thread_members (thread_id, user_id) values ($1, $2)`, [A.staffThread, pa.p1]),
    /validation/,
  );
  await expectError(
    "another child's parent cannot be added to a care-team thread",
    () => su(`insert into public.thread_members (thread_id, user_id) values ($1, $2)`, [A.thread, pa.p2]),
    /validation/,
  );

  const snap = await rpc<Record<string, unknown>>(pa.p1, 'parent_session_snapshot', [A.session1]);
  const snapText = JSON.stringify(snap);
  check(
    'parent snapshot has the parent summary and highlights',
    snap.parentSummary === 'Parent summary a' &&
      Array.isArray(snap.highlights) &&
      (snap.highlights as unknown[]).length === 4,
    snapText,
  );
  check(
    'parent snapshot contains no SOAP / internal / clinical text',
    !/SECRET|subjective|assessment|objective|planNext/i.test(snapText),
    snapText,
  );
  check('parent snapshot hides the numeric score by default', !('sessionScore' in snap));
  await su(`update public.organizations set settings = settings || '{"parentsSeeNumericScore": true}' where id = $1`, [
    A.org,
  ]);
  const snapNumeric = await rpc<Record<string, unknown>>(pa.p1, 'parent_session_snapshot', [A.session1]);
  check('parent snapshot shows the score when the school enables it', typeof snapNumeric.sessionScore === 'number');
  await su(`update public.organizations set settings = settings - 'parentsSeeNumericScore' where id = $1`, [A.org]);

  const snaps = await rpc<unknown[]>(pa.p1, 'parent_session_snapshots', [A.child1, 10]);
  check('parent_session_snapshots returns own child sessions', Array.isArray(snaps) && snaps.length >= 1);
  await expectError(
    'parent cannot read a snapshot of another child',
    () => rpc(pa.p1, 'parent_session_snapshot', [A.session2]),
    /not_found/,
  );
  await expectError(
    'parent cannot list snapshots of another child',
    () => rpc(pa.p1, 'parent_session_snapshots', [A.child2, 10]),
    /not_found/,
  );

  const goals = await rpc<Record<string, unknown>[]>(pa.p1, 'parent_goals', [A.child1]);
  check(
    'parent_goals returns parent wording only',
    goals.length === 1 &&
      goals[0].parentText === 'Asks for things using pictures' &&
      !/STAFF-GOAL|BASELINE/.test(JSON.stringify(goals)),
    JSON.stringify(goals),
  );
  const progress = await rpc<{ byTherapy: unknown[] }>(pa.p1, 'parent_progress', [A.child1, null]);
  check(
    'parent_progress returns per-therapy trends',
    Array.isArray(progress.byTherapy) && progress.byTherapy.length === 1,
    JSON.stringify(progress),
  );
  check('child_access = parent for own child', (await rpc<string>(pa.p1, 'child_access', [A.child1])) === 'parent');

  const res = await as(pa.p1, async (q) =>
    (await q<{ id: string }>(`select id from public.resources where organization_id is not null order by id`)).map(
      (r) => r.id,
    ),
  );
  check(
    'parent sees parent resources but not staff-only resources',
    deepEqual(res, [A.parentResource]),
    JSON.stringify(res),
  );

  const profiles = await as(pa.p1, async (q) =>
    (await q<{ id: string }>(`select id from public.profiles`)).map((r) => r.id),
  );
  check(
    'parent can read their child’s therapist, coordinator and admin',
    [pa.t1, pa.coord, pa.admin].every((u) => profiles.includes(u)),
  );
  check(
    'parent cannot read other parents or unrelated therapists',
    ![pa.p2, pa.t3].some((u) => profiles.includes(u)),
    JSON.stringify(profiles),
  );
  const ann = await as(pa.p1, async (q) =>
    (await q<{ title: string }>(`select title from public.announcements order by title`)).map((r) => r.title),
  );
  check('parent sees "everyone" announcements, not staff ones', deepEqual(ann, ['Holiday a']), JSON.stringify(ann));
}

async function testTherapists(): Promise<void> {
  section('Therapist scoping');
  const A = things('a');
  const pa = people('a');

  // t1: assigned to child1
  check(
    'assigned therapist reads clinical of assigned child',
    (await count(pa.t1, `select * from public.child_clinical where child_id = $1`, [A.child1])) === 1,
  );
  check(
    'assigned therapist reads SOAP notes of assigned child',
    (await count(pa.t1, `select * from public.session_notes where session_id = $1`, [A.session1])) === 1,
  );
  check(
    'assigned therapist cannot read another child’s clinical',
    (await count(pa.t1, `select * from public.child_clinical where child_id = $1`, [A.child2])) === 0,
  );
  const t1Kids = await as(pa.t1, async (q) =>
    (await q<{ id: string }>(`select id from public.children where id in ($1, $2)`, [A.child1, A.child2])).map(
      (r) => r.id,
    ),
  );
  check('assigned therapist sees child1 but not child2', deepEqual(t1Kids, [A.child1]), JSON.stringify(t1Kids));
  check(
    'child_access = full for assigned therapist',
    (await rpc<string>(pa.t1, 'child_access', [A.child1])) === 'full',
  );
  const fullBrief = await rpc<Record<string, Record<string, unknown>>>(pa.t1, 'handover_brief', [A.apptSub]);
  check('assigned therapist brief includes clinical', fullBrief.profile?.clinical !== undefined);

  // t2: substitute on appointment 42 (in 2 hours)
  check(
    'substitute reads About Me (brief)',
    (await count(pa.t2, `select * from public.child_profiles where child_id = $1`, [A.child1])) === 1,
  );
  check(
    'substitute reads goals (brief)',
    (await count(pa.t2, `select * from public.goals where child_id = $1`, [A.child1])) === 1,
  );
  check(
    'substitute reads recent session summaries (brief)',
    (await count(pa.t2, `select * from public.sessions where child_id = $1`, [A.child1])) >= 1,
  );
  check(
    'substitute cannot read clinical',
    (await count(pa.t2, `select * from public.child_clinical where child_id = $1`, [A.child1])) === 0,
  );
  check('substitute cannot read SOAP notes', (await count(pa.t2, `select * from public.session_notes`)) === 0);
  check(
    'child_access = brief_only for substitute',
    (await rpc<string>(pa.t2, 'child_access', [A.child1])) === 'brief_only',
  );
  const brief = await rpc<Record<string, unknown>>(pa.t2, 'handover_brief', [A.apptSub]);
  const briefText = JSON.stringify(brief);
  check(
    'substitute brief: plan for today, goals, recent sessions, must acknowledge, no clinical',
    (brief.planForToday as Record<string, unknown> | null)?.text !== undefined &&
      (brief.goals as unknown[]).length === 1 &&
      (brief.recentSessions as unknown[]).length >= 1 &&
      brief.mustAcknowledge === true &&
      brief.acknowledged === true &&
      !briefText.includes('CLINICAL-SECRET') &&
      !('clinical' in (brief.profile as Record<string, unknown>)),
    briefText.slice(0, 400),
  );

  // window boundaries: move appointment 42 around
  const windowAccess = async (startsIn: string, endsIn: string): Promise<number> => {
    await su(`select set_config('app.suppress_appointment_notify', 'on', false)`);
    await su(
      `update public.appointments set starts_at = now() + $2::interval, ends_at = now() + $3::interval where id = $1`,
      [A.apptSub, startsIn, endsIn],
    );
    await su(`select set_config('app.suppress_appointment_notify', 'off', false)`);
    return count(pa.t2, `select * from public.child_profiles where child_id = $1`, [A.child1]);
  };
  check('substitute window: 23h before start → access', (await windowAccess('23 hours', '23 hours 45 minutes')) === 1);
  check(
    'substitute window: 25h before start → no access',
    (await windowAccess('25 hours', '25 hours 45 minutes')) === 0,
  );
  await expectError(
    'substitute outside the window cannot open the brief',
    () => rpc(pa.t2, 'handover_brief', [A.apptSub]),
    /forbidden/,
  );
  check(
    'substitute outside the window still sees the child’s name on their calendar',
    (await count(pa.t2, `select id, full_name from public.children where id = $1`, [A.child1])) === 1,
  );
  check(
    'substitute outside the window cannot read goals',
    (await count(pa.t2, `select * from public.goals where child_id = $1`, [A.child1])) === 0,
  );
  check('substitute window: ended 23h ago → access', (await windowAccess('-24 hours', '-23 hours')) === 1);
  check('substitute window: ended 25h ago → no access', (await windowAccess('-26 hours', '-25 hours')) === 0);
  await windowAccess('2 hours', '2 hours 45 minutes');

  // t4: appointment in 3 days
  check(
    'therapist with a session in 3 days has no brief access yet',
    (await count(pa.t4, `select * from public.child_profiles where child_id = $1`, [A.child1])) === 0,
  );
  await expectError(
    'therapist with a session in 3 days cannot open the brief yet',
    () => rpc(pa.t4, 'handover_brief', [A.apptFar]),
    /forbidden/,
  );

  // t3: assigned to child2; cancelled appointment with child1 inside the window
  for (const t of [
    'child_profiles',
    'goals',
    'sessions',
    'child_clinical',
    'home_tasks',
    'alerts',
    'parent_checkins',
  ]) {
    check(
      `unrelated therapist reads 0 ${t} of child1 (cancelled appointment gives no access)`,
      (await count(pa.t3, `select * from public.${t} where child_id = $1`, [A.child1])) === 0,
    );
  }
  check(
    'unrelated therapist cannot see child1 at all',
    (await count(pa.t3, `select * from public.children where id = $1`, [A.child1])) === 0,
  );
  check(
    'unrelated therapist cannot read the staff-only thread of child1',
    (await count(pa.t3, `select * from public.threads where child_id = $1`, [A.child1])) === 0,
  );
  check(
    'child_access = none for unrelated therapist',
    (await rpc<string>(pa.t3, 'child_access', [A.child1])) === 'none',
  );
  check(
    'therapist reads guardians of their own child',
    (await count(pa.t3, `select * from public.profiles where id = $1`, [pa.p2])) === 1,
  );
  check(
    'therapist cannot read guardians of other children',
    (await count(pa.t3, `select * from public.profiles where id = $1`, [pa.p1])) === 0,
  );

  // coordinator / admin: everything in the school
  check(
    'coordinator reads all clinical records of the school',
    (await count(pa.coord, `select * from public.child_clinical`)) === 2,
  );
  check(
    'coordinator reads the staff-only thread',
    (await count(pa.coord, `select * from public.threads where id = $1`, [A.staffThread])) === 1,
  );
}

// SessionInput payload builder used by the session tests.
function sessionPayload(
  appointmentId: string,
  goalId: string,
  values: number[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    clientId: extra.clientId ?? '00000000-0000-4000-8000-0000000000c1',
    appointmentId,
    actualMinutes: 45,
    startedLate: false,
    regulationState: 'regulated',
    ratings: ratingsOf(values),
    goalTrials: extra.goalTrials ?? [{ goalId, attempted: 10, successful: 7, promptLevel: 3 }],
    incidents: extra.incidents ?? [],
    breaksCount: 1,
    comparedToLast: 'same',
    workedTags: ['first_then'],
    workedText: 'Visual schedule',
    notWorkedTags: [],
    notWorkedText: '',
    notes: {
      subjective: 'S',
      objective: 'O',
      assessment: 'A',
      planNext: 'Continue PECS phase 2',
      planGoalIds: [goalId],
      parentSummary: 'Good session today',
    },
    ...extra,
  };
}

async function testSessionsLockAmend(): Promise<void> {
  section('Session logging, lock window, amendments');
  const A = things('a');
  const pa = people('a');
  const clientId = '00000000-0000-4000-8000-00000000c045';
  const payload = sessionPayload(A.apptToLog, A.goal1, [4, 4, 3, 4, 4, 3, 4, 4], { clientId });

  type SaveResult = {
    sessionId: string;
    created: boolean;
    lockedAt: string;
    metrics: SessionMetrics;
    amendmentCount: number;
  };
  const r1 = await rpc<SaveResult>(pa.t1, 'save_session', [JSON.stringify(payload)], { commit: true });
  check(
    'save_session creates the log',
    r1.created === true && typeof r1.metrics.sessionScore === 'number',
    JSON.stringify(r1),
  );
  const lockHours = (new Date(r1.lockedAt).getTime() - Date.now()) / 3_600_000;
  check('locked_at = created_at + logLockHours (24h)', lockHours > 23.9 && lockHours <= 24.01, String(lockHours));
  const r2 = await rpc<SaveResult>(pa.t1, 'save_session', [JSON.stringify(payload)], { commit: true });
  check('retry with the same clientId is idempotent', r2.sessionId === r1.sessionId && r2.created === false);
  check(
    'exactly one session row for the clientId',
    (await suCount(`select 1 from public.sessions where client_id = $1`, [clientId])) === 1,
  );
  check(
    'parent notified once about the new summary',
    (await suCount(
      `select 1 from public.notifications where user_id = $1 and kind = 'session_summary' and payload ->> 'sessionId' = $2`,
      [pa.p1, r1.sessionId],
    )) === 1,
  );
  const appt = await su<{ status: string; attendance: string }>(
    `select status, attendance from public.appointments where id = $1`,
    [A.apptToLog],
  );
  check('appointment marked completed / present', appt[0].status === 'completed' && appt[0].attendance === 'present');

  const edited = { ...payload, ratings: ratingsOf([5, 5, 5, 5, 5, 5, 5, 5]) };
  const r3 = await rpc<SaveResult>(pa.t1, 'save_session', [JSON.stringify(edited)], { commit: true });
  check(
    'edit inside the window recomputes metrics',
    r3.sessionId === r1.sessionId && r3.metrics.sessionScore === 100,
    JSON.stringify(r3.metrics),
  );
  const tampered = await as(pa.t1, async (q) => {
    await q(`update public.sessions set session_score = 1, locked_at = now() + interval '30 days' where id = $1`, [
      r1.sessionId,
    ]);
    return q<{ s: string; locked: boolean }>(
      `select session_score::text as s, locked_at < now() + interval '2 days' as locked from public.sessions where id = $1`,
      [r1.sessionId],
    );
  });
  check(
    'API callers cannot write metric or lock columns',
    tampered[0].s === '100.0' && tampered[0].locked === true,
    JSON.stringify(tampered),
  );

  await expectError(
    'another therapist cannot log this appointment',
    () =>
      rpc(pa.t2, 'save_session', [JSON.stringify({ ...payload, clientId: '00000000-0000-4000-8000-00000000c046' })]),
    /not_found|forbidden/,
  );
  await expectError(
    'a parent cannot log a session',
    () => rpc(pa.p1, 'save_session', [JSON.stringify(payload)]),
    /not_found|forbidden/,
  );
  await expectError(
    'planNext is required',
    () =>
      rpc(pa.t1, 'save_session', [
        JSON.stringify({ ...payload, notes: { ...(payload.notes as object), planNext: ' ' } }),
      ]),
    /validation/,
  );
  await expectError(
    'ratings must be 1..5',
    () => rpc(pa.t1, 'save_session', [JSON.stringify({ ...payload, ratings: { engagement: 7 } })]),
    /validation/,
  );

  // lock it
  await su(`update public.sessions set locked_at = now() - interval '1 minute' where id = $1`, [r1.sessionId]);
  await expectError(
    'changed save after the window is rejected',
    () => rpc(pa.t1, 'save_session', [JSON.stringify(payload)]),
    /locked/,
  );
  const replay = await rpc<SaveResult>(pa.t1, 'save_session', [JSON.stringify(edited)]);
  check(
    'replay of the last applied payload after the lock is still idempotent',
    replay.sessionId === r1.sessionId && replay.created === false,
  );
  await expectError(
    'direct update of a locked session is rejected',
    () => as(pa.t1, (q) => q(`update public.sessions set worked_text = 'x' where id = $1`, [r1.sessionId])),
    /locked/,
  );
  await expectError(
    'direct update of locked notes is rejected',
    () => as(pa.t1, (q) => q(`update public.session_notes set assessment = 'x' where session_id = $1`, [r1.sessionId])),
    /locked/,
  );
  await expectError(
    'deleting ratings of a locked session is rejected',
    () => as(pa.t1, (q) => q(`delete from public.session_ratings where session_id = $1`, [r1.sessionId])),
    /locked/,
  );
  await expectError(
    'coordinator cannot bypass the lock with a direct update',
    () => as(pa.coord, (q) => q(`update public.sessions set worked_text = 'x' where id = $1`, [r1.sessionId])),
    /locked/,
  );

  await expectError(
    'amendment needs a reason',
    () => rpc(pa.t1, 'amend_session', [r1.sessionId, JSON.stringify({ workedText: 'x' }), ' ']),
    /validation/,
  );
  await expectError(
    'parent cannot amend',
    () => rpc(pa.p1, 'amend_session', [r1.sessionId, JSON.stringify({ workedText: 'x' }), 'r']),
    /forbidden/,
  );
  await expectError(
    'unrelated therapist cannot amend',
    () => rpc(pa.t3, 'amend_session', [r1.sessionId, JSON.stringify({ workedText: 'x' }), 'r']),
    /forbidden/,
  );

  const amended = await rpc<SaveResult>(
    pa.t1,
    'amend_session',
    [
      r1.sessionId,
      JSON.stringify({
        ratings: { engagement: 1 },
        notes: { assessment: 'Amended assessment' },
        workedTags: ['timer'],
        goalTrials: [{ goalId: A.goal1, attempted: 10, successful: 9, promptLevel: 4 }],
      }),
      'Corrected after supervisor review',
    ],
    { commit: true },
  );
  const amendRows = await su<{
    entity: string;
    field: string;
    old_value: string;
    new_value: string;
    reason: string;
    by: string;
  }>(
    `select entity, field, old_value, new_value, reason, "by" from public.amendments where session_id = $1 order by field`,
    [r1.sessionId],
  );
  check(
    'amend_session records one amendment per changed field',
    amendRows.length === 4 &&
      amendRows.every((r) => r.reason === 'Corrected after supervisor review' && r.by === pa.t1),
    JSON.stringify(amendRows),
  );
  check(
    'amendment rows carry old and new values',
    amendRows.some((r) => r.field === 'ratings.engagement' && r.old_value === '5' && r.new_value === '1') &&
      amendRows.some(
        (r) => r.entity === 'goal_trial' && r.old_value.startsWith('7/10') && r.new_value.startsWith('9/10'),
      ) &&
      amendRows.some((r) => r.entity === 'session_notes' && r.new_value === 'Amended assessment'),
    JSON.stringify(amendRows),
  );
  check(
    'amendment_count updated and metrics recomputed',
    amended.amendmentCount === 4 && amended.metrics.sessionScore === 87.5 && amended.metrics.goalAccuracy === 90,
    JSON.stringify(amended),
  );
  const stored = await su<{ assessment: string }>(`select assessment from public.session_notes where session_id = $1`, [
    r1.sessionId,
  ]);
  check('amended note is stored', stored[0].assessment === 'Amended assessment');
  const coordAmend = await rpc<SaveResult>(
    pa.coord,
    'amend_session',
    [r1.sessionId, JSON.stringify({ breaksCount: 3 }), 'Coordinator correction'],
    { commit: true },
  );
  check('coordinator can amend', coordAmend.amendmentCount === 5);
  check(
    'therapist can read the amendment trail',
    (await count(pa.t1, `select * from public.amendments where session_id = $1`, [r1.sessionId])) === 5,
  );
  check(
    'audit_log records the session and notes changes (field names only)',
    (await suCount(
      `select 1 from public.audit_log where entity in ('sessions', 'session_notes') and entity_id is not null and meta ? 'fields'`,
    )) >= 2 && (await suCount(`select 1 from public.audit_log where meta::text like '%Amended assessment%'`)) === 0,
  );
  check(
    'profile_edits records About Me changes',
    (await suCount(
      `select 1 from public.profile_edits where child_id = $1 and field = 'reinforcers' and new_value = 'bubbles, music, swing'`,
      [A.child1],
    )) === 1,
  );
}

async function testMetricParity(): Promise<void> {
  section('Metric parity: SQL compute_session_metrics vs src/domain/metrics.ts');
  const cases = loadOrWriteCases();
  check(`fixture file has at least 12 cases (${cases.length})`, cases.length >= 12);
  for (const c of cases) {
    const ts = plain(computeSessionMetrics(c.input));
    const sql = (
      await su<{ m: unknown }>(`select public.compute_session_metrics($1::jsonb) as m`, [JSON.stringify(c.input)])
    )[0].m;
    const drift = !deepEqual(ts, c.expected);
    check(
      `${c.name}: SQL == TS${drift ? ' (fixture expected is stale, rerun with --write-fixtures)' : ''}`,
      deepEqual(sql, ts) && !drift,
      `ts=${JSON.stringify(ts)}\n        sql=${JSON.stringify(sql)}`,
    );
  }

  // End-to-end: save_session pipeline (loader + weights from rating_dimensions + recompute).
  const A = things('a');
  const pa = people('a');
  await su(`update public.rating_dimensions set weight = 2 where organization_id = $1 and key = 'engagement'`, [A.org]);
  await su(`update public.rating_dimensions set enabled = false where organization_id = $1 and key = 'transitions'`, [
    A.org,
  ]);
  const dims = (
    await su<{ key: string; weight: number; enabled: boolean }>(
      `select key, weight::float8 as weight, enabled from public.rating_dimensions where organization_id = $1 order by sort_order, key`,
      [A.org],
    )
  ).map((d) => ({ key: d.key, weight: Number(d.weight), enabled: d.enabled }));

  interface Planned {
    n: number;
    values: number[];
    trial: [number, number];
    incidents: number;
  }
  const plan: Planned[] = [
    { n: 101, values: [4, 4, 4, 4, 4, 4, 4, 4], trial: [10, 5], incidents: 0 },
    { n: 102, values: [4, 3, 4, 5, 4, 4, 3, 4], trial: [10, 6], incidents: 0 },
    { n: 103, values: [5, 5, 5, 5, 4, 5, 5, 5], trial: [10, 7], incidents: 0 },
    { n: 104, values: [4, 4, 4, 3, 4, 4, 4, 5], trial: [10, 8], incidents: 1 },
    { n: 105, values: [4, 4, 5, 4, 4, 3, 4, 4], trial: [10, 9], incidents: 0 },
    { n: 106, values: [2, 2, 1, 2, 2, 2, 3, 2], trial: [10, 8], incidents: 2 },
    { n: 107, values: [1, 1, 2, 1, 1, 1, 1, 1], trial: [10, 9], incidents: 3 },
  ];
  const late: Planned = { n: 100, values: [3, 3, 3, 3, 3, 3, 3, 3], trial: [10, 2], incidents: 0 };
  const incidentList = (k: number) =>
    Array.from({ length: k }, () => ({ type: 'meltdown', antecedentTags: ['transition'] }));
  const toInput = (p: Planned, previous: PreviousSession[]): MetricsInput => ({
    ratings: ratingsOf(p.values),
    goalTrials: [{ attempted: p.trial[0], successful: p.trial[1] }],
    incidents: incidentList(p.incidents).map((i) => ({ type: 'meltdown' as const, antecedentTags: i.antecedentTags })),
    dimensions: dims,
    previous,
  });

  type SaveResult = {
    sessionId: string;
    metrics: SessionMetrics;
    alertsRaised: string[];
    masterySuggestedGoalIds: string[];
  };
  const history: { p: Planned; metrics: SessionMetrics; ratings: Record<string, number> }[] = [];
  const accuracies: number[] = [];
  const ids = new Map<number, string>();
  for (const p of plan) {
    const previous = [...history]
      .reverse()
      .map((h) => prevOf(h.metrics.sessionScore, h.ratings, h.metrics.deltaRolling));
    const expected = computeSessionMetrics(toInput(p, previous));
    const res = await rpc<SaveResult>(
      pa.t1,
      'save_session',
      [
        JSON.stringify(
          sessionPayload(id('a', p.n), A.goal3, p.values, {
            clientId: id('a', 1000 + p.n),
            goalTrials: [{ goalId: A.goal3, attempted: p.trial[0], successful: p.trial[1], promptLevel: 3 }],
            incidents: incidentList(p.incidents),
          }),
        ),
      ],
      { commit: true },
    );
    ids.set(p.n, res.sessionId);
    check(
      `save_session #${p.n}: stored metrics == TS`,
      deepEqual(res.metrics, plain(expected)),
      `ts=${JSON.stringify(plain(expected))}\n        sql=${JSON.stringify(res.metrics)}`,
    );
    const alerts = checkAlerts(expected, previous[0], { drop: 15, incidents: 3 });
    const expectedAlerts = [
      alerts.scoreDrop ? 'score_drop' : null,
      alerts.incidentSpike ? 'incident_spike' : null,
    ].filter(Boolean);
    check(
      `save_session #${p.n}: alerts == TS checkAlerts ${JSON.stringify(expectedAlerts)}`,
      deepEqual(res.alertsRaised, expectedAlerts),
      JSON.stringify(res.alertsRaised),
    );
    accuracies.push(trialAccuracy({ attempted: p.trial[0], successful: p.trial[1] }) ?? 0);
    const mastery = masteryMet(accuracies, { accuracy: 80, consecutiveSessions: 3 });
    check(
      `save_session #${p.n}: mastery suggestion == TS masteryMet (${mastery})`,
      deepEqual(res.masterySuggestedGoalIds, mastery ? [A.goal3] : []),
      JSON.stringify(res.masterySuggestedGoalIds),
    );
    history.push({ p, metrics: expected, ratings: ratingsOf(p.values) });
  }
  check(
    'coordinator was notified about the score-drop alert',
    (await suCount(
      `select 1 from public.notifications n join public.alerts a on a.id = (n.payload ->> 'alertId')::uuid where n.user_id = $1 and a.child_id = $2 and a.kind = 'score_drop'`,
      [pa.coord, A.child3],
    )) === 1,
  );

  // A late (offline) log for the oldest appointment shifts the windows of the following sessions.
  await rpc(
    pa.t1,
    'save_session',
    [
      JSON.stringify(
        sessionPayload(id('a', late.n), A.goal3, late.values, {
          clientId: id('a', 1000 + late.n),
          goalTrials: [{ goalId: A.goal3, attempted: late.trial[0], successful: late.trial[1], promptLevel: 3 }],
        }),
      ),
    ],
    { commit: true },
  );
  ids.set(
    late.n,
    (await su<{ id: string }>(`select id from public.sessions where appointment_id = $1`, [id('a', late.n)]))[0].id,
  );
  const chronological = [late, ...plan];
  const finalHistory: { metrics: SessionMetrics; ratings: Record<string, number> }[] = [];
  let mismatches = 0;
  for (const p of chronological) {
    const previous = [...finalHistory]
      .reverse()
      .map((h) => prevOf(h.metrics.sessionScore, h.ratings, h.metrics.deltaRolling));
    const expected = computeSessionMetrics(toInput(p, previous));
    const stored = (
      await su<{ m: { metrics: unknown } }>(`select app.session_result($1, false, '{}', '{}') as m`, [ids.get(p.n)])
    )[0].m.metrics;
    if (!deepEqual(stored, plain(expected))) {
      mismatches++;
      console.log(
        `        #${p.n} ts=${JSON.stringify(plain(expected))}\n        #${p.n} sql=${JSON.stringify(stored)}`,
      );
    }
    finalHistory.push({ metrics: expected, ratings: ratingsOf(p.values) });
  }
  check(
    'after a late log, every stored session matches a fresh TS recomputation',
    mismatches === 0,
    `${mismatches} mismatches`,
  );
}

async function testPlatformAdmin(): Promise<void> {
  section('Platform admin');
  const A = things('a');
  const B = things('b');
  const pa = people('a');
  check(
    'platform admin sees both schools',
    (await count(PLATFORM_ADMIN, `select * from public.organizations where id in ($1, $2)`, [A.org, B.org])) === 2,
  );
  for (const t of [
    'children',
    'child_profiles',
    'child_clinical',
    'sessions',
    'session_notes',
    'goals',
    'home_logs',
    'media',
    'messages',
    'threads',
  ]) {
    check(`platform admin reads 0 ${t}`, (await count(PLATFORM_ADMIN, `select * from public.${t}`)) === 0);
  }
  const summaries = await rpc<{ organization: { id: string }; activeChildren: number; sessionsThisMonth: number }[]>(
    PLATFORM_ADMIN,
    'platform_school_summaries',
    [],
  );
  const sa = summaries.find((s) => s.organization.id === A.org);
  check(
    'platform_school_summaries returns cross-school counts',
    summaries.length >= 2 && sa?.activeChildren === 3 && (sa?.sessionsThisMonth ?? 0) >= 1,
    JSON.stringify(sa),
  );
  await expectError(
    'school admin cannot read platform summaries',
    () => rpc(pa.admin, 'platform_school_summaries', []),
    /forbidden/,
  );

  const created = await rpc<{ organization: { id: string; name: string }; invite: { role: string; phone: string } }>(
    PLATFORM_ADMIN,
    'create_school',
    ['Asha Centre', 'Asha', 'Pune', 'FC Road', '+912000000000', 'Meera Rao', '98765 43210'],
    { commit: true },
  );
  check(
    'create_school creates the school and a school-admin invite',
    created.organization.name === 'Asha Centre' &&
      created.invite.role === 'school_admin' &&
      created.invite.phone === '+919876543210',
    JSON.stringify(created),
  );
  check(
    'new school gets default therapy types and rating dimensions',
    (await suCount(`select 1 from public.therapy_types where organization_id = $1`, [created.organization.id])) === 6 &&
      (await suCount(`select 1 from public.rating_dimensions where organization_id = $1`, [
        created.organization.id,
      ])) === 8,
  );
  await expectError(
    'school admin cannot create schools',
    () => rpc(pa.admin, 'create_school', ['X', 'X', 'X', 'X', 'X', 'X', '9876543210']),
    /forbidden/,
  );
  await expectError(
    'school admin cannot change their school status',
    () => as(pa.admin, (q) => q(`update public.organizations set status = 'suspended' where id = $1`, [A.org])),
    /forbidden/,
  );

  await as(PLATFORM_ADMIN, (q) => q(`update public.organizations set status = 'suspended' where id = $1`, [B.org]), {
    commit: true,
  });
  check(
    'suspended school: its users lose data access',
    (await count(people('b').admin, `select * from public.children`)) === 0,
  );
  check(
    'suspended school: users still see the school row (status)',
    (await count(people('b').admin, `select * from public.organizations where id = $1`, [B.org])) === 1,
  );
  await as(PLATFORM_ADMIN, (q) => q(`update public.organizations set status = 'active' where id = $1`, [B.org]), {
    commit: true,
  });
  check(
    're-activated school: access restored',
    (await count(people('b').admin, `select * from public.children`)) === 2,
  );
}

async function testInvites(): Promise<void> {
  section('Invites');
  const A = things('a');
  const user9 = id('a', 9);
  const user10 = id('a', 10);
  const res = await rpc<{ accepted: number }>(user9, 'accept_pending_invites', [], { commit: true });
  check('verified phone accepts the pending invite', res.accepted === 1, JSON.stringify(res));
  check(
    'membership and guardian link created',
    (await suCount(
      `select 1 from public.memberships where user_id = $1 and organization_id = $2 and role = 'parent' and status = 'active'`,
      [user9, A.org],
    )) === 1 &&
      (await suCount(
        `select 1 from public.child_guardians where user_id = $1 and child_id = $2 and relation = 'Grandparent'`,
        [user9, A.child2],
      )) === 1,
  );
  const kids = await as(user9, async (q) =>
    (await q<{ id: string }>(`select id from public.children`)).map((r) => r.id),
  );
  check('new guardian sees the linked child only', deepEqual(kids, [A.child2]), JSON.stringify(kids));
  check(
    'accepting again is a no-op',
    (await rpc<{ accepted: number }>(user9, 'accept_pending_invites', [], { commit: true })).accepted === 0,
  );
  check(
    'unverified phone cannot claim an invite',
    (await rpc<{ accepted: number }>(user10, 'accept_pending_invites', [], { commit: true })).accepted === 0,
  );
  check(
    'invites are only visible to org admins',
    (await count(people('a').t1, `select * from public.invites`)) === 0 &&
      (await count(people('a').admin, `select * from public.invites`)) >= 3,
  );
}

async function testStorage(): Promise<void> {
  section('Storage policies');
  const A = things('a');
  const B = things('b');
  const pa = people('a');
  const insertObject = (user: string, bucket: string, name: string) =>
    as(user, (q) =>
      q(`insert into storage.objects (bucket_id, name, owner, owner_id) values ($1, $2, $3::uuid, $4)`, [
        bucket,
        name,
        user,
        user,
      ]),
    );

  await insertObject(pa.p1, 'media', `${A.org}/${A.child1}/new.mp4`);
  check('parent uploads a video for their own child', true);
  await expectError(
    'parent cannot upload under another child',
    () => insertObject(pa.p1, 'media', `${A.org}/${A.child2}/x.mp4`),
    /row-level security/,
  );
  await expectError(
    'parent cannot upload into another school',
    () => insertObject(pa.p1, 'media', `${B.org}/${B.child1}/x.mp4`),
    /row-level security/,
  );
  await expectError(
    'path must be {org}/{child}/file',
    () => insertObject(pa.p1, 'media', `${A.org}/x.mp4`),
    /row-level security/,
  );
  check(
    'assigned therapist can read the child’s media',
    (await count(pa.t1, `select * from storage.objects where bucket_id = 'media'`)) === 1,
  );
  check(
    'unrelated therapist cannot read the child’s media',
    (await count(pa.t3, `select * from storage.objects where bucket_id = 'media'`)) === 0,
  );
  check(
    'other parent cannot read the child’s media',
    (await count(pa.p2, `select * from storage.objects where bucket_id = 'media'`)) === 0,
  );
  check(
    'staff-only resource files are hidden from parents',
    (await count(pa.p1, `select * from storage.objects where bucket_id = 'resources'`)) === 1,
  );
  check(
    'staff read all resource files of their school',
    (await count(pa.t3, `select * from storage.objects where bucket_id = 'resources'`)) === 2,
  );
  check(
    'child photo visible to guardian, hidden from other parent',
    (await count(pa.p1, `select * from storage.objects where bucket_id = 'avatars'`)) === 1 &&
      (await count(pa.p2, `select * from storage.objects where bucket_id = 'avatars'`)) === 0,
  );
  check(
    'org assets visible to members',
    (await count(pa.p2, `select * from storage.objects where bucket_id = 'org-assets'`)) === 1,
  );

  await as(
    pa.p1,
    (q) =>
      q(
        `insert into public.consents (child_id, kind, granted, version) values ($1, 'video_upload', false, '2026-10')`,
        [A.child1],
      ),
    { commit: true },
  );
  await expectError(
    'withdrawn video consent blocks uploads',
    () => insertObject(pa.p1, 'media', `${A.org}/${A.child1}/after-withdrawal.mp4`),
    /row-level security/,
  );
  await expectError(
    'withdrawn video consent blocks media rows',
    () =>
      as(pa.p1, (q) =>
        q(
          `insert into public.media (organization_id, child_id, bucket_path, kind, size_bytes) values ($1, $2, 'x/y/z.mp4', 'video', 1)`,
          [A.org, A.child1],
        ),
      ),
    /row-level security/,
  );
  await as(
    pa.p1,
    (q) =>
      q(`insert into public.consents (child_id, kind, granted, version) values ($1, 'video_upload', true, '2026-10')`, [
        A.child1,
      ]),
    { commit: true },
  );
  const media = await as(pa.p1, async (q) =>
    q<{ owner_id: string; expires: boolean }>(
      `insert into public.media (organization_id, child_id, owner_id, bucket_path, kind, size_bytes) values ($1, $2, $3, 'p/q/r.mp4', 'video', 1)
       returning owner_id, expires_at between now() + interval '179 days' and now() + interval '181 days' as expires`,
      [A.org, A.child1, pa.t1],
    ),
  );
  check(
    're-granted consent allows uploads; owner forced to caller; 180-day expiry',
    media[0].owner_id === pa.p1 && media[0].expires === true,
    JSON.stringify(media),
  );

  // Orphan sweep used by media-retention (e.g. after a child is deleted on request).
  const orphan = `${A.org}/${A.child2}/orphan.mp4`;
  await su(
    `insert into storage.objects (bucket_id, name, owner_id, created_at) values ('media', $1, $2, now() - interval '2 days')`,
    [orphan, pa.p2],
  );
  const orphans = await as(
    null,
    async (q) => (await q<{ name: string }>(`select name from public.orphaned_media_objects(100)`)).map((r) => r.name),
    { role: 'service_role' },
  );
  check(
    'orphaned_media_objects lists files without a media row, not live ones',
    orphans.includes(orphan) && !orphans.some((n) => n.includes(things('a').media)),
    JSON.stringify(orphans),
  );
  await expectError(
    'only the service role can list orphaned media',
    () => as(pa.admin, (q) => q(`select * from public.orphaned_media_objects(10)`)),
    /permission denied/,
  );
  await su(`delete from storage.objects where name = $1`, [orphan]);
}

async function testRemindersAndGuards(): Promise<void> {
  section('Reminders, notifications and guards');
  const A = things('a');
  const pa = people('a');
  await expectError(
    'authenticated users cannot run the reminder job',
    () => rpc(pa.admin, 'enqueue_reminders', [new Date().toISOString()]),
    /permission denied/,
  );
  const first = await rpc<{ reminders: number; unlogged: number; alerts: number }>(
    null,
    'enqueue_reminders',
    [new Date().toISOString()],
    { role: 'service_role', commit: true },
  );
  check(
    'reminder job queues appointment reminders and unlogged-session pushes',
    first.reminders >= 1 && first.unlogged >= 2 && first.alerts >= 2,
    JSON.stringify(first),
  );
  check(
    'parent got the 24h reminder for the substitute session',
    (await suCount(`select 1 from public.notifications where user_id = $1 and dedupe_key = $2`, [
      pa.p1,
      `reminder:${A.apptSub}:24`,
    ])) === 1,
  );
  check(
    'unlogged session: therapist push + coordinator flag + alert',
    (await suCount(`select 1 from public.notifications where user_id = $1 and dedupe_key = $2`, [
      pa.t3,
      `unlogged:${A.apptUnlogged}`,
    ])) === 1 &&
      (await suCount(`select 1 from public.notifications where user_id = $1 and dedupe_key = $2`, [
        pa.coord,
        `unlogged-coordinator:${A.apptUnlogged}`,
      ])) === 1 &&
      (await suCount(
        `select 1 from public.alerts where kind = 'unlogged_session' and payload ->> 'appointmentId' = $1`,
        [A.apptUnlogged],
      )) === 1,
  );
  const second = await rpc<{ reminders: number; unlogged: number; alerts: number; agendas: number }>(
    null,
    'enqueue_reminders',
    [new Date().toISOString()],
    { role: 'service_role', commit: true },
  );
  check(
    're-running the job sends nothing twice',
    second.reminders === 0 && second.unlogged === 0 && second.alerts === 0 && second.agendas === 0,
    JSON.stringify(second),
  );

  await as(
    pa.p1,
    (q) =>
      q(
        `update public.appointments set status = 'cancelled', attendance = 'cancelled_by_parent', cancel_reason = 'Fever' where id = $1`,
        [A.apptParentCancel],
      ),
    { commit: true },
  );
  check(
    'parent cancels an upcoming appointment; therapist notified',
    (await suCount(
      `select 1 from public.notifications where user_id = $1 and kind = 'appointment_changed' and payload ->> 'appointmentId' = $2`,
      [pa.t1, A.apptParentCancel],
    )) === 1,
  );
  await expectError(
    'parent cannot move an appointment',
    () =>
      as(pa.p1, (q) =>
        q(`update public.appointments set starts_at = starts_at + interval '1 hour' where id = $1`, [A.apptSub]),
      ),
    /forbidden/,
  );
  await expectError(
    'therapist cannot move their appointment',
    () =>
      as(pa.t1, (q) =>
        q(`update public.appointments set starts_at = starts_at + interval '1 hour' where id = $1`, [A.apptLogged]),
      ),
    /forbidden/,
  );
  const marked = await as(
    pa.t1,
    async (q) =>
      (
        await q(`update public.appointments set attendance = 'late', late_minutes = 10 where id = $1 returning id`, [
          A.apptLogged,
        ])
      ).length,
  );
  check('therapist marks attendance on their appointment', marked === 1);

  const subRes = await rpc<{ therapistId: string; originalTherapistId: string }>(
    pa.coord,
    'assign_substitute',
    [A.apptFar, pa.t2],
    { commit: true },
  );
  check(
    'assign_substitute sets therapist + original therapist',
    subRes.therapistId === pa.t2 && subRes.originalTherapistId === pa.t4,
    JSON.stringify(subRes),
  );
  check(
    'substitute and parent are notified',
    (await suCount(
      `select 1 from public.notifications where user_id = $1 and kind = 'substitute_assigned' and payload ->> 'appointmentId' = $2`,
      [pa.t2, A.apptFar],
    )) === 1 &&
      (await suCount(
        `select 1 from public.notifications where user_id = $1 and kind = 'substitute_assigned' and payload ->> 'appointmentId' = $2`,
        [pa.p1, A.apptFar],
      )) === 1,
  );
  await expectError(
    'therapists cannot assign substitutes',
    () => rpc(pa.t1, 'assign_substitute', [A.apptFar, pa.t3]),
    /forbidden/,
  );

  const slot = new Date(Date.now() + 6 * 86_400_000).toISOString();
  const req = await rpc<{ id: string; status: string }>(
    pa.p1,
    'request_reschedule',
    [A.apptSub, JSON.stringify([slot]), 'Doctor visit'],
    { commit: true },
  );
  check(
    'parent requests a reschedule; coordinator notified',
    req.status === 'pending' &&
      (await suCount(`select 1 from public.notifications where user_id = $1 and kind = 'reschedule_request'`, [
        pa.coord,
      ])) >= 1,
  );
  await expectError(
    'parent cannot approve their own request',
    () => rpc(pa.p1, 'resolve_reschedule', [req.id, JSON.stringify({ type: 'approve', slot })]),
    /forbidden/,
  );
  const counter = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await rpc(
    pa.coord,
    'resolve_reschedule',
    [req.id, JSON.stringify({ type: 'counter', slots: [counter], note: 'Only Thursday' })],
    { commit: true },
  );
  const accepted = await rpc<{ status: string }>(
    pa.p1,
    'resolve_reschedule',
    [req.id, JSON.stringify({ type: 'accept_counter', slot: counter })],
    { commit: true },
  );
  const moved = await su<{ ok: boolean }>(
    `select abs(extract(epoch from starts_at - $2::timestamptz)) < 1 and was_rescheduled as ok from public.appointments where id = $1`,
    [A.apptSub, counter],
  );
  check('counter-proposal accepted moves the appointment', accepted.status === 'approved' && moved[0].ok === true);

  await as(pa.p1, (q) => q(`update public.notifications set read_at = now() where user_id = $1`, [pa.p1]), {
    commit: true,
  });
  check(
    'users mark their notifications read',
    (await suCount(`select 1 from public.notifications where user_id = $1 and read_at is null`, [pa.p1])) === 0,
  );
  await expectError(
    'users cannot rewrite notification content',
    () => as(pa.p1, (q) => q(`update public.notifications set title = 'x' where user_id = $1`, [pa.p1])),
    /forbidden/,
  );
  await expectError(
    'nobody can mute schedule-change notifications',
    () => as(pa.p1, (q) => q(`insert into public.notification_mutes (kind) values ('appointment_changed')`)),
    /check constraint/,
  );

  await as(
    pa.t1,
    (q) =>
      q(
        `update public.home_logs set review_reaction = 'great_job', review_comment = 'Lovely!', reviewed_at = now() where id = $1`,
        [A.homeLog],
      ),
    { commit: true },
  );
  const log = await su<{ reviewed_by: string }>(`select reviewed_by from public.home_logs where id = $1`, [A.homeLog]);
  check(
    'therapist reviews a home log; parent gets feedback',
    log[0].reviewed_by === pa.t1 &&
      (await suCount(`select 1 from public.notifications where user_id = $1 and kind = 'home_log_feedback'`, [
        pa.p1,
      ])) === 1,
  );
  await expectError(
    'parent cannot edit a reviewed log',
    () => as(pa.p1, (q) => q(`update public.home_logs set note = 'x' where id = $1`, [A.homeLog])),
    /forbidden/,
  );
  await expectError(
    'therapist cannot change what the parent logged',
    () => as(pa.t1, (q) => q(`update public.home_logs set note = 'x' where id = $1`, [A.homeLog])),
    /forbidden/,
  );
  const parentLog = await as(pa.p1, (q) =>
    q<{ review_comment: string | null; child_id: string }>(
      `insert into public.home_logs (task_id, outcome, difficulty, review_comment) values ($1, 'done', 'easy', 'self-praise') returning review_comment, child_id`,
      [A.homeTask],
    ),
  );
  check(
    'parent log: review fields stripped, child taken from the task',
    parentLog[0].review_comment === null && parentLog[0].child_id === A.child1,
    JSON.stringify(parentLog),
  );
  await expectError(
    'parent cannot log against another child’s task',
    () =>
      as(pa.p2, (q) =>
        q(`insert into public.home_logs (task_id, outcome, difficulty) values ($1, 'done', 'easy')`, [A.homeTask]),
      ),
    /row-level security/,
  );
}

async function testDashboards(): Promise<void> {
  section('Dashboards');
  const A = things('a');
  const pa = people('a');
  interface Dashboard {
    today: Record<string, number>;
    week: { loggingCompliance: { therapistId: string }[]; attendanceRate: number };
    childrenNeedingAttention: { childId: string }[];
    unloggedAppointmentIds: string[];
    upcomingSubstitutionIds: string[];
    pendingRescheduleIds: string[];
    workload: { therapistId: string; sessionsThisWeek: number }[];
  }
  const d = await rpc<Dashboard>(pa.coord, 'admin_dashboard', [A.org, null]);
  const attention = d.childrenNeedingAttention.map((c) => c.childId);
  check(
    'admin_dashboard: today counters present',
    ['scheduled', 'completed', 'logged', 'unlogged', 'cancelled'].every((k) => typeof d.today[k] === 'number'),
    JSON.stringify(d.today),
  );
  check(
    'admin_dashboard: children needing attention come from open alerts',
    [A.child1, A.child2, A.child3].every((c) => attention.includes(c)),
    JSON.stringify(d.childrenNeedingAttention),
  );
  check('admin_dashboard: unlogged sessions listed', d.unloggedAppointmentIds.includes(A.apptUnlogged));
  check('admin_dashboard: upcoming substitution listed', d.upcomingSubstitutionIds.includes(A.apptFar));
  check('admin_dashboard: pending reschedule listed', d.pendingRescheduleIds.includes(id('a', 86)));
  check(
    'admin_dashboard: workload per therapist',
    d.workload.some((w) => w.therapistId === pa.t1),
    JSON.stringify(d.workload),
  );
  await expectError(
    'therapists cannot open the admin dashboard',
    () => rpc(pa.t1, 'admin_dashboard', [A.org, null]),
    /forbidden/,
  );
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (run through scripts/test-db.sh)');
    process.exit(2);
  }
  await client.connect();
  const sections: [string, () => Promise<void>][] = [
    ['Structure', testStructure],
    ['Tenant isolation', testTenantIsolation],
    ['Parent scoping', testParents],
    ['Therapist scoping', testTherapists],
    ['Sessions', testSessionsLockAmend],
    ['Metric parity', testMetricParity],
    ['Platform admin', testPlatformAdmin],
    ['Invites', testInvites],
    ['Storage', testStorage],
    ['Reminders & guards', testRemindersAndGuards],
    ['Dashboards', testDashboards],
  ];
  for (const [name, fn] of sections) {
    try {
      await fn();
    } catch (e) {
      currentSection = currentSection || name;
      check(`${name}: section crashed`, false, errText(e));
    }
  }
  await client.end();

  const failed = results.filter((r) => !r.ok);
  const bySection = new Map<string, { pass: number; fail: number }>();
  for (const r of results) {
    const s = bySection.get(r.section) ?? { pass: 0, fail: 0 };
    if (r.ok) s.pass++;
    else s.fail++;
    bySection.set(r.section, s);
  }
  console.log('\n== Summary');
  for (const [name, s] of bySection)
    console.log(`  ${s.fail ? 'FAIL' : 'PASS'}  ${name}: ${s.pass} passed${s.fail ? `, ${s.fail} failed` : ''}`);
  console.log(
    `\n${failed.length ? 'FAIL' : 'PASS'}: ${results.length - failed.length}/${results.length} checks passed`,
  );
  if (failed.length) {
    for (const f of failed) console.log(`  - [${f.section}] ${f.name}`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(errText(e));
  process.exit(1);
});
