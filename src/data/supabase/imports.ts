/**
 * CSV / XLSX import commit, idempotent on natural keys:
 *   children  full name + date of birth within the school (children_natural_key index)
 *   staff     phone → existing member (therapy types updated) or a pending invite
 *   parents   phone → existing parent (child linked) or a pending invite carrying the child ids
 *   schedule  child + therapist + therapy type + weekday + start time → series + occurrences
 * Accepted column keys (any case / snake_case): see the `get(...)` calls below.
 */
import type { ImportContext, ImportRow, ImportSummary, Member, Role, UUID } from '@/domain/types';

import { RepoError, type ImportsRepo } from '../repository';
import type { AdapterContext } from './context';
import { chunk, nameKey, normalizePhone, rruleWeekdays } from './derive-local';
import { toRepoError } from './errors';
import { childToRow } from './mappers';
import { parseDate, parseGender, parseStaffRole, parseTime, parseWeekdays, reader, splitList, type RowReader } from './imports-parse';
import { loadMembers } from './org';
import { done, many, selectAll, single } from './query';
import type { AppointmentSeriesRow, ChildRow, InviteRow } from './rows';
import { createSeries } from './scheduling';

type Summary = ImportSummary;

function fail(summary: Summary, row: ImportRow, e: unknown): void {
  const err = toRepoError(e);
  summary.errors.push({ rowNumber: row.rowNumber, message: err.message || err.code });
}

function rowError(message: string): RepoError {
  return new RepoError('validation', message);
}

interface Lookups {
  children: ChildRow[];
  members: Member[];
  invites: InviteRow[];
}

function childKey(name: string, dob: string): string {
  return `${nameKey(name)}|${dob}`;
}

function findChild(l: Lookups, get: RowReader): ChildRow {
  const id = get('childId');
  if (id) {
    const hit = l.children.find((ch) => ch.id === id);
    if (hit) return hit;
  }
  const name = get('childName', 'childFullName', 'child');
  if (!name) throw rowError('Child name is missing');
  const dobRaw = get('childDob', 'childDateOfBirth', 'dob');
  if (dobRaw) {
    const dob = parseDate(dobRaw);
    const hit = dob && l.children.find((ch) => childKey(ch.full_name, ch.dob) === childKey(name, dob));
    if (hit) return hit;
    throw rowError(`No child "${name}" born ${dobRaw}`);
  }
  const matches = l.children.filter((ch) => nameKey(ch.full_name) === nameKey(name) || nameKey(ch.preferred_name ?? '') === nameKey(name));
  if (matches.length === 1) return matches[0];
  throw rowError(matches.length ? `Several children are called "${name}"; add the date of birth` : `Unknown child "${name}"`);
}

