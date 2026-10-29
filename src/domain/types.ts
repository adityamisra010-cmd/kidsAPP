/**
 * Domain model shared by the app, the Demo adapter and the Supabase adapter.
 *
 * Naming contract with the database: tables are snake_case plurals (see supabase/migrations),
 * columns are the snake_case form of these camelCase fields. Nested objects marked "jsonb" are
 * stored as a single jsonb column.
 */

export type UUID = string;
/** Calendar date, `yyyy-MM-dd` (local school date). */
export type ISODate = string;
/** Full timestamp, ISO 8601 with offset. */
export type ISODateTime = string;
/** Wall-clock time, `HH:mm`. */
export type ClockTime = string;

export type Language = 'en' | 'hi';

// ---------------------------------------------------------------------------
// Tenancy, people, roles
// ---------------------------------------------------------------------------

export type Role = 'platform_admin' | 'school_admin' | 'coordinator' | 'therapist' | 'parent';
export const STAFF_ROLES: Role[] = ['school_admin', 'coordinator', 'therapist'];
export const ADMIN_ROLES: Role[] = ['school_admin', 'coordinator'];

export type OrgStatus = 'active' | 'suspended';

export interface OrgSettings {
  /** Hours before an appointment to send reminders, e.g. [24, 1]. */
  reminderHoursBefore: number[];
  /** Therapist daily agenda push time. */
  dailyAgendaTime: ClockTime;
  quietHours: { start: ClockTime; end: ClockTime };
  videoRetentionDays: number;
  /** When false (default) parents see words + arrows, never the 0–100 score. */
  parentsSeeNumericScore: boolean;
  workingHours: { start: ClockTime; end: ClockTime; days: number[] /* 0=Sun..6=Sat */ };
  holidays: { date: ISODate; label: string }[];
  /** Morning check-in prompt for parents on session days. */
  checkinEnabled: boolean;
  /** Score drop vs rolling average (points) that raises an alert. */
  alertDropThreshold: number;
  /** Behaviour incidents in one session that raise an alert. */
  alertIncidentThreshold: number;
  /** Hours after which a session log is locked (amendments only). */
  logLockHours: number;
}

export interface Organization {
  id: UUID;
  name: string;
  shortName: string;
  city: string;
  address: string;
  phone: string;
  email?: string;
  logoUrl?: string;
  status: OrgStatus;
  settings: OrgSettings; // jsonb
  createdAt: ISODateTime;
}

export interface Branch {
  id: UUID;
  organizationId: UUID;
  name: string;
  address?: string;
}

export interface Profile {
  id: UUID; // = auth user id
  fullName: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  preferredLanguage: Language;
  /** Short title shown under staff names, e.g. "Speech Therapist". */
  title?: string;
}

export type MembershipStatus = 'active' | 'invited' | 'suspended';

export interface Membership {
  id: UUID;
  userId: UUID;
  /** null only for platform_admin. */
  organizationId: UUID | null;
  role: Role;
  status: MembershipStatus;
}

export interface Invite {
  id: UUID;
  organizationId: UUID;
  role: Role;
  fullName: string;
  phone?: string;
  email?: string;
  /** For parent invites: children to link on acceptance. */
  childIds: UUID[];
  relation?: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: ISODateTime;
  createdBy: UUID;
}

