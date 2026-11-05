/** People tab helpers: linking parents to children, searching members, invite + new-child validation. */
import type { ChildSummary, Invite, ISODate, Member, Role, UUID } from '@/domain/types';
import { matchesSearch } from '@/features/children/caseload';

import { normaliseIndianPhone } from './phone';

export interface LinkedChild {
  childId: UUID;
  name: string;
  relation: string;
}

/** Parent userId → children they are linked to (from the children list's guardians). */
export function childrenByGuardian(children: ChildSummary[]): Map<UUID, LinkedChild[]> {
  const map = new Map<UUID, LinkedChild[]>();
  for (const c of children) {
    for (const g of c.guardians) {
      const list = map.get(g.userId) ?? [];
      list.push({ childId: c.child.id, name: c.child.preferredName || c.child.fullName, relation: g.relation });
      map.set(g.userId, list);
    }
  }
  return map;
}

/** Number of children a therapist is assigned to (any therapy type). */
export function caseloadCount(children: ChildSummary[], userId: UUID): number {
  return children.filter((c) => c.therapists.some((t) => t.userId === userId)).length;
}

export function searchMembers(members: Member[], query: string): Member[] {
  return members.filter((m) => matchesSearch([m.profile.fullName, m.profile.phone, m.profile.email, m.profile.title], query));
}

const ROLE_ORDER: Record<Role, number> = { school_admin: 0, coordinator: 1, therapist: 2, parent: 3, platform_admin: 4 };

/** Admins first, then coordinators, therapists; suspended members at the end; then by name. */
export function sortMembers(members: Member[]): Member[] {
  return [...members].sort(
    (a, b) =>
      Number(a.membership.status === 'suspended') - Number(b.membership.status === 'suspended') ||
      ROLE_ORDER[a.membership.role] - ROLE_ORDER[b.membership.role] ||
      a.profile.fullName.localeCompare(b.profile.fullName),
  );
}

export function pendingInvites(invites: Invite[]): Invite[] {
  return invites.filter((i) => i.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Invite form
// ---------------------------------------------------------------------------

export const INVITE_ROLES: Role[] = ['parent', 'therapist', 'coordinator', 'school_admin'];
export const RELATIONS = ['mother', 'father', 'grandparent', 'guardian'] as const;
export type RelationKey = (typeof RELATIONS)[number];

export interface InviteDraft {
  role: Role;
  fullName: string;
  phone: string;
  email: string;
  childIds: UUID[];
  relation: RelationKey;
}

export type InviteErrors = Partial<Record<'fullName' | 'phone' | 'email' | 'childIds' | 'role', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Roles the current user may invite: only School Admins can invite another School Admin. */
export function invitableRoles(myRole: Role): Role[] {
  return myRole === 'school_admin' ? INVITE_ROLES : INVITE_ROLES.filter((r) => r !== 'school_admin');
}

export function validateInvite(d: InviteDraft, opts: { existingPhones?: string[]; allowedRoles?: Role[] } = {}): InviteErrors {
  const e: InviteErrors = {};
  if (opts.allowedRoles && !opts.allowedRoles.includes(d.role)) e.role = 'admin:invite.errors.role';
  if (d.fullName.trim().length < 2) e.fullName = 'admin:invite.errors.name';
  const phone = normaliseIndianPhone(d.phone);
  if (!phone) e.phone = 'admin:invite.errors.phone';
  else if (opts.existingPhones?.some((p) => normaliseIndianPhone(p) === phone)) e.phone = 'admin:invite.errors.phoneTaken';
  if (d.email.trim() && !EMAIL_RE.test(d.email.trim())) e.email = 'admin:invite.errors.email';
  if (d.role === 'parent' && d.childIds.length === 0) e.childIds = 'admin:invite.errors.children';
  return e;
}

/** Relation is stored as an English word (it is shown to staff in lists and exports). */
export const RELATION_VALUE: Record<RelationKey, string> = {
  mother: 'Mother',
  father: 'Father',
  grandparent: 'Grandparent',
  guardian: 'Guardian',
};

export function toInviteInput(d: InviteDraft, organizationId: UUID): Omit<Invite, 'id' | 'status' | 'createdAt' | 'createdBy'> {
  return {
    organizationId,
    role: d.role,
    fullName: d.fullName.trim(),
    phone: normaliseIndianPhone(d.phone) ?? undefined,
    email: d.email.trim() || undefined,
    childIds: d.role === 'parent' ? d.childIds : [],
    relation: d.role === 'parent' ? RELATION_VALUE[d.relation] : undefined,
  };
}

// ---------------------------------------------------------------------------
// New child form
// ---------------------------------------------------------------------------

export interface NewChildDraft {
  fullName: string;
  preferredName: string;
  dob: ISODate | null;
  gender: 'male' | 'female' | 'other' | null;
  classGroup: string;
  /** therapyTypeId → assignment */
  therapists: Record<UUID, { userId: UUID; isLead: boolean }>;
  /** Existing parents to link. */
  guardians: { userId: UUID; relation: RelationKey; isPrimary: boolean }[];
  /** Optional new parent invited in the same step. */
  newParent: { fullName: string; phone: string; relation: RelationKey } | null;
}

export type NewChildErrors = Partial<Record<'fullName' | 'dob' | 'newParentName' | 'newParentPhone', string>>;

export function validateNewChild(d: NewChildDraft, today: ISODate): NewChildErrors {
  const e: NewChildErrors = {};
  if (d.fullName.trim().length < 2) e.fullName = 'admin:newChild.errors.name';
  if (!d.dob) e.dob = 'admin:newChild.errors.dob';
  else if (d.dob > today) e.dob = 'admin:newChild.errors.dobFuture';
  if (d.newParent) {
    if (d.newParent.fullName.trim().length < 2) e.newParentName = 'admin:invite.errors.name';
    if (!normaliseIndianPhone(d.newParent.phone)) e.newParentPhone = 'admin:invite.errors.phone';
  }
  return e;
}

/** Ensures exactly one primary guardian when any are linked (the first one by default). */
export function withPrimaryGuardian<T extends { isPrimary: boolean }>(list: T[]): T[] {
  if (list.length === 0 || list.filter((g) => g.isPrimary).length === 1) return list;
  const idx = Math.max(0, list.findIndex((g) => g.isPrimary));
  return list.map((g, i) => ({ ...g, isPrimary: i === idx }));
}

/** Therapists qualified for a therapy type; falls back to all therapists when none are tagged. */
export function qualifiedFor(members: Member[], therapyTypeId: UUID): Member[] {
  const active = members.filter((m) => m.membership.status === 'active' && m.membership.role !== 'parent');
  const tagged = active.filter((m) => m.therapyTypeIds.includes(therapyTypeId));
  return tagged.length ? tagged : active.filter((m) => m.membership.role === 'therapist');
}