export function createImportsRepo(c: AdapterContext): ImportsRepo {
  const sb = c.sb;

  async function lookups(orgId: UUID): Promise<Lookups> {
    const [children, members, invites] = await Promise.all([
      selectAll<ChildRow>((f, t) => sb.from('children').select('*').eq('organization_id', orgId).order('id').range(f, t)),
      loadMembers(c, orgId),
      selectAll<InviteRow>((f, t) => sb.from('invites').select('*').eq('organization_id', orgId).eq('status', 'pending').order('id').range(f, t)),
    ]);
    return { children, members, invites };
  }

  async function commitChildren(orgId: UUID, rows: ImportRow[], l: Lookups, s: Summary): Promise<void> {
    const index = new Map(l.children.map((ch) => [childKey(ch.full_name, ch.dob), ch]));
    const inserts: { row: ImportRow; values: Record<string, unknown> }[] = [];
    for (const row of rows) {
      try {
        const get = reader(row.values);
        const fullName = get('fullName', 'name', 'childName');
        const dob = parseDate(get('dob', 'dateOfBirth', 'birthDate'));
        if (!fullName) throw rowError('Name is missing');
        if (!dob) throw rowError('Date of birth is missing or not a date');
        const patch = {
          preferredName: get('preferredName', 'nickname', 'calledAs') || undefined,
          gender: parseGender(get('gender', 'sex')),
          classGroup: get('classGroup', 'class', 'group', 'section') || undefined,
        };
        const existing = index.get(childKey(fullName, dob));
        if (existing) {
          const changed =
            (patch.preferredName && patch.preferredName !== existing.preferred_name) ||
            (patch.gender && patch.gender !== existing.gender) ||
            (patch.classGroup && patch.classGroup !== existing.class_group);
          if (!changed) {
            s.skipped++;
            continue;
          }
          await single(sb.from('children').update(childToRow(patch)).eq('id', existing.id).select('id'), 'child');
          s.updated++;
        } else {
          const values = { ...childToRow({ fullName, dob, ...patch, status: 'active' }), organization_id: orgId };
          inserts.push({ row, values });
          // Same child twice in one file: the second row is a no-op.
          index.set(childKey(fullName, dob), { id: '', organization_id: orgId, full_name: fullName, dob } as ChildRow);
        }
      } catch (e) {
        fail(s, row, e);
      }
    }
    for (const part of chunk(inserts, 200)) {
      try {
        const created = await many<{ id: UUID }>(sb.from('children').insert(part.map((p) => p.values)).select('id'));
        s.created += created.length;
        await done(sb.from('child_profiles').upsert(created.map((x) => ({ child_id: x.id })), { onConflict: 'child_id', ignoreDuplicates: true })).catch(() => undefined);
      } catch {
        // One bad row fails the whole batch: retry row by row to report it precisely.
        for (const p of part) {
          try {
            const one = await single<{ id: UUID }>(sb.from('children').insert(p.values).select('id'), 'child');
            s.created++;
            await done(sb.from('child_profiles').upsert({ child_id: one.id }, { onConflict: 'child_id', ignoreDuplicates: true })).catch(() => undefined);
          } catch (e) {
            fail(s, p.row, e);
          }
        }
      }
    }
  }

  async function upsertInvite(
    orgId: UUID,
    l: Lookups,
    input: { role: Role; fullName: string; phone: string; email?: string; childIds?: UUID[]; relation?: string },
  ): Promise<'created' | 'updated' | 'skipped'> {
    const pending = l.invites.find((i) => i.phone === input.phone && i.role === input.role);
    if (pending) {
      const childIds = [...new Set([...(pending.child_ids ?? []), ...(input.childIds ?? [])])];
      const changed = childIds.length !== (pending.child_ids ?? []).length || (input.fullName && input.fullName !== pending.full_name);
      if (!changed) return 'skipped';
      const row = await single<InviteRow>(
        sb.from('invites').update({ child_ids: childIds, full_name: input.fullName || pending.full_name }).eq('id', pending.id).select('*'),
        'invite',
      );
      Object.assign(pending, row);
      return 'updated';
    }
    const row = await single<InviteRow>(
      sb
        .from('invites')
        .insert({
          organization_id: orgId,
          role: input.role,
          full_name: input.fullName,
          phone: input.phone,
          email: input.email?.toLowerCase() || null,
          child_ids: input.childIds ?? [],
          relation: input.relation || null,
        })
        .select('*'),
      'invite',
    );
    l.invites.push(row);
    return 'created';
  }

  async function commitStaff(orgId: UUID, rows: ImportRow[], l: Lookups, s: Summary): Promise<void> {
    const types = await c.therapyTypes(orgId);
    for (const row of rows) {
      try {
        const get = reader(row.values);
        const fullName = get('fullName', 'name', 'staffName');
        const phone = normalizePhone(get('phone', 'mobile', 'phoneNumber'));
        if (!fullName) throw rowError('Name is missing');
        if (!phone) throw rowError('Phone number is missing');
        const role = parseStaffRole(get('role', 'designation'));
        const wanted = splitList(get('therapyTypes', 'therapyType', 'therapies', 'specialisation', 'specialization')).map((name) => {
          const t = types.find((x) => nameKey(x.name) === nameKey(name) || x.key === nameKey(name).replace(/\s+/g, '_'));
          if (!t) throw rowError(`Unknown therapy type "${name}"`);
          return t.id;
        });
        const member = l.members.find((m) => m.profile.phone === phone && m.membership.role !== 'parent');
        if (member) {
          const current = new Set(member.therapyTypeIds);
          const merged = [...new Set([...member.therapyTypeIds, ...wanted])];
          if (merged.length === current.size) {
            s.skipped++;
            continue;
          }
          await done(
            sb
              .from('member_therapy_types')
              .upsert(merged.map((id) => ({ organization_id: orgId, user_id: member.profile.id, therapy_type_id: id })), {
                onConflict: 'user_id,therapy_type_id',
                ignoreDuplicates: true,
              }),
          );
          member.therapyTypeIds = merged;
          s.updated++;
          continue;
        }
        s[await upsertInvite(orgId, l, { role, fullName, phone, email: get('email') })]++;
      } catch (e) {
        fail(s, row, e);
      }
    }
  }

  async function commitParents(orgId: UUID, rows: ImportRow[], l: Lookups, s: Summary): Promise<void> {
    for (const row of rows) {
      try {
        const get = reader(row.values);
        const fullName = get('parentName', 'fullName', 'name', 'guardianName');
        const phone = normalizePhone(get('phone', 'parentPhone', 'mobile', 'phoneNumber'));
        if (!phone) throw rowError('Phone number is missing');
        const child = findChild(l, get);
        const relation = get('relation', 'relationship') || 'Guardian';
        const member = l.members.find((m) => m.profile.phone === phone && m.membership.role === 'parent');
        if (member) {
          const linked = await many<{ child_id: UUID }>(sb.from('child_guardians').select('child_id').eq('child_id', child.id).eq('user_id', member.profile.id));
          if (linked.length) {
            s.skipped++;
            continue;
          }
          await done(
            sb.from('child_guardians').insert({ child_id: child.id, user_id: member.profile.id, relation, is_primary: get('primary', 'isPrimary').toLowerCase().startsWith('y') }),
          );
          s.updated++;
          continue;
        }
        s[await upsertInvite(orgId, l, { role: 'parent', fullName, phone, email: get('email'), childIds: [child.id], relation })]++;
      } catch (e) {
        fail(s, row, e);
      }
    }
  }

  async function commitSchedule(orgId: UUID, rows: ImportRow[], l: Lookups, s: Summary): Promise<void> {
    const [types, series] = await Promise.all([
      c.therapyTypes(orgId),
      selectAll<AppointmentSeriesRow>((f, t) => sb.from('appointment_series').select('*').eq('organization_id', orgId).order('id').range(f, t)),
    ]);
    const slotKey = (child: UUID, therapist: UUID, type: UUID, weekday: number, time: string) => `${child}|${therapist}|${type}|${weekday}|${time.slice(0, 5)}`;
    const existing = new Set<string>();
    for (const x of series) for (const d of rruleWeekdays(x.rrule)) existing.add(slotKey(x.child_id, x.therapist_id, x.therapy_type_id, d, x.start_time));
    const staff = l.members.filter((m) => m.membership.role !== 'parent' && m.membership.status !== 'suspended');

    for (const row of rows) {
      try {
        const get = reader(row.values);
        const child = findChild(l, get);
        const tName = get('therapistName', 'therapist');
        const tPhone = normalizePhone(get('therapistPhone'));
        const tId = get('therapistId');
        const therapists = staff.filter(
          (m) => m.profile.id === tId || (!!tPhone && m.profile.phone === tPhone) || (!!tName && nameKey(m.profile.fullName) === nameKey(tName)),
        );
        if (therapists.length !== 1) throw rowError(therapists.length ? `Several staff are called "${tName}"; add the phone number` : `Unknown therapist "${tName || tPhone || tId}"`);
        const typeRaw = get('therapyTypeId', 'therapyType', 'therapy');
        const type = types.find((x) => x.id === typeRaw || nameKey(x.name) === nameKey(typeRaw) || x.key === nameKey(typeRaw).replace(/\s+/g, '_'));
        if (!type) throw rowError(`Unknown therapy type "${typeRaw}"`);
        const weekdays = parseWeekdays(get('weekdays', 'days', 'day', 'weekday'));
        if (!weekdays.length) throw rowError('Weekdays are missing');
        const startTime = parseTime(get('startTime', 'time', 'start'));
        if (!startTime) throw rowError('Start time is missing or not a time');
        const endTime = parseTime(get('endTime', 'end'));
        const minutes = Number(get('durationMinutes', 'duration', 'minutes')) || (endTime ? toMinutes(endTime) - toMinutes(startTime) : 45);
        const startDate = parseDate(get('startDate', 'from'));
        const endDate = parseDate(get('endDate', 'to', 'until'));
        if (!startDate || !endDate) throw rowError('Start and end dates are required');
        const therapistId = therapists[0].profile.id;
        const fresh = weekdays.filter((d) => !existing.has(slotKey(child.id, therapistId, type.id, d, startTime)));
        if (fresh.length === 0) {
          s.skipped++;
          continue;
        }
        await createSeries(
          c,
          { childId: child.id, therapistId, therapyTypeId: type.id, weekdays: fresh, startTime, durationMinutes: minutes, startDate, endDate, room: get('room') || undefined },
          { force: true },
        );
        for (const d of fresh) existing.add(slotKey(child.id, therapistId, type.id, d, startTime));
        s.created++;
      } catch (e) {
        fail(s, row, e);
      }
    }
  }

  return {
    async context(): Promise<ImportContext> {
      const orgId = c.requireOrg();
      const [l, types] = await Promise.all([lookups(orgId), c.therapyTypes(orgId)]);
      const active = l.members.filter((m) => m.membership.status !== 'suspended');
      return {
        therapists: active
          .filter((m) => m.membership.role === 'therapist' || m.membership.role === 'coordinator')
          .map((m) => ({ id: m.profile.id, name: m.profile.fullName, phone: m.profile.phone })),
        children: l.children.map((ch) => ({ id: ch.id, fullName: ch.full_name, dob: ch.dob })),
        therapyTypes: types.map((t) => ({ id: t.id, name: t.name, key: t.key })),
        parents: active.filter((m) => m.membership.role === 'parent').map((m) => ({ id: m.profile.id, name: m.profile.fullName, phone: m.profile.phone })),
      };
    },

    async commit(kind, rows) {
      if (!c.isOrgAdmin()) throw new RepoError('forbidden', 'Only school admins and coordinators can import');
      const orgId = c.requireOrg();
      const summary: Summary = { kind, created: 0, updated: 0, skipped: 0, errors: [] };
      const l = await lookups(orgId);
      if (kind === 'children') await commitChildren(orgId, rows, l, summary);
      else if (kind === 'staff') await commitStaff(orgId, rows, l, summary);
      else if (kind === 'parents') await commitParents(orgId, rows, l, summary);
      else await commitSchedule(orgId, rows, l, summary);
      c.forget(`org:${orgId}:`);
      return summary;
    },
  };
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
