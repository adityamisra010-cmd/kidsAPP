/** Me (profile, consents, privacy requests, muted kinds) and Org (settings, people, invites, audit). */
import type { MeRepo, OrgRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import type { DataRequest, Member, Role } from '@/domain/types';
import { STAFF_ROLES, UNMUTABLE_NOTIFICATION_KINDS } from '@/domain/types';
import { uuid } from '@/lib/id';

import type { DemoCore } from './core';

export function createMeRepo(core: DemoCore): MeRepo {
  const st = core.db;
  const request = (childId: string, kind: DataRequest['kind']) =>
    core.run(() => {
      const ctx = core.requireOrg();
      const { child } = core.requireChild(childId, ['parent', 'full']);
      const req: DataRequest = { id: uuid(), organizationId: child.organizationId, userId: ctx.userId, userName: core.name(ctx.userId), childId, childName: child.fullName, kind, status: 'open', createdAt: core.nowIso() };
      st.dataRequests.push(req);
      core.audit(`data_request.${kind}`, 'child', childId);
      return req;
    });
  return {
    updateProfile: (patch) =>
      core.run(() => {
        const ctx = core.requireCtx();
        const profile = st.profiles.find((p) => p.id === ctx.userId)!;
        if (patch.fullName != null && !patch.fullName.trim()) throw new RepoError('validation', 'Name cannot be empty.');
        Object.assign(profile, patch);
        return profile;
      }),
    registerPushToken: (token, platform) =>
      core.run(() => {
        const ctx = core.requireCtx();
        st.pushTokens = st.pushTokens.filter((t) => t.token !== token);
        st.pushTokens.push({ userId: ctx.userId, token, platform });
      }),
    listConsents: () =>
      core.run(() => {
        const ctx = core.requireCtx();
        return st.consents.filter((c) => c.userId === ctx.userId).sort((a, b) => b.at.localeCompare(a.at));
      }),
    recordConsent: (input) =>
      core.run(() => {
        const ctx = core.requireCtx();
        if (input.childId && !core.isGuardian(ctx.userId, input.childId)) throw new RepoError('forbidden', 'You can only record consent for your own child.');
        const consent = { id: uuid(), userId: ctx.userId, childId: input.childId, kind: input.kind, granted: input.granted, at: core.nowIso(), version: input.version };
        st.consents.push(consent);
        core.audit(`consent.${input.granted ? 'grant' : 'withdraw'}`, 'consent', consent.id, { kind: input.kind });
        return consent;
      }),
    requestDataExport: (childId) => request(childId, 'export'),
    requestDeletion: (childId) => request(childId, 'deletion'),
    getMutedNotificationKinds: () => core.run(() => st.mutedKinds.find((m) => m.userId === core.requireCtx().userId)?.kinds ?? []),
    setMutedNotificationKinds: (kinds) =>
      core.run(() => {
        const ctx = core.requireCtx();
        const allowed = kinds.filter((k) => !UNMUTABLE_NOTIFICATION_KINDS.includes(k));
        st.mutedKinds = st.mutedKinds.filter((m) => m.userId !== ctx.userId).concat({ userId: ctx.userId, kinds: allowed });
      }),
  };
}

export function createOrgRepo(core: DemoCore): OrgRepo {
  const st = core.db;
  /** Org-scoped access: members of that school (or the platform admin). */
  const orgFor = (orgId: string, roles?: Role[]) => {
    const ctx = core.requireCtx();
    if (ctx.role === 'platform_admin') return core.org(orgId);
    if (ctx.organizationId !== orgId) throw new RepoError('not_found', 'School not found.');
    if (roles && !roles.includes(ctx.role)) throw new RepoError('forbidden', 'Your role cannot do this.');
    return core.org(orgId);
  };
  const member = (orgId: string, userId: string): Member => {
    const membership = st.memberships.find((m) => m.userId === userId && m.organizationId === orgId)!;
    return {
      profile: st.profiles.find((p) => p.id === userId)!,
      membership,
      therapyTypeIds: st.qualifications.filter((q) => q.userId === userId && q.organizationId === orgId).map((q) => q.therapyTypeId),
    };
  };
  return {
    get: (orgId) => core.run(() => orgFor(orgId)),
    update: (orgId, patch) => core.run(() => Object.assign(orgFor(orgId, ['school_admin']), patch)),
    updateSettings: (orgId, patch) =>
      core.run(() => {
        const org = orgFor(orgId, ['school_admin']);
        org.settings = { ...org.settings, ...patch };
        core.audit('org.update_settings', 'organization', orgId, { keys: Object.keys(patch) });
        return org;
      }),
    listTherapyTypes: (orgId) =>
      core.run(() => {
        orgFor(orgId);
        return st.therapyTypes.filter((t) => t.organizationId === orgId);
      }),
    upsertTherapyType: (input) =>
      core.run(() => {
        orgFor(input.organizationId, ['school_admin']);
        if (!input.name.trim()) throw new RepoError('validation', 'Name is required.');
        const existing = input.id ? st.therapyTypes.find((t) => t.id === input.id && t.organizationId === input.organizationId) : undefined;
        if (existing) return Object.assign(existing, input);
        const created = { ...input, id: uuid() };
        st.therapyTypes.push(created);
        return created;
      }),
    listRatingDimensions: (orgId) =>
      core.run(() => {
        orgFor(orgId);
        return core.dims(orgId);
      }),
    upsertRatingDimension: (input) =>
      core.run(() => {
        if (!input.organizationId) throw new RepoError('forbidden', 'Global templates are managed by the platform admin.');
        orgFor(input.organizationId, ['school_admin']);
        if (input.weight < 0 || [1, 2, 3, 4, 5].some((v) => !input.anchors[v as 1]?.trim())) throw new RepoError('validation', 'Every value needs an anchor and the weight must be 0 or more.');
        const existing = input.id ? st.dimensions.find((d) => d.id === input.id && d.organizationId === input.organizationId) : undefined;
        if (existing) return Object.assign(existing, input);
        const created = { ...input, id: uuid() };
        st.dimensions.push(created);
        return created;
      }),
    reorderRatingDimensions: (orgId, orderedIds) =>
      core.run(() => {
        orgFor(orgId, ['school_admin']);
        orderedIds.forEach((id, i) => {
          const d = st.dimensions.find((x) => x.id === id && x.organizationId === orgId);
          if (d) d.sortOrder = i + 1;
        });
      }),
    listMembers: (orgId, roles) =>
      core.run(() => {
        const ctx = core.requireCtx();
        orgFor(orgId);
        // Parents may see the staff list (names, titles) but never other families.
        const visible = ctx.role === 'parent' ? STAFF_ROLES : undefined;
        return st.memberships
          .filter((m) => m.organizationId === orgId && (!roles || roles.includes(m.role)) && (!visible || visible.includes(m.role)))
          .map((m) => member(orgId, m.userId))
          .sort((a, b) => a.profile.fullName.localeCompare(b.profile.fullName));
      }),
    setMemberTherapyTypes: (orgId, userId, therapyTypeIds) =>
      core.run(() => {
        orgFor(orgId, ['school_admin', 'coordinator']);
        st.qualifications = st.qualifications.filter((q) => !(q.userId === userId && q.organizationId === orgId));
        for (const therapyTypeId of therapyTypeIds) st.qualifications.push({ organizationId: orgId, userId, therapyTypeId });
      }),
    setMemberStatus: (membershipId, status) =>
      core.run(() => {
        const m = st.memberships.find((x) => x.id === membershipId);
        if (!m?.organizationId) throw new RepoError('not_found', 'Member not found.');
        orgFor(m.organizationId, ['school_admin']);
        m.status = status;
      }),
    listInvites: (orgId) =>
      core.run(() => {
        orgFor(orgId, ['school_admin', 'coordinator']);
        return st.invites.filter((i) => i.organizationId === orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }),
    createInvite: (input) =>
      core.run(() => {
        const ctx = core.requireCtx();
        orgFor(input.organizationId, ['school_admin', 'coordinator']);
        if (!input.fullName.trim() || (!input.phone && !input.email)) throw new RepoError('validation', 'Name and a phone number or email are required.');
        if (input.childIds.some((id) => st.children.find((c) => c.id === id)?.organizationId !== input.organizationId)) throw new RepoError('validation', 'Unknown child.');
        const invite = { ...input, id: uuid(), status: 'pending' as const, createdAt: core.nowIso(), createdBy: ctx.userId };
        st.invites.push(invite);
        core.audit('invite.create', 'invite', invite.id, { role: input.role });
        return invite;
      }),
    revokeInvite: (inviteId) =>
      core.run(() => {
        const invite = core.sameOrg(st.invites.find((i) => i.id === inviteId), 'Invite');
        orgFor(invite.organizationId, ['school_admin', 'coordinator']);
        invite.status = 'revoked';
      }),
    listDataRequests: (orgId) =>
      core.run(() => {
        orgFor(orgId, ['school_admin', 'coordinator']);
        return st.dataRequests.filter((d) => d.organizationId === orgId);
      }),
    setDataRequestStatus: (id, status) =>
      core.run(() => {
        const req = core.sameOrg(st.dataRequests.find((d) => d.id === id), 'Request');
        orgFor(req.organizationId, ['school_admin', 'coordinator']);
        req.status = status;
      }),
    listAudit: (orgId, filter) =>
      core.run(() => {
        orgFor(orgId, ['school_admin', 'coordinator']);
        return st.audit
          .filter((a) => a.organizationId === orgId && (!filter?.entity || a.entity === filter.entity) && (!filter?.entityId || a.entityId === filter.entityId))
          .slice(0, filter?.limit ?? 100);
      }),
  };
}
