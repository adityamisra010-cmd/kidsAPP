/**
 * Pure row ↔ domain mappers for the Supabase adapter (snake_case rows → camelCase domain types).
 * RPC payload mappers (camelCase jsonb) live in mappers-rpc.ts.
 */
import { DEFAULT_MASTERY_RULE, DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type {
  Alert,
  Amendment,
  Announcement,
  AppNotification,
  Appointment,
  AppointmentSeries,
  AuditEntry,
  BehaviourIncident,
  Child,
  ChildProfile,
  ClinicalInfo,
  Consent,
  DataRequest,
  Goal,
  GoalBankItem,
  GoalTrial,
  HomeLog,
  HomeTask,
  Invite,
  MasteryRule,
  Media,
  Membership,
  Organization,
  OrgSettings,
  ParentCheckin,
  Profile,
  ProfileEdit,
  PromptLevel,
  RatingDimension,
  RatingValue,
  RescheduleRequest,
  Resource,
  ResourceShare,
  SessionMetrics,
  SessionNotes,
  SessionSummary,
  TherapistUnavailability,
  TherapyType,
  Thread,
  ChildTherapist,
  ChildGuardian,
} from '@/domain/types';

import { toClock } from './derive-local';
import type {
  AlertRow,
  AmendmentRow,
  AnnouncementRow,
  AppointmentRow,
  AppointmentSeriesRow,
  AuditLogRow,
  BehaviourIncidentRow,
  ChildClinicalRow,
  ChildGuardianRow,
  ChildProfileRow,
  ChildRow,
  ChildTherapistRow,
  ConsentRow,
  DataRequestRow,
  GoalBankRow,
  GoalRow,
  GoalTrialRow,
  HomeLogRow,
  HomeTaskRow,
  InviteRow,
  MediaRow,
  MembershipRow,
  NotificationRow,
  OrganizationRow,
  ParentCheckinRow,
  ProfileEditRow,
  ProfileRow,
  RatingDimensionRow,
  RescheduleRequestRow,
  ResourceRow,
  ResourceShareRow,
  SessionJoinedRow,
  SessionNotesRow,
  SessionRatingRow,
  SessionRow,
  TherapistUnavailabilityRow,
  TherapyTypeRow,
  ThreadRow,
} from './rows';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------
/** null → undefined (domain types use optional fields, not nulls). */
export function opt<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v;
}

/** numeric columns may arrive as numbers or strings depending on the client. */
export function num(v: number | string | null | undefined): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function arr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function rating(v: number): RatingValue {
  return Math.min(5, Math.max(1, Math.round(v))) as RatingValue;
}

export function promptLevel(v: number | null | undefined): PromptLevel {
  return Math.min(5, Math.max(1, Math.round(v ?? 3))) as PromptLevel;
}

/** Drops keys whose value is undefined (PostgREST would send them as null otherwise). */
export function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

// ---------------------------------------------------------------------------
// Tenancy & people
// ---------------------------------------------------------------------------
export function orgSettings(raw: Partial<OrgSettings> | null | undefined): OrgSettings {
  const s = raw ?? {};
  return {
    ...DEFAULT_ORG_SETTINGS,
    ...s,
    quietHours: { ...DEFAULT_ORG_SETTINGS.quietHours, ...(s.quietHours ?? {}) },
    workingHours: { ...DEFAULT_ORG_SETTINGS.workingHours, ...(s.workingHours ?? {}) },
    holidays: Array.isArray(s.holidays) ? s.holidays : DEFAULT_ORG_SETTINGS.holidays,
    reminderHoursBefore: Array.isArray(s.reminderHoursBefore) ? s.reminderHoursBefore : DEFAULT_ORG_SETTINGS.reminderHoursBefore,
  };
}

