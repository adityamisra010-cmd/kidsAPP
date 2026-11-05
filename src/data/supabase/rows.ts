/**
 * Generated-style row interfaces for the tables and RPC payloads the Supabase adapter reads.
 * Table rows mirror supabase/migrations/*_schema.sql (snake_case, nullable columns as `| null`).
 * RPC results are camelCase jsonb built by the migrations (see *_metrics.sql / *_rpc.sql).
 *
 * Only the columns the adapter selects are listed as required; audit columns that are never
 * read are omitted. Keep in sync with the migrations when columns change.
 */
import type {
  AlertKind,
  AnnouncementAudience,
  Attendance,
  AppointmentStatus,
  ChildStatus,
  CommunicationMode,
  ComparedToLast,
  ConsentKind,
  DataRequest,
  GoalDomain,
  GoalStatus,
  HomeLogDifficulty,
  HomeLogOutcome,
  HomeTask,
  IncidentType,
  Language,
  MasteryRule,
  MediaKind,
  MembershipStatus,
  NotificationKind,
  OrgSettings,
  OrgStatus,
  ParentGoalStatus,
  RegulationState,
  RescheduleRequest,
  ResourceAudience,
  ResourceKind,
  ReviewReaction,
  Role,
  SessionMetrics,
  ThreadKind,
  Trend,
  UploadStatus,
} from '@/domain/types';

type Ts = string; // timestamptz, ISO 8601 with offset
type DateStr = string; // date, yyyy-MM-dd
type Id = string;

// ---------------------------------------------------------------------------
// Tenancy & people
// ---------------------------------------------------------------------------
export interface OrganizationRow {
  id: Id;
  name: string;
  short_name: string;
  city: string;
  address: string;
  phone: string;
  email: string | null;
  logo_url: string | null;
  status: OrgStatus;
  settings: Partial<OrgSettings> | null;
  created_at: Ts;
}

export interface ProfileRow {
  id: Id;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  preferred_language: Language;
  title: string | null;
}

export interface MembershipRow {
  id: Id;
  user_id: Id;
  organization_id: Id | null;
  role: Role;
  status: MembershipStatus;
}

export interface InviteRow {
  id: Id;
  organization_id: Id;
  role: Role;
  full_name: string;
  phone: string | null;
  email: string | null;
  child_ids: Id[] | null;
  relation: string | null;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: Ts;
  created_by: Id | null;
}

export interface TherapyTypeRow {
  id: Id;
  organization_id: Id;
  key: string;
  name: string;
  color: string;
  icon: string;
  active: boolean;
}

