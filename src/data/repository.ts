/**
 * Data access contract. Every screen talks to data only through this interface.
 *
 * Two implementations:
 * - DemoAdapter (src/data/demo): seeded, in-memory, no backend needed. Powers "Try demo".
 * - SupabaseAdapter (src/data/supabase): the real backend, protected by Postgres RLS.
 *
 * Scoping: adapters read the active RequestContext (set via `setContext` after login / role switch)
 * and must only return what that user is allowed to see. The Demo adapter emulates the same rules
 * as the RLS policies so the demo behaves like production.
 *
 * Errors: throw `RepoError` (below) with a stable `code`; UI maps codes to friendly messages.
 */
import type {
  AdminDashboard,
  Alert,
  Amendment,
  Announcement,
  AnnouncementAudience,
  AppNotification,
  Appointment,
  AppointmentView,
  Attendance,
  AuditEntry,
  AuthUser,
  CheckinInput,
  Child,
  ChildDetail,
  ChildProfile,
  ChildReportData,
  ChildSummary,
  ChildTherapist,
  Conflict,
  Consent,
  ConsentKind,
  DataRequest,
  DemoPersonaKey,
  ExportRow,
  Goal,
  GoalBankItem,
  GoalDomain,
  GoalProgressPoint,
  GoalStatus,
  GoalWithStats,
  HandoverBrief,
  HomeLog,
  HomeLogInput,
  HomeTask,
  HomeTaskInput,
  ImportContext,
  ImportKind,
  ImportRow,
  ImportSummary,
  Invite,
  ISODate,
  ISODateTime,
  Media,
  Member,
  Message,
  NotificationKind,
  Organization,
  OrgSettings,
  ParentCheckin,
  ParentProgress,
  ParentSessionSnapshot,
  Profile,
  ProfileEdit,
  ProgressPeriod,
  RatingDimension,
  RequestContext,
  RescheduleRequest,
  Resource,
  ResourceShare,
  ReviewReaction,
  Role,
  SchoolSummary,
  SeriesInput,
  SessionInput,
  SessionLog,
  SessionSummary,
  StaffProgress,
  TherapistToday,
  TherapistUnavailability,
  TherapyType,
  ThreadSummary,
  UUID,
  WeeklyCompletion,
} from '@/domain/types';

export type RepoErrorCode =
  | 'not_authenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'locked'
  | 'offline'
  | 'otp_invalid'
  | 'otp_expired'
  | 'no_membership'
  | 'consent_required'
  | 'unknown';

