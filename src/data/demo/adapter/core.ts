/**
 * Shared engine for the Demo adapter: clock, latency, request context, RLS-like scoping helpers,
 * view builders and side effects (notifications, audit). Each repo module is a thin layer on top.
 */
import { buildAppointmentView, isCancelled, toSessionSummary } from '@/domain/derive';
import type {
  Appointment,
  AppNotification,
  AppointmentView,
  Child,
  ChildAccess,
  ISODate,
  NotificationKind,
  Organization,
  RatingDimension,
  RequestContext,
  Role,
  SessionSummary,
  TherapyType,
  UUID,
} from '@/domain/types';
import { ADMIN_ROLES, STAFF_ROLES } from '@/domain/types';
import { RepoError } from '@/data/repository';
import { toISODate } from '@/lib/dates';
import { uuid } from '@/lib/id';

import { buildDemoDataset } from '../seed';
import type { DemoStore, StoredSession } from '../store';

const HOUR = 3_600_000;

export interface DemoOptions {
  /** Freezes the demo clock (tests). Default: the real clock. */
  now?: Date;
  /** Fixed latency per call. Default: random 80–200 ms so loading states show. */
  latencyMs?: number;
}

export type OrgContext = RequestContext & { organizationId: UUID };

/** JSON-safe deep copy so callers can never mutate the store. */
export function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export class DemoCore {
  ctx: RequestContext | null = null;
  currentUserId: UUID | null = null;
  private fixedNow?: Date;
  private readonly latencyMs?: number;
  private built?: DemoStore;

  constructor(opts: DemoOptions = {}) {
    this.fixedNow = opts.now ? new Date(opts.now) : undefined;
    this.latencyMs = opts.latencyMs;
  }

  /** The dataset is generated on first use, so creating the repository at app start is free. */
  get store(): DemoStore {
    if (!this.built) this.built = buildDemoDataset(this.now());
    return this.built;
  }

  /** Stable handle repo modules can capture at creation time without forcing the build. */
  readonly db: DemoStore = new Proxy({} as DemoStore, {
    get: (_target, prop) => Reflect.get(this.store, prop),
    set: (_target, prop, value) => Reflect.set(this.store, prop, value),
  });

  now(): Date {
    return this.fixedNow ? new Date(this.fixedNow) : new Date();
  }
  nowIso(): string {
    return this.now().toISOString();
  }
  today(): ISODate {
    return toISODate(this.now());
  }
  /** Test hook: move the frozen clock. */
  setNow(d: Date): void {
    this.fixedNow = new Date(d);
  }

  /** Typical per-call latency (used to pace fake upload progress). */
  latencyHint(): number {
    return this.latencyMs ?? 140;
  }

  async delay(ms?: number): Promise<void> {
    const wait = ms ?? this.latencyMs ?? 80 + Math.floor(Math.random() * 120);
    if (wait <= 0) return Promise.resolve();
    await new Promise((r) => setTimeout(r, wait));
  }

  /** Every repo method goes through here: latency, then a cloned result. */
  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.delay();
    return clone(await fn());
  }

  // -------------------------------------------------------------------------
  // Context & roles
  // -------------------------------------------------------------------------

  requireCtx(): RequestContext {
    if (!this.ctx) throw new RepoError('not_authenticated', 'Please sign in first.');
    return this.ctx;
  }

  /** A school-scoped context (everyone except the platform admin). */
  requireOrg(roles?: Role[]): OrgContext {
    const ctx = this.requireCtx();
    if (!ctx.organizationId || ctx.role === 'platform_admin') throw new RepoError('forbidden', 'Not available for platform admins.');
    if (roles && !roles.includes(ctx.role)) throw new RepoError('forbidden', 'Your role cannot do this.');
    return ctx as OrgContext;
  }

  requireStaff(): OrgContext {
    return this.requireOrg(STAFF_ROLES);
  }
  requireAdmin(): OrgContext {
    return this.requireOrg(ADMIN_ROLES);
  }
  requirePlatform(): RequestContext {
    const ctx = this.requireCtx();
    if (ctx.role !== 'platform_admin') throw new RepoError('forbidden', 'Platform admins only.');
    return ctx;
  }
  isAdmin(ctx: RequestContext): boolean {
    return ADMIN_ROLES.includes(ctx.role);
  }

  /** Rows from another organisation are invisible (RLS returns no rows). */
  sameOrg<T extends { organizationId: UUID | null }>(row: T | undefined, what = 'Record'): T {
    const ctx = this.requireCtx();
    if (!row || (ctx.role !== 'platform_admin' && row.organizationId !== null && row.organizationId !== ctx.organizationId)) {
      throw new RepoError('not_found', `${what} not found.`);
    }
    return row;
  }

  // -------------------------------------------------------------------------
  // Child scoping (mirrors the RLS policies)
  // -------------------------------------------------------------------------

  isGuardian(userId: UUID, childId: UUID): boolean {
    return this.store.guardians.some((g) => g.userId === userId && g.childId === childId);
  }

  isAssigned(userId: UUID, childId: UUID, therapyTypeId?: UUID): boolean {
    const today = this.today();
    return this.store.childTherapists.some(
      (t) =>
        t.childId === childId &&
        t.userId === userId &&
        (!therapyTypeId || t.therapyTypeId === therapyTypeId) &&
        t.activeFrom <= today &&
        (!t.activeTo || t.activeTo >= today),
    );
  }

  /** A therapist covering an appointment gets brief access from 24 h before until 24 h after it. */
  inSubstituteWindow(userId: UUID, childId: UUID): boolean {
    const t = this.now().getTime();
    return this.store.appointments.some(
      (a) =>
        a.childId === childId &&
        a.therapistId === userId &&
        !isCancelled(a) &&
        t >= new Date(a.startsAt).getTime() - 24 * HOUR &&
        t <= new Date(a.endsAt).getTime() + 24 * HOUR,
    );
  }

  childAccess(childId: UUID): ChildAccess {
    const ctx = this.requireCtx();
    const child = this.store.children.find((c) => c.id === childId);
    if (!child || ctx.role === 'platform_admin' || child.organizationId !== ctx.organizationId) return 'none';
    if (ctx.role === 'school_admin' || ctx.role === 'coordinator') return 'full';
    if (ctx.role === 'parent') return this.isGuardian(ctx.userId, childId) ? 'parent' : 'none';
    if (this.isAssigned(ctx.userId, childId)) return 'full';
    return this.inSubstituteWindow(ctx.userId, childId) ? 'brief_only' : 'none';
  }

  /** Loads a child the caller may see at one of `allowed` levels; other orgs → not_found, else forbidden. */
  requireChild(childId: UUID, allowed: ChildAccess[] = ['full', 'brief_only', 'parent']): { child: Child; access: ChildAccess } {
    const ctx = this.requireCtx();
    if (ctx.role === 'platform_admin') throw new RepoError('forbidden', 'Platform admins see school summaries only.');
    const child = this.sameOrg(this.store.children.find((c) => c.id === childId), 'Child');
    const access = this.childAccess(childId);
    if (access === 'none' || !allowed.includes(access)) throw new RepoError('forbidden', 'You do not have access to this child.');
    return { child, access };
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  org(orgId: UUID): Organization {
    const org = this.store.organizations.find((o) => o.id === orgId);
    if (!org) throw new RepoError('not_found', 'School not found.');
    return org;
  }
  dims(orgId: UUID): RatingDimension[] {
    return this.store.dimensions.filter((d) => d.organizationId === orgId).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  therapyType(id: UUID): TherapyType {
    const tt = this.store.therapyTypes.find((t) => t.id === id);
    if (!tt) throw new RepoError('not_found', 'Therapy type not found.');
    return tt;
  }
  name(userId: UUID | undefined): string {
    return this.store.profiles.find((p) => p.id === userId)?.fullName ?? '';
  }
  roleIn(userId: UUID, orgId: UUID | null): Role | undefined {
    return this.store.memberships.find((m) => m.userId === userId && m.organizationId === orgId && m.status === 'active')?.role;
  }
  orgUsers(orgId: UUID, roles: Role[]): UUID[] {
    return this.store.memberships.filter((m) => m.organizationId === orgId && roles.includes(m.role) && m.status === 'active').map((m) => m.userId);
  }
  guardiansOf(childId: UUID): UUID[] {
    return this.store.guardians.filter((g) => g.childId === childId).map((g) => g.userId);
  }
  sessionFor(appointmentId: UUID): StoredSession | undefined {
    return this.store.sessions.find((s) => s.appointmentId === appointmentId);
  }
  appointment(id: UUID): Appointment {
    return this.sameOrg(this.store.appointments.find((a) => a.id === id), 'Appointment');
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  appointmentView(a: Appointment): AppointmentView {
    const viewer = this.ctx?.userId ?? '';
    const child = this.store.children.find((c) => c.id === a.childId)!;
    const session = this.sessionFor(a.id);
    const pending = this.store.rescheduleRequests.find((r) => r.appointmentId === a.id && (r.status === 'pending' || r.status === 'countered'));
    return buildAppointmentView({
      appointment: a,
      child,
      therapist: this.store.profiles.find((p) => p.id === a.therapistId) ?? { fullName: '' },
      originalTherapist: a.originalTherapistId ? { fullName: this.name(a.originalTherapistId) } : undefined,
      therapyType: this.therapyType(a.therapyTypeId),
      sessionId: session?.id,
      viewer: {
        userId: viewer,
        assignedToChild: this.isAssigned(viewer, a.childId, a.therapyTypeId),
        hasWorkedWithChild: this.store.sessions.some((s) => s.childId === a.childId && s.therapistId === viewer),
      },
      briefAcknowledged: this.store.briefAcks.some((k) => k.appointmentId === a.id && k.userId === viewer),
      hasCheckin: this.store.checkins.some((c) => c.appointmentId === a.id),
      pendingRescheduleRequestId: pending?.id,
      now: this.now(),
    });
  }

  summary(s: StoredSession): SessionSummary {
    return toSessionSummary(s, this.therapyType(s.therapyTypeId));
  }

  // -------------------------------------------------------------------------
  // Side effects
  // -------------------------------------------------------------------------

  notify(userIds: UUID[], kind: NotificationKind, title: string, body: string, route?: string): void {
    const actor = this.ctx?.userId;
    for (const userId of new Set(userIds)) {
      if (!userId || userId === actor) continue;
      const n: AppNotification = { id: uuid(), userId, kind, title, body, route, createdAt: this.nowIso() };
      this.store.notifications.push(n);
    }
  }

  audit(action: string, entity: string, entityId: UUID, meta: Record<string, unknown> = {}): void {
    const ctx = this.ctx;
    if (!ctx?.organizationId) return;
    this.store.audit.unshift({ id: uuid(), organizationId: ctx.organizationId, actorId: ctx.userId, actorName: this.name(ctx.userId), action, entity, entityId, at: this.nowIso(), meta });
  }
}
