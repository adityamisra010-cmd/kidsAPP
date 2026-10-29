/** Platform admin: cross-school summaries only, school creation and global templates. */
import type { PlatformRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import { DEFAULT_DIMENSIONS, DEFAULT_ORG_SETTINGS, DEFAULT_THERAPY_TYPES } from '@/domain/constants';
import type { Invite, Organization, SchoolSummary } from '@/domain/types';
import { STAFF_ROLES } from '@/domain/types';
import { addDaysISO } from '@/lib/dates';
import { uuid } from '@/lib/id';

import { normalisePhone } from './auth';
import type { DemoCore } from './core';

export function createPlatformRepo(core: DemoCore): PlatformRepo {
  const st = core.db;

  const summary = (org: Organization): SchoolSummary => {
    const month = core.today().slice(0, 7);
    const since = addDaysISO(core.today(), -30);
    const parents = st.memberships.filter((m) => m.organizationId === org.id && m.role === 'parent' && m.status === 'active').map((m) => m.userId);
    const active = new Set([
      ...st.homeLogs.filter((l) => l.organizationId === org.id && l.createdAt.slice(0, 10) >= since).map((l) => l.loggedBy),
      ...st.checkins.filter((c) => c.organizationId === org.id && c.date >= since).map((c) => c.submittedBy),
      ...st.messages.filter((m) => m.senderRole === 'parent' && m.createdAt.slice(0, 10) >= since).map((m) => m.senderId),
    ]);
    const stamps = [
      ...st.sessions.filter((s) => s.organizationId === org.id).map((s) => s.createdAt),
      ...st.homeLogs.filter((l) => l.organizationId === org.id).map((l) => l.createdAt),
    ].sort();
    return {
      organization: org,
      activeChildren: st.children.filter((c) => c.organizationId === org.id && c.status === 'active').length,
      staffCount: st.memberships.filter((m) => m.organizationId === org.id && STAFF_ROLES.includes(m.role) && m.status === 'active').length,
      sessionsThisMonth: st.sessions.filter((s) => s.organizationId === org.id && s.date.startsWith(month)).length,
      activeParentsPercent: parents.length ? Math.round((parents.filter((p) => active.has(p)).length / parents.length) * 100) : 0,
      lastActivityAt: stamps[stamps.length - 1],
    };
  };

  return {
    listSchools: () =>
      core.run(() => {
        core.requirePlatform();
        return st.organizations.map(summary).sort((a, b) => a.organization.name.localeCompare(b.organization.name));
      }),
    createSchool: (input) =>
      core.run(() => {
        const ctx = core.requirePlatform();
        if (!input.name.trim() || !input.adminName.trim()) throw new RepoError('validation', 'School name and admin name are required.');
        const adminPhone = normalisePhone(input.adminPhone);
        if (!/^\+91[6-9]\d{9}$/.test(adminPhone)) throw new RepoError('validation', 'Enter a valid Indian mobile number for the admin.');
        const org: Organization = {
          id: uuid(),
          name: input.name.trim(),
          shortName: input.shortName.trim() || input.name.trim(),
          city: input.city,
          address: input.address,
          phone: input.phone,
          status: 'active',
          settings: { ...DEFAULT_ORG_SETTINGS, holidays: [] },
          createdAt: core.nowIso(),
        };
        st.organizations.push(org);
        for (const t of DEFAULT_THERAPY_TYPES) st.therapyTypes.push({ ...t, id: uuid(), organizationId: org.id, active: true });
        for (const d of DEFAULT_DIMENSIONS) st.dimensions.push({ ...d, id: uuid(), organizationId: org.id });
        const invite: Invite = { id: uuid(), organizationId: org.id, role: 'school_admin', fullName: input.adminName.trim(), phone: adminPhone, childIds: [], status: 'pending', createdAt: core.nowIso(), createdBy: ctx.userId };
        st.invites.push(invite);
        return { organization: org, invite };
      }),
    setSchoolStatus: (orgId, status) =>
      core.run(() => {
        core.requirePlatform();
        core.org(orgId).status = status;
      }),
    listGlobalDimensions: () =>
      core.run(() => {
        core.requirePlatform();
        return st.dimensions.filter((d) => d.organizationId === null).sort((a, b) => a.sortOrder - b.sortOrder);
      }),
    listGlobalGoalBank: () =>
      core.run(() => {
        core.requirePlatform();
        return st.goalBank.filter((g) => g.organizationId === null);
      }),
    upsertGlobalGoalBankItem: (input) =>
      core.run(() => {
        core.requirePlatform();
        if (!input.staffText.trim() || !input.parentText.trim()) throw new RepoError('validation', 'Both staff and parent wording are required.');
        const existing = input.id ? st.goalBank.find((g) => g.id === input.id && g.organizationId === null) : undefined;
        if (existing) return Object.assign(existing, input);
        const item = { ...input, id: uuid(), organizationId: null };
        st.goalBank.push(item);
        return item;
      }),
    listGlobalResources: () =>
      core.run(() => {
        core.requirePlatform();
        return st.resources.filter((r) => r.organizationId === null);
      }),
  };
}
