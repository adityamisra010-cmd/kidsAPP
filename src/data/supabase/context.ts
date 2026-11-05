/**
 * Shared state of one Supabase repository instance: the client, the active RequestContext
 * (role + school; RLS is the real guard, the context only picks the school and query shape),
 * the signed-in AuthUser, and small TTL caches (org settings, therapy types, profile names).
 * Caches are cleared whenever the context changes, because RLS visibility depends on the role.
 */
import { ADMIN_ROLES, STAFF_ROLES, type AuthUser, type OrgSettings, type RequestContext, type Role, type TherapyType, type UUID } from '@/domain/types';

import { RepoError } from '../repository';
import { orgSettings, therapyTypeFromRow } from './mappers';
import { inChunks, many, maybe, type Sb } from './query';
import type { OrganizationRow, ProfileRow, TherapyTypeRow } from './rows';

const FIVE_MIN = 5 * 60_000;

interface CacheEntry {
  at: number;
  value: unknown;
}

export class AdapterContext {
  private ctx: RequestContext | null = null;
  private user: AuthUser | null = null;
  private cache = new Map<string, CacheEntry>();
  private nameCache = new Map<UUID, { at: number; name: string }>();
  private readonly clock: () => Date;

  constructor(
    readonly sb: Sb,
    opts: { now?: () => Date } = {},
  ) {
    this.clock = opts.now ?? (() => new Date());
  }

  now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // Context & user
  // -------------------------------------------------------------------------
  setContext(ctx: RequestContext | null): void {
    this.ctx = ctx;
    this.clearCaches();
  }

  getContext(): RequestContext | null {
    return this.ctx;
  }

  setUser(user: AuthUser | null): void {
    this.user = user;
    if (!user) this.clearCaches();
  }

  getUser(): AuthUser | null {
    return this.user;
  }

  clearCaches(): void {
    this.cache.clear();
    this.nameCache.clear();
  }

  userId(): UUID | null {
    return this.ctx?.userId ?? this.user?.profile.id ?? null;
  }

  requireUserId(): UUID {
    const id = this.userId();
    if (!id) throw new RepoError('not_authenticated', 'Not signed in');
    return id;
  }

  role(): Role | null {
    return this.ctx?.role ?? null;
  }

  /** Active school; platform admins (no school) get `forbidden` for school-scoped calls. */
  requireOrg(): UUID {
    const org = this.ctx?.organizationId;
    if (!org) throw new RepoError(this.ctx ? 'forbidden' : 'not_authenticated', 'No school selected');
    return org;
  }

  orgOrNull(): UUID | null {
    return this.ctx?.organizationId ?? null;
  }

  isParent(): boolean {
    return this.ctx?.role === 'parent';
  }

  isStaff(): boolean {
    return !!this.ctx && STAFF_ROLES.includes(this.ctx.role);
  }

  isOrgAdmin(): boolean {
    return !!this.ctx && ADMIN_ROLES.includes(this.ctx.role);
  }

  isTherapist(): boolean {
    return this.ctx?.role === 'therapist';
  }

  // -------------------------------------------------------------------------
  // Caches
  // -------------------------------------------------------------------------
  async cached<T>(key: string, load: () => Promise<T>, ttlMs = FIVE_MIN): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && this.clock().getTime() - hit.at < ttlMs) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: this.clock().getTime(), value });
    return value;
  }

  forget(prefix: string): void {
    for (const k of [...this.cache.keys()]) if (k.startsWith(prefix)) this.cache.delete(k);
  }

  /** Settings of a school (defaults filled in). */
  orgSettings(orgId: UUID = this.requireOrg()): Promise<OrgSettings> {
    return this.cached(`org:${orgId}:settings`, async () => {
      const row = await maybe<Pick<OrganizationRow, 'settings'>>(this.sb.from('organizations').select('settings').eq('id', orgId));
      return orgSettings(row?.settings);
    });
  }

  therapyTypes(orgId: UUID = this.requireOrg()): Promise<TherapyType[]> {
    return this.cached(`org:${orgId}:therapyTypes`, async () => {
      const rows = await many<TherapyTypeRow>(this.sb.from('therapy_types').select('*').eq('organization_id', orgId).order('name'));
      return rows.map(therapyTypeFromRow);
    });
  }

  /** Display names for profile ids (RLS decides who is visible; unknown ids map to ''). */
  async names(ids: (UUID | null | undefined)[]): Promise<Map<UUID, string>> {
    const now = this.clock().getTime();
    const out = new Map<UUID, string>();
    const missing: UUID[] = [];
    for (const id of new Set(ids.filter((x): x is UUID => !!x))) {
      const hit = this.nameCache.get(id);
      if (hit && now - hit.at < FIVE_MIN) out.set(id, hit.name);
      else missing.push(id);
    }
    if (missing.length) {
      const rows = await inChunks(missing, (part) => many<Pick<ProfileRow, 'id' | 'full_name'>>(this.sb.from('profiles').select('id,full_name').in('id', part)));
      for (const r of rows) {
        out.set(r.id, r.full_name ?? '');
        this.nameCache.set(r.id, { at: now, name: r.full_name ?? '' });
      }
      for (const id of missing) if (!out.has(id)) out.set(id, '');
    }
    return out;
  }

  rememberName(id: UUID, name: string): void {
    this.nameCache.set(id, { at: this.clock().getTime(), name });
  }

  /** Children linked to the signed-in parent (from the AuthUser, else child_guardians). */
  async guardianChildIds(): Promise<UUID[]> {
    if (this.user && this.user.profile.id === this.userId()) return this.user.childIds;
    const uid = this.requireUserId();
    return this.cached(`guardian:${uid}`, async () => {
      const rows = await many<{ child_id: UUID }>(this.sb.from('child_guardians').select('child_id').eq('user_id', uid));
      return rows.map((r) => r.child_id);
    });
  }
}
