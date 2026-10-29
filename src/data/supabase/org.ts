/** School settings, therapy types, rating dimensions, members, invites, privacy requests, audit. */
import type { Member, OrgSettings, Role, UUID } from '@/domain/types';

import type { OrgRepo } from '../repository';
import type { AdapterContext } from './context';
import { normalizePhone } from './derive-local';
import {
  auditFromRow,
  compact,
  dataRequestFromRow,
  dimensionFromRow,
  dimensionToRow,
  inviteFromRow,
  membershipFromRow,
  organizationFromRow,
  orgSettings,
  profileFromRow,
  therapyTypeFromRow,
} from './mappers';
import { done, many, single } from './query';
import type {
  AuditLogRow,
  DataRequestRow,
  InviteRow,
  MembershipRow,
  MemberTherapyTypeRow,
  OrganizationRow,
  ProfileRow,
  RatingDimensionRow,
  TherapyTypeRow,
} from './rows';

type MemberJoinedRow = MembershipRow & { profile: ProfileRow | null };

/** Members of a school with their qualified therapy types (2 queries). */
export async function loadMembers(c: AdapterContext, orgId: UUID, roles?: Role[]): Promise<Member[]> {
  let q = c.sb.from('memberships').select('id,user_id,organization_id,role,status, profile:profiles(*)').eq('organization_id', orgId);
  if (roles?.length) q = q.in('role', roles);
  const [rows, types] = await Promise.all([
    many<MemberJoinedRow>(q),
    many<MemberTherapyTypeRow>(c.sb.from('member_therapy_types').select('user_id,therapy_type_id').eq('organization_id', orgId)),
  ]);
  const typesByUser = new Map<UUID, UUID[]>();
  for (const t of types) typesByUser.set(t.user_id, [...(typesByUser.get(t.user_id) ?? []), t.therapy_type_id]);
  return rows
    .map((r) => ({
      profile: r.profile ? profileFromRow(r.profile) : { id: r.user_id, fullName: '', preferredLanguage: 'en' as const },
      membership: membershipFromRow(r),
      therapyTypeIds: typesByUser.get(r.user_id) ?? [],
    }))
    .sort((a, b) => a.profile.fullName.localeCompare(b.profile.fullName));
}

