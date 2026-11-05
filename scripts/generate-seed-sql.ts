/**
 * npm run seed:sql — writes supabase/seed.sql from the SAME dataset Demo Mode uses
 * (buildDemoDataset in src/data/demo/seed), so a real Supabase project can be loaded with the two
 * demo schools, their people and the five login personas.
 *
 * Usage
 *   npm run seed:sql                                   # -> supabase/seed.sql, "now" = this moment
 *   npx tsx scripts/generate-seed-sql.ts --out /tmp/seed.sql --now 2026-10-29T09:00:00+05:30
 *
 * Notes
 *   * The dataset is relative to `now` (8 weeks of history, 4 weeks ahead, "today" agenda), so the
 *     SQL holds absolute timestamps: regenerate right before seeding.
 *   * The process runs in Asia/Kolkata (TZ is forced below) because the seed builds wall-clock
 *     times ("10:30") the way the app does on an Indian device, and the database computes dates
 *     in IST (app.tz()).
 *   * `@/...` imports inside src/ resolve through the `paths` in tsconfig.json, which tsx reads
 *     from the working directory: run it from the repo root (npm run does). No extra tsconfig.
 *   * Loading: `supabase db reset` runs supabase/seed.sql (config.toml [db.seed]); on a hosted
 *     project paste it into the SQL editor or `psql "$DB_URL" -f supabase/seed.sql`. It runs as
 *     the `postgres` role (table owner, so RLS does not apply) in one transaction.
 *   * Verified by `npm run test:db:seed` (scripts/db/seed-check.ts).
 */
/* eslint-disable no-console -- CLI generator: progress output is the point. */
import fs from 'node:fs';
import path from 'node:path';

import type { DemoStore } from '../src/data/demo/store';

// Must happen before any date is computed (the dataset is built after the dynamic import below).
process.env.TZ = 'Asia/Kolkata';

const ROOT = path.resolve(__dirname, '..');
const DEMO_PASSWORD = 'Demo@1234';
const BATCH = 250;
/** Every auth user in a Supabase project belongs to this GoTrue instance id. */
const INSTANCE_ID = '00000000-0000-0000-0000-000000000000';
/** raw_user_meta_data flag on every seeded auth user (lets the owner delete the demo users). */
const DEMO_MARKER = 'demo_seed';

/** Notification / audit triggers that would add rows the demo already contains (or never wants). */
const SIDE_EFFECT_TRIGGERS: [table: string, trigger: string][] = [
  ['home_tasks', 'z_notify'],
  ['home_logs', 'z_notify'],
  ['messages', 'z_notify'],
  ['announcements', 'z_notify'],
  ['child_profiles', 'z_audit'],
  ['child_clinical', 'z_audit'],
  ['goals', 'z_audit'],
  ['sessions', 'z_audit'],
  ['session_notes', 'z_audit'],
];

// ---------------------------------------------------------------------------
// SQL literals
// ---------------------------------------------------------------------------
class Raw {
  constructor(readonly sql: string) {}
}
type Val = string | number | boolean | null | undefined | Raw;
/** One row: column name -> value (every row of a table must have the same keys). */
type Row = Record<string, Val>;

const raw = (sql: string) => new Raw(sql);
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const NOW = raw('now()');

function lit(v: Val): string {
  if (v === null || v === undefined) return 'null';
  if (v instanceof Raw) return v.sql;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`non-finite number in seed: ${v}`);
    return String(v);
  }
  return quote(v);
}

/** jsonb value (an untyped literal: INSERT coerces it to the column type). */
const json = (v: unknown) => raw(quote(JSON.stringify(v ?? null)));

