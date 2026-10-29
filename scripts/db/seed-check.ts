/**
 * Seed check (npm run test:db:seed = `scripts/test-db.sh --seed`, which first loads the shim and
 * migrations into an otherwise EMPTY database). Loads a generated supabase/seed.sql and proves,
 * against the real schema, RLS and triggers:
 *   1. every row the generator wrote landed: per-table counts == the file's `-- @counts` header,
 *      and no public table is left empty except ones the demo does not use
 *   2. loading the same file again changes nothing (re-run safe), side-effect triggers are back on
 *   3. the personas can sign in: bcrypt password, confirmed email/phone, auth identities
 *   4. RLS with real personas: the therapist sees today's agenda and the substitute brief, the
 *      parent sees only her own children (no clinical data, notes or staff-only threads), the
 *      school admin sees only her school, the platform admin sees schools but no children
 *   5. stored session metrics == what the SQL metrics engine recomputes from the stored rows
 *   6. the "replace an older load" delete block in the header works (rolled back)
 *
 * Usage: DATABASE_URL=... npx tsx scripts/db/seed-check.ts path/to/seed.sql
 */
/* eslint-disable no-console -- CLI check: the PASS/FAIL report is its output. */
import fs from 'node:fs';

import pg from 'pg';

import { DEMO_PERSONAS } from '../../src/data/demo/personas';

const PASSWORD = 'Demo@1234';
/** Tables the demo dataset leaves empty (no branches, no devices, no muted kinds). */
const MAY_BE_EMPTY = new Set(['branches', 'push_tokens', 'notification_mutes']);

const file = process.argv[2] ?? 'supabase/seed.sql';
const seedSql = fs.readFileSync(file, 'utf8');
const countsLine = /^-- @counts (.*)$/m.exec(seedSql);
if (!countsLine) throw new Error(`${file}: no "-- @counts" header line`);
const expected = JSON.parse(countsLine[1]) as Record<string, number>;
const seedToday = /"today" = (\d{4}-\d{2}-\d{2})/.exec(seedSql)?.[1];
const resetSql = [...seedSql.matchAll(/^-- (delete from .*;)$/gm)].map((m) => m[1]);

type Row = pg.QueryResultRow;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const su = async <T extends Row = Row>(sql: string, params: unknown[] = []) =>
  (await client.query<T>(sql, params)).rows;