export interface MemberTherapyTypeRow {
  user_id: Id;
  therapy_type_id: Id;
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------
export interface ChildRow {
  id: Id;
  organization_id: Id;
  branch_id: Id | null;
  full_name: string;
  preferred_name: string | null;
  dob: DateStr;
  gender: 'male' | 'female' | 'other' | null;
  photo_url: string | null;
  class_group: string | null;
  status: ChildStatus;
  created_at: Ts;
}

export interface ChildProfileRow {
  child_id: Id;
  communication_mode: CommunicationMode;
  comm_tools: string[] | null;
  comm_notes: string | null;
  reinforcers: string[] | null;
  reinforcers_notes: string | null;
  triggers: string[] | null;
  triggers_notes: string | null;
  calming: string[] | null;
  calming_notes: string | null;
  sensory_notes: string | null;
  dos: string[] | null;
  donts: string[] | null;
  updated_at: Ts;
  updated_by: Id | null;
}

export interface ChildClinicalRow {
  child_id: Id;
  diagnosis: string[] | null;
  medical_notes: string | null;
  allergies: string | null;
  medications: string | null;
}

export interface ProfileEditRow {
  id: Id;
  child_id: Id;
  field: string;
  old_value: string;
  new_value: string;
  by: Id | null;
  at: Ts;
}

export interface ChildGuardianRow {
  child_id: Id;
  user_id: Id;
  relation: string;
  is_primary: boolean;
}

export interface ChildTherapistRow {
  child_id: Id;
  user_id: Id;
  therapy_type_id: Id;
  is_lead: boolean;
  active_from: DateStr;
  active_to: DateStr | null;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
export interface GoalBankRow {
  id: Id;
  organization_id: Id | null;
  domain: GoalDomain;
  therapy_type_key: string;
  staff_text: string;
  parent_text: string;
}

export interface GoalRow {
  id: Id;
  organization_id: Id;
  child_id: Id;
  therapy_type_id: Id;
  domain: GoalDomain;
  staff_text: string;
  parent_text: string;
  baseline: string;
  mastery_rule: Partial<MasteryRule> | null;
  status: GoalStatus;
  start_date: DateStr;
  mastered_at: Ts | null;
  created_at: Ts;
  created_by: Id | null;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
export interface AppointmentSeriesRow {
  id: Id;
  organization_id: Id;
  child_id: Id;
  therapist_id: Id;
  therapy_type_id: Id;
  rrule: string;
  start_time: string; // HH:mm:ss
  duration_minutes: number;
  start_date: DateStr;
  end_date: DateStr;
  room: string | null;
  created_by: Id | null;
}

export interface AppointmentRow {
  id: Id;
  organization_id: Id;
  series_id: Id | null;
  child_id: Id;
  therapist_id: Id;
  original_therapist_id: Id | null;
  therapy_type_id: Id;
  starts_at: Ts;
  ends_at: Ts;
  room: string | null;
  status: AppointmentStatus;
  attendance: Attendance | null;
  late_minutes: number | null;
  makeup_of_id: Id | null;
  was_rescheduled: boolean;
  cancel_reason: string | null;
  created_at: Ts;
}

/** `appointments` selected with the joins used for AppointmentView. */
export interface AppointmentJoinedRow extends AppointmentRow {
  child: Pick<ChildRow, 'full_name' | 'preferred_name' | 'photo_url'> | null;
  therapy_type: Pick<TherapyTypeRow, 'name' | 'color' | 'icon' | 'key'> | null;
  therapist: Pick<ProfileRow, 'full_name' | 'avatar_url'> | null;
  original_therapist: Pick<ProfileRow, 'full_name'> | null;
}

export interface RescheduleRequestRow {
  id: Id;
  organization_id: Id;
  appointment_id: Id;
  requested_by: Id;
  proposed_slots: string[] | null;
  reason: string;
  status: RescheduleRequest['status'];
  resolution: RescheduleRequest['resolution'] | null;
  resolved_by: Id | null;
  resolved_at: Ts | null;
  created_at: Ts;
}

export interface TherapistUnavailabilityRow {
  id: Id;
  organization_id: Id;
  user_id: Id;
  from: DateStr;
  to: DateStr;
  reason: string;
  created_at: Ts;
}

export interface BriefAckRow {
  appointment_id: Id;
  user_id: Id;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export interface RatingDimensionRow {
  id: Id;
  organization_id: Id | null;
  key: string;
  label: string;
  parent_label: string;
  description: string;
  anchors: Record<string, string> | null;
  weight: number | string;
  enabled: boolean;
  sort_order: number;
  icon: string;
}

export interface SessionRow {
  id: Id;
  organization_id: Id;
  client_id: Id | null;
  appointment_id: Id;
  child_id: Id;
  therapist_id: Id;
  therapy_type_id: Id;
  is_substitute: boolean;
  date: DateStr;
  actual_minutes: number;
  started_late: boolean;
  regulation_state: RegulationState;
  breaks_count: number;
  compared_to_last: ComparedToLast;
  worked_tags: string[] | null;
  worked_text: string;
  not_worked_tags: string[] | null;
  not_worked_text: string;
  session_score: number | string | null;
  goal_accuracy: number | string | null;
  delta_last: number | string | null;
  delta_rolling: number | string | null;
  rolling_average: number | string | null;
  trend: Trend;
  dimension_metrics: SessionMetrics['dimensions'] | null;
  incident_count: number;
  locked_at: Ts;
  amendment_count: number;
  created_at: Ts;
  updated_at: Ts;
}

/** `sessions` selected with therapy type + therapist names (SessionSummary lists). */
export interface SessionJoinedRow extends SessionRow {
  therapy_type: Pick<TherapyTypeRow, 'name' | 'color' | 'key'> | null;
  therapist: Pick<ProfileRow, 'full_name'> | null;
}

export interface SessionRatingRow {
  session_id: Id;
  dimension_key: string;
  value: number;
}

export interface GoalTrialRow {
  session_id: Id;
  goal_id: Id;
  attempted: number;
  successful: number;
  prompt_level: number;
  note: string | null;
}

/** goal_trials with the session date and appointment start (for ordering / progress points). */
export interface GoalTrialWithSessionRow extends GoalTrialRow {
  session: { date: DateStr; appointment: { starts_at: Ts } | null } | null;
}

export interface BehaviourIncidentRow {
  session_id: Id;
  type: IncidentType;
  duration_seconds: number | null;
  antecedent_tags: string[] | null;
  created_at: Ts;
}

export interface SessionNotesRow {
  session_id: Id;
  subjective: string;
  objective: string;
  assessment: string;
  plan_next: string;
  plan_goal_ids: Id[] | null;
  parent_summary: string;
}

export interface AmendmentRow {
  id: Id;
  session_id: Id;
  entity: 'session' | 'session_notes' | 'goal_trial';
  entity_id: Id;
  field: string;
  old_value: string;
  new_value: string;
  reason: string;
  by: Id | null;
  at: Ts;
}

export interface ParentCheckinRow {
  id: Id;
  organization_id: Id;
  child_id: Id;
  appointment_id: Id | null;
  date: DateStr;
  sleep: 'good' | 'ok' | 'poor';
  ate_breakfast: boolean;
  mood: 'happy' | 'okay' | 'upset';
  change_flag: boolean;
  change_note: string;
  submitted_by: Id;
  created_at: Ts;
}

// ---------------------------------------------------------------------------
// Media, resources, home practice
// ---------------------------------------------------------------------------
export interface MediaRow {
  id: Id;
  organization_id: Id;
  owner_id: Id;
  child_id: Id | null;
  bucket_path: string;
  kind: MediaKind;
  mime_type: string | null;
  duration_s: number | string | null;
  size_bytes: number | string;
  expires_at: Ts | null;
  upload_status: UploadStatus;
  created_at: Ts;
}

export interface ResourceRow {
  id: Id;
  organization_id: Id | null;
  title: string;
  description: string;
  kind: ResourceKind;
  url: string;
  tags: string[] | null;
  therapy_type_keys: string[] | null;
  domains: GoalDomain[] | null;
  age_band: '0-3' | '3-6' | '6-10' | '10+' | null;
  audience: ResourceAudience;
  created_at: Ts;
}

export interface ResourceShareRow {
  id: Id;
  resource_id: Id;
  child_id: Id | null;
  user_id: Id | null;
  shared_by: Id;
  note: string | null;
  at: Ts;
}

export interface HomeTaskRow {
  id: Id;
  organization_id: Id;
  child_id: Id;
  goal_id: Id | null;
  assigned_by: Id;
  title: string;
  steps: string[] | null;
  frequency_per_week: number;
  duration_minutes: number;
  resource_id: Id | null;
  demo_media_id: Id | null;
  active_from: DateStr;
  active_to: DateStr;
  status: HomeTask['status'];
  created_at: Ts;
}

export interface HomeLogRow {
  id: Id;
  organization_id: Id;
  client_id: Id | null;
  task_id: Id;
  child_id: Id;
  logged_by: Id;
  outcome: HomeLogOutcome;
  difficulty: HomeLogDifficulty;
  note: string;
  media_id: Id | null;
  reviewed_by: Id | null;
  review_reaction: ReviewReaction | null;
  review_comment: string | null;
  reviewed_at: Ts | null;
  use_in_next_session: boolean;
  created_at: Ts;
}

// ---------------------------------------------------------------------------
// Messaging, notifications, alerts
// ---------------------------------------------------------------------------
export interface ThreadRow {
  id: Id;
  organization_id: Id;
  child_id: Id | null;
  kind: ThreadKind;
  title: string;
  created_at: Ts;
}

export interface ThreadMemberRow {
  thread_id: Id;
  user_id: Id;
}

export interface MessageRow {
  id: Id;
  thread_id: Id;
  sender_id: Id;
  body: string;
  attachments: unknown[] | null;
  created_at: Ts;
}

export interface MessageReadRow {
  thread_id: Id;
  user_id: Id;
  last_read_at: Ts;
}

export interface AnnouncementRow {
  id: Id;
  organization_id: Id;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  therapy_type_id: Id | null;
  urgent: boolean;
  created_by: Id | null;
  created_at: Ts;
}

export interface AlertRow {
  id: Id;
  organization_id: Id;
  child_id: Id;
  kind: AlertKind;
  payload: Record<string, unknown> | null;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  resolved_by: Id | null;
  resolved_at: Ts | null;
  created_at: Ts;
}

export interface NotificationRow {
  id: Id;
  user_id: Id;
  kind: NotificationKind;
  title: string;
  body: string;
  route: string | null;
  read_at: Ts | null;
  created_at: Ts;
}

export interface ConsentRow {
  id: Id;
  user_id: Id;
  child_id: Id | null;
  kind: ConsentKind;
  granted: boolean;
  at: Ts;
  version: string;
}

export interface DataRequestRow {
  id: Id;
  organization_id: Id;
  user_id: Id;
  child_id: Id;
  kind: DataRequest['kind'];
  status: DataRequest['status'];
  created_at: Ts;
}

export interface AuditLogRow {
  id: Id;
  organization_id: Id | null;
  actor_id: Id | null;
  action: string;
  entity: string;
  entity_id: Id | null;
  at: Ts;
  meta: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// RPC results (camelCase jsonb)
// ---------------------------------------------------------------------------
export interface AcceptInvitesResult {
  accepted: number;
  organizationIds: Id[];
}

/** app.camel_keys(to_jsonb(row)) of an organizations row. */
export interface OrganizationJson {
  id: Id;
  name: string;
  shortName: string;
  city: string;
  address: string;
  phone: string;
  email: string | null;
  logoUrl: string | null;
  status: OrgStatus;
  settings: Partial<OrgSettings> | null;
  createdAt: Ts;
}

export interface InviteJson {
  id: Id;
  organizationId: Id;
  role: Role;
  fullName: string;
  phone: string | null;
  email: string | null;
  childIds: Id[] | null;
  relation: string | null;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: Ts;
  createdBy: Id | null;
}

export interface CreateSchoolResult {
  organization: OrganizationJson;
  invite: InviteJson;
}

export interface SaveSessionResult {
  sessionId: Id;
  appointmentId: Id;
  created: boolean;
  date: DateStr;
  isSubstitute: boolean;
  lockedAt: Ts;
  amendmentCount: number;
  metrics: SessionMetrics;
  alertsRaised: string[];
  masterySuggestedGoalIds: Id[];
}

export interface RescheduleJson {
  id: Id;
  organizationId: Id;
  appointmentId: Id;
  requestedBy: Id;
  requestedByName: string | null;
  proposedSlots: string[] | null;
  reason: string;
  status: RescheduleRequest['status'];
  resolution: RescheduleRequest['resolution'] | null;
  resolvedBy: Id | null;
  resolvedAt: Ts | null;
  createdAt: Ts;
}

export interface ParentSnapshotJson {
  sessionId: Id;
  childId: Id;
  date: DateStr;
  therapyTypeId: Id;
  therapyTypeName: string;
  therapyTypeColor: string;
  therapistName: string;
  isSubstitute: boolean;
  highlights: { key: string; label: string; icon: string; value: number; change: 'better' | 'same' | 'harder' }[] | null;
  overall: 'better' | 'same' | 'harder';
  sessionScore?: number;
  parentSummary: string | null;
  goalsWorkedOn: { goalId: Id; parentText: string }[] | null;
}

export interface ParentGoalJson {
  id: Id;
  childId: Id;
  therapyTypeId: Id;
  therapyTypeName: string;
  therapyTypeColor: string;
  domain: GoalDomain;
  parentText: string;
  status: GoalStatus;
  parentStatus: ParentGoalStatus;
  startDate: DateStr;
  masteredAt?: Ts;
}

export interface ParentProgressJson {
  childId: Id;
  since: DateStr;
  byTherapy: {
    therapyTypeId: Id;
    therapyTypeName: string;
    therapyTypeColor: string;
    sessionsCount: number;
    dimensions: { key: string; label: string; icon: string; trend: Trend; recent: number[] | null }[] | null;
  }[];
  goalsSummary: { domain: GoalDomain; achieved: number; inProgress: number }[];
}

/** Keys of app.camel_keys(to_jsonb(goals row)) plus the stats added by goal_with_stats_json. */
export interface GoalWithStatsJson {
  id: Id;
  organizationId: Id;
  childId: Id;
  therapyTypeId: Id;
  domain: GoalDomain;
  staffText: string;
  parentText: string;
  baseline: string;
  masteryRule: Partial<MasteryRule> | null;
  status: GoalStatus;
  startDate: DateStr;
  masteredAt: Ts | null;
  createdAt: Ts;
  createdBy: Id | null;
  lastAccuracy?: number;
  lastPromptLevel?: number;
  sessionsTracked?: number;
  masterySuggested?: boolean;
}

export interface SessionSummaryJson {
  id: Id;
  appointmentId: Id;
  childId: Id;
  date: DateStr;
  therapyTypeId: Id;
  therapyTypeName: string;
  therapyTypeColor: string;
  therapistName: string;
  isSubstitute: boolean;
  sessionScore?: number;
  goalAccuracy?: number;
  deltaLast?: number;
  deltaRolling?: number;
  trend: Trend;
  ratings: Record<string, number> | null;
  incidentCount: number;
  comparedToLast: ComparedToLast;
  parentSummary: string | null;
}

/** Generic camel-cased row (handover brief parts). Values are read through the mappers. */
export type CamelRow = Record<string, unknown>;

export interface HandoverBriefJson {
  appointment: CamelRow;
  child: CamelRow;
  profile: CamelRow;
  planForToday: { text: string; goalIds: Id[] | null; byName: string; date: DateStr } | null;
  goals: GoalWithStatsJson[];
  recentSessions: SessionSummaryJson[];
  whatWorked: string[];
  whatDidnt: string[];
  todaysCheckin: CamelRow | null;
  openHomeTasks: CamelRow[];
  latestParentFeedback: CamelRow | null;
  activeAlerts: CamelRow[];
  mustAcknowledge: boolean;
  acknowledged: boolean;
}

export interface AdminDashboardJson {
  date: DateStr;
  today: { scheduled: number; completed: number; logged: number; unlogged: number; cancelled: number };
  week: {
    weekStart: DateStr;
    attendanceRate: number;
    homePracticeRate: number;
    loggingCompliance: { therapistId: Id; name: string; logged: number; due: number; percent: number }[];
  };
  childrenNeedingAttention: { childId: Id; childName: string; reason: string; alertId?: Id; kind?: AlertKind; trend?: Trend }[];
  unloggedAppointmentIds: Id[];
  upcomingSubstitutionIds: Id[];
  needsSubstituteIds: Id[];
  pendingRescheduleIds: Id[];
  workload: { therapistId: Id; name: string; sessionsThisWeek: number }[];
}

export interface SchoolSummaryJson {
  organization: OrganizationJson;
  activeChildren: number;
  staffCount: number;
  sessionsThisMonth: number;
  activeParentsPercent: number;
  lastActivityAt: Ts | null;
}
