/**
 * Session logs. Writes go through the save_session / amend_session RPCs (metrics, alerts, lock
 * window and audit live in Postgres). Staff reads assemble SessionLog from the split tables;
 * parents never read these tables and use the parent_session_snapshot(s) RPCs instead.
 */
import type { ParentSessionSnapshot, SessionInput, SessionLog, SessionSummary, UUID } from '@/domain/types';

import { RepoError, type SessionsRepo } from '../repository';
import { loadBrief } from './brief';
import type { AdapterContext } from './context';
import { istDate } from './derive-local';
import {
  amendmentFromRow,
  arr,
  goalTrialFromRow,
  incidentFromRow,
  notesFromRow,
  ratingsFromRows,
  sessionMetricsFromRow,
  sessionSummaryFromRow,
} from './mappers';
import { parentSnapshotFromJson } from './mappers-rpc';
import { inChunks, many, maybe, rpc, single } from './query';
import type {
  AmendmentRow,
  AppointmentJoinedRow,
  BehaviourIncidentRow,
  GoalTrialRow,
  ParentSnapshotJson,
  SaveSessionResult,
  SessionJoinedRow,
  SessionNotesRow,
  SessionRatingRow,
} from './rows';
import { APPOINTMENT_SELECT, hydrateAppointments } from './views';

export const SESSION_SELECT = '*, therapy_type:therapy_types(name,color,key), therapist:profiles!sessions_therapist_id_fkey(full_name)';

/** SessionSummary rows for joined session rows (2 batched queries: ratings + parent summaries). */
export async function summarizeSessions(c: AdapterContext, rows: SessionJoinedRow[]): Promise<SessionSummary[]> {
  const ids = rows.map((r) => r.id);
  const [ratings, notes] = await Promise.all([
    inChunks(ids, (part) => many<SessionRatingRow>(c.sb.from('session_ratings').select('session_id,dimension_key,value').in('session_id', part))),
    // Brief-only (substitute) access cannot read notes; the summary then has no parent text.
    inChunks(ids, (part) => many<Pick<SessionNotesRow, 'session_id' | 'parent_summary'>>(c.sb.from('session_notes').select('session_id,parent_summary').in('session_id', part))),
  ]);
  const ratingsBy = new Map<UUID, SessionRatingRow[]>();
  for (const r of ratings) ratingsBy.set(r.session_id, [...(ratingsBy.get(r.session_id) ?? []), r]);
  const summaryBy = new Map(notes.map((n) => [n.session_id, n.parent_summary]));
  return rows.map((r) => sessionSummaryFromRow(r, ratingsFromRows(ratingsBy.get(r.id) ?? []), summaryBy.get(r.id) ?? ''));
}

/** Full SessionLog from the split tables (4 parallel queries). */
async function assembleLog(c: AdapterContext, row: SessionJoinedRow): Promise<SessionLog> {
  const sb = c.sb;
  const [ratings, trials, incidents, notes] = await Promise.all([
    many<SessionRatingRow>(sb.from('session_ratings').select('session_id,dimension_key,value').eq('session_id', row.id)),
    many<GoalTrialRow>(sb.from('goal_trials').select('session_id,goal_id,attempted,successful,prompt_level,note').eq('session_id', row.id).order('created_at')),
    many<BehaviourIncidentRow>(sb.from('behaviour_incidents').select('session_id,type,duration_seconds,antecedent_tags,created_at').eq('session_id', row.id).order('created_at')),
    maybe<SessionNotesRow>(sb.from('session_notes').select('*').eq('session_id', row.id)),
  ]);
  return {
    id: row.id,
    organizationId: row.organization_id,
    appointmentId: row.appointment_id,
    childId: row.child_id,
    therapistId: row.therapist_id,
    therapistName: row.therapist?.full_name ?? '',
    therapyTypeId: row.therapy_type_id,
    isSubstitute: row.is_substitute,
    date: row.date,
    actualMinutes: row.actual_minutes,
    startedLate: row.started_late,
    regulationState: row.regulation_state,
    ratings: ratingsFromRows(ratings),
    goalTrials: trials.map(goalTrialFromRow),
    incidents: incidents.map(incidentFromRow),
    breaksCount: row.breaks_count,
    comparedToLast: row.compared_to_last,
    workedTags: arr(row.worked_tags),
    workedText: row.worked_text ?? '',
    notWorkedTags: arr(row.not_worked_tags),
    notWorkedText: row.not_worked_text ?? '',
    notes: notesFromRow(notes),
    metrics: sessionMetricsFromRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedAt: row.locked_at,
    amendmentCount: row.amendment_count ?? 0,
  };
}

/** SessionLog after save_session: the RPC replaced every child row with the input, so only the
 *  session row (derived ids, names, timestamps) is re-read. */
export function logFromSave(input: SessionInput, result: SaveSessionResult, row: SessionJoinedRow): SessionLog {
  const { clientId: _clientId, ...rest } = input;
  return {
    ...rest,
    goalTrials: input.goalTrials.map((t) => (t.note ? t : { goalId: t.goalId, attempted: t.attempted, successful: t.successful, promptLevel: t.promptLevel })),
    id: result.sessionId,
    organizationId: row.organization_id,
    childId: row.child_id,
    therapistId: row.therapist_id,
    therapistName: row.therapist?.full_name ?? '',
    therapyTypeId: row.therapy_type_id,
    isSubstitute: result.isSubstitute,
    date: result.date,
    metrics: { ...sessionMetricsFromRow(row), ...result.metrics, dimensions: result.metrics.dimensions ?? {} },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedAt: result.lockedAt,
    amendmentCount: result.amendmentCount ?? 0,
  };
}