/** Postgres array literal for text[] / uuid[] / enum[] columns. */
const pgArray = (items: readonly string[] | undefined) =>
  raw(quote(`{${(items ?? []).map((x) => `"${x.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`));

/** Reserved words used as column names (see the schema migration header). */
const RESERVED = new Set(['from', 'to', 'by']);
const col = (c: string) => (RESERVED.has(c) ? `"${c}"` : c);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const out: string[] = [];
const counts: Record<string, number> = {};
const emit = (...lines: string[]) => out.push(...lines);

function section(title: string) {
  emit('', `-- ${'-'.repeat(75)}`, `-- ${title}`, `-- ${'-'.repeat(75)}`);
}

/**
 * Multi-row INSERT in batches. `conflict` defaults to `on conflict do nothing`, which covers the
 * primary key and every natural unique key, so re-running the file is a no-op.
 */
function insert(table: string, rows: Row[], conflict = 'on conflict do nothing') {
  const key = table.replace(/^public\./, '');
  counts[key] = (counts[key] ?? 0) + rows.length;
  if (!rows.length) {
    emit(`-- ${table}: no rows in the demo dataset`);
    return;
  }
  const columns = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    emit(`insert into ${table} (${columns.map(col).join(', ')}) values`);
    chunk.forEach((r, j) => {
      if (Object.keys(r).join() !== columns.join()) throw new Error(`${table}: rows have different columns`);
      emit(`  (${columns.map((c) => lit(r[c])).join(', ')})${j === chunk.length - 1 ? '' : ','}`);
    });
    emit(`${conflict};`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1];
}

async function main() {
  const nowArg = arg('now');
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`--now is not a date: ${nowArg}`);
  const outPath = path.resolve(arg('out') ?? path.join(ROOT, 'supabase/seed.sql'));

  const { buildDemoDataset } = await import('../src/data/demo/seed');
  const { stableId } = await import('../src/lib/id');
  const { toISODate } = await import('../src/lib/dates');
  const { DEMO_PERSONAS } = await import('../src/data/demo/personas');

  const st: DemoStore = buildDemoDataset(now);
  const today = toISODate(now);
  write(st, { now, today, stableId, personas: DEMO_PERSONAS });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${out.join('\n')}\n`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const size = fs.statSync(outPath).size;
  const shown = outPath.startsWith(`${process.cwd()}${path.sep}`) ? path.relative(process.cwd(), outPath) : outPath;
  console.log(`seed: ${shown} — ${total} rows, ${(size / 1024 / 1024).toFixed(2)} MB, today = ${today} (IST)`);
}

// ---------------------------------------------------------------------------
// The dataset -> SQL
// ---------------------------------------------------------------------------
interface Ctx {
  now: Date;
  today: string;
  stableId: (seed: string) => string;
  personas: { key: string; name: string; phone: string; email?: string }[];
}

function write(st: DemoStore, ctx: Ctx) {
  const { stableId } = ctx;
  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((x) => [x.id, x]));
  const children = byId(st.children);
  const appointments = byId(st.appointments);
  const sessions = byId(st.sessions);
  const child = (childId: string) => {
    const c = children.get(childId);
    if (!c) throw new Error(`unknown child ${childId}`);
    return c;
  };
  const userOrg = (userId: string) =>
    st.memberships.find((m) => m.userId === userId && m.organizationId)?.organizationId ?? null;
  const coordinatorOf = (orgId: string) =>
    (
      st.memberships.find((m) => m.organizationId === orgId && m.role === 'coordinator') ??
      st.memberships.find((m) => m.organizationId === orgId && m.role === 'school_admin')
    )?.userId ?? null;
  const phoneDigits = (phone: string | undefined) => (phone ? phone.replace(/\D/g, '') : null);

  // Media rows follow the storage path convention {org_id}/{child_id}/{file}: the `media` bucket
  // policies only let the child's guardians and therapists sign URLs for objects under that path.
  const mediaChild = new Map<string, string>();
  for (const l of st.homeLogs) if (l.mediaId) mediaChild.set(l.mediaId, l.childId);
  const mediaPath = (m: DemoStore['media'][number]) => {
    const childId = mediaChild.get(m.id);
    if (!childId) throw new Error(`media ${m.id} is not attached to a home log`);
    return { childId, path: `${m.organizationId}/${childId}/${path.posix.basename(m.bucketPath)}` };
  };

  // Login identifiers must be unique (auth.users has unique phone / email) ...
  const seen = new Map<string, string>();
  for (const p of st.profiles) {
    for (const k of [p.email?.toLowerCase(), phoneDigits(p.phone) ?? undefined]) {
      if (!k) continue;
      if (seen.has(k)) throw new Error(`duplicate login ${k} (${seen.get(k)} / ${p.fullName})`);
      seen.set(k, p.fullName);
    }
  }
  // ... and the personas' must be the ones the login screen advertises (personas.ts).
  for (const p of ctx.personas) {
    const userId = st.personas.find((x) => x.key === p.key)?.userId;
    const profile = st.profiles.find((x) => x.id === userId);
    if (!profile || profile.phone !== p.phone || profile.email !== p.email || profile.fullName !== p.name) {
      throw new Error(`persona ${p.key} in personas.ts does not match the seeded profile`);
    }
  }

  // ------------------------------------------------------------------------- header
  const personaLines = st.personas.map(({ key, userId }) => {
    const p = st.profiles.find((x) => x.id === userId)!;
    const login = p.email ? `${p.email} / ${DEMO_PASSWORD}  or  ${p.phone} + OTP` : `${p.phone} + OTP`;
    return `--   ${key.padEnd(15)} ${p.fullName.padEnd(16)} ${login}`;
  });
  const mediaLines = st.media.map((m) => `--   assets/${m.bucketPath}  ->  media/${mediaPath(m).path}`);
  emit(
    '-- =============================================================================',
    "-- supabase/seed.sql — My Kid's Tracker demo data (GENERATED, do not edit by hand)",
    '--',
    `-- Generated ${ctx.now.toISOString()} by scripts/generate-seed-sql.ts; "today" = ${ctx.today} (IST).`,
    '-- Same dataset as Demo Mode (src/data/demo/seed): Anvaya CDC (Noida) + Sahaj (Bengaluru).',
    '--',
    '-- REGENERATE BEFORE SEEDING:  npm run seed:sql',
    '--   Every timestamp below is absolute. The dataset is built around the generation moment',
    '--   (8 weeks of logged sessions, 4 weeks ahead, a busy "today" for the therapist persona),',
    '--   so an old file still loads but "today" will have no sessions.',
    '--',
    '-- Load: `supabase db reset` (config.toml [db.seed]) or `psql "$DB_URL" -f supabase/seed.sql`',
    '-- as the postgres role. One transaction; safe to re-run (on conflict do nothing). To replace',
    '-- an older load, delete the demo schools and users first (see the commented block below).',
    '--',
    `-- Logins (password ${DEMO_PASSWORD} for every user; phone OTP needs [auth.sms.test_otp]):`,
    ...personaLines,
    `--   Other staff: <name>@anvaya.demo / <name>@sahaj.demo with ${DEMO_PASSWORD}.`,
    '--',
    '-- MANUAL STEP: upload the practice videos to the private `media` bucket (Dashboard > Storage,',
    '-- or `supabase storage cp <file> ss:///media/<path> --experimental`):',
    ...mediaLines,
    '--',
    '-- What it does:',
    '--   * auth.users + auth.identities (common Supabase seed pattern; bcrypt via pgcrypto), then',
    '--     profiles (the on_auth_user_created trigger creates them; we fill title/language).',
    '--   * Global rating-dimension templates come from the templates migration and are NOT',
    '--     inserted here. The goal bank is global (organization_id null) in the demo and no',
    '--     migration inserts it, so its rows are inserted here.',
    '--   * Side-effect triggers are disabled for the load and re-enabled before commit:',
    '--     z_notify (would push hundreds of "new message"/"home task" notifications) and z_audit',
    '--     (would log every seeded row as a fresh edit). Validation/org triggers stay ON, so the',
    '--     data passes the same checks as API writes. Seeded notifications use',
    "--     push_status = 'skipped' so the send-push function never pushes history.",
    '--   * Session metric columns hold the values the demo computed with src/domain/metrics.ts',
    '--     (the same numbers app.apply_session_metrics would produce).',
    `-- @counts ${JSON.stringify(precount(st))}`,
    '-- =============================================================================',
    '',
    '-- Replace an older demo load (uncomment both; deletes cascade through every demo row; the',
    '-- global goal-bank and resource rows have fixed ids and are simply kept):',
    `-- delete from public.organizations where id in (${st.organizations.map((o) => quote(o.id)).join(', ')});`,
    `-- delete from auth.users where raw_user_meta_data ->> '${DEMO_MARKER}' = 'true';`,
    '',
    'begin;',
    '',
    'set local statement_timeout = 0;',
    '',
    '-- Side-effect triggers off for the load (re-enabled at the end of this transaction).',
    ...SIDE_EFFECT_TRIGGERS.map(([t, trg]) => `alter table public.${t} disable trigger ${trg};`),
  );

  // ------------------------------------------------------------------------- auth
  section('auth.users / auth.identities');
  const identities: Row[] = [];
  const users = st.profiles.map((p): Row => {
    const email = p.email?.toLowerCase() ?? null;
    const phone = phoneDigits(p.phone); // GoTrue stores phones without '+'
    const providers = [...(email ? ['email'] : []), ...(phone ? ['phone'] : [])];
    if (!providers.length) throw new Error(`profile ${p.fullName} has neither email nor phone`);
    if (email) {
      identities.push({
        id: stableId(`identity:email:${p.id}`),
        provider_id: p.id,
        user_id: p.id,
        provider: 'email',
        identity_data: json({ sub: p.id, email, email_verified: true, phone_verified: false }),
        last_sign_in_at: NOW,
        created_at: NOW,
        updated_at: NOW,
      });
    }
    if (phone) {
      identities.push({
        id: stableId(`identity:phone:${p.id}`),
        provider_id: p.id,
        user_id: p.id,
        provider: 'phone',
        identity_data: json({ sub: p.id, phone, email_verified: false, phone_verified: true }),
        last_sign_in_at: NOW,
        created_at: NOW,
        updated_at: NOW,
      });
    }
    return {
      instance_id: INSTANCE_ID,
      id: p.id,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      encrypted_password: raw(`extensions.crypt(${quote(DEMO_PASSWORD)}, extensions.gen_salt('bf'))`),
      email_confirmed_at: email ? NOW : null,
      phone,
      phone_confirmed_at: phone ? NOW : null,
      raw_app_meta_data: json({ provider: providers[0], providers }),
      raw_user_meta_data: json({ full_name: p.fullName, [DEMO_MARKER]: true }),
      created_at: NOW,
      updated_at: NOW,
      // GoTrue scans these as strings: NULL breaks sign-in ("Database error querying schema").
      confirmation_token: '',
      recovery_token: '',
      email_change_token_new: '',
      email_change: '',
    };
  });
  insert('auth.users', users);
  insert('auth.identities', identities);

  // ------------------------------------------------------------------------- tenancy & people
  section('profiles (rows already created by the on_auth_user_created trigger; fill the rest)');
  insert(
    'public.profiles',
    st.profiles.map((p) => ({
      id: p.id,
      full_name: p.fullName,
      phone: p.phone,
      email: p.email?.toLowerCase(),
      preferred_language: p.preferredLanguage,
      title: p.title,
      created_by: p.id,
    })),
    'on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone, email = excluded.email,\n' +
      '  preferred_language = excluded.preferred_language, title = excluded.title',
  );

  section('organizations, branches, memberships');
  insert(
    'public.organizations',
    st.organizations.map((o) => ({
      id: o.id,
      name: o.name,
      short_name: o.shortName,
      city: o.city,
      address: o.address,
      phone: o.phone,
      email: o.email,
      logo_url: o.logoUrl,
      status: o.status,
      settings: json(o.settings),
      created_at: o.createdAt,
    })),
  );
  insert(
    'public.branches',
    st.branches.map((b) => ({ id: b.id, organization_id: b.organizationId, name: b.name, address: b.address })),
  );
  insert(
    'public.memberships',
    st.memberships.map((m) => ({
      id: m.id,
      user_id: m.userId,
      organization_id: m.organizationId,
      role: m.role,
      status: m.status,
    })),
  );

  section('therapy types, qualifications, rating dimensions (org copies), goal bank');
  insert(
    'public.therapy_types',
    st.therapyTypes.map((t) => ({
      id: t.id,
      organization_id: t.organizationId,
      key: t.key,
      name: t.name,
      color: t.color,
      icon: t.icon,
      active: t.active,
    })),
  );
  insert(
    'public.member_therapy_types',
    st.qualifications.map((q) => ({
      organization_id: q.organizationId,
      user_id: q.userId,
      therapy_type_id: q.therapyTypeId,
    })),
  );
  insert(
    'public.rating_dimensions',
    st.dimensions
      .filter((d) => d.organizationId) // global templates come from 20261029000007_templates.sql
      .map((d) => ({
        id: d.id,
        organization_id: d.organizationId,
        key: d.key,
        label: d.label,
        parent_label: d.parentLabel,
        description: d.description,
        anchors: json(d.anchors),
        weight: d.weight,
        enabled: d.enabled,
        sort_order: d.sortOrder,
        icon: d.icon,
      })),
  );
  insert(
    'public.goal_bank',
    st.goalBank.map((g) => ({
      id: g.id,
      organization_id: g.organizationId,
      domain: g.domain,
      therapy_type_key: g.therapyTypeKey,
      staff_text: g.staffText,
      parent_text: g.parentText,
    })),
  );

  // ------------------------------------------------------------------------- children
  section('children, About Me, clinical, edit history, guardians, therapists');
  insert(
    'public.children',
    st.children.map((c) => ({
      id: c.id,
      organization_id: c.organizationId,
      branch_id: c.branchId,
      full_name: c.fullName,
      preferred_name: c.preferredName,
      dob: c.dob,
      gender: c.gender,
      photo_url: c.photoUrl,
      class_group: c.classGroup,
      status: c.status,
      created_at: c.createdAt,
    })),
  );
  insert(
    'public.child_profiles',
    st.childProfiles.map((p) => ({
      organization_id: child(p.childId).organizationId,
      child_id: p.childId,
      communication_mode: p.communicationMode,
      comm_tools: pgArray(p.commTools),
      comm_notes: p.commNotes,
      reinforcers: pgArray(p.reinforcers),
      reinforcers_notes: p.reinforcersNotes,
      triggers: pgArray(p.triggers),
      triggers_notes: p.triggersNotes,
      calming: pgArray(p.calming),
      calming_notes: p.calmingNotes,
      sensory_notes: p.sensoryNotes,
      dos: pgArray(p.dos),
      donts: pgArray(p.donts),
      created_at: child(p.childId).createdAt,
      updated_at: p.updatedAt,
      created_by: p.updatedBy,
      updated_by: p.updatedBy,
    })),
  );
  insert(
    'public.child_clinical',
    st.childProfiles
      .filter((p) => p.clinical)
      .map((p) => ({
        organization_id: child(p.childId).organizationId,
        child_id: p.childId,
        diagnosis: pgArray(p.clinical!.diagnosis),
        medical_notes: p.clinical!.medicalNotes,
        allergies: p.clinical!.allergies,
        medications: p.clinical!.medications,
        created_at: child(p.childId).createdAt,
        updated_at: p.updatedAt,
        created_by: p.updatedBy,
        updated_by: p.updatedBy,
      })),
  );
  insert(
    'public.profile_edits',
    st.profileEdits.map((e) => ({
      id: e.id,
      organization_id: child(e.childId).organizationId,
      child_id: e.childId,
      field: e.field,
      old_value: e.oldValue,
      new_value: e.newValue,
      by: e.by,
      at: e.at,
      created_at: e.at,
    })),
  );
  insert(
    'public.child_guardians',
    st.guardians.map((g) => ({
      organization_id: child(g.childId).organizationId,
      child_id: g.childId,
      user_id: g.userId,
      relation: g.relation,
      is_primary: g.isPrimary,
    })),
  );
  insert(
    'public.child_therapists',
    st.childTherapists.map((t) => ({
      organization_id: child(t.childId).organizationId,
      child_id: t.childId,
      user_id: t.userId,
      therapy_type_id: t.therapyTypeId,
      is_lead: t.isLead,
      active_from: t.activeFrom,
      active_to: t.activeTo,
    })),
  );

  section('invites');
  const acceptedBy = (phone?: string, email?: string) =>
    st.profiles.find((p) => (phone && p.phone === phone) || (email && p.email?.toLowerCase() === email.toLowerCase()))
      ?.id;
  insert(
    'public.invites',
    st.invites.map((i) => {
      const by = i.status === 'accepted' ? acceptedBy(i.phone, i.email) : undefined;
      return {
        id: i.id,
        organization_id: i.organizationId,
        role: i.role,
        full_name: i.fullName,
        phone: i.phone,
        email: i.email,
        child_ids: pgArray(i.childIds),
        relation: i.relation,
        status: i.status,
        accepted_by: by,
        accepted_at: by
          ? new Date(Math.min(new Date(i.createdAt).getTime() + 86_400_000, ctx.now.getTime())).toISOString()
          : undefined,
        created_at: i.createdAt,
        created_by: i.createdBy,
      };
    }),
  );

  // ------------------------------------------------------------------------- goals
  section('goals');
  insert(
    'public.goals',
    st.goals.map((g) => ({
      id: g.id,
      organization_id: g.organizationId,
      child_id: g.childId,
      therapy_type_id: g.therapyTypeId,
      domain: g.domain,
      staff_text: g.staffText,
      parent_text: g.parentText,
      baseline: g.baseline,
      mastery_rule: json(g.masteryRule),
      status: g.status,
      start_date: g.startDate,
      mastered_at: g.masteredAt,
      created_at: g.createdAt,
      created_by: g.createdBy,
    })),
  );

  // ------------------------------------------------------------------------- calendar
  section('appointment series and appointments');
  const seriesCreated = new Map<string, string>();
  for (const a of st.appointments) {
    const prev = a.seriesId ? seriesCreated.get(a.seriesId) : undefined;
    if (a.seriesId && (!prev || a.createdAt < prev)) seriesCreated.set(a.seriesId, a.createdAt);
  }
  insert(
    'public.appointment_series',
    st.series.map((s) => ({
      id: s.id,
      organization_id: s.organizationId,
      child_id: s.childId,
      therapist_id: s.therapistId,
      therapy_type_id: s.therapyTypeId,
      rrule: s.rrule,
      start_time: s.startTime,
      duration_minutes: s.durationMinutes,
      start_date: s.startDate,
      end_date: s.endDate,
      room: s.room,
      created_at: seriesCreated.get(s.id),
      created_by: s.createdBy,
    })),
  );
  // makeup_of_id references appointments: emit referenced rows first.
  const ordered: DemoStore['appointments'] = [];
  const placed = new Set<string>();
  let pending = [...st.appointments];
  while (pending.length) {
    const ready = pending.filter((a) => !a.makeupOfId || placed.has(a.makeupOfId) || !appointments.has(a.makeupOfId));
    if (!ready.length) throw new Error('cycle in appointments.makeup_of_id');
    for (const a of ready) {
      ordered.push(a);
      placed.add(a.id);
    }
    pending = pending.filter((a) => !placed.has(a.id));
  }
  insert(
    'public.appointments',
    ordered.map((a) => ({
      id: a.id,
      organization_id: a.organizationId,
      series_id: a.seriesId,
      child_id: a.childId,
      therapist_id: a.therapistId,
      original_therapist_id: a.originalTherapistId,
      therapy_type_id: a.therapyTypeId,
      starts_at: a.startsAt,
      ends_at: a.endsAt,
      room: a.room,
      status: a.status,
      attendance: a.attendance,
      late_minutes: a.lateMinutes,
      makeup_of_id: a.makeupOfId,
      was_rescheduled: a.wasRescheduled,
      cancel_reason: a.cancelReason,
      created_at: a.createdAt,
      created_by: coordinatorOf(a.organizationId),
    })),
  );

  section('reschedule requests, leave, Handover Brief acknowledgements');
  insert(
    'public.reschedule_requests',
    st.rescheduleRequests.map((r) => ({
      id: r.id,
      organization_id: r.organizationId,
      appointment_id: r.appointmentId,
      requested_by: r.requestedBy,
      proposed_slots: json(r.proposedSlots),
      reason: r.reason,
      status: r.status,
      resolution: r.resolution ? json(r.resolution) : null,
      resolved_by: r.resolvedBy,
      resolved_at: r.resolvedAt,
      created_at: r.createdAt,
      created_by: r.requestedBy,
    })),
  );
  insert(
    'public.therapist_unavailability',
    st.unavailability.map((u) => ({
      id: u.id,
      organization_id: u.organizationId,
      user_id: u.userId,
      from: u.from,
      to: u.to,
      reason: u.reason,
      created_at: u.createdAt,
      created_by: coordinatorOf(u.organizationId),
    })),
  );
  insert(
    'public.brief_acknowledgements',
    st.briefAcks.map((b) => ({
      organization_id: appointments.get(b.appointmentId)!.organizationId,
      user_id: b.userId,
      appointment_id: b.appointmentId,
      at: b.at,
      created_at: b.at,
      created_by: b.userId,
    })),
  );

  section('parent check-ins');
  insert(
    'public.parent_checkins',
    st.checkins.map((c) => ({
      id: c.id,
      organization_id: c.organizationId,
      client_id: c.clientId,
      child_id: c.childId,
      appointment_id: c.appointmentId,
      date: c.date,
      sleep: c.sleep,
      ate_breakfast: c.ateBreakfast,
      mood: c.mood,
      change_flag: c.changeFlag,
      change_note: c.changeNote,
      submitted_by: c.submittedBy,
      created_at: c.createdAt,
      created_by: c.submittedBy,
    })),
  );

  // ------------------------------------------------------------------------- sessions
  section('sessions (with precomputed metrics) and their ratings, trials, incidents, notes, amendments');
  insert(
    'public.sessions',
    st.sessions.map((s) => ({
      id: s.id,
      organization_id: s.organizationId,
      client_id: s.clientId,
      appointment_id: s.appointmentId,
      child_id: s.childId,
      therapist_id: s.therapistId,
      therapy_type_id: s.therapyTypeId,
      is_substitute: s.isSubstitute,
      date: s.date,
      actual_minutes: s.actualMinutes,
      started_late: s.startedLate,
      regulation_state: s.regulationState,
      breaks_count: s.breaksCount,
      compared_to_last: s.comparedToLast,
      worked_tags: pgArray(s.workedTags),
      worked_text: s.workedText,
      not_worked_tags: pgArray(s.notWorkedTags),
      not_worked_text: s.notWorkedText,
      session_score: s.metrics.sessionScore,
      goal_accuracy: s.metrics.goalAccuracy,
      delta_last: s.metrics.deltaLast,
      delta_rolling: s.metrics.deltaRolling,
      rolling_average: s.metrics.rollingAverage,
      trend: s.metrics.trend,
      dimension_metrics: json(s.metrics.dimensions),
      incident_count: s.metrics.incidentCount,
      locked_at: s.lockedAt,
      amendment_count: s.amendmentCount,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
      created_by: s.therapistId,
    })),
  );
  // organization_id of the session children is filled by the a_set_org trigger (from session_id).
  // Ratings are the largest block, so each session's ratings travel as one json object and are
  // expanded here (created_at / created_by come from the session row).
  counts.session_ratings = st.sessions.reduce((n, s) => n + Object.keys(s.ratings).length, 0);
  for (let i = 0; i < st.sessions.length; i += BATCH) {
    const chunk = st.sessions.slice(i, i + BATCH);
    emit(
      'insert into public.session_ratings (session_id, dimension_key, value, created_at, created_by)',
      'select s.id, r.key, r.value::smallint, s.created_at, s.therapist_id',
      'from (values',
      ...chunk.map((s, j) => `  (${lit(s.id)}, ${lit(json(s.ratings))})${j === chunk.length - 1 ? '' : ','}`),
      ') v (session_id, ratings)',
      'join public.sessions s on s.id = v.session_id::uuid',
      'cross join lateral jsonb_each_text(v.ratings::jsonb) r (key, value)',
      'on conflict do nothing;',
    );
  }
  insert(
    'public.goal_trials',
    st.sessions.flatMap((s) =>
      s.goalTrials.map((t) => ({
        session_id: s.id,
        goal_id: t.goalId,
        attempted: t.attempted,
        successful: t.successful,
        prompt_level: t.promptLevel,
        note: t.note,
        created_at: s.createdAt,
        created_by: s.therapistId,
      })),
    ),
  );
  insert(
    'public.behaviour_incidents',
    st.sessions.flatMap((s) =>
      s.incidents.map((i, n) => ({
        id: stableId(`incident:${s.id}:${n}`), // no natural key: a stable id keeps re-runs idempotent
        session_id: s.id,
        type: i.type,
        duration_seconds: i.durationSeconds,
        antecedent_tags: pgArray(i.antecedentTags),
        created_at: s.createdAt,
        created_by: s.therapistId,
      })),
    ),
  );
  insert(
    'public.session_notes',
    st.sessions.map((s) => ({
      session_id: s.id,
      subjective: s.notes.subjective,
      objective: s.notes.objective,
      assessment: s.notes.assessment,
      plan_next: s.notes.planNext,
      plan_goal_ids: pgArray(s.notes.planGoalIds),
      parent_summary: s.notes.parentSummary,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
      created_by: s.therapistId,
    })),
  );
  insert(
    'public.amendments',
    st.amendments.map((a) => ({
      id: a.id,
      organization_id: sessions.get(a.sessionId)!.organizationId,
      session_id: a.sessionId,
      entity: a.entity,
      entity_id: a.entityId,
      field: a.field,
      old_value: a.oldValue,
      new_value: a.newValue,
      reason: a.reason,
      by: a.by,
      at: a.at,
      created_at: a.at,
      created_by: a.by,
    })),
  );

  // ------------------------------------------------------------------------- media, resources, home practice
  section('media (files must be uploaded to the `media` bucket by hand, see header)');
  const MIME: Record<string, string> = { video: 'video/mp4', image: 'image/jpeg', pdf: 'application/pdf' };
  insert(
    'public.media',
    st.media.map((m) => ({
      id: m.id,
      organization_id: m.organizationId,
      owner_id: m.ownerId,
      child_id: mediaPath(m).childId,
      bucket_path: mediaPath(m).path,
      kind: m.kind,
      mime_type: MIME[m.kind],
      duration_s: m.durationS,
      size_bytes: m.sizeBytes,
      expires_at: m.expiresAt,
      upload_status: m.uploadStatus,
      created_at: m.createdAt,
      created_by: m.ownerId,
    })),
  );

  section('resources and shares');
  insert(
    'public.resources',
    st.resources.map((r) => ({
      id: r.id,
      organization_id: r.organizationId,
      title: r.title,
      description: r.description,
      kind: r.kind,
      url: r.url,
      tags: pgArray(r.tags),
      therapy_type_keys: pgArray(r.therapyTypeKeys),
      domains: pgArray(r.domains),
      age_band: r.ageBand,
      audience: r.audience,
      created_at: r.createdAt,
    })),
  );
  insert(
    'public.resource_shares',
    st.resourceShares.map((r) => ({
      id: r.id,
      organization_id: r.childId ? child(r.childId).organizationId : userOrg(r.userId!),
      resource_id: r.resourceId,
      child_id: r.childId,
      user_id: r.userId,
      shared_by: r.sharedBy,
      note: r.note,
      at: r.at,
      created_at: r.at,
      created_by: r.sharedBy,
    })),
  );

  section('home practice');
  insert(
    'public.home_tasks',
    st.homeTasks.map((t) => ({
      id: t.id,
      organization_id: t.organizationId,
      child_id: t.childId,
      goal_id: t.goalId,
      assigned_by: t.assignedBy,
      title: t.title,
      steps: json(t.steps),
      frequency_per_week: t.frequencyPerWeek,
      duration_minutes: t.durationMinutes,
      resource_id: t.resourceId,
      demo_media_id: t.demoMediaId,
      active_from: t.activeFrom,
      active_to: t.activeTo,
      status: t.status,
      created_at: t.createdAt,
      created_by: t.assignedBy,
    })),
  );
  insert(
    'public.home_logs',
    st.homeLogs.map((l) => ({
      id: l.id,
      organization_id: l.organizationId,
      client_id: l.clientId,
      task_id: l.taskId,
      child_id: l.childId,
      logged_by: l.loggedBy,
      outcome: l.outcome,
      difficulty: l.difficulty,
      note: l.note,
      media_id: l.mediaId,
      reviewed_by: l.reviewedBy,
      review_reaction: l.reviewReaction,
      review_comment: l.reviewComment,
      reviewed_at: l.reviewedAt,
      use_in_next_session: l.useInNextSession,
      created_at: l.createdAt,
      updated_at: l.reviewedAt ?? l.createdAt,
      created_by: l.loggedBy,
    })),
  );

  // ------------------------------------------------------------------------- messaging
  section('threads, members, messages, read watermarks');
  insert(
    'public.threads',
    st.threads.map((t) => ({
      id: t.id,
      organization_id: t.organizationId,
      child_id: t.childId,
      kind: t.kind,
      title: t.title,
      created_at: t.createdAt,
      created_by: coordinatorOf(t.organizationId),
    })),
  );
  const threadOrg = new Map(st.threads.map((t) => [t.id, t.organizationId]));
  insert(
    'public.thread_members',
    st.threadMembers.map((m) => ({
      organization_id: threadOrg.get(m.threadId),
      thread_id: m.threadId,
      user_id: m.userId,
    })),
  );
  insert(
    'public.messages',
    st.messages.map((m) => ({
      id: m.id,
      organization_id: threadOrg.get(m.threadId),
      thread_id: m.threadId,
      sender_id: m.senderId,
      body: m.body,
      attachments: json(m.attachments ?? []),
      created_at: m.createdAt,
      updated_at: m.createdAt,
      created_by: m.senderId,
    })),
  );
  insert(
    'public.message_reads',
    st.threadReads.map((r) => ({
      organization_id: threadOrg.get(r.threadId),
      thread_id: r.threadId,
      user_id: r.userId,
      last_read_at: r.lastReadAt,
    })),
  );

  section('announcements, alerts, notifications');
  insert(
    'public.announcements',
    st.announcements.map((a) => ({
      id: a.id,
      organization_id: a.organizationId,
      title: a.title,
      body: a.body,
      audience: a.audience,
      therapy_type_id: a.therapyTypeId,
      urgent: a.urgent,
      created_at: a.createdAt,
      created_by: a.createdBy,
    })),
  );
  insert(
    'public.alerts',
    st.alerts.map((a) => ({
      id: a.id,
      organization_id: a.organizationId,
      child_id: a.childId,
      kind: a.kind,
      payload: json(a.payload),
      message: a.message,
      status: a.status,
      resolved_by: a.resolvedBy,
      resolved_at: a.resolvedAt,
      created_at: a.createdAt,
      updated_at: a.resolvedAt ?? a.createdAt,
    })),
  );
  insert(
    'public.notifications',
    st.notifications.map((n) => ({
      id: n.id,
      organization_id: userOrg(n.userId),
      user_id: n.userId,
      kind: n.kind,
      title: n.title,
      body: n.body,
      route: n.route,
      read_at: n.readAt,
      push_status: 'skipped', // history: the send-push function only picks up 'pending'
      created_at: n.createdAt,
      updated_at: n.readAt ?? n.createdAt,
    })),
  );
  insert(
    'public.notification_mutes',
    st.mutedKinds.flatMap((m) => m.kinds.map((kind) => ({ user_id: m.userId, kind, created_by: m.userId }))),
  );
  insert(
    'public.push_tokens',
    st.pushTokens.map((t) => ({ user_id: t.userId, token: t.token, platform: t.platform, created_by: t.userId })),
  );

  // ------------------------------------------------------------------------- privacy & audit
  section('consents, data requests, audit log');
  insert(
    'public.consents',
    st.consents.map((c) => ({
      id: c.id,
      user_id: c.userId,
      organization_id: c.childId ? child(c.childId).organizationId : userOrg(c.userId),
      child_id: c.childId,
      kind: c.kind,
      granted: c.granted,
      at: c.at,
      version: c.version,
      created_at: c.at,
      created_by: c.userId,
    })),
  );
  insert(
    'public.data_requests',
    st.dataRequests.map((d) => ({
      id: d.id,
      organization_id: d.organizationId,
      user_id: d.userId,
      child_id: d.childId,
      kind: d.kind,
      status: d.status,
      created_at: d.createdAt,
      created_by: d.userId,
    })),
  );
  insert(
    'public.audit_log',
    st.audit.map((e) => ({
      id: e.id,
      organization_id: e.organizationId || null,
      actor_id: e.actorId || null,
      action: e.action,
      entity: e.entity,
      entity_id: e.entityId || null,
      at: e.at,
      meta: json(e.meta),
      created_at: e.at,
      created_by: e.actorId || null,
    })),
  );

  section('done');
  emit(...SIDE_EFFECT_TRIGGERS.map(([t, trg]) => `alter table public.${t} enable trigger ${trg};`), '', 'commit;');

  // The @counts header line must describe exactly what was emitted.
  const expected = precount(st);
  for (const k of new Set([...Object.keys(expected), ...Object.keys(counts)])) {
    if (expected[k] !== counts[k])
      throw new Error(`count mismatch for ${k}: header ${expected[k]} vs emitted ${counts[k]}`);
  }
}

