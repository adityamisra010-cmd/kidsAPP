/**
 * CSV/XLSX import commit. Idempotent on natural keys:
 * child = full name + DOB · staff/parent = phone · schedule = child + therapist + therapy + weekday + time.
 * Column keys are matched loosely (case, spaces, `_` ignored): full_name / fullName / "Full Name".
 */
import type { ImportsRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import { expandSeries, rruleToWeekdays, weekdaysToRrule } from '@/domain/derive';
import type { Child, ImportRow, ImportSummary, ISODate, Role, UUID } from '@/domain/types';
import { addDaysISO } from '@/lib/dates';
import { uuid } from '@/lib/id';

import { normalisePhone } from './auth';
import type { DemoCore, OrgContext } from './core';

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function reader(row: ImportRow) {
  const map = new Map(Object.entries(row.values).map(([k, v]) => [norm(k), (v ?? '').trim()]));
  return (...keys: string[]) => keys.map((k) => map.get(norm(k))).find((v) => v) ?? '';
}

export function parseDate(raw: string): ISODate | undefined {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export function parseWeekdays(raw: string): number[] {
  const out = raw
    .toLowerCase()
    .split(/[\s,/;&+|-]+/)
    .filter(Boolean)
    .map((t) => (/^[0-6]$/.test(t) ? Number(t) : DAYS.indexOf(t.slice(0, 3))))
    .filter((d) => d >= 0);
  return [...new Set(out)];
}

export function parseTime(raw: string): string | undefined {
  const m = /^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return undefined;
  let h = Number(m[1]);
  if (m[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
  if (m[3]?.toLowerCase() === 'am' && h === 12) h = 0;
  return h < 24 && Number(m[2]) < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : undefined;
}

export function createImportsRepo(core: DemoCore): ImportsRepo {
  const st = core.db;
  const findChild = (ctx: OrgContext, name: string, dob?: ISODate): Child | undefined => {
    const matches = st.children.filter((c) => c.organizationId === ctx.organizationId && same(c.fullName, name) && (!dob || c.dob === dob));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const memberByPhone = (ctx: OrgContext, phone: string, roles: Role[]) => {
    const profile = st.profiles.find((p) => p.phone === phone);
    const role = profile ? core.roleIn(profile.id, ctx.organizationId) : undefined;
    return { profile, inOrg: Boolean(role && roles.includes(role)) };
  };
  const therapyTypeId = (ctx: OrgContext, raw: string) =>
    st.therapyTypes.find((t) => t.organizationId === ctx.organizationId && (same(t.key, raw) || same(t.name, raw) || t.name.toLowerCase().startsWith(raw.trim().toLowerCase())))?.id;

  const commitRow = (ctx: OrgContext, kind: ImportSummary['kind'], row: ImportRow): 'created' | 'updated' | 'skipped' => {
    const get = reader(row);
    if (kind === 'children') {
      const fullName = get('full_name', 'name', 'child_name');
      const dob = parseDate(get('dob', 'date_of_birth', 'birth_date'));
      if (!fullName || !dob) throw new RepoError('validation', 'Child name and date of birth are required.');
      const patch = { classGroup: get('class_group', 'class', 'group') || undefined, preferredName: get('preferred_name', 'nickname') || undefined, gender: (get('gender').toLowerCase() as Child['gender']) || undefined };
      const existing = findChild(ctx, fullName, dob);
      if (existing) {
        const changes = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v && existing[k as keyof Child] !== v));
        if (!Object.keys(changes).length) return 'skipped';
        Object.assign(existing, changes);
        return 'updated';
      }
      st.children.push({ id: uuid(), organizationId: ctx.organizationId, fullName, dob, status: 'active', createdAt: core.nowIso(), ...patch });
      const childId = st.children[st.children.length - 1].id;
      st.childProfiles.push({ childId, communicationMode: 'verbal', commTools: [], commNotes: '', reinforcers: [], reinforcersNotes: '', triggers: [], triggersNotes: '', calming: [], calmingNotes: '', sensoryNotes: '', dos: [], donts: [], clinical: { diagnosis: [], medicalNotes: '', allergies: '', medications: '' }, updatedAt: core.nowIso(), updatedBy: ctx.userId });
      return 'created';
    }
    if (kind === 'staff' || kind === 'parents') {
      const fullName = get('full_name', 'name', kind === 'parents' ? 'parent_name' : 'staff_name');
      const phone = normalisePhone(get('phone', 'mobile', 'phone_number'));
      if (!fullName || !/^\+91[6-9]\d{9}$/.test(phone)) throw new RepoError('validation', 'Name and a valid 10-digit mobile number are required.');
      const role: Role = kind === 'parents' ? 'parent' : get('role').toLowerCase().includes('coord') ? 'coordinator' : get('role').toLowerCase().includes('admin') ? 'school_admin' : 'therapist';
      const child = kind === 'parents' ? findChild(ctx, get('child_name', 'child'), parseDate(get('child_dob', 'dob')) ) : undefined;
      if (kind === 'parents' && !child) throw new RepoError('validation', 'Unknown child — check the child name and date of birth.');
      const { profile, inOrg } = memberByPhone(ctx, phone, [role]);
      let result: 'created' | 'updated' | 'skipped' = 'skipped';
      const user = profile ?? { id: uuid(), fullName, phone, email: get('email') || undefined, preferredLanguage: 'en' as const, title: get('title', 'designation') || undefined };
      if (!profile) {
        st.profiles.push(user);
        result = 'created';
      }
      if (!inOrg) {
        st.memberships.push({ id: uuid(), userId: user.id, organizationId: ctx.organizationId, role, status: 'active' });
        result = 'created';
      } else if (profile && (profile.fullName !== fullName || (get('title') && profile.title !== get('title')))) {
        Object.assign(profile, { fullName, title: get('title') || profile.title });
        result = 'updated';
      }
      if (kind === 'staff') {
        const types = get('therapy_types', 'therapies', 'therapy_type')
          .split(/[,;/]+/)
          .filter((x) => x.trim())
          .map((x) => therapyTypeId(ctx, x))
          .filter((id): id is UUID => Boolean(id));
        for (const typeId of types) {
          if (st.qualifications.some((q) => q.userId === user.id && q.therapyTypeId === typeId)) continue;
          st.qualifications.push({ organizationId: ctx.organizationId, userId: user.id, therapyTypeId: typeId });
          if (result === 'skipped') result = 'updated';
        }
        const email = get('email');
        if (email && !st.credentials.some((c) => same(c.email, email))) st.credentials.push({ email, userId: user.id });
      }
      if (child && !core.isGuardian(user.id, child.id)) {
        st.guardians.push({ childId: child.id, userId: user.id, relation: get('relation') || 'Parent', isPrimary: !st.guardians.some((g) => g.childId === child.id && g.isPrimary) });
        if (result === 'skipped') result = 'updated';
      }
      return result;
    }
    // schedule
    const child = findChild(ctx, get('child_name', 'child'), parseDate(get('child_dob', 'dob')));
    const therapistRaw = get('therapist_name', 'therapist');
    const therapistPhone = normalisePhone(get('therapist_phone'));
    const therapist = st.memberships.find(
      (m) => m.organizationId === ctx.organizationId && m.role === 'therapist' && ((therapistRaw && same(core.name(m.userId), therapistRaw)) || st.profiles.find((p) => p.id === m.userId)?.phone === therapistPhone),
    );
    const typeId = therapyTypeId(ctx, get('therapy_type', 'therapy'));
    const weekdays = parseWeekdays(get('weekdays', 'days', 'weekday', 'day'));
    const startTime = parseTime(get('start_time', 'time'));
    if (!child) throw new RepoError('validation', 'Unknown child.');
    if (!therapist) throw new RepoError('validation', 'Unknown therapist name.');
    if (!typeId) throw new RepoError('validation', 'Unknown therapy type.');
    if (!weekdays.length || !startTime) throw new RepoError('validation', 'Weekdays and a start time (HH:mm) are required.');
    const fresh = weekdays.filter(
      (d) => !st.series.some((s) => s.childId === child.id && s.therapistId === therapist.userId && s.therapyTypeId === typeId && s.startTime === startTime && rruleToWeekdays(s.rrule).includes(d)),
    );
    if (!fresh.length) return 'skipped';
    const startDate = parseDate(get('start_date', 'from')) ?? core.today();
    const endDate = parseDate(get('end_date', 'to')) ?? addDaysISO(startDate, 83);
    const durationMinutes = Number(get('duration_minutes', 'duration')) || 45;
    const seriesId = uuid();
    st.series.push({ id: seriesId, organizationId: ctx.organizationId, childId: child.id, therapistId: therapist.userId, therapyTypeId: typeId, rrule: weekdaysToRrule(fresh), startTime, durationMinutes, startDate, endDate, room: get('room') || undefined, createdBy: ctx.userId });
    for (const o of expandSeries({ weekdays: fresh, startTime, durationMinutes, startDate, endDate })) {
      st.appointments.push({ id: uuid(), organizationId: ctx.organizationId, seriesId, childId: child.id, therapistId: therapist.userId, therapyTypeId: typeId, startsAt: o.startsAt, endsAt: o.endsAt, room: get('room') || undefined, status: 'scheduled', wasRescheduled: false, createdAt: core.nowIso() });
    }
    return 'created';
  };

  return {
    context: () =>
      core.run(() => {
        const ctx = core.requireAdmin();
        const people = (role: Role) =>
          st.memberships
            .filter((m) => m.organizationId === ctx.organizationId && m.role === role)
            .map((m) => {
              const p = st.profiles.find((x) => x.id === m.userId)!;
              return { id: p.id, name: p.fullName, phone: p.phone };
            });
        return {
          therapists: people('therapist'),
          children: st.children.filter((c) => c.organizationId === ctx.organizationId).map((c) => ({ id: c.id, fullName: c.fullName, dob: c.dob })),
          therapyTypes: st.therapyTypes.filter((x) => x.organizationId === ctx.organizationId).map((x) => ({ id: x.id, name: x.name, key: x.key })),
          parents: people('parent'),
        };
      }),
    commit: (kind, rows) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        const summary: ImportSummary = { kind, created: 0, updated: 0, skipped: 0, errors: [] };
        for (const row of rows) {
          try {
            summary[commitRow(ctx, kind, row)]++;
          } catch (e) {
            if (!(e instanceof RepoError)) throw e;
            summary.errors.push({ rowNumber: row.rowNumber, message: e.message });
          }
        }
        core.audit('import.commit', kind, ctx.organizationId, { created: summary.created, updated: summary.updated, skipped: summary.skipped, errors: summary.errors.length });
        return summary;
      }),
  };
}