export class RepoError extends Error {
  constructor(
    public code: RepoErrorCode,
    message?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = 'RepoError';
  }
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

// ---------------------------------------------------------------------------

export interface AuthRepo {
  /** Sends an SMS OTP. Demo adapter accepts any number and code 123456. */
  requestOtp(phone: string): Promise<void>;
  /** Verifies OTP, accepts pending invites for this phone, returns the user. */
  verifyOtp(phone: string, code: string): Promise<AuthUser>;
  signInWithPassword(email: string, password: string): Promise<AuthUser>;
  signInDemo(persona: DemoPersonaKey): Promise<AuthUser>;
  /** Restores a persisted session on app start. */
  restore(): Promise<AuthUser | null>;
  /** Reloads memberships, orgs and children for the signed-in user. */
  refresh(): Promise<AuthUser>;
  signOut(): Promise<void>;
}

export interface MeRepo {
  updateProfile(patch: Partial<Pick<Profile, 'fullName' | 'email' | 'avatarUrl' | 'preferredLanguage'>>): Promise<Profile>;
  registerPushToken(token: string, platform: 'android' | 'ios' | 'web'): Promise<void>;
  listConsents(): Promise<Consent[]>;
  recordConsent(input: { kind: ConsentKind; granted: boolean; childId?: UUID; version: string }): Promise<Consent>;
  requestDataExport(childId: UUID): Promise<DataRequest>;
  requestDeletion(childId: UUID): Promise<DataRequest>;
  getMutedNotificationKinds(): Promise<NotificationKind[]>;
  setMutedNotificationKinds(kinds: NotificationKind[]): Promise<void>;
}

export interface OrgRepo {
  get(orgId: UUID): Promise<Organization>;
  update(orgId: UUID, patch: Partial<Pick<Organization, 'name' | 'shortName' | 'city' | 'address' | 'phone' | 'email' | 'logoUrl'>>): Promise<Organization>;
  updateSettings(orgId: UUID, patch: Partial<OrgSettings>): Promise<Organization>;
  listTherapyTypes(orgId: UUID): Promise<TherapyType[]>;
  upsertTherapyType(input: Omit<TherapyType, 'id'> & { id?: UUID }): Promise<TherapyType>;
  listRatingDimensions(orgId: UUID): Promise<RatingDimension[]>;
  upsertRatingDimension(input: Omit<RatingDimension, 'id'> & { id?: UUID }): Promise<RatingDimension>;
  reorderRatingDimensions(orgId: UUID, orderedIds: UUID[]): Promise<void>;
  listMembers(orgId: UUID, roles?: Role[]): Promise<Member[]>;
  setMemberTherapyTypes(orgId: UUID, userId: UUID, therapyTypeIds: UUID[]): Promise<void>;
  setMemberStatus(membershipId: UUID, status: 'active' | 'suspended'): Promise<void>;
  listInvites(orgId: UUID): Promise<Invite[]>;
  createInvite(input: Omit<Invite, 'id' | 'status' | 'createdAt' | 'createdBy'>): Promise<Invite>;
  revokeInvite(inviteId: UUID): Promise<void>;
  listDataRequests(orgId: UUID): Promise<DataRequest[]>;
  setDataRequestStatus(id: UUID, status: DataRequest['status']): Promise<void>;
  listAudit(orgId: UUID, filter?: { entity?: string; entityId?: UUID; limit?: number }): Promise<AuditEntry[]>;
}

export interface PlatformRepo {
  listSchools(): Promise<SchoolSummary[]>;
  createSchool(input: { name: string; shortName: string; city: string; address: string; phone: string; adminName: string; adminPhone: string }): Promise<{ organization: Organization; invite: Invite }>;
  setSchoolStatus(orgId: UUID, status: 'active' | 'suspended'): Promise<void>;
  listGlobalDimensions(): Promise<RatingDimension[]>;
  listGlobalGoalBank(): Promise<GoalBankItem[]>;
  upsertGlobalGoalBankItem(input: Omit<GoalBankItem, 'id' | 'organizationId'> & { id?: UUID }): Promise<GoalBankItem>;
  listGlobalResources(): Promise<Resource[]>;
}

export interface ChildFilter {
  search?: string;
  therapistId?: UUID;
  therapyTypeId?: UUID;
  status?: Child['status'];
  /** Only children with open alerts / declining trend. */
  needsAttention?: boolean;
}

export interface ChildrenRepo {
  /** Staff: school (or caseload when therapistId given). Parent: own children. */
  list(filter?: ChildFilter): Promise<ChildSummary[]>;
  get(childId: UUID): Promise<ChildDetail>;
  create(input: Omit<Child, 'id' | 'organizationId' | 'createdAt' | 'status'> & { status?: Child['status'] }): Promise<Child>;
  update(childId: UUID, patch: Partial<Omit<Child, 'id' | 'organizationId' | 'createdAt'>>): Promise<Child>;
  /** Records one ProfileEdit per changed field. */
  updateProfile(childId: UUID, patch: Partial<Omit<ChildProfile, 'childId' | 'updatedAt' | 'updatedBy'>>): Promise<ChildProfile>;
  profileHistory(childId: UUID): Promise<ProfileEdit[]>;
  linkGuardian(childId: UUID, userId: UUID, relation: string, isPrimary: boolean): Promise<void>;
  assignTherapist(input: Omit<ChildTherapist, 'activeFrom'> & { activeFrom?: ISODate }): Promise<void>;
  unassignTherapist(childId: UUID, userId: UUID, therapyTypeId: UUID): Promise<void>;
}

export interface GoalsRepo {
  listForChild(childId: UUID, filter?: { therapyTypeId?: UUID; status?: GoalStatus[] }): Promise<GoalWithStats[]>;
  get(goalId: UUID): Promise<GoalWithStats>;
  create(input: Omit<Goal, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'masteredAt'>): Promise<Goal>;
  update(goalId: UUID, patch: Partial<Omit<Goal, 'id' | 'organizationId' | 'childId' | 'createdBy' | 'createdAt'>>): Promise<Goal>;
  /** Sets status; 'mastered' stamps masteredAt and moves the goal to Wins. */
  setStatus(goalId: UUID, status: GoalStatus): Promise<Goal>;
  progress(goalId: UUID): Promise<GoalProgressPoint[]>;
  /** Mastered + maintenance goals, newest first. */
  wins(childId: UUID): Promise<Goal[]>;
  listBank(filter?: { domain?: GoalDomain; therapyTypeKey?: string; search?: string }): Promise<GoalBankItem[]>;
  addToBank(input: Omit<GoalBankItem, 'id' | 'organizationId'>): Promise<GoalBankItem>;
}

export interface AppointmentFilter {
  from: ISODateTime;
  to: ISODateTime;
  therapistId?: UUID;
  childId?: UUID;
  therapyTypeId?: UUID;
  includeCancelled?: boolean;
}

export interface AppointmentsRepo {
  list(filter: AppointmentFilter): Promise<AppointmentView[]>;
  get(id: UUID): Promise<AppointmentView>;
  /** Next appointments for the current user (parent: their children; therapist: own). */
  upcoming(opts?: { childId?: UUID; limit?: number }): Promise<AppointmentView[]>;
  checkConflicts(input: SeriesInput & { excludeAppointmentIds?: UUID[] }): Promise<Conflict[]>;
  /** Creates the series and expands its occurrences. Pass `force` to save despite conflicts. */
  createSeries(input: SeriesInput, opts?: { force?: boolean }): Promise<{ seriesId: UUID; created: number; conflicts: Conflict[] }>;
  createOne(input: Omit<SeriesInput, 'weekdays' | 'endDate'> & { makeupOfId?: UUID }, opts?: { force?: boolean }): Promise<{ appointment?: Appointment; conflicts: Conflict[] }>;
  /** Edit this occurrence or this and all future occurrences of its series. */
  update(
    id: UUID,
    patch: Partial<Pick<Appointment, 'startsAt' | 'endsAt' | 'therapistId' | 'room'>>,
    scope: 'this' | 'future',
  ): Promise<void>;
  cancel(id: UUID, by: 'school' | 'parent', reason: string): Promise<void>;
  markAttendance(id: UUID, attendance: Attendance, lateMinutes?: number): Promise<void>;
  acknowledgeBrief(id: UUID): Promise<void>;
  // Reschedule requests
  requestReschedule(appointmentId: UUID, proposedSlots: ISODateTime[], reason: string): Promise<RescheduleRequest>;
  listRescheduleRequests(filter?: { status?: RescheduleRequest['status'][]; childId?: UUID }): Promise<(RescheduleRequest & { appointment: AppointmentView })[]>;
  resolveRescheduleRequest(
    id: UUID,
    action: { type: 'approve'; slot: ISODateTime } | { type: 'decline'; note: string } | { type: 'counter'; slots: ISODateTime[]; note?: string },
  ): Promise<RescheduleRequest>;
  /** Parent accepts one of the coordinator's counter-proposed slots. */
  acceptCounter(id: UUID, slot: ISODateTime): Promise<RescheduleRequest>;
  // Availability & substitution
  listUnavailability(filter?: { userId?: UUID; from?: ISODate; to?: ISODate }): Promise<TherapistUnavailability[]>;
  /** Returns appointments affected (needing a substitute). */
  addUnavailability(input: Omit<TherapistUnavailability, 'id' | 'organizationId' | 'createdAt'>): Promise<{ unavailability: TherapistUnavailability; affected: AppointmentView[] }>;
  removeUnavailability(id: UUID): Promise<void>;
  /** Appointments whose therapist is unavailable and no substitute is assigned yet. */
  needingSubstitute(): Promise<AppointmentView[]>;
  /** Staff qualified for the therapy type and free at that time, best match first. */
  substituteCandidates(appointmentId: UUID): Promise<(Member & { freeAtTime: boolean; knowsChild: boolean })[]>;
  /** Assigns the substitute, grants time-boxed brief access, notifies therapist + parent. */
  assignSubstitute(appointmentId: UUID, therapistId: UUID): Promise<void>;
}

export interface SessionsRepo {
  getByAppointment(appointmentId: UUID): Promise<SessionLog | null>;
  get(sessionId: UUID): Promise<SessionLog>;
  listForChild(childId: UUID, opts?: { therapyTypeId?: UUID; from?: ISODate; to?: ISODate; limit?: number }): Promise<SessionSummary[]>;
  /** Idempotent on input.clientId. Computes metrics, raises alerts, notifies parents. */
  save(input: SessionInput): Promise<SessionLog>;
  /** Edits within the lock window go through save(); after it, amend() with a reason. */
  amend(sessionId: UUID, changes: Partial<Omit<SessionInput, 'clientId' | 'appointmentId'>>, reason: string): Promise<SessionLog>;
  amendments(sessionId: UUID): Promise<Amendment[]>;
  /** Attended but not logged within the lock window. */
  unlogged(): Promise<AppointmentView[]>;
  brief(appointmentId: UUID): Promise<HandoverBrief>;
  parentSnapshot(sessionId: UUID): Promise<ParentSessionSnapshot>;
  parentSnapshots(childId: UUID, opts?: { limit?: number }): Promise<ParentSessionSnapshot[]>;
  /** The most recent session of the same child + therapy type before a date (for the logger header). */
  previous(childId: UUID, therapyTypeId: UUID, before?: ISODateTime): Promise<SessionSummary | null>;
}

export interface CheckinsRepo {
  submit(input: CheckinInput): Promise<ParentCheckin>;
  forAppointment(appointmentId: UUID): Promise<ParentCheckin | null>;
  /** Today's session appointments for the parent's children that have no check-in yet. */
  pendingForToday(): Promise<AppointmentView[]>;
}

export interface ProgressRepo {
  staff(childId: UUID, opts?: { therapyTypeId?: UUID; from?: ISODate; to?: ISODate }): Promise<StaffProgress>;
  parent(childId: UUID, period: ProgressPeriod): Promise<ParentProgress>;
}

export interface HomePracticeRepo {
  listTasks(filter: { childId?: UUID; assignedBy?: UUID; status?: HomeTask['status'][] }): Promise<HomeTask[]>;
  getTask(taskId: UUID): Promise<HomeTask & { logs: HomeLog[] }>;
  createTask(input: HomeTaskInput): Promise<HomeTask>;
  updateTask(taskId: UUID, patch: Partial<HomeTaskInput> & { status?: HomeTask['status'] }): Promise<HomeTask>;
  /** Idempotent on clientId. Video, if any, is uploaded by the media queue first. */
  log(input: HomeLogInput & { mediaId?: UUID }): Promise<HomeLog>;
  listLogs(filter: { childId?: UUID; taskId?: UUID; limit?: number }): Promise<HomeLog[]>;
  /** Unreviewed logs for children assigned to the therapist (or all, for coordinators). */
  reviewQueue(): Promise<HomeLog[]>;
  review(logId: UUID, input: { reaction: ReviewReaction; comment?: string; useInNextSession?: boolean }): Promise<HomeLog>;
  weeklyCompletion(childId: UUID, weekStart?: ISODate): Promise<WeeklyCompletion>;
}

export interface MediaRepo {
  /** Uploads a local file to private storage. Reports progress 0..1. */
  upload(input: { localUri: string; kind: Media['kind']; durationS?: number; sizeBytes: number; mimeType: string }, onProgress?: (p: number) => void): Promise<Media>;
  /** Short-lived signed URL. Never a public link. */
  playbackUrl(mediaId: UUID): Promise<string>;
  get(mediaId: UUID): Promise<Media>;
}

export interface ResourcesRepo {
  list(filter?: { search?: string; therapyTypeKey?: string; domain?: GoalDomain; kind?: Resource['kind'] }): Promise<Resource[]>;
  get(id: UUID): Promise<Resource>;
  create(input: Omit<Resource, 'id' | 'organizationId' | 'createdAt'>): Promise<Resource>;
  share(resourceId: UUID, target: { childId?: UUID; userId?: UUID }, note?: string): Promise<ResourceShare>;
  /** Parent view: shared with their child + school-wide parent resources. */
  forParent(childId: UUID): Promise<(Resource & { share?: ResourceShare })[]>;
}

export interface MessagingRepo {
  listThreads(): Promise<ThreadSummary[]>;
  threadsForChild(childId: UUID): Promise<ThreadSummary[]>;
  getThread(threadId: UUID): Promise<ThreadSummary>;
  listMessages(threadId: UUID, opts?: { before?: ISODateTime; limit?: number }): Promise<Message[]>;
  send(threadId: UUID, body: string, attachments?: Message['attachments']): Promise<Message>;
  markRead(threadId: UUID): Promise<void>;
  unreadCount(): Promise<number>;
  listAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(input: { title: string; body: string; audience: AnnouncementAudience; therapyTypeId?: UUID; urgent: boolean }): Promise<Announcement>;
}

export interface NotificationsRepo {
  list(opts?: { limit?: number }): Promise<AppNotification[]>;
  unreadCount(): Promise<number>;
  markRead(id: UUID | 'all'): Promise<void>;
}

export interface AlertsRepo {
  list(filter?: { status?: Alert['status'][]; childId?: UUID }): Promise<Alert[]>;
  acknowledge(id: UUID): Promise<void>;
  resolve(id: UUID): Promise<void>;
}

export interface DashboardsRepo {
  therapistToday(date?: ISODate): Promise<TherapistToday>;
  admin(date?: ISODate): Promise<AdminDashboard>;
}

export interface ReportsRepo {
  childReport(childId: UUID, opts: { from: ISODate; to: ISODate; audience: 'staff' | 'parent' }): Promise<ChildReportData>;
  exportSessions(opts: { from: ISODate; to: ISODate; childId?: UUID; therapistId?: UUID }): Promise<ExportRow[]>;
  exportAttendance(opts: { from: ISODate; to: ISODate; childId?: UUID; therapistId?: UUID }): Promise<ExportRow[]>;
}

export interface ImportsRepo {
  context(): Promise<ImportContext>;
  /** Writes validated rows. Idempotent on natural keys (see src/features/import/validate.ts). */
  commit(kind: ImportKind, rows: ImportRow[]): Promise<ImportSummary>;
}

export interface Repository {
  readonly mode: 'demo' | 'supabase';
  setContext(ctx: RequestContext | null): void;
  getContext(): RequestContext | null;

  auth: AuthRepo;
  me: MeRepo;
  org: OrgRepo;
  platform: PlatformRepo;
  children: ChildrenRepo;
  goals: GoalsRepo;
  appointments: AppointmentsRepo;
  sessions: SessionsRepo;
  checkins: CheckinsRepo;
  progress: ProgressRepo;
  homePractice: HomePracticeRepo;
  media: MediaRepo;
  resources: ResourcesRepo;
  messaging: MessagingRepo;
  notifications: NotificationsRepo;
  alerts: AlertsRepo;
  dashboards: DashboardsRepo;
  reports: ReportsRepo;
  imports: ImportsRepo;
}

/** Re-exported for convenience in feature code. */
export type { ISODateTime as Timestamp };
