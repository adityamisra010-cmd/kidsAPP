/**
 * Mappers for RPC results (camelCase jsonb built by the migrations, e.g. app.camel_keys(row)).
 * Pure; tested in __tests__/mappers.test.ts.
 */
import type {
  Alert,
  Appointment,
  Child,
  ChildProfile,
  GoalWithStats,
  HomeLog,
  HomeTask,
  Invite,
  Organization,
  ParentCheckin,
  ParentSessionSnapshot,
  RatingValue,
  RescheduleRequest,
  SchoolSummary,
  SessionSummary,
  Trend,
} from '@/domain/types';

import { arr, masteryRule, num, opt, orgSettings, promptLevel } from './mappers';
import type {
  CamelRow,
  GoalWithStatsJson,
  InviteJson,
  OrganizationJson,
  ParentGoalJson,
  ParentSnapshotJson,
  RescheduleJson,
  SchoolSummaryJson,
  SessionSummaryJson,
} from './rows';

// ---------------------------------------------------------------------------
// Typed readers for loosely typed camelCase rows
// ---------------------------------------------------------------------------
function s(o: CamelRow, k: string, fallback = ''): string {
  const v = o[k];
  return typeof v === 'string' ? v : v == null ? fallback : String(v);
}
function so(o: CamelRow, k: string): string | undefined {
  const v = o[k];
  return v == null || v === '' ? undefined : String(v);
}
function n(o: CamelRow, k: string): number | undefined {
  const v = o[k];
  return typeof v === 'number' || typeof v === 'string' ? num(v) : undefined;
}
function b(o: CamelRow, k: string): boolean {
  return o[k] === true;
}
function sa(o: CamelRow, k: string): string[] {
  const v = o[k];
  return Array.isArray(v) ? v.map(String) : [];
}
function one<T extends string>(o: CamelRow, k: string, allowed: readonly T[], fallback: T): T {
  const v = o[k];
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

// ---------------------------------------------------------------------------
export function organizationFromJson(j: OrganizationJson): Organization {
  return {
    id: j.id,
    name: j.name,
    shortName: j.shortName ?? '',
    city: j.city ?? '',
    address: j.address ?? '',
    phone: j.phone ?? '',
    email: opt(j.email),
    logoUrl: opt(j.logoUrl),
    status: j.status,
    settings: orgSettings(j.settings),
    createdAt: j.createdAt,
  };
}

export function inviteFromJson(j: InviteJson): Invite {
  return {
    id: j.id,
    organizationId: j.organizationId,
    role: j.role,
    fullName: j.fullName ?? '',
    phone: opt(j.phone),
    email: opt(j.email),
    childIds: arr(j.childIds),
    relation: opt(j.relation),
    status: j.status,
    createdAt: j.createdAt,
    createdBy: j.createdBy ?? '',
  };
}

export function schoolSummaryFromJson(j: SchoolSummaryJson): SchoolSummary {
  return {
    organization: organizationFromJson(j.organization),
    activeChildren: j.activeChildren ?? 0,
    staffCount: j.staffCount ?? 0,
    sessionsThisMonth: j.sessionsThisMonth ?? 0,
    activeParentsPercent: num(j.activeParentsPercent) ?? 0,
    lastActivityAt: opt(j.lastActivityAt),
  };
}

export function rescheduleFromJson(j: RescheduleJson): RescheduleRequest {
  return {
    id: j.id,
    organizationId: j.organizationId,
    appointmentId: j.appointmentId,
    requestedBy: j.requestedBy,
    requestedByName: j.requestedByName ?? '',
    proposedSlots: arr(j.proposedSlots),
    reason: j.reason ?? '',
    status: j.status,
    resolution: opt(j.resolution),
    resolvedBy: opt(j.resolvedBy),
    resolvedAt: opt(j.resolvedAt),
    createdAt: j.createdAt,
  };
}

export type ParentSnapshotWithKey = ParentSessionSnapshot & { therapyTypeKey: string };

/**
 * ParentSessionSnapshot from parent_session_snapshot(s). `therapyTypeKey` is resolved by the caller
 * from therapy_types (the RPC returns the id only).
 */
export function parentSnapshotFromJson(j: ParentSnapshotJson, therapyTypeKey: string): ParentSnapshotWithKey {
  const snap: ParentSnapshotWithKey = {
    sessionId: j.sessionId,
    date: j.date,
    therapyTypeName: j.therapyTypeName ?? '',
    therapyTypeColor: j.therapyTypeColor ?? '',
    therapyTypeKey,
    therapistName: j.therapistName ?? '',
    isSubstitute: !!j.isSubstitute,
    highlights: arr(j.highlights).map((h) => ({
      key: h.key,
      label: h.label,
      icon: h.icon,
      value: Math.min(5, Math.max(1, Math.round(h.value))) as RatingValue,
      change: h.change,
    })),
    overall: j.overall ?? 'same',
    parentSummary: j.parentSummary ?? '',
    goalsWorkedOn: arr(j.goalsWorkedOn).map((g) => ({ goalId: g.goalId, parentText: g.parentText ?? '' })),
  };
  if (typeof j.sessionScore === 'number') snap.sessionScore = j.sessionScore;
  return snap;
}

/** Parents read goals through parent_goals(); staff-only fields are blanked (never sent). */
export function goalFromParentJson(j: ParentGoalJson, organizationId: string): GoalWithStats {
  return {
    id: j.id,
    organizationId,
    childId: j.childId,
    therapyTypeId: j.therapyTypeId,
    domain: j.domain,
    staffText: j.parentText ?? '',
    parentText: j.parentText ?? '',
    baseline: '',
    masteryRule: masteryRule(null),
    status: j.status,
    startDate: j.startDate,
    masteredAt: opt(j.masteredAt),
    createdBy: '',
    createdAt: j.startDate,
    sessionsTracked: 0,
    masterySuggested: false,
  };
}

export function goalWithStatsFromJson(j: GoalWithStatsJson): GoalWithStats {
  return {
    id: j.id,
    organizationId: j.organizationId,
    childId: j.childId,
    therapyTypeId: j.therapyTypeId,
    domain: j.domain,
    staffText: j.staffText ?? '',
    parentText: j.parentText ?? '',
    baseline: j.baseline ?? '',
    masteryRule: masteryRule(j.masteryRule),
    status: j.status,
    startDate: j.startDate,
    masteredAt: opt(j.masteredAt),
    createdBy: j.createdBy ?? '',
    createdAt: j.createdAt,
    lastAccuracy: num(j.lastAccuracy),
    lastPromptLevel: j.lastPromptLevel != null ? promptLevel(j.lastPromptLevel) : undefined,
    sessionsTracked: j.sessionsTracked ?? 0,
    masterySuggested: !!j.masterySuggested,
  };
}

export function sessionSummaryFromJson(j: SessionSummaryJson): SessionSummary {
  const ratings: Record<string, RatingValue> = {};
  for (const [k, v] of Object.entries(j.ratings ?? {})) ratings[k] = Math.min(5, Math.max(1, Math.round(v))) as RatingValue;
  return {
    id: j.id,
    appointmentId: j.appointmentId,
    childId: j.childId,
    date: j.date,
    therapyTypeId: j.therapyTypeId,
    therapyTypeName: j.therapyTypeName ?? '',
    therapyTypeColor: j.therapyTypeColor ?? '',
    therapistName: j.therapistName ?? '',
    isSubstitute: !!j.isSubstitute,
    sessionScore: num(j.sessionScore) ?? 0,
    goalAccuracy: num(j.goalAccuracy),
    deltaLast: num(j.deltaLast),
    deltaRolling: num(j.deltaRolling),
    trend: j.trend ?? 'flat',
    ratings,
    incidentCount: j.incidentCount ?? 0,
    comparedToLast: j.comparedToLast ?? 'same',
    parentSummary: j.parentSummary ?? '',
  };
}

// ---------------------------------------------------------------------------
// camel_keys(to_jsonb(row)) parts of handover_brief()
// ---------------------------------------------------------------------------
const STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
const ATTENDANCE = ['present', 'late', 'absent', 'cancelled_by_school', 'cancelled_by_parent'] as const;

export function appointmentFromCamel(o: CamelRow): Appointment {
  const attendance = so(o, 'attendance');
  return {
    id: s(o, 'id'),
    organizationId: s(o, 'organizationId'),
    seriesId: so(o, 'seriesId'),
    childId: s(o, 'childId'),
    therapistId: s(o, 'therapistId'),
    originalTherapistId: so(o, 'originalTherapistId'),
    therapyTypeId: s(o, 'therapyTypeId'),
    startsAt: s(o, 'startsAt'),
    endsAt: s(o, 'endsAt'),
    room: so(o, 'room'),
    status: one(o, 'status', STATUSES, 'scheduled'),
    attendance: attendance ? one(o, 'attendance', ATTENDANCE, 'present') : undefined,
    lateMinutes: n(o, 'lateMinutes'),
    makeupOfId: so(o, 'makeupOfId'),
    wasRescheduled: b(o, 'wasRescheduled'),
    cancelReason: so(o, 'cancelReason'),
    createdAt: s(o, 'createdAt'),
  };
}

export function childFromCamel(o: CamelRow): Child {
  const gender = so(o, 'gender');
  return {
    id: s(o, 'id'),
    organizationId: s(o, 'organizationId'),
    branchId: so(o, 'branchId'),
    fullName: s(o, 'fullName'),
    preferredName: so(o, 'preferredName'),
    dob: s(o, 'dob'),
    gender: gender ? one(o, 'gender', ['male', 'female', 'other'] as const, 'other') : undefined,
    photoUrl: so(o, 'photoUrl'),
    classGroup: so(o, 'classGroup'),
    status: one(o, 'status', ['active', 'inactive'] as const, 'active'),
    createdAt: s(o, 'createdAt'),
  };
}

export function childProfileFromCamel(o: CamelRow, childId: string): ChildProfile {
  const p: ChildProfile = {
    childId: s(o, 'childId', childId),
    communicationMode: one(o, 'communicationMode', ['verbal', 'limited_verbal', 'non_verbal'] as const, 'verbal'),
    commTools: sa(o, 'commTools'),
    commNotes: s(o, 'commNotes'),
    reinforcers: sa(o, 'reinforcers'),
    reinforcersNotes: s(o, 'reinforcersNotes'),
    triggers: sa(o, 'triggers'),
    triggersNotes: s(o, 'triggersNotes'),
    calming: sa(o, 'calming'),
    calmingNotes: s(o, 'calmingNotes'),
    sensoryNotes: s(o, 'sensoryNotes'),
    dos: sa(o, 'dos'),
    donts: sa(o, 'donts'),
    updatedAt: s(o, 'updatedAt'),
    updatedBy: so(o, 'updatedBy'),
  };
  const c = o.clinical;
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    const cr = c as CamelRow;
    p.clinical = { diagnosis: sa(cr, 'diagnosis'), medicalNotes: s(cr, 'medicalNotes'), allergies: s(cr, 'allergies'), medications: s(cr, 'medications') };
  }
  return p;
}

