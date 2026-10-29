/** Children: scoped lists, About Me (clinical only for full access), edit history, assignments. */
import type { ChildrenRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import { compareSessions, isCancelled, scoreTrend } from '@/domain/derive';
import type { Child, ChildDetail, ChildProfile, ChildSummary, ProfileEdit, UUID } from '@/domain/types';
import { addDaysISO } from '@/lib/dates';
import { uuid } from '@/lib/id';

import type { DemoCore } from './core';

export function withoutClinical(p: ChildProfile): ChildProfile {
  const copy = { ...p };
  delete copy.clinical;
  return copy;
}

const asText = (v: unknown) => (Array.isArray(v) ? v.join(' | ') : typeof v === 'object' && v ? JSON.stringify(v) : String(v ?? ''));

export function createChildrenRepo(core: DemoCore): ChildrenRepo {
  const st = core.db;

  const detail = (child: Child, access: ChildDetail['access']): ChildDetail => {
    const profile = st.childProfiles.find((p) => p.childId === child.id)!;
    return {
      child,
      profile: access === 'full' ? profile : withoutClinical(profile),
      guardians: st.guardians.filter((g) => g.childId === child.id).map((g) => {
        const p = st.profiles.find((x) => x.id === g.userId);
        return { ...g, name: p?.fullName ?? '', phone: p?.phone };
      }),
      therapists: st.childTherapists
        .filter((t) => t.childId === child.id && (!t.activeTo || t.activeTo >= core.today()))
        .map((t) => ({ ...t, name: core.name(t.userId), avatarUrl: st.profiles.find((p) => p.id === t.userId)?.avatarUrl })),
      access,
    };
  };

  const summary = (child: Child, staffView: boolean): ChildSummary => {
    const now = core.now().getTime();
    const next = st.appointments
      .filter((a) => a.childId === child.id && !isCancelled(a) && new Date(a.endsAt).getTime() > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    const recent = st.sessions.filter((s) => s.childId === child.id).sort(compareSessions).slice(-6);
    return {
      child,
      therapists: st.childTherapists
        .filter((t) => t.childId === child.id && (!t.activeTo || t.activeTo >= core.today()))
        .map((t) => ({ userId: t.userId, name: core.name(t.userId), therapyTypeId: t.therapyTypeId, isLead: t.isLead })),
      guardians: st.guardians.filter((g) => g.childId === child.id).map((g) => ({ userId: g.userId, name: core.name(g.userId), relation: g.relation, phone: st.profiles.find((p) => p.id === g.userId)?.phone })),
      openAlerts: staffView ? st.alerts.filter((a) => a.childId === child.id && a.status === 'open').length : 0,
      nextAppointment: next ? core.appointmentView(next) : undefined,
      trend: staffView && recent.length >= 3 ? scoreTrend(recent) : undefined,
    };
  };

  const requireStaffFull = (childId: UUID) => {
    core.requireStaff();
    return core.requireChild(childId, ['full']);
  };

  return {
    list: (filter) =>
      core.run(() => {
        const ctx = core.requireOrg();
        let kids = st.children.filter((c) => c.organizationId === ctx.organizationId);
        if (ctx.role === 'parent') kids = kids.filter((c) => core.isGuardian(ctx.userId, c.id));
        if (ctx.role === 'therapist') kids = kids.filter((c) => core.isAssigned(ctx.userId, c.id));
        if (filter?.therapistId) kids = kids.filter((c) => core.isAssigned(filter.therapistId!, c.id));
        if (filter?.therapyTypeId) kids = kids.filter((c) => st.childTherapists.some((t) => t.childId === c.id && t.therapyTypeId === filter.therapyTypeId));
        if (filter?.status) kids = kids.filter((c) => c.status === filter.status);
        if (filter?.search) {
          const q = filter.search.trim().toLowerCase();
          kids = kids.filter((c) => [c.fullName, c.preferredName, c.classGroup].some((v) => v?.toLowerCase().includes(q)));
        }
        const staffView = ctx.role !== 'parent';
        let out = kids.map((c) => summary(c, staffView));
        if (filter?.needsAttention) out = out.filter((s) => s.openAlerts > 0 || s.trend === 'down');
        return out.sort((a, b) => a.child.fullName.localeCompare(b.child.fullName));
      }),
    get: (childId) =>
      core.run(() => {
        const { child, access } = core.requireChild(childId);
        return detail(child, access);
      }),
    create: (input) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        if (!input.fullName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) throw new RepoError('validation', 'Full name and date of birth (yyyy-MM-dd) are required.');
        const child: Child = { ...input, id: uuid(), organizationId: ctx.organizationId, status: input.status ?? 'active', createdAt: core.nowIso() };
        st.children.push(child);
        st.childProfiles.push({
          childId: child.id,
          communicationMode: 'verbal',
          commTools: [],
          commNotes: '',
          reinforcers: [],
          reinforcersNotes: '',
          triggers: [],
          triggersNotes: '',
          calming: [],
          calmingNotes: '',
          sensoryNotes: '',
          dos: [],
          donts: [],
          clinical: { diagnosis: [], medicalNotes: '', allergies: '', medications: '' },
          updatedAt: core.nowIso(),
          updatedBy: ctx.userId,
        });
        core.audit('child.create', 'child', child.id);
        return child;
      }),
    update: (childId, patch) =>
      core.run(() => {
        core.requireAdmin();
        const { child } = core.requireChild(childId, ['full']);
        if (patch.fullName != null && !patch.fullName.trim()) throw new RepoError('validation', 'Name cannot be empty.');
        Object.assign(child, patch);
        core.audit('child.update', 'child', childId, { keys: Object.keys(patch) });
        return child;
      }),
    updateProfile: (childId, patch) =>
      core.run(() => {
        const ctx = core.requireStaff();
        requireStaffFull(childId);
        const profile = st.childProfiles.find((p) => p.childId === childId)!;
        const edits: ProfileEdit[] = [];
        for (const [field, value] of Object.entries(patch) as [keyof ChildProfile, unknown][]) {
          const before = asText(profile[field]);
          const after = asText(value);
          if (before === after) continue;
          edits.push({ id: uuid(), childId, field, oldValue: before, newValue: after, by: ctx.userId, byName: core.name(ctx.userId), at: core.nowIso() });
        }
        Object.assign(profile, patch, { updatedAt: core.nowIso(), updatedBy: ctx.userId });
        st.profileEdits.push(...edits);
        if (edits.length) core.audit('child_profile.update', 'child_profile', childId, { fields: edits.map((e) => e.field) });
        return profile;
      }),
    profileHistory: (childId) =>
      core.run(() => {
        requireStaffFull(childId);
        return st.profileEdits.filter((e) => e.childId === childId).sort((a, b) => b.at.localeCompare(a.at));
      }),
    linkGuardian: (childId, userId, relation, isPrimary) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        core.requireChild(childId, ['full']);
        if (core.roleIn(userId, ctx.organizationId) !== 'parent') throw new RepoError('validation', 'That person is not a parent at this school.');
        if (isPrimary) st.guardians.filter((g) => g.childId === childId).forEach((g) => (g.isPrimary = false));
        const existing = st.guardians.find((g) => g.childId === childId && g.userId === userId);
        if (existing) Object.assign(existing, { relation, isPrimary });
        else st.guardians.push({ childId, userId, relation, isPrimary });
      }),
    assignTherapist: (input) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        core.requireChild(input.childId, ['full']);
        if (core.roleIn(input.userId, ctx.organizationId) !== 'therapist') throw new RepoError('validation', 'That person is not a therapist at this school.');
        core.therapyType(input.therapyTypeId);
        if (input.isLead) st.childTherapists.filter((t) => t.childId === input.childId).forEach((t) => (t.isLead = false));
        const existing = st.childTherapists.find((t) => t.childId === input.childId && t.userId === input.userId && t.therapyTypeId === input.therapyTypeId);
        if (existing) Object.assign(existing, { isLead: input.isLead, activeTo: undefined });
        else st.childTherapists.push({ ...input, activeFrom: input.activeFrom ?? core.today() });
        core.audit('child.assign_therapist', 'child', input.childId, { userId: input.userId });
      }),
    unassignTherapist: (childId, userId, therapyTypeId) =>
      core.run(() => {
        core.requireAdmin();
        core.requireChild(childId, ['full']);
        const row = st.childTherapists.find((t) => t.childId === childId && t.userId === userId && t.therapyTypeId === therapyTypeId && !t.activeTo);
        if (!row) throw new RepoError('not_found', 'Assignment not found.');
        row.activeTo = addDaysISO(core.today(), -1);
        core.audit('child.unassign_therapist', 'child', childId, { userId });
      }),
  };
}