/** Therapy type keys by id (the snapshot RPCs return ids only). */
async function therapyTypeKeys(c: AdapterContext, ids: UUID[]): Promise<Map<UUID, string>> {
  const out = new Map<UUID, string>();
  const org = c.orgOrNull();
  if (org) for (const t of await c.therapyTypes(org)) out.set(t.id, t.key);
  const missing = [...new Set(ids)].filter((id) => !out.has(id));
  if (missing.length) {
    const rows = await many<{ id: UUID; key: string }>(c.sb.from('therapy_types').select('id,key').in('id', missing));
    for (const r of rows) out.set(r.id, r.key);
  }
  return out;
}

export async function parentSnapshots(c: AdapterContext, childId: UUID, limit = 20): Promise<ParentSessionSnapshot[]> {
  const rows = await rpc<ParentSnapshotJson[] | null>(c.sb, 'parent_session_snapshots', { child_id: childId, limit_count: Math.min(Math.max(limit, 1), 200) });
  const list = rows ?? [];
  const keys = await therapyTypeKeys(c, list.map((r) => r.therapyTypeId));
  return list.map((r) => parentSnapshotFromJson(r, keys.get(r.therapyTypeId) ?? ''));
}

function noParents(c: AdapterContext): void {
  if (c.isParent()) throw new RepoError('forbidden', 'Parents see sessions as parent snapshots');
}

export function createSessionsRepo(c: AdapterContext): SessionsRepo {
  const sb = c.sb;

  async function get(sessionId: UUID): Promise<SessionLog> {
    noParents(c);
    return assembleLog(c, await single<SessionJoinedRow>(sb.from('sessions').select(SESSION_SELECT).eq('id', sessionId), 'session'));
  }

  return {
    async getByAppointment(appointmentId) {
      if (c.isParent()) return null;
      const row = await maybe<SessionJoinedRow>(sb.from('sessions').select(SESSION_SELECT).eq('appointment_id', appointmentId));
      return row ? assembleLog(c, row) : null;
    },

    get,

    async listForChild(childId, opts) {
      noParents(c);
      let q = sb.from('sessions').select(SESSION_SELECT).eq('child_id', childId);
      if (opts?.therapyTypeId) q = q.eq('therapy_type_id', opts.therapyTypeId);
      if (opts?.from) q = q.gte('date', opts.from);
      if (opts?.to) q = q.lte('date', opts.to);
      const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 500);
      const rows = await many<SessionJoinedRow>(q.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(limit));
      return summarizeSessions(c, rows);
    },

    async save(input) {
      const result = await rpc<SaveSessionResult>(sb, 'save_session', { payload: input });
      const row = await single<SessionJoinedRow>(sb.from('sessions').select(SESSION_SELECT).eq('id', result.sessionId), 'session');
      return logFromSave(input, result, row);
    },

    async amend(sessionId, changes, reason) {
      await rpc(sb, 'amend_session', { session_id: sessionId, changes, reason });
      return get(sessionId);
    },

    async amendments(sessionId) {
      const rows = await many<AmendmentRow>(sb.from('amendments').select('id,session_id,entity,entity_id,field,old_value,new_value,reason,by,at').eq('session_id', sessionId).order('at'));
      const names = await c.names(rows.map((r) => r.by));
      return rows.map((r) => amendmentFromRow(r, (r.by && names.get(r.by)) || ''));
    },

    async unlogged() {
      noParents(c);
      const orgId = c.requireOrg();
      const lockHours = (await c.orgSettings(orgId)).logLockHours;
      const now = c.now().getTime();
      let q = sb
        .from('appointments')
        .select(`${APPOINTMENT_SELECT}, sessions(id)`)
        .eq('organization_id', orgId)
        .neq('status', 'cancelled')
        .or('attendance.is.null,attendance.in.(present,late)')
        .lt('ends_at', new Date(now - lockHours * 3_600_000).toISOString())
        .gt('ends_at', new Date(now - 14 * 86_400_000).toISOString())
        .is('sessions', null);
      if (!c.isOrgAdmin()) q = q.eq('therapist_id', c.requireUserId());
      return hydrateAppointments(c, await many<AppointmentJoinedRow>(q.order('starts_at').limit(500)));
    },

    brief: (appointmentId) => loadBrief(c, appointmentId),

    async parentSnapshot(sessionId) {
      const j = await rpc<ParentSnapshotJson | null>(sb, 'parent_session_snapshot', { session_id: sessionId });
      if (!j) throw new RepoError('not_found', 'session not found');
      const keys = await therapyTypeKeys(c, [j.therapyTypeId]);
      return parentSnapshotFromJson(j, keys.get(j.therapyTypeId) ?? '');
    },

    parentSnapshots: (childId, opts) => parentSnapshots(c, childId, opts?.limit),

    async previous(childId, therapyTypeId, before) {
      if (c.isParent()) return null;
      const beforeIso = before ?? c.now().toISOString();
      const rows = await many<SessionJoinedRow & { appointment: { starts_at: string } | null }>(
        sb
          .from('sessions')
          .select(`${SESSION_SELECT}, appointment:appointments(starts_at)`)
          .eq('child_id', childId)
          .eq('therapy_type_id', therapyTypeId)
          .lte('date', istDate(beforeIso))
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(8),
      );
      const startOf = (r: (typeof rows)[number]) => Date.parse(r.appointment?.starts_at ?? `${r.date}T00:00:00+05:30`);
      const cutoff = Date.parse(beforeIso);
      const prev = rows.filter((r) => startOf(r) < cutoff).sort((a, b) => startOf(b) - startOf(a))[0];
      if (!prev) return null;
      return (await summarizeSessions(c, [prev]))[0];
    },
  };
}