export function checkinFromCamel(o: CamelRow): ParentCheckin {
  return {
    id: s(o, 'id'),
    organizationId: s(o, 'organizationId'),
    childId: s(o, 'childId'),
    appointmentId: so(o, 'appointmentId'),
    date: s(o, 'date'),
    sleep: one(o, 'sleep', ['good', 'ok', 'poor'] as const, 'ok'),
    ateBreakfast: b(o, 'ateBreakfast'),
    mood: one(o, 'mood', ['happy', 'okay', 'upset'] as const, 'okay'),
    changeFlag: b(o, 'changeFlag'),
    changeNote: s(o, 'changeNote'),
    submittedBy: s(o, 'submittedBy'),
    createdAt: s(o, 'createdAt'),
  };
}

export function homeTaskFromCamel(o: CamelRow): HomeTask {
  return {
    id: s(o, 'id'),
    organizationId: s(o, 'organizationId'),
    childId: s(o, 'childId'),
    goalId: so(o, 'goalId'),
    assignedBy: s(o, 'assignedBy'),
    assignedByName: s(o, 'assignedByName'),
    title: s(o, 'title'),
    steps: sa(o, 'steps'),
    frequencyPerWeek: n(o, 'frequencyPerWeek') ?? 0,
    durationMinutes: n(o, 'durationMinutes') ?? 0,
    resourceId: so(o, 'resourceId'),
    demoMediaId: so(o, 'demoMediaId'),
    activeFrom: s(o, 'activeFrom'),
    activeTo: s(o, 'activeTo'),
    status: one(o, 'status', ['active', 'completed', 'archived'] as const, 'active'),
    createdAt: s(o, 'createdAt'),
  };
}

