/**
 * Children: lists with summary data (batched), detail with About Me / clinical (RLS hides
 * clinical from everyone but admins, coordinators and assigned therapists), edits and links.
 */
import type { ChildAccess, ChildDetail, ChildSummary, Trend, UUID } from '@/domain/types';

import { RepoError, type ChildFilter, type ChildrenRepo } from '../repository';
import type { AdapterContext } from './context';
import { addDays, todayIST } from './derive-local';
import {
  childFromRow,
  childProfileFromRow,
  childProfilePatchToRows,
  childTherapistFromRow,
  childToRow,
  emptyProfileRow,
  guardianFromRow,
  profileEditFromRow,
} from './mappers';
import { done, ilikeAny, inChunks, many, maybe, rpc, searchTerm, selectAll, single } from './query';
import type {
  AppointmentJoinedRow,
  ChildClinicalRow,
  ChildGuardianRow,
  ChildProfileRow,
  ChildRow,
  ChildTherapistRow,
  ProfileEditRow,
  ProfileRow,
  SessionRow,
} from './rows';
import { APPOINTMENT_SELECT, hydrateAppointments } from './views';

type GuardianJoined = ChildGuardianRow & { profile: Pick<ProfileRow, 'full_name' | 'phone'> | null };
type TherapistJoined = ChildTherapistRow & { profile: Pick<ProfileRow, 'full_name' | 'avatar_url'> | null };

const GUARDIAN_SELECT = 'child_id,user_id,relation,is_primary, profile:profiles(full_name,phone)';
const THERAPIST_SELECT = 'child_id,user_id,therapy_type_id,is_lead,active_from,active_to, profile:profiles(full_name,avatar_url)';

function activeToday(t: Pick<ChildTherapistRow, 'active_from' | 'active_to'>, today: string): boolean {
  return t.active_from <= today && (!t.active_to || t.active_to >= today);
}

async function childIdsForFilter(c: AdapterContext, filter: ChildFilter | undefined): Promise<UUID[] | null> {
  if (c.isParent()) return c.guardianChildIds();
  if (!filter?.therapistId && !filter?.therapyTypeId) return null;
  const today = todayIST(c.now());
  let q = c.sb.from('child_therapists').select('child_id,active_from,active_to').eq('organization_id', c.requireOrg());
  if (filter.therapistId) q = q.eq('user_id', filter.therapistId);
  if (filter.therapyTypeId) q = q.eq('therapy_type_id', filter.therapyTypeId);
  const rows = await many<Pick<ChildTherapistRow, 'child_id' | 'active_from' | 'active_to'>>(q);
  return [...new Set(rows.filter((r) => activeToday(r, today)).map((r) => r.child_id))];
}