export function organizationFromRow(r: OrganizationRow): Organization {
  return {
    id: r.id,
    name: r.name,
    shortName: r.short_name ?? '',
    city: r.city ?? '',
    address: r.address ?? '',
    phone: r.phone ?? '',
    email: opt(r.email),
    logoUrl: opt(r.logo_url),
    status: r.status,
    settings: orgSettings(r.settings),
    createdAt: r.created_at,
  };
}

export function profileFromRow(r: ProfileRow): Profile {
  return {
    id: r.id,
    fullName: r.full_name ?? '',
    phone: opt(r.phone),
    email: opt(r.email),
    avatarUrl: opt(r.avatar_url),
    preferredLanguage: r.preferred_language === 'hi' ? 'hi' : 'en',
    title: opt(r.title),
  };
}

export function membershipFromRow(r: MembershipRow): Membership {
  return { id: r.id, userId: r.user_id, organizationId: r.organization_id, role: r.role, status: r.status };
}

export function inviteFromRow(r: InviteRow): Invite {
  return {
    id: r.id,
    organizationId: r.organization_id,
    role: r.role,
    fullName: r.full_name ?? '',
    phone: opt(r.phone),
    email: opt(r.email),
    childIds: arr(r.child_ids),
    relation: opt(r.relation),
    status: r.status,
    createdAt: r.created_at,
    createdBy: r.created_by ?? '',
  };
}