export function homeLogFromCamel(o: CamelRow, childName: string): HomeLog {
  return {
    id: s(o, 'id'),
    organizationId: s(o, 'organizationId'),
    taskId: s(o, 'taskId'),
    taskTitle: s(o, 'taskTitle'),
    childId: s(o, 'childId'),
    childName,
    loggedBy: s(o, 'loggedBy'),
    loggedByName: s(o, 'loggedByName'),
    outcome: one(o, 'outcome', ['done', 'partly', 'could_not'] as const, 'done'),
    difficulty: one(o, 'difficulty', ['easy', 'ok', 'hard'] as const, 'ok'),
    note: s(o, 'note'),
    mediaId: so(o, 'mediaId'),
    createdAt: s(o, 'createdAt'),
    reviewedBy: so(o, 'reviewedBy'),
    reviewReaction: so(o, 'reviewReaction')
      ? one(o, 'reviewReaction', ['great_job', 'good_effort', 'try_next_time', 'lets_discuss'] as const, 'great_job')
      : undefined,
    reviewComment: so(o, 'reviewComment'),
    reviewedAt: so(o, 'reviewedAt'),
    useInNextSession: b(o, 'useInNextSession'),
  };
}

export function alertFromCamel(o: CamelRow, childName: string): Alert {
  const payload = o.payload && typeof o.payload === 'object' && !Array.isArray(o.payload) ? (o.payload as Record<string, unknown>) : {};
  return {
    id: s(o, 'id'),
    organizationId: s(o, 'organizationId'),
    childId: s(o, 'childId'),
    childName,
    kind: one(o, 'kind', ['score_drop', 'incident_spike', 'unlogged_session', 'declining_trend'] as const, 'score_drop'),
    payload,
    message: s(o, 'message'),
    status: one(o, 'status', ['open', 'acknowledged', 'resolved'] as const, 'open'),
    createdAt: s(o, 'createdAt'),
    resolvedBy: so(o, 'resolvedBy'),
    resolvedAt: so(o, 'resolvedAt'),
  };
}

export function trendOf(v: unknown): Trend {
  return v === 'up' || v === 'down' ? v : 'flat';
}