/** Summary decorations for a page of children: 5 batched queries + one appointment hydration. */
async function summarize(c: AdapterContext, children: ChildRow[]): Promise<ChildSummary[]> {
  const sb = c.sb;
  const ids = children.map((x) => x.id);
  const now = c.now();
  const today = todayIST(now);
  const parent = c.isParent();
  const [therapists, guardians, alerts, upcoming, sessions] = await Promise.all([
    inChunks(ids, (part) => many<TherapistJoined>(sb.from('child_therapists').select(THERAPIST_SELECT).in('child_id', part))),
    inChunks(ids, (part) => many<GuardianJoined>(sb.from('child_guardians').select(GUARDIAN_SELECT).in('child_id', part))),
    parent
      ? Promise.resolve([] as { child_id: UUID }[])
      : inChunks(ids, (part) => many<{ child_id: UUID }>(sb.from('alerts').select('child_id').in('child_id', part).in('status', ['open', 'acknowledged']))),
    inChunks(ids, (part) =>
      many<AppointmentJoinedRow>(
        sb
          .from('appointments')
          .select(APPOINTMENT_SELECT)
          .in('child_id', part)
          .eq('status', 'scheduled')
          .gte('ends_at', now.toISOString())
          .lt('starts_at', addDays(today, 30))
          .order('starts_at'),
      ),
    ),
    parent
      ? Promise.resolve([] as Pick<SessionRow, 'child_id' | 'trend' | 'date'>[])
      : inChunks(ids, (part) =>
          many<Pick<SessionRow, 'child_id' | 'trend' | 'date'>>(
            sb.from('sessions').select('child_id,trend,date').in('child_id', part).gte('date', addDays(today, -60)).order('date', { ascending: false }),
          ),
        ),
  ]);

  const nextRows = new Map<UUID, AppointmentJoinedRow>();
  for (const a of upcoming) if (!nextRows.has(a.child_id)) nextRows.set(a.child_id, a);
  const nextViews = await hydrateAppointments(c, [...nextRows.values()]);
  const nextByChild = new Map(nextViews.map((v) => [v.childId, v]));
  const trendByChild = new Map<UUID, Trend>();
  for (const s of sessions) if (!trendByChild.has(s.child_id)) trendByChild.set(s.child_id, s.trend);
  const alertCount = new Map<UUID, number>();
  for (const a of alerts) alertCount.set(a.child_id, (alertCount.get(a.child_id) ?? 0) + 1);

  return children.map((row) => ({
    child: childFromRow(row),
    therapists: therapists
      .filter((t) => t.child_id === row.id && activeToday(t, today))
      .map((t) => ({ userId: t.user_id, name: t.profile?.full_name ?? '', therapyTypeId: t.therapy_type_id, isLead: t.is_lead })),
    guardians: guardians
      .filter((g) => g.child_id === row.id)
      .map((g) => ({ userId: g.user_id, name: g.profile?.full_name ?? '', relation: g.relation, phone: g.profile?.phone ?? undefined })),
    openAlerts: alertCount.get(row.id) ?? 0,
    nextAppointment: nextByChild.get(row.id),
    trend: trendByChild.get(row.id),
  }));
}