export function therapyTypeFromRow(r: TherapyTypeRow): TherapyType {
  return { id: r.id, organizationId: r.organization_id, key: r.key, name: r.name, color: r.color, icon: r.icon, active: r.active };
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------
export function childFromRow(r: ChildRow): Child {
  return {
    id: r.id,
    organizationId: r.organization_id,
    branchId: opt(r.branch_id),
    fullName: r.full_name,
    preferredName: opt(r.preferred_name),
    dob: r.dob,
    gender: opt(r.gender),
    photoUrl: opt(r.photo_url),
    classGroup: opt(r.class_group),
    status: r.status,
    createdAt: r.created_at,
  };
}

export function childToRow(c: Partial<Omit<Child, 'id' | 'organizationId' | 'createdAt'>>): Record<string, unknown> {
  return compact({
    branch_id: c.branchId === undefined ? undefined : (c.branchId ?? null),
    full_name: c.fullName?.trim(),
    preferred_name: c.preferredName === undefined ? undefined : c.preferredName || null,
    dob: c.dob,
    gender: c.gender === undefined ? undefined : (c.gender ?? null),
    photo_url: c.photoUrl === undefined ? undefined : c.photoUrl || null,
    class_group: c.classGroup === undefined ? undefined : c.classGroup || null,
    status: c.status,
  });
}

export function clinicalFromRow(r: ChildClinicalRow): ClinicalInfo {
  return { diagnosis: arr(r.diagnosis), medicalNotes: r.medical_notes ?? '', allergies: r.allergies ?? '', medications: r.medications ?? '' };
}

/** A blank About Me row (children created without a profile yet). */
export function emptyProfileRow(childId: string, at: string): ChildProfileRow {
  return {
    child_id: childId,
    communication_mode: 'verbal',
    comm_tools: [],
    comm_notes: '',
    reinforcers: [],
    reinforcers_notes: '',
    triggers: [],
    triggers_notes: '',
    calming: [],
    calming_notes: '',
    sensory_notes: '',
    dos: [],
    donts: [],
    updated_at: at,
    updated_by: null,
  };
}

export function childProfileFromRow(r: ChildProfileRow, clinical?: ChildClinicalRow | null): ChildProfile {
  const p: ChildProfile = {
    childId: r.child_id,
    communicationMode: r.communication_mode,
    commTools: arr(r.comm_tools),
    commNotes: r.comm_notes ?? '',
    reinforcers: arr(r.reinforcers),
    reinforcersNotes: r.reinforcers_notes ?? '',
    triggers: arr(r.triggers),
    triggersNotes: r.triggers_notes ?? '',
    calming: arr(r.calming),
    calmingNotes: r.calming_notes ?? '',
    sensoryNotes: r.sensory_notes ?? '',
    dos: arr(r.dos),
    donts: arr(r.donts),
    updatedAt: r.updated_at,
    updatedBy: opt(r.updated_by),
  };
  if (clinical) p.clinical = clinicalFromRow(clinical);
  return p;
}

type ProfilePatch = Partial<Omit<ChildProfile, 'childId' | 'updatedAt' | 'updatedBy'>>;

/** Splits an About Me patch into child_profiles and child_clinical column patches. */
export function childProfilePatchToRows(p: ProfilePatch): { profile: Record<string, unknown>; clinical: Record<string, unknown> | null } {
  const profile = compact({
    communication_mode: p.communicationMode,
    comm_tools: p.commTools,
    comm_notes: p.commNotes,
    reinforcers: p.reinforcers,
    reinforcers_notes: p.reinforcersNotes,
    triggers: p.triggers,
    triggers_notes: p.triggersNotes,
    calming: p.calming,
    calming_notes: p.calmingNotes,
    sensory_notes: p.sensoryNotes,
    dos: p.dos,
    donts: p.donts,
  });
  const clinical = p.clinical
    ? compact({
        diagnosis: p.clinical.diagnosis,
        medical_notes: p.clinical.medicalNotes,
        allergies: p.clinical.allergies,
        medications: p.clinical.medications,
      })
    : null;
  return { profile, clinical };
}

export function profileEditFromRow(r: ProfileEditRow, byName: string): ProfileEdit {
  return { id: r.id, childId: r.child_id, field: r.field, oldValue: r.old_value, newValue: r.new_value, by: r.by ?? '', byName, at: r.at };
}

export function guardianFromRow(r: ChildGuardianRow): ChildGuardian {
  return { childId: r.child_id, userId: r.user_id, relation: r.relation, isPrimary: r.is_primary };
}

export function childTherapistFromRow(r: ChildTherapistRow): ChildTherapist {
  return {
    childId: r.child_id,
    userId: r.user_id,
    therapyTypeId: r.therapy_type_id,
    isLead: r.is_lead,
    activeFrom: r.active_from,
    activeTo: opt(r.active_to),
  };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
export function masteryRule(raw: Partial<MasteryRule> | null | undefined): MasteryRule {
  return {
    accuracy: num(raw?.accuracy) ?? DEFAULT_MASTERY_RULE.accuracy,
    consecutiveSessions: num(raw?.consecutiveSessions) ?? DEFAULT_MASTERY_RULE.consecutiveSessions,
  };
}

export function goalFromRow(r: GoalRow): Goal {
  return {
    id: r.id,
    organizationId: r.organization_id,
    childId: r.child_id,
    therapyTypeId: r.therapy_type_id,
    domain: r.domain,
    staffText: r.staff_text,
    parentText: r.parent_text ?? '',
    baseline: r.baseline ?? '',
    masteryRule: masteryRule(r.mastery_rule),
    status: r.status,
    startDate: r.start_date,
    masteredAt: opt(r.mastered_at),
    createdBy: r.created_by ?? '',
    createdAt: r.created_at,
  };
}

export function goalToRow(g: Partial<Omit<Goal, 'id' | 'organizationId' | 'createdBy' | 'createdAt'>>): Record<string, unknown> {
  return compact({
    child_id: g.childId,
    therapy_type_id: g.therapyTypeId,
    domain: g.domain,
    staff_text: g.staffText,
    parent_text: g.parentText,
    baseline: g.baseline,
    mastery_rule: g.masteryRule,
    status: g.status,
    start_date: g.startDate,
    mastered_at: g.masteredAt === undefined ? undefined : (g.masteredAt ?? null),
  });
}

export function goalBankFromRow(r: GoalBankRow): GoalBankItem {
  return {
    id: r.id,
    organizationId: r.organization_id,
    domain: r.domain,
    therapyTypeKey: r.therapy_type_key,
    staffText: r.staff_text,
    parentText: r.parent_text ?? '',
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
export function appointmentFromRow(r: AppointmentRow): Appointment {
  return {
    id: r.id,
    organizationId: r.organization_id,
    seriesId: opt(r.series_id),
    childId: r.child_id,
    therapistId: r.therapist_id,
    originalTherapistId: opt(r.original_therapist_id),
    therapyTypeId: r.therapy_type_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    room: opt(r.room),
    status: r.status,
    attendance: opt(r.attendance),
    lateMinutes: opt(r.late_minutes),
    makeupOfId: opt(r.makeup_of_id),
    wasRescheduled: !!r.was_rescheduled,
    cancelReason: opt(r.cancel_reason),
    createdAt: r.created_at,
  };
}

export function seriesFromRow(r: AppointmentSeriesRow): AppointmentSeries {
  return {
    id: r.id,
    organizationId: r.organization_id,
    childId: r.child_id,
    therapistId: r.therapist_id,
    therapyTypeId: r.therapy_type_id,
    rrule: r.rrule,
    startTime: toClock(r.start_time),
    durationMinutes: r.duration_minutes,
    startDate: r.start_date,
    endDate: r.end_date,
    room: opt(r.room),
    createdBy: r.created_by ?? '',
  };
}

export function rescheduleFromRow(r: RescheduleRequestRow, requestedByName: string): RescheduleRequest {
  return {
    id: r.id,
    organizationId: r.organization_id,
    appointmentId: r.appointment_id,
    requestedBy: r.requested_by,
    requestedByName,
    proposedSlots: arr(r.proposed_slots),
    reason: r.reason ?? '',
    status: r.status,
    resolution: opt(r.resolution),
    resolvedBy: opt(r.resolved_by),
    resolvedAt: opt(r.resolved_at),
    createdAt: r.created_at,
  };
}

export function unavailabilityFromRow(r: TherapistUnavailabilityRow): TherapistUnavailability {
  return { id: r.id, organizationId: r.organization_id, userId: r.user_id, from: r.from, to: r.to, reason: r.reason ?? '', createdAt: r.created_at };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export function dimensionFromRow(r: RatingDimensionRow): RatingDimension {
  const a = r.anchors ?? {};
  return {
    id: r.id,
    organizationId: r.organization_id,
    key: r.key,
    label: r.label,
    parentLabel: r.parent_label || r.label,
    description: r.description ?? '',
    anchors: { 1: a['1'] ?? '', 2: a['2'] ?? '', 3: a['3'] ?? '', 4: a['4'] ?? '', 5: a['5'] ?? '' },
    weight: num(r.weight) ?? 1,
    enabled: r.enabled,
    sortOrder: r.sort_order,
    icon: r.icon,
  };
}

export function dimensionToRow(d: Partial<Omit<RatingDimension, 'id'>>): Record<string, unknown> {
  return compact({
    organization_id: d.organizationId,
    key: d.key,
    label: d.label,
    parent_label: d.parentLabel,
    description: d.description,
    anchors: d.anchors ? { '1': d.anchors[1], '2': d.anchors[2], '3': d.anchors[3], '4': d.anchors[4], '5': d.anchors[5] } : undefined,
    weight: d.weight,
    enabled: d.enabled,
    sort_order: d.sortOrder,
    icon: d.icon,
  });
}

export function ratingsFromRows(rows: Pick<SessionRatingRow, 'dimension_key' | 'value'>[]): Record<string, RatingValue> {
  const out: Record<string, RatingValue> = {};
  for (const r of rows) out[r.dimension_key] = rating(r.value);
  return out;
}

export function sessionMetricsFromRow(r: SessionRow): SessionMetrics {
  return {
    sessionScore: num(r.session_score) ?? 0,
    goalAccuracy: num(r.goal_accuracy),
    deltaLast: num(r.delta_last),
    deltaRolling: num(r.delta_rolling),
    rollingAverage: num(r.rolling_average),
    trend: r.trend ?? 'flat',
    dimensions: r.dimension_metrics ?? {},
    incidentCount: r.incident_count ?? 0,
  };
}

export function goalTrialFromRow(r: GoalTrialRow): GoalTrial {
  const t: GoalTrial = { goalId: r.goal_id, attempted: r.attempted, successful: r.successful, promptLevel: promptLevel(r.prompt_level) };
  if (r.note) t.note = r.note;
  return t;
}

export function incidentFromRow(r: BehaviourIncidentRow): BehaviourIncident {
  const i: BehaviourIncident = { type: r.type, antecedentTags: arr(r.antecedent_tags) };
  if (r.duration_seconds != null) i.durationSeconds = r.duration_seconds;
  return i;
}

export function notesFromRow(r: SessionNotesRow | null | undefined): SessionNotes {
  return {
    subjective: r?.subjective ?? '',
    objective: r?.objective ?? '',
    assessment: r?.assessment ?? '',
    planNext: r?.plan_next ?? '',
    planGoalIds: arr(r?.plan_goal_ids),
    parentSummary: r?.parent_summary ?? '',
  };
}

export function sessionSummaryFromRow(
  r: SessionJoinedRow,
  ratings: Record<string, RatingValue>,
  parentSummary: string,
): SessionSummary {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    childId: r.child_id,
    date: r.date,
    therapyTypeId: r.therapy_type_id,
    therapyTypeName: r.therapy_type?.name ?? '',
    therapyTypeColor: r.therapy_type?.color ?? '',
    therapistName: r.therapist?.full_name ?? '',
    isSubstitute: r.is_substitute,
    sessionScore: num(r.session_score) ?? 0,
    goalAccuracy: num(r.goal_accuracy),
    deltaLast: num(r.delta_last),
    deltaRolling: num(r.delta_rolling),
    trend: r.trend ?? 'flat',
    ratings,
    incidentCount: r.incident_count ?? 0,
    comparedToLast: r.compared_to_last,
    parentSummary,
  };
}

export function amendmentFromRow(r: AmendmentRow, byName: string): Amendment {
  return {
    id: r.id,
    entity: r.entity,
    entityId: r.entity_id,
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
    reason: r.reason,
    by: r.by ?? '',
    byName,
    at: r.at,
  };
}

export function checkinFromRow(r: ParentCheckinRow): ParentCheckin {
  return {
    id: r.id,
    organizationId: r.organization_id,
    childId: r.child_id,
    appointmentId: opt(r.appointment_id),
    date: r.date,
    sleep: r.sleep,
    ateBreakfast: r.ate_breakfast,
    mood: r.mood,
    changeFlag: r.change_flag,
    changeNote: r.change_note ?? '',
    submittedBy: r.submitted_by,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Home practice, media, resources
// ---------------------------------------------------------------------------
export function homeTaskFromRow(r: HomeTaskRow, assignedByName: string): HomeTask {
  return {
    id: r.id,
    organizationId: r.organization_id,
    childId: r.child_id,
    goalId: opt(r.goal_id),
    assignedBy: r.assigned_by,
    assignedByName,
    title: r.title,
    steps: arr(r.steps).map(String),
    frequencyPerWeek: r.frequency_per_week,
    durationMinutes: r.duration_minutes,
    resourceId: opt(r.resource_id),
    demoMediaId: opt(r.demo_media_id),
    activeFrom: r.active_from,
    activeTo: r.active_to,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function homeLogFromRow(
  r: HomeLogRow,
  names: { taskTitle: string; childName: string; loggedByName: string; reviewedByName?: string },
): HomeLog {
  return {
    id: r.id,
    organizationId: r.organization_id,
    taskId: r.task_id,
    taskTitle: names.taskTitle,
    childId: r.child_id,
    childName: names.childName,
    loggedBy: r.logged_by,
    loggedByName: names.loggedByName,
    outcome: r.outcome,
    difficulty: r.difficulty,
    note: r.note ?? '',
    mediaId: opt(r.media_id),
    createdAt: r.created_at,
    reviewedBy: opt(r.reviewed_by),
    reviewedByName: r.reviewed_by ? names.reviewedByName : undefined,
    reviewReaction: opt(r.review_reaction),
    reviewComment: opt(r.review_comment),
    reviewedAt: opt(r.reviewed_at),
    useInNextSession: !!r.use_in_next_session,
  };
}

export function mediaFromRow(r: MediaRow): Media {
  return {
    id: r.id,
    organizationId: r.organization_id,
    ownerId: r.owner_id,
    bucketPath: r.bucket_path,
    kind: r.kind,
    durationS: num(r.duration_s),
    sizeBytes: num(r.size_bytes) ?? 0,
    expiresAt: opt(r.expires_at),
    uploadStatus: r.upload_status,
    createdAt: r.created_at,
  };
}

export function resourceFromRow(r: ResourceRow, url: string = r.url): Resource {
  return {
    id: r.id,
    organizationId: r.organization_id,
    title: r.title,
    description: r.description ?? '',
    kind: r.kind,
    url,
    tags: arr(r.tags),
    therapyTypeKeys: arr(r.therapy_type_keys),
    domains: arr(r.domains),
    ageBand: opt(r.age_band),
    audience: r.audience,
    createdAt: r.created_at,
  };
}

export function resourceShareFromRow(r: ResourceShareRow, sharedByName: string): ResourceShare {
  return {
    id: r.id,
    resourceId: r.resource_id,
    childId: opt(r.child_id),
    userId: opt(r.user_id),
    sharedBy: r.shared_by,
    sharedByName,
    note: opt(r.note),
    at: r.at,
  };
}

// ---------------------------------------------------------------------------
// Messaging, notifications, alerts, privacy
// ---------------------------------------------------------------------------
export function threadFromRow(r: ThreadRow): Thread {
  return { id: r.id, organizationId: r.organization_id, childId: opt(r.child_id), kind: r.kind, title: r.title ?? '', createdAt: r.created_at };
}

export function announcementFromRow(r: AnnouncementRow, createdByName: string): Announcement {
  return {
    id: r.id,
    organizationId: r.organization_id,
    title: r.title,
    body: r.body ?? '',
    audience: r.audience,
    therapyTypeId: opt(r.therapy_type_id),
    urgent: r.urgent,
    createdBy: r.created_by ?? '',
    createdByName,
    createdAt: r.created_at,
  };
}

export function alertFromRow(r: AlertRow, childName: string): Alert {
  return {
    id: r.id,
    organizationId: r.organization_id,
    childId: r.child_id,
    childName,
    kind: r.kind,
    payload: r.payload ?? {},
    message: r.message ?? '',
    status: r.status,
    createdAt: r.created_at,
    resolvedBy: opt(r.resolved_by),
    resolvedAt: opt(r.resolved_at),
  };
}

export function notificationFromRow(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    title: r.title,
    body: r.body ?? '',
    route: opt(r.route),
    readAt: opt(r.read_at),
    createdAt: r.created_at,
  };
}

export function consentFromRow(r: ConsentRow): Consent {
  return { id: r.id, userId: r.user_id, childId: opt(r.child_id), kind: r.kind, granted: r.granted, at: r.at, version: r.version };
}

export function dataRequestFromRow(r: DataRequestRow, userName: string, childName: string): DataRequest {
  return {
    id: r.id,
    organizationId: r.organization_id,
    userId: r.user_id,
    userName,
    childId: r.child_id,
    childName,
    kind: r.kind,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function auditFromRow(r: AuditLogRow, actorName: string): AuditEntry {
  return {
    id: r.id,
    organizationId: r.organization_id ?? '',
    actorId: r.actor_id ?? '',
    actorName,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id ?? '',
    at: r.at,
    meta: r.meta ?? {},
  };
}