/** Runs `fn` as an API user the way PostgREST does (role + JWT claims), then rolls back. */
async function as<T>(user: string, fn: () => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)`,
      [user, JSON.stringify({ sub: user, role: 'authenticated' })],
    );
    return await fn();
  } finally {
    await client.query('rollback');
  }
}
const n = async (sql: string, params: unknown[] = []) =>
  Number((await su<{ n: string }>(`select (${sql})::text as n`, params))[0].n);

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const qualified = (t: string) => (t.includes('.') ? t : `public.${t}`);
async function tableCounts(): Promise<Record<string, number>> {
  const keys = Object.keys(expected);
  const row = (
    await su(`select ${keys.map((k, i) => `(select count(*) from ${qualified(k)})::int as c${i}`).join(', ')}`)
  )[0];
  return Object.fromEntries(keys.map((k, i) => [k, Number(row[`c${i}`])]));
}

async function main() {
  await client.connect();

  // ------------------------------------------------------------------- 1. load
  console.log(`› load ${file} (${(seedSql.length / 1024 / 1024).toFixed(2)} MB)`);
  const before = await tableCounts();
  let t = Date.now();
  await client.query(seedSql);
  const loadMs = Date.now() - t;
  const after = await tableCounts();
  const diff = Object.fromEntries(Object.keys(expected).map((k) => [k, after[k] - before[k]]));
  const wrong = Object.keys(expected).filter((k) => diff[k] !== expected[k]);
  check(
    `loaded in ${(loadMs / 1000).toFixed(1)}s, every generated row landed (${Object.keys(expected).length} tables)`,
    wrong.length === 0,
    wrong.map((k) => `${k}: ${diff[k]} of ${expected[k]}`).join(', '),
  );
  console.log(
    `        rows: ${Object.entries(diff)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  );

  const publicTables = (
    await su<{ t: string }>(
      `select c.relname as t from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' order by 1`,
    )
  ).map((r) => r.t);
  const empty: string[] = [];
  for (const tbl of publicTables) if ((await n(`select count(*) from public.${tbl}`)) === 0) empty.push(tbl);
  check(
    'every public table the demo uses has rows',
    empty.every((x) => MAY_BE_EMPTY.has(x)),
    `empty: ${empty.join(', ') || 'none'}`,
  );
  check(
    'global rating-dimension templates were not duplicated',
    (await n(`select count(*) from public.rating_dimensions where organization_id is null`)) === 8,
  );

  // ------------------------------------------------------------------- 2. re-run
  t = Date.now();
  await client.query(seedSql);
  const again = await tableCounts();
  const changed = Object.keys(expected).filter((k) => again[k] !== after[k]);
  check(`second load is a no-op (${((Date.now() - t) / 1000).toFixed(1)}s)`, changed.length === 0, changed.join(', '));
  const triggersOff = await n(
    `select count(*) from pg_trigger where tgname in ('z_notify', 'z_audit') and tgenabled <> 'O'`,
  );
  check('side-effect triggers re-enabled after the load', triggersOff === 0, `${triggersOff} still disabled`);
  check(
    'no seeded notification is queued for push',
    (await n(`select count(*) from public.notifications where push_status = 'pending'`)) === 0,
  );
  check(
    'session dates match appointment dates in IST',
    (await n(
      `select count(*) from public.sessions s join public.appointments a on a.id = s.appointment_id where s.date <> (a.starts_at at time zone app.tz())::date`,
    )) === 0,
  );
  const dbToday = (await su<{ d: string }>(`select app.today()::text as d`))[0].d;
  check(`seed "today" is the database's today`, seedToday === dbToday, `seed ${seedToday}, db ${dbToday}`);

  // ------------------------------------------------------------------- 3. logins
  const users = expected['auth.users'];
  check(
    'every user signs in with the demo password',
    (await n(`select count(*) from auth.users where encrypted_password = extensions.crypt($1, encrypted_password)`, [
      PASSWORD,
    ])) === users,
  );
  check(
    'auth users carry the GoTrue fields (aud/role/instance, empty tokens)',
    (await n(`select count(*) from auth.users where aud = 'authenticated' and role = 'authenticated' and instance_id = '00000000-0000-0000-0000-000000000000'
               and confirmation_token = '' and recovery_token = '' and email_change_token_new = '' and email_change = ''`)) ===
      users,
  );
  const ids: Record<string, string> = {};
  for (const p of DEMO_PERSONAS) {
    const digits = p.phone.replace(/\D/g, '');
    const rows = await su<{
      id: string;
      email_ok: boolean;
      phone_ok: boolean;
      identities: string[];
      full_name: string;
      phone: string;
    }>(
      `select u.id, u.email_confirmed_at is not null as email_ok, u.phone_confirmed_at is not null as phone_ok,
              array(select i.provider from auth.identities i where i.user_id = u.id order by 1) as identities, p.full_name, p.phone
       from auth.users u join public.profiles p on p.id = u.id
       where u.phone = $1 and ($2::text is null or u.email = $2)`,
      [digits, p.email ?? null],
    );
    const r = rows[0];
    ids[p.key] = r?.id;
    const providers = p.email ? ['email', 'phone'] : ['phone'];
    check(
      `persona ${p.key}: ${p.email ?? p.phone} confirmed, identities ${providers.join('+')}, profile matches personas.ts`,
      rows.length === 1 &&
        r.phone_ok &&
        (!p.email || r.email_ok) &&
        r.identities.join() === providers.join() &&
        r.full_name === p.name &&
        r.phone === p.phone,
    );
  }

  // ------------------------------------------------------------------- 4. RLS with personas
  const riya = ids.therapist;
  const todaysSql = `select count(*) from public.appointments where therapist_id = $1 and status <> 'cancelled' and (starts_at at time zone app.tz())::date = app.today()`;
  const riyaToday = await n(todaysSql, [riya]);
  const riyaSees = await as(riya, () => n(todaysSql, [riya]));
  check(`therapist sees today's appointments`, riyaToday > 0 && riyaSees === riyaToday, `${riyaSees} of ${riyaToday}`);
  const sub = (
    await su<{ id: string; child_id: string }>(
      `select id, child_id from public.appointments where therapist_id = $1 and original_therapist_id is not null and (starts_at at time zone app.tz())::date = app.today()`,
      [riya],
    )
  )[0];
  if (sub) {
    const brief = await as(
      riya,
      async () => (await su<{ b: { child?: unknown } | null }>(`select public.handover_brief($1) as b`, [sub.id]))[0].b,
    );
    const access = await as(
      riya,
      async () => (await su<{ a: string }>(`select public.child_access($1) as a`, [sub.child_id]))[0].a,
    );
    check(
      `therapist opens today's substitute Handover Brief (${access} access)`,
      brief != null && (access === 'brief_only' || access === 'full'),
    );
  } else {
    check(`therapist has a substitute session today`, false, 'none found');
  }
  const riyaSessions = await as(riya, () => n(`select count(*) from public.sessions`));
  const riyaClinical = await as(riya, () => n(`select count(*) from public.child_clinical`));
  check(
    'therapist reads session history and clinical info of her caseload',
    riyaSessions > 0 && riyaClinical > 0,
    `${riyaSessions} sessions, ${riyaClinical} clinical rows`,
  );

  const priya = ids.parent;
  const own = (
    await su<{ id: string }>(`select child_id as id from public.child_guardians where user_id = $1 order by 1`, [priya])
  ).map((r) => r.id);
  const seen = await as(priya, async () =>
    (await su<{ id: string }>(`select id from public.children order by 1`)).map((r) => r.id),
  );
  check(
    'parent sees only her own children',
    own.length === 2 && seen.join() === own.join(),
    `${seen.length} visible, ${own.length} linked`,
  );
  const hidden = await as(priya, async () => ({
    clinical: await n(`select count(*) from public.child_clinical`),
    notes: await n(`select count(*) from public.session_notes`),
    sessions: await n(`select count(*) from public.sessions`),
    staffThreads: await n(`select count(*) from public.threads where kind = 'staff_only'`),
    otherNotifications: await n(`select count(*) from public.notifications where user_id <> $1`, [priya]),
  }));
  check(
    "parent sees no clinical data, SOAP notes, raw sessions, staff-only threads or others' inbox",
    Object.values(hidden).every((v) => v === 0),
    JSON.stringify(hidden),
  );
  const snapshots = await as(
    priya,
    async () => (await su<{ s: unknown[] }>(`select public.parent_session_snapshots($1, 5) as s`, [own[0]]))[0].s,
  );
  const careThreads = await as(priya, () => n(`select count(*) from public.threads where kind = 'care_team'`));
  check(
    'parent gets session snapshots and her care-team threads',
    Array.isArray(snapshots) && snapshots.length > 0 && careThreads === own.length,
    `${snapshots?.length ?? 0} snapshots, ${careThreads} threads`,
  );

  const sunita = ids.school_admin;
  const sunitaOrg = (
    await su<{ o: string }>(`select organization_id as o from public.memberships where user_id = $1`, [sunita])
  )[0].o;
  const adminView = await as(sunita, async () => ({
    own: await n(`select count(*) from public.children where organization_id = $1`, [sunitaOrg]),
    other: await n(`select count(*) from public.children where organization_id <> $1`, [sunitaOrg]),
  }));
  check('school admin sees her school only', adminView.own === 12 && adminView.other === 0, JSON.stringify(adminView));
  const kabir = ids.platform_admin;
  const platform = await as(kabir, async () => ({
    orgs: await n(`select count(*) from public.organizations`),
    children: await n(`select count(*) from public.children`),
  }));
  check(
    'platform admin sees both schools and no child data',
    platform.orgs === 2 && platform.children === 0,
    JSON.stringify(platform),
  );

  // ------------------------------------------------------------------- 5. metrics
  const metrics = (
    await su<{ total: string; bad: string }>(`
      select count(*)::text as total, count(*) filter (where not ok)::text as bad from (
        select (m ->> 'sessionScore')::numeric is not distinct from s.session_score
           and (m ->> 'goalAccuracy')::numeric is not distinct from s.goal_accuracy
           and (m ->> 'deltaLast')::numeric is not distinct from s.delta_last
           and (m ->> 'deltaRolling')::numeric is not distinct from s.delta_rolling
           and (m ->> 'rollingAverage')::numeric is not distinct from s.rolling_average
           and (m ->> 'trend') = s.trend::text
           and coalesce((m ->> 'incidentCount')::int, 0) = s.incident_count
           and coalesce(m -> 'dimensions', '{}'::jsonb) = s.dimension_metrics as ok
        from public.sessions s
        cross join lateral (select public.compute_session_metrics(app.session_metrics_input(s.id)) as m) x
      ) y`)
  )[0];
  check(
    'stored session metrics == SQL engine recomputation',
    Number(metrics.bad) === 0 && Number(metrics.total) === expected.sessions,
    `${metrics.bad} of ${metrics.total} differ`,
  );

  // ------------------------------------------------------------------- 6. reset block
  await client.query('begin');
  try {
    for (const stmt of resetSql) await client.query(stmt);
    const left = {
      orgs: await n(`select count(*) from public.organizations`),
      users: await n(`select count(*) from auth.users`),
      appointments: await n(`select count(*) from public.appointments`),
      templates: await n(`select count(*) from public.rating_dimensions where organization_id is null`),
    };
    check(
      'header "replace an older load" block removes the demo schools and users',
      resetSql.length === 2 && left.orgs === 0 && left.users === 0 && left.appointments === 0 && left.templates === 8,
      JSON.stringify(left),
    );
  } catch (e) {
    check(
      'header "replace an older load" block removes the demo schools and users',
      false,
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    await client.query('rollback');
  }

  await client.end();
  console.log(`\n${failed ? 'FAIL' : 'PASS'}: ${passed}/${passed + failed} seed checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (e: unknown) => {
  console.error(e);
  await client.end().catch(() => undefined);
  process.exit(1);
});