/** A person as shown in lists: profile + their role in the current school. */
export interface Member {
  profile: Profile;
  membership: Membership;
  /** Therapy type ids a therapist is qualified for. */
  therapyTypeIds: UUID[];
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

export interface TherapyType {
  id: UUID;
  organizationId: UUID;
  /** Stable key used by templates: speech | occupational | behaviour | special_ed | physio | audiology | custom */
  key: string;
  name: string;
  /** Muted marker colour (hex). */
  color: string;
  /** lucide icon name. */
  icon: string;
  active: boolean;
}

export type ChildStatus = 'active' | 'inactive';

export interface Child {
  id: UUID;
  organizationId: UUID;
  branchId?: UUID;
  fullName: string;
  /** What the child likes to be called. */
  preferredName?: string;
  dob: ISODate;
  gender?: 'male' | 'female' | 'other';
  photoUrl?: string;
  classGroup?: string;
  status: ChildStatus;
  createdAt: ISODateTime;
}

export type CommunicationMode = 'verbal' | 'limited_verbal' | 'non_verbal';

export interface ClinicalInfo {
  diagnosis: string[];
  medicalNotes: string;
  allergies: string;
  medications: string;
}

/** "About Me": the continuity backbone. */
export interface ChildProfile {
  childId: UUID;
  communicationMode: CommunicationMode;
  commTools: string[];
  commNotes: string;
  reinforcers: string[];
  reinforcersNotes: string;
  triggers: string[];
  triggersNotes: string;
  calming: string[];
  calmingNotes: string;
  sensoryNotes: string;
  dos: string[];
  donts: string[];
  /** Restricted: only admin/coordinator/assigned therapists. Omitted for everyone else. jsonb */
  clinical?: ClinicalInfo;
  updatedAt: ISODateTime;
  updatedBy?: UUID;
}

export interface ProfileEdit {
  id: UUID;
  childId: UUID;
  field: string;
  oldValue: string;
  newValue: string;
  by: UUID;
  byName: string;
  at: ISODateTime;
}

export interface ChildGuardian {
  childId: UUID;
  userId: UUID;
  relation: string; // Mother, Father, Grandparent, Guardian
  isPrimary: boolean;
}

export interface ChildTherapist {
  childId: UUID;
  userId: UUID;
  therapyTypeId: UUID;
  isLead: boolean;
  activeFrom: ISODate;
  activeTo?: ISODate;
}

/** What level of access the current user has to a child. */
export type ChildAccess = 'full' | 'brief_only' | 'parent' | 'none';

export interface ChildSummary {
  child: Child;
  therapists: { userId: UUID; name: string; therapyTypeId: UUID; isLead: boolean }[];
  guardians: { userId: UUID; name: string; relation: string; phone?: string }[];
  openAlerts: number;
  nextAppointment?: AppointmentView;
  /** Overall trend across last sessions (any therapy). */
  trend?: Trend;
}

export interface ChildDetail {
  child: Child;
  profile: ChildProfile;
  guardians: (ChildGuardian & { name: string; phone?: string })[];
  therapists: (ChildTherapist & { name: string; avatarUrl?: string })[];
  access: ChildAccess;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type GoalDomain =
  | 'communication'
  | 'fine_motor'
  | 'gross_motor'
  | 'self_care'
  | 'social'
  | 'behaviour'
  | 'cognition'
  | 'sensory';

export type GoalStatus =
  | 'not_started'
  | 'emerging'
  | 'progressing'
  | 'mastered'
  | 'maintenance'
  | 'paused';

/** Simplified status shown to parents. */
export type ParentGoalStatus = 'working_on_it' | 'getting_there' | 'achieved' | 'paused';

export interface MasteryRule {
  /** Accuracy % required, default 80. */
  accuracy: number;
  /** Consecutive sessions at or above accuracy, default 3. */
  consecutiveSessions: number;
}

export interface GoalBankItem {
  id: UUID;
  /** null = global (platform-provided). */
  organizationId: UUID | null;
  domain: GoalDomain;
  therapyTypeKey: string;
  staffText: string;
  parentText: string;
}

export interface Goal {
  id: UUID;
  organizationId: UUID;
  childId: UUID;
  therapyTypeId: UUID;
  domain: GoalDomain;
  staffText: string;
  parentText: string;
  baseline: string;
  masteryRule: MasteryRule; // jsonb
  status: GoalStatus;
  startDate: ISODate;
  masteredAt?: ISODateTime;
  createdBy: UUID;
  createdAt: ISODateTime;
}

/** Goal plus derived numbers for lists and the Handover Brief. */
export interface GoalWithStats extends Goal {
  lastAccuracy?: number;
  lastPromptLevel?: PromptLevel;
  sessionsTracked: number;
  /** True when the mastery rule is met but the therapist has not confirmed yet. */
  masterySuggested: boolean;
}

export interface GoalProgressPoint {
  date: ISODate;
  sessionId: UUID;
  accuracy: number;
  attempted: number;
  successful: number;
  promptLevel: PromptLevel;
}

// ---------------------------------------------------------------------------
// Calendar & appointments
// ---------------------------------------------------------------------------

export interface AppointmentSeries {
  id: UUID;
  organizationId: UUID;
  childId: UUID;
  therapistId: UUID;
  therapyTypeId: UUID;
  /** RFC 5545 rule without DTSTART, e.g. `FREQ=WEEKLY;BYDAY=MO,WE,FR`. */
  rrule: string;
  startTime: ClockTime;
  durationMinutes: number;
  startDate: ISODate;
  endDate: ISODate;
  room?: string;
  createdBy: UUID;
}

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

export type Attendance =
  | 'present'
  | 'late'
  | 'absent'
  | 'cancelled_by_school'
  | 'cancelled_by_parent';

export interface Appointment {
  id: UUID;
  organizationId: UUID;
  seriesId?: UUID;
  childId: UUID;
  therapistId: UUID;
  /** Set when a substitute replaces the regular therapist. */
  originalTherapistId?: UUID;
  therapyTypeId: UUID;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  room?: string;
  status: AppointmentStatus;
  attendance?: Attendance;
  lateMinutes?: number;
  /** For make-up sessions: the missed appointment. */
  makeupOfId?: UUID;
  /** True when moved from its original time via reschedule. */
  wasRescheduled: boolean;
  cancelReason?: string;
  createdAt: ISODateTime;
}

/** What the status chip says. */
export type AppointmentDisplayStatus =
  | 'confirmed'
  | 'rescheduled'
  | 'substitute'
  | 'cancelled'
  | 'completed'
  | 'absent'
  | 'makeup';

/** Session logging state from the therapist's point of view. */
export type LogState = 'upcoming' | 'in_progress' | 'logged' | 'not_logged' | 'not_applicable';

/** Appointment joined with names for display. */
export interface AppointmentView extends Appointment {
  childName: string;
  childPhotoUrl?: string;
  therapistName: string;
  therapistAvatarUrl?: string;
  originalTherapistName?: string;
  therapyTypeName: string;
  therapyTypeColor: string;
  therapyTypeIcon: string;
  displayStatus: AppointmentDisplayStatus;
  logState: LogState;
  sessionId?: UUID;
  isSubstitute: boolean;
  /** Current user must read the Handover Brief before logging. */
  briefRequired: boolean;
  briefAcknowledged: boolean;
  hasCheckin: boolean;
  pendingRescheduleRequestId?: UUID;
}

export interface Conflict {
  kind: 'therapist_double_booked' | 'child_double_booked' | 'therapist_unavailable' | 'holiday' | 'outside_hours';
  date: ISODate;
  message: string;
  appointmentId?: UUID;
}

export interface SeriesInput {
  childId: UUID;
  therapistId: UUID;
  therapyTypeId: UUID;
  /** 0=Sun..6=Sat */
  weekdays: number[];
  startTime: ClockTime;
  durationMinutes: number;
  startDate: ISODate;
  endDate: ISODate;
  room?: string;
}

export interface RescheduleRequest {
  id: UUID;
  organizationId: UUID;
  appointmentId: UUID;
  requestedBy: UUID;
  requestedByName: string;
  proposedSlots: ISODateTime[]; // jsonb, up to 2
  reason: string;
  status: 'pending' | 'approved' | 'declined' | 'countered';
  /** jsonb */
  resolution?: { chosenSlot?: ISODateTime; counterSlots?: ISODateTime[]; note?: string };
  resolvedBy?: UUID;
  resolvedAt?: ISODateTime;
  createdAt: ISODateTime;
}

export interface TherapistUnavailability {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  from: ISODate;
  to: ISODate;
  reason: string;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Sessions (the heart of the app)
// ---------------------------------------------------------------------------

export type RatingValue = 1 | 2 | 3 | 4 | 5;
/** 1 Full physical · 2 Partial physical · 3 Model/gestural · 4 Verbal · 5 Independent */
export type PromptLevel = 1 | 2 | 3 | 4 | 5;
export type RegulationState = 'under' | 'regulated' | 'over';
export type ComparedToLast = 'much_worse' | 'worse' | 'same' | 'better' | 'much_better';
export type Trend = 'up' | 'flat' | 'down';

export interface RatingDimension {
  id: UUID;
  /** null = platform default template. */
  organizationId: UUID | null;
  key: string; // engagement, attention, regulation, mood, cooperation, independence, communication, transitions
  label: string;
  /** Short parent-friendly label, e.g. "Focus". */
  parentLabel: string;
  description: string;
  /** Behavioural anchor for each value 1..5. jsonb */
  anchors: Record<RatingValue, string>;
  weight: number;
  enabled: boolean;
  sortOrder: number;
  /** lucide icon name used in parent cards. */
  icon: string;
}

export interface GoalTrial {
  goalId: UUID;
  attempted: number;
  successful: number;
  promptLevel: PromptLevel;
  note?: string;
}

export type IncidentType = 'meltdown' | 'aggression' | 'self_injury' | 'elopement' | 'refusal' | 'other';

export interface BehaviourIncident {
  type: IncidentType;
  durationSeconds?: number;
  antecedentTags: string[];
}

export interface SessionNotes {
  subjective: string;
  objective: string;
  assessment: string;
  /** "P": plan for next session. Required. Feeds the next Handover Brief. */
  planNext: string;
  planGoalIds: UUID[];
  /** Plain-language text visible to parents. */
  parentSummary: string;
}

/** What the therapist submits from the Session Logger. */
export interface SessionInput {
  /** Client-generated id so offline retries are idempotent. */
  clientId: UUID;
  appointmentId: UUID;
  actualMinutes: number;
  startedLate: boolean;
  regulationState: RegulationState;
  /** dimensionKey → 1..5 */
  ratings: Record<string, RatingValue>;
  goalTrials: GoalTrial[];
  incidents: BehaviourIncident[];
  breaksCount: number;
  comparedToLast: ComparedToLast;
  workedTags: string[];
  workedText: string;
  notWorkedTags: string[];
  notWorkedText: string;
  notes: SessionNotes;
}

export interface DimensionDelta {
  value: number;
  deltaLast?: number;
  deltaRolling?: number;
  trend: Trend;
}

/** Denormalised metrics computed on save (single source: domain/metrics.ts mirrored in SQL). */
export interface SessionMetrics {
  sessionScore: number; // 0..100
  goalAccuracy?: number; // 0..100
  deltaLast?: number;
  deltaRolling?: number;
  rollingAverage?: number;
  trend: Trend;
  dimensions: Record<string, DimensionDelta>;
  incidentCount: number;
}

export interface SessionLog extends Omit<SessionInput, 'clientId'> {
  id: UUID;
  organizationId: UUID;
  childId: UUID;
  therapistId: UUID;
  therapistName: string;
  therapyTypeId: UUID;
  isSubstitute: boolean;
  date: ISODate;
  metrics: SessionMetrics;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** After this the log can only be amended. */
  lockedAt: ISODateTime;
  amendmentCount: number;
}

/** Compact row for lists and sparklines. */
export interface SessionSummary {
  id: UUID;
  appointmentId: UUID;
  childId: UUID;
  date: ISODate;
  therapyTypeId: UUID;
  therapyTypeName: string;
  therapyTypeColor: string;
  therapistName: string;
  isSubstitute: boolean;
  sessionScore: number;
  goalAccuracy?: number;
  deltaLast?: number;
  deltaRolling?: number;
  trend: Trend;
  ratings: Record<string, RatingValue>;
  incidentCount: number;
  comparedToLast: ComparedToLast;
  parentSummary: string;
}

/** What a parent sees for one session. Never contains internal notes. */
export interface ParentSessionSnapshot {
  sessionId: UUID;
  date: ISODate;
  therapyTypeName: string;
  therapyTypeColor: string;
  /** Stable therapy type key (speech, occupational, …) for icons and i18n. */
  therapyTypeKey: string;
  therapistName: string;
  isSubstitute: boolean;
  /** 3–4 highlighted dimensions in words. */
  highlights: { key: string; label: string; icon: string; value: RatingValue; change: 'better' | 'same' | 'harder' }[];
  overall: 'better' | 'same' | 'harder';
  /** Only when the school enables numeric scores for parents. */
  sessionScore?: number;
  parentSummary: string;
  goalsWorkedOn: { goalId: UUID; parentText: string }[];
}

export interface Amendment {
  id: UUID;
  entity: 'session' | 'session_notes' | 'goal_trial';
  entityId: UUID;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  by: UUID;
  byName: string;
  at: ISODateTime;
}

export interface ParentCheckin {
  id: UUID;
  organizationId: UUID;
  childId: UUID;
  appointmentId?: UUID;
  date: ISODate;
  sleep: 'good' | 'ok' | 'poor';
  ateBreakfast: boolean;
  mood: 'happy' | 'okay' | 'upset';
  changeFlag: boolean;
  changeNote: string;
  submittedBy: UUID;
  createdAt: ISODateTime;
}

export type CheckinInput = Omit<ParentCheckin, 'id' | 'organizationId' | 'submittedBy' | 'createdAt'> & {
  clientId: UUID;
};

/** One-screen brief for a therapist before a session. */
export interface HandoverBrief {
  appointment: AppointmentView;
  child: Child;
  ageLabel: string;
  profile: ChildProfile;
  /** P from the previous session of this therapy type. */
  planForToday?: { text: string; goalIds: UUID[]; byName: string; date: ISODate };
  goals: GoalWithStats[];
  recentSessions: SessionSummary[]; // last 3, newest first
  whatWorked: string[]; // deduplicated chips from last 3
  whatDidnt: string[];
  todaysCheckin?: ParentCheckin;
  openHomeTasks: HomeTask[];
  latestParentFeedback?: HomeLog;
  activeAlerts: Alert[];
  /** Viewer's access to the child ('brief_only' for substitutes outside their caseload). */
  access: ChildAccess;
  mustAcknowledge: boolean;
  acknowledged: boolean;
}

// ---------------------------------------------------------------------------
// Progress views
// ---------------------------------------------------------------------------

export interface StaffProgress {
  childId: UUID;
  therapyTypeId?: UUID;
  sessions: SessionSummary[]; // oldest → newest within range
  latest?: SessionSummary;
  /** Average rating per dimension over the 4 sessions before latest. */
  fourSessionAverage: Record<string, number>;
  goals: (GoalWithStats & { points: GoalProgressPoint[] })[];
  attendance: AttendanceSummary;
  incidentsByWeek: { weekStart: ISODate; count: number }[];
  substituteImpact?: { regularAvg: number; substituteAvg: number; substituteCount: number };
}

export interface AttendanceSummary {
  scheduled: number;
  attended: number;
  late: number;
  absent: number;
  cancelledBySchool: number;
  cancelledByParent: number;
}

export type ProgressPeriod = 'week' | 'month' | 'quarter';

export interface ParentProgress {
  childId: UUID;
  period: ProgressPeriod;
  byTherapy: {
    therapyTypeId: UUID;
    therapyTypeName: string;
    therapyTypeColor: string;
    /** Per dimension: words + arrow over last 4 sessions. */
    dimensions: { key: string; label: string; icon: string; trend: Trend; recent: number[] }[];
    sessionsCount: number;
  }[];
  goalsSummary: { domain: GoalDomain; achieved: number; inProgress: number }[];
  attendance: AttendanceSummary;
  homePracticeCompletion: number; // 0..100
}

// ---------------------------------------------------------------------------
// Home practice
// ---------------------------------------------------------------------------

export interface HomeTask {
  id: UUID;
  organizationId: UUID;
  childId: UUID;
  goalId?: UUID;
  assignedBy: UUID;
  assignedByName: string;
  title: string;
  steps: string[]; // jsonb
  frequencyPerWeek: number;
  durationMinutes: number;
  resourceId?: UUID;
  demoMediaId?: UUID;
  activeFrom: ISODate;
  activeTo: ISODate;
  status: 'active' | 'completed' | 'archived';
  createdAt: ISODateTime;
}

export type HomeTaskInput = Pick<
  HomeTask,
  'childId' | 'goalId' | 'title' | 'steps' | 'frequencyPerWeek' | 'durationMinutes' | 'resourceId' | 'demoMediaId' | 'activeFrom' | 'activeTo'
>;

export type HomeLogOutcome = 'done' | 'partly' | 'could_not';
export type HomeLogDifficulty = 'easy' | 'ok' | 'hard';
export type ReviewReaction = 'great_job' | 'good_effort' | 'try_next_time' | 'lets_discuss';

export interface HomeLog {
  id: UUID;
  organizationId: UUID;
  taskId: UUID;
  taskTitle: string;
  childId: UUID;
  childName: string;
  loggedBy: UUID;
  loggedByName: string;
  outcome: HomeLogOutcome;
  difficulty: HomeLogDifficulty;
  note: string;
  mediaId?: UUID;
  createdAt: ISODateTime;
  reviewedBy?: UUID;
  reviewedByName?: string;
  reviewReaction?: ReviewReaction;
  reviewComment?: string;
  reviewedAt?: ISODateTime;
  /** Therapist flagged the video to use in the next session (shows in the brief). */
  useInNextSession: boolean;
}

export interface HomeLogInput {
  clientId: UUID;
  taskId: UUID;
  outcome: HomeLogOutcome;
  difficulty: HomeLogDifficulty;
  note: string;
  /** Local file to upload (already compressed). */
  video?: { localUri: string; durationS: number; sizeBytes: number };
}

export interface WeeklyCompletion {
  childId: UUID;
  weekStart: ISODate;
  expected: number;
  done: number;
  partly: number;
  percent: number; // 0..100
}

export type MediaKind = 'video' | 'image' | 'pdf' | 'other';
export type UploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

export interface Media {
  id: UUID;
  organizationId: UUID;
  ownerId: UUID;
  bucketPath: string;
  kind: MediaKind;
  durationS?: number;
  sizeBytes: number;
  expiresAt?: ISODateTime;
  /** Local file while the upload is pending (device only). */
  localUri?: string;
  uploadStatus: UploadStatus;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export type ResourceKind = 'pdf' | 'image' | 'video' | 'link';
export type ResourceAudience = 'staff' | 'parents' | 'all';

export interface Resource {
  id: UUID;
  /** null = global (platform-provided). */
  organizationId: UUID | null;
  title: string;
  description: string;
  kind: ResourceKind;
  url: string;
  tags: string[];
  therapyTypeKeys: string[];
  domains: GoalDomain[];
  ageBand?: '0-3' | '3-6' | '6-10' | '10+';
  audience: ResourceAudience;
  createdAt: ISODateTime;
}

export interface ResourceShare {
  id: UUID;
  resourceId: UUID;
  childId?: UUID;
  userId?: UUID;
  sharedBy: UUID;
  sharedByName: string;
  note?: string;
  at: ISODateTime;
}

// ---------------------------------------------------------------------------
// Messaging, announcements, notifications, alerts
// ---------------------------------------------------------------------------

export type ThreadKind = 'care_team' | 'staff_only' | 'direct';

export interface Thread {
  id: UUID;
  organizationId: UUID;
  childId?: UUID;
  kind: ThreadKind;
  title: string;
  createdAt: ISODateTime;
}

export interface Attachment {
  kind: MediaKind;
  name: string;
  url: string;
  mediaId?: UUID;
}

export interface Message {
  id: UUID;
  threadId: UUID;
  senderId: UUID;
  senderName: string;
  senderRole: Role;
  body: string;
  attachments: Attachment[]; // jsonb
  createdAt: ISODateTime;
  /** Names of members who have read up to this message (care-team read receipts). */
  readBy: string[];
}

export interface ThreadSummary extends Thread {
  childName?: string;
  childPhotoUrl?: string;
  memberNames: string[];
  lastMessage?: Pick<Message, 'body' | 'senderName' | 'createdAt'>;
  unreadCount: number;
}

export type AnnouncementAudience = 'everyone' | 'all_parents' | 'all_staff' | 'therapy_type';

export interface Announcement {
  id: UUID;
  organizationId: UUID;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  /** When audience = therapy_type. */
  therapyTypeId?: UUID;
  urgent: boolean;
  createdBy: UUID;
  createdByName: string;
  createdAt: ISODateTime;
}

export type AlertKind = 'score_drop' | 'incident_spike' | 'unlogged_session' | 'declining_trend';

export interface Alert {
  id: UUID;
  organizationId: UUID;
  childId: UUID;
  childName: string;
  kind: AlertKind;
  /** jsonb, e.g. { sessionIds, drop, therapyTypeId } */
  payload: Record<string, unknown>;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt: ISODateTime;
  resolvedBy?: UUID;
  resolvedAt?: ISODateTime;
}

export type NotificationKind =
  | 'appointment_reminder'
  | 'appointment_changed'
  | 'substitute_assigned'
  | 'reschedule_request'
  | 'reschedule_response'
  | 'session_summary'
  | 'home_task_assigned'
  | 'home_log_submitted'
  | 'home_log_feedback'
  | 'unlogged_session'
  | 'child_alert'
  | 'new_message'
  | 'announcement'
  | 'daily_agenda';

/** Schedule changes can never be muted. */
export const UNMUTABLE_NOTIFICATION_KINDS: NotificationKind[] = [
  'appointment_changed',
  'substitute_assigned',
  'reschedule_response',
];

export interface AppNotification {
  id: UUID;
  userId: UUID;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Route to open when tapped, e.g. `/appointment/123`. */
  route?: string;
  readAt?: ISODateTime;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Consent, privacy, audit
// ---------------------------------------------------------------------------

export type ConsentKind = 'data_processing' | 'video_upload';

export interface Consent {
  id: UUID;
  userId: UUID;
  childId?: UUID;
  kind: ConsentKind;
  granted: boolean;
  at: ISODateTime;
  version: string;
}

export interface DataRequest {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  userName: string;
  childId: UUID;
  childName: string;
  kind: 'export' | 'deletion';
  status: 'open' | 'in_progress' | 'done';
  createdAt: ISODateTime;
}

export interface AuditEntry {
  id: UUID;
  organizationId: UUID;
  actorId: UUID;
  actorName: string;
  action: string;
  entity: string;
  entityId: UUID;
  at: ISODateTime;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Dashboards & reports
// ---------------------------------------------------------------------------

export interface TherapistToday {
  date: ISODate;
  appointments: AppointmentView[];
  pendingReviews: number;
  unreadMessages: number;
  unloggedCount: number;
}

export interface AdminDashboard {
  date: ISODate;
  today: { scheduled: number; completed: number; logged: number; unlogged: number; cancelled: number };
  week: {
    attendanceRate: number; // 0..100
    homePracticeRate: number; // 0..100
    loggingCompliance: { therapistId: UUID; name: string; logged: number; due: number; percent: number }[];
  };
  childrenNeedingAttention: { child: Child; reason: string; alertId?: UUID; trend?: Trend }[];
  unloggedSessions: AppointmentView[];
  upcomingSubstitutions: AppointmentView[];
  needsSubstitute: AppointmentView[];
  pendingReschedules: (RescheduleRequest & { appointment: AppointmentView })[];
  workload: { therapistId: UUID; name: string; sessionsThisWeek: number }[];
}

export interface SchoolSummary {
  organization: Organization;
  activeChildren: number;
  staffCount: number;
  sessionsThisMonth: number;
  activeParentsPercent: number;
  lastActivityAt?: ISODateTime;
}

export interface ChildReportData {
  organization: Organization;
  child: Child;
  ageLabel: string;
  range: { from: ISODate; to: ISODate };
  audience: 'staff' | 'parent';
  attendance: AttendanceSummary;
  byTherapy: {
    therapyTypeName: string;
    therapyTypeColor: string;
    sessions: SessionSummary[];
    averageScore?: number;
    trend: Trend;
  }[];
  goals: GoalWithStats[];
  wins: Goal[];
  homePracticeCompletion: number;
  therapistSummary: string;
  generatedAt: ISODateTime;
}

export interface ExportRow {
  [column: string]: string | number | boolean | null;
}

// ---------------------------------------------------------------------------
// CSV / XLSX import
// ---------------------------------------------------------------------------

export type ImportKind = 'children' | 'staff' | 'parents' | 'schedule';

/** A validated row ready to write. Values are keyed by template column key. */
export interface ImportRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ImportSummary {
  kind: ImportKind;
  created: number;
  updated: number;
  skipped: number;
  errors: { rowNumber: number; message: string }[];
}

/** Lookups the validator needs (names → ids) to resolve references. */
export interface ImportContext {
  therapists: { id: UUID; name: string; phone?: string }[];
  children: { id: UUID; fullName: string; dob: ISODate }[];
  therapyTypes: { id: UUID; name: string; key: string }[];
  parents: { id: UUID; name: string; phone?: string }[];
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  profile: Profile;
  memberships: Membership[];
  organizations: Organization[];
  /** For parents: linked child ids. */
  childIds: UUID[];
  /** Demo persona key when signed in via "Try demo". */
  demoPersona?: DemoPersonaKey;
}

export type DemoPersonaKey = 'parent' | 'therapist' | 'coordinator' | 'school_admin' | 'platform_admin';

/** Active context the adapters scope every call by. */
export interface RequestContext {
  userId: UUID;
  role: Role;
  organizationId: UUID | null;
}