export function createChildrenRepo(c: AdapterContext): ChildrenRepo {
  const sb = c.sb;

  async function readProfile(childId: UUID) {
    const [profile, clinical] = await Promise.all([
      maybe<ChildProfileRow>(sb.from('child_profiles').select('*').eq('child_id', childId)),
      c.isParent() ? Promise.resolve(null) : maybe<ChildClinicalRow>(sb.from('child_clinical').select('*').eq('child_id', childId)),
    ]);
    return { profile, clinical };
  }

  return {
    async list(filter) {
      const restrict = await childIdsForFilter(c, filter);
      if (restrict && restrict.length === 0) return [];
      const term = searchTerm(filter?.search);
      const build = (from: number, to: number, part?: string[]) => {
        let q = sb.from('children').select('*');
        if (part) q = q.in('id', part);
        else q = q.eq('organization_id', c.requireOrg());
        if (filter?.status) q = q.eq('status', filter.status);
        if (term) q = q.or(ilikeAny(['full_name', 'preferred_name'], term));
        return q.order('full_name').order('id').range(from, to);
      };
      const rows = restrict
        ? await inChunks(restrict, (part) => selectAll<ChildRow>((from, to) => build(from, to, part)))
        : await selectAll<ChildRow>((from, to) => build(from, to));
      rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
      const out = await summarize(c, rows);
      return filter?.needsAttention ? out.filter((s) => s.openAlerts > 0 || s.trend === 'down') : out;
    },

    async get(childId) {
      const [childRow, { profile, clinical }, guardians, therapists, access] = await Promise.all([
        single<ChildRow>(sb.from('children').select('*').eq('id', childId), 'child'),
        readProfile(childId),
        many<GuardianJoined>(sb.from('child_guardians').select(GUARDIAN_SELECT).eq('child_id', childId)),
        many<TherapistJoined>(sb.from('child_therapists').select(THERAPIST_SELECT).eq('child_id', childId).order('active_from')),
        rpc<ChildAccess | null>(sb, 'child_access', { child_id: childId }),
      ]);
      const detail: ChildDetail = {
        child: childFromRow(childRow),
        profile: childProfileFromRow(profile ?? emptyProfileRow(childId, childRow.created_at), clinical),
        guardians: guardians.map((g) => ({ ...guardianFromRow(g), name: g.profile?.full_name ?? '', phone: g.profile?.phone ?? undefined })),
        therapists: therapists.map((t) => ({ ...childTherapistFromRow(t), name: t.profile?.full_name ?? '', avatarUrl: t.profile?.avatar_url ?? undefined })),
        access: access ?? 'none',
      };
      return detail;
    },

    async create(input) {
      const orgId = c.requireOrg();
      const row = await single<ChildRow>(
        sb
          .from('children')
          .insert({ ...childToRow({ ...input, status: input.status ?? 'active' }), organization_id: orgId })
          .select('*'),
        'child',
      );
      // An empty About Me row so later edits are recorded field by field (best effort).
      try {
        await done(sb.from('child_profiles').upsert({ child_id: row.id }, { onConflict: 'child_id', ignoreDuplicates: true }));
      } catch {
        // The profile is created lazily by updateProfile() otherwise.
      }
      return childFromRow(row);
    },

    async update(childId, patch) {
      return childFromRow(await single<ChildRow>(sb.from('children').update(childToRow(patch)).eq('id', childId).select('*'), 'child'));
    },

    async updateProfile(childId, patch) {
      const { profile, clinical } = childProfilePatchToRows(patch);
      if (Object.keys(profile).length) {
        // Update first so the edit-history trigger sees each changed field; insert if missing.
        const updated = await many<{ child_id: UUID }>(sb.from('child_profiles').update(profile).eq('child_id', childId).select('child_id'));
        if (updated.length === 0) await done(sb.from('child_profiles').insert({ ...profile, child_id: childId }));
      }
      if (clinical && Object.keys(clinical).length) {
        if (c.isParent()) throw new RepoError('forbidden', 'Clinical details are staff-only');
        const updated = await many<{ child_id: UUID }>(sb.from('child_clinical').update(clinical).eq('child_id', childId).select('child_id'));
        if (updated.length === 0) await done(sb.from('child_clinical').insert({ ...clinical, child_id: childId }));
      }
      const read = await readProfile(childId);
      return childProfileFromRow(read.profile ?? emptyProfileRow(childId, c.now().toISOString()), read.clinical);
    },

    async profileHistory(childId) {
      const rows = await many<ProfileEditRow>(sb.from('profile_edits').select('id,child_id,field,old_value,new_value,by,at').eq('child_id', childId).order('at', { ascending: false }).limit(500));
      const names = await c.names(rows.map((r) => r.by));
      return rows.map((r) => profileEditFromRow(r, (r.by && names.get(r.by)) || ''));
    },

    async linkGuardian(childId, userId, relation, isPrimary) {
      if (isPrimary) await done(sb.from('child_guardians').update({ is_primary: false }).eq('child_id', childId).neq('user_id', userId));
      await done(
        sb
          .from('child_guardians')
          .upsert({ child_id: childId, user_id: userId, relation: relation || 'Guardian', is_primary: isPrimary }, { onConflict: 'child_id,user_id' }),
      );
    },

    async assignTherapist(input) {
      if (input.isLead) {
        await done(
          sb.from('child_therapists').update({ is_lead: false }).eq('child_id', input.childId).eq('therapy_type_id', input.therapyTypeId).neq('user_id', input.userId),
        );
      }
      await done(
        sb.from('child_therapists').upsert(
          {
            child_id: input.childId,
            user_id: input.userId,
            therapy_type_id: input.therapyTypeId,
            is_lead: input.isLead,
            active_from: input.activeFrom ?? todayIST(c.now()),
            active_to: input.activeTo ?? null,
          },
          { onConflict: 'child_id,user_id,therapy_type_id' },
        ),
      );
    },

    async unassignTherapist(childId, userId, therapyTypeId) {
      const row = await maybe<Pick<ChildTherapistRow, 'active_from'>>(
        sb.from('child_therapists').select('active_from').eq('child_id', childId).eq('user_id', userId).eq('therapy_type_id', therapyTypeId),
      );
      if (!row) return;
      const yesterday = addDays(todayIST(c.now()), -1);
      // Keep the history (who worked with the child, when); access ends today.
      const q =
        row.active_from <= yesterday
          ? sb.from('child_therapists').update({ active_to: yesterday, is_lead: false })
          : sb.from('child_therapists').delete();
      await done(q.eq('child_id', childId).eq('user_id', userId).eq('therapy_type_id', therapyTypeId));
    },
  };
}