export function createOrgRepo(c: AdapterContext): OrgRepo {
  const sb = c.sb;

  return {
    async get(orgId) {
      return organizationFromRow(await single<OrganizationRow>(sb.from('organizations').select('*').eq('id', orgId), 'school'));
    },

    async update(orgId, patch) {
      const row = await single<OrganizationRow>(
        sb
          .from('organizations')
          .update(
            compact({
              name: patch.name?.trim(),
              short_name: patch.shortName,
              city: patch.city,
              address: patch.address,
              phone: patch.phone,
              email: patch.email === undefined ? undefined : patch.email || null,
              logo_url: patch.logoUrl === undefined ? undefined : patch.logoUrl || null,
            }),
          )
          .eq('id', orgId)
          .select('*'),
        'school',
      );
      return organizationFromRow(row);
    },

    async updateSettings(orgId, patch) {
      const current = await single<Pick<OrganizationRow, 'settings'>>(sb.from('organizations').select('settings').eq('id', orgId), 'school');
      const next: OrgSettings = orgSettings({ ...orgSettings(current.settings), ...patch });
      const row = await single<OrganizationRow>(sb.from('organizations').update({ settings: next }).eq('id', orgId).select('*'), 'school');
      c.forget(`org:${orgId}:`);
      return organizationFromRow(row);
    },

    async listTherapyTypes(orgId) {
      const rows = await many<TherapyTypeRow>(sb.from('therapy_types').select('*').eq('organization_id', orgId).order('name'));
      return rows.map(therapyTypeFromRow);
    },

    async upsertTherapyType(input) {
      const values = compact({
        organization_id: input.organizationId,
        key: input.key,
        name: input.name.trim(),
        color: input.color,
        icon: input.icon,
        active: input.active,
      });
      const q = input.id ? sb.from('therapy_types').update(values).eq('id', input.id) : sb.from('therapy_types').insert(values);
      const row = await single<TherapyTypeRow>(q.select('*'), 'therapy type');
      c.forget(`org:${row.organization_id}:therapyTypes`);
      return therapyTypeFromRow(row);
    },

    async listRatingDimensions(orgId) {
      const own = await many<RatingDimensionRow>(sb.from('rating_dimensions').select('*').eq('organization_id', orgId).order('sort_order'));
      // Same fallback as app.org_dimensions(): a school without its own copy uses the templates.
      const rows = own.length ? own : await many<RatingDimensionRow>(sb.from('rating_dimensions').select('*').is('organization_id', null).order('sort_order'));
      return rows.map(dimensionFromRow);
    },

    async upsertRatingDimension(input) {
      const { id, ...rest } = input;
      const values = dimensionToRow(rest);
      const q = id ? sb.from('rating_dimensions').update(values).eq('id', id) : sb.from('rating_dimensions').insert(values);
      return dimensionFromRow(await single<RatingDimensionRow>(q.select('*'), 'rating dimension'));
    },

    async reorderRatingDimensions(orgId, orderedIds) {
      await Promise.all(
        orderedIds.map((id, i) => done(sb.from('rating_dimensions').update({ sort_order: i + 1 }).eq('id', id).eq('organization_id', orgId))),
      );
    },

    listMembers: (orgId, roles) => loadMembers(c, orgId, roles),

    async setMemberTherapyTypes(orgId, userId, therapyTypeIds) {
      const ids = [...new Set(therapyTypeIds)];
      let del = sb.from('member_therapy_types').delete().eq('organization_id', orgId).eq('user_id', userId);
      if (ids.length) del = del.not('therapy_type_id', 'in', `(${ids.join(',')})`);
      await done(del);
      if (ids.length) {
        await done(
          sb
            .from('member_therapy_types')
            .upsert(
              ids.map((therapy_type_id) => ({ organization_id: orgId, user_id: userId, therapy_type_id })),
              { onConflict: 'user_id,therapy_type_id', ignoreDuplicates: true },
            ),
        );
      }
    },

    async setMemberStatus(membershipId, status) {
      await single(sb.from('memberships').update({ status }).eq('id', membershipId).select('id'), 'membership');
    },

    async listInvites(orgId) {
      const rows = await many<InviteRow>(sb.from('invites').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }));
      return rows.map(inviteFromRow);
    },

    async createInvite(input) {
      const row = await single<InviteRow>(
        sb
          .from('invites')
          .insert({
            organization_id: input.organizationId,
            role: input.role,
            full_name: input.fullName.trim(),
            phone: normalizePhone(input.phone) ?? null,
            email: input.email?.trim().toLowerCase() || null,
            child_ids: input.childIds ?? [],
            relation: input.relation ?? null,
          })
          .select('*'),
        'invite',
      );
      return inviteFromRow(row);
    },

    async revokeInvite(inviteId) {
      await single(sb.from('invites').update({ status: 'revoked' }).eq('id', inviteId).select('id'), 'invite');
    },

    async listDataRequests(orgId) {
      const rows = await many<DataRequestRow & { child: { full_name: string } | null }>(
        sb.from('data_requests').select('*, child:children(full_name)').eq('organization_id', orgId).order('created_at', { ascending: false }),
      );
      const names = await c.names(rows.map((r) => r.user_id));
      return rows.map((r) => dataRequestFromRow(r, names.get(r.user_id) ?? '', r.child?.full_name ?? ''));
    },

    async setDataRequestStatus(id, status) {
      await single(sb.from('data_requests').update({ status }).eq('id', id).select('id'), 'data request');
    },

    async listAudit(orgId, filter) {
      let q = sb.from('audit_log').select('*').eq('organization_id', orgId);
      if (filter?.entity) q = q.eq('entity', filter.entity);
      if (filter?.entityId) q = q.eq('entity_id', filter.entityId);
      const rows = await many<AuditLogRow>(q.order('at', { ascending: false }).limit(Math.min(filter?.limit ?? 100, 500)));
      const names = await c.names(rows.map((r) => r.actor_id));
      return rows.map((r) => auditFromRow(r, (r.actor_id && names.get(r.actor_id)) || ''));
    },
  };
}