/** Rows per table the generator inserts (scripts/db/seed-check.ts compares these with the DB). */
function precount(st: DemoStore): Record<string, number> {
  const sum = <T>(items: T[], f: (x: T) => number) => items.reduce((n, x) => n + f(x), 0);
  return {
    'auth.users': st.profiles.length,
    'auth.identities': sum(st.profiles, (p) => (p.email ? 1 : 0) + (p.phone ? 1 : 0)),
    profiles: st.profiles.length,
    organizations: st.organizations.length,
    branches: st.branches.length,
    memberships: st.memberships.length,
    therapy_types: st.therapyTypes.length,
    member_therapy_types: st.qualifications.length,
    rating_dimensions: st.dimensions.filter((d) => d.organizationId).length,
    goal_bank: st.goalBank.length,
    children: st.children.length,
    child_profiles: st.childProfiles.length,
    child_clinical: st.childProfiles.filter((p) => p.clinical).length,
    profile_edits: st.profileEdits.length,
    child_guardians: st.guardians.length,
    child_therapists: st.childTherapists.length,
    invites: st.invites.length,
    goals: st.goals.length,
    appointment_series: st.series.length,
    appointments: st.appointments.length,
    reschedule_requests: st.rescheduleRequests.length,
    therapist_unavailability: st.unavailability.length,
    brief_acknowledgements: st.briefAcks.length,
    parent_checkins: st.checkins.length,
    sessions: st.sessions.length,
    session_ratings: sum(st.sessions, (s) => Object.keys(s.ratings).length),
    goal_trials: sum(st.sessions, (s) => s.goalTrials.length),
    behaviour_incidents: sum(st.sessions, (s) => s.incidents.length),
    session_notes: st.sessions.length,
    amendments: st.amendments.length,
    media: st.media.length,
    resources: st.resources.length,
    resource_shares: st.resourceShares.length,
    home_tasks: st.homeTasks.length,
    home_logs: st.homeLogs.length,
    threads: st.threads.length,
    thread_members: st.threadMembers.length,
    messages: st.messages.length,
    message_reads: st.threadReads.length,
    announcements: st.announcements.length,
    alerts: st.alerts.length,
    notifications: st.notifications.length,
    notification_mutes: sum(st.mutedKinds, (m) => m.kinds.length),
    push_tokens: st.pushTokens.length,
    consents: st.consents.length,
    data_requests: st.dataRequests.length,
    audit_log: st.audit.length,
  };
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
