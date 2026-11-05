/** Home practice: tasks, parent logs (idempotent on clientId), therapist reviews, completion. */
import type { HomeLog, HomeLogInput, HomeTask, HomeTaskInput, ISODate, UUID } from '@/domain/types';

import { RepoError, type HomePracticeRepo } from '../repository';
import type { AdapterContext } from './context';
import { addDays, istDayBounds, todayIST, weekStartOf, weeklyCompletion } from './derive-local';
import { compact, homeLogFromRow, homeTaskFromRow } from './mappers';
import { uploadMedia, type FileReader } from './media';
import { done, inChunks, many, selectAll, single } from './query';
import type { ChildRow, ChildTherapistRow, HomeLogRow, HomeTaskRow } from './rows';


function taskValues(input: Partial<HomeTaskInput> & { status?: HomeTask['status'] }): Record<string, unknown> {
  return compact({
    child_id: input.childId,
    goal_id: input.goalId === undefined ? undefined : (input.goalId ?? null),
    title: input.title?.trim(),
    steps: input.steps?.map((s) => s.trim()).filter(Boolean),
    frequency_per_week: input.frequencyPerWeek,
    duration_minutes: input.durationMinutes,
    resource_id: input.resourceId === undefined ? undefined : (input.resourceId ?? null),
    demo_media_id: input.demoMediaId === undefined ? undefined : (input.demoMediaId ?? null),
    active_from: input.activeFrom,
    active_to: input.activeTo,
    status: input.status,
  });
}

/** Task titles, child names and people for a page of logs (3 batched queries). */
export async function hydrateLogs(c: AdapterContext, rows: HomeLogRow[]): Promise<HomeLog[]> {
  if (rows.length === 0) return [];
  const [tasks, children, names] = await Promise.all([
    inChunks(rows.map((r) => r.task_id), (part) => many<Pick<HomeTaskRow, 'id' | 'title'>>(c.sb.from('home_tasks').select('id,title').in('id', part))),
    inChunks(rows.map((r) => r.child_id), (part) =>
      many<Pick<ChildRow, 'id' | 'full_name' | 'preferred_name'>>(c.sb.from('children').select('id,full_name,preferred_name').in('id', part)),
    ),
    c.names(rows.flatMap((r) => [r.logged_by, r.reviewed_by])),
  ]);
  const titles = new Map(tasks.map((t) => [t.id, t.title]));
  const childNames = new Map(children.map((ch) => [ch.id, ch.full_name]));
  return rows.map((r) =>
    homeLogFromRow(r, {
      taskTitle: titles.get(r.task_id) ?? '',
      childName: childNames.get(r.child_id) ?? '',
      loggedByName: names.get(r.logged_by) ?? '',
      reviewedByName: r.reviewed_by ? names.get(r.reviewed_by) : undefined,
    }),
  );
}

async function tasksWithNames(c: AdapterContext, rows: HomeTaskRow[]): Promise<HomeTask[]> {
  const names = await c.names(rows.map((r) => r.assigned_by));
  return rows.map((r) => homeTaskFromRow(r, names.get(r.assigned_by) ?? ''));
}

export async function tasksAndLogsForChild(
  c: AdapterContext,
  childId: UUID,
  from: ISODate,
  to: ISODate,
): Promise<{ tasks: HomeTaskRow[]; logs: Pick<HomeLogRow, 'outcome' | 'created_at'>[] }> {
  const [tasks, logs] = await Promise.all([
    many<HomeTaskRow>(c.sb.from('home_tasks').select('*').eq('child_id', childId).lte('active_from', to).gte('active_to', from)),
    selectAll<Pick<HomeLogRow, 'outcome' | 'created_at'>>((f, t) =>
      c.sb
        .from('home_logs')
        .select('outcome,created_at')
        .eq('child_id', childId)
        .gte('created_at', istDayBounds(from).start)
        .lt('created_at', istDayBounds(to).end)
        .order('created_at')
        .range(f, t),
    ),
  ]);
  return { tasks, logs };
}

export function createHomePracticeRepo(c: AdapterContext, readFile: FileReader): HomePracticeRepo {
  const sb = c.sb;

  async function logById(logId: UUID): Promise<HomeLog> {
    const [log] = await hydrateLogs(c, [await single<HomeLogRow>(sb.from('home_logs').select('*').eq('id', logId), 'home log')]);
    return log;
  }

  return {
    async listTasks(filter) {
      const childIds = c.isParent() ? (filter.childId ? [filter.childId] : await c.guardianChildIds()) : null;
      if (childIds && childIds.length === 0) return [];
      const build = (from: number, to: number) => {
        let q = sb.from('home_tasks').select('*');
        if (childIds) q = q.in('child_id', childIds);
        else {
          q = q.eq('organization_id', c.requireOrg());
          if (filter.childId) q = q.eq('child_id', filter.childId);
        }
        if (filter.assignedBy) q = q.eq('assigned_by', filter.assignedBy);
        if (filter.status?.length) q = q.in('status', filter.status);
        return q.order('created_at', { ascending: false }).order('id').range(from, to);
      };
      return tasksWithNames(c, await selectAll<HomeTaskRow>(build));
    },

    async getTask(taskId) {
      const [task, logs] = await Promise.all([
        single<HomeTaskRow>(sb.from('home_tasks').select('*').eq('id', taskId), 'home task'),
        many<HomeLogRow>(sb.from('home_logs').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(200)),
      ]);
      const [mapped] = await tasksWithNames(c, [task]);
      return { ...mapped, logs: await hydrateLogs(c, logs) };
    },

    async createTask(input) {
      const uid = c.requireUserId();
      const today = todayIST(c.now());
      const row = await single<HomeTaskRow>(
        sb
          .from('home_tasks')
          .insert({
            ...taskValues({ ...input, activeFrom: input.activeFrom || today, activeTo: input.activeTo || addDays(today, 28) }),
            assigned_by: uid,
          })
          .select('*'),
        'home task',
      );
      return (await tasksWithNames(c, [row]))[0];
    },

    async updateTask(taskId, patch) {
      const row = await single<HomeTaskRow>(sb.from('home_tasks').update(taskValues(patch)).eq('id', taskId).select('*'), 'home task');
      return (await tasksWithNames(c, [row]))[0];
    },

    async log(input: HomeLogInput & { mediaId?: UUID }) {
      if (!input.clientId) throw new RepoError('validation', 'clientId is required');
      let mediaId = input.mediaId;
      if (!mediaId && input.video) {
        // Normally the outbox uploads first; this keeps a direct call with a local video working.
        const task = await single<Pick<HomeTaskRow, 'child_id'>>(sb.from('home_tasks').select('child_id').eq('id', input.taskId), 'home task');
        const media = await uploadMedia(c, readFile, {
          localUri: input.video.localUri,
          kind: 'video',
          durationS: input.video.durationS,
          sizeBytes: input.video.sizeBytes,
          mimeType: 'video/mp4',
          childId: task.child_id,
        });
        mediaId = media.id;
      }
      await done(
        sb.from('home_logs').upsert(
          {
            client_id: input.clientId,
            task_id: input.taskId,
            outcome: input.outcome,
            difficulty: input.difficulty,
            note: input.note?.trim() ?? '',
            media_id: mediaId ?? null,
            logged_by: c.requireUserId(),
          },
          { onConflict: 'client_id', ignoreDuplicates: true },
        ),
      );
      const row = await single<HomeLogRow>(sb.from('home_logs').select('*').eq('client_id', input.clientId), 'home log');
      return (await hydrateLogs(c, [row]))[0];
    },

    async listLogs(filter) {
      const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);
      let q = sb.from('home_logs').select('*');
      if (filter.taskId) q = q.eq('task_id', filter.taskId);
      if (filter.childId) q = q.eq('child_id', filter.childId);
      else if (c.isParent()) {
        const ids = await c.guardianChildIds();
        if (ids.length === 0) return [];
        q = q.in('child_id', ids);
      } else if (!filter.taskId) q = q.eq('organization_id', c.requireOrg());
      return hydrateLogs(c, await many<HomeLogRow>(q.order('created_at', { ascending: false }).limit(limit)));
    },

    async reviewQueue() {
      if (c.isParent()) return [];
      let q = sb.from('home_logs').select('*').eq('organization_id', c.requireOrg()).is('reviewed_at', null);
      if (!c.isOrgAdmin()) {
        const today = todayIST(c.now());
        const mine = await many<Pick<ChildTherapistRow, 'child_id' | 'active_from' | 'active_to'>>(
          sb.from('child_therapists').select('child_id,active_from,active_to').eq('user_id', c.requireUserId()),
        );
        const ids = [...new Set(mine.filter((m) => m.active_from <= today && (!m.active_to || m.active_to >= today)).map((m) => m.child_id))];
        if (ids.length === 0) return [];
        q = q.in('child_id', ids);
      }
      return hydrateLogs(c, await many<HomeLogRow>(q.order('created_at', { ascending: false }).limit(200)));
    },

    async review(logId, input) {
      const row = await single<HomeLogRow>(
        sb
          .from('home_logs')
          .update(
            compact({
              review_reaction: input.reaction,
              review_comment: input.comment?.trim() || null,
              use_in_next_session: input.useInNextSession,
              reviewed_at: c.now().toISOString(),
              reviewed_by: c.requireUserId(),
            }),
          )
          .eq('id', logId)
          .select('*'),
        'home log',
      );
      return (await hydrateLogs(c, [row]))[0];
    },

    async weeklyCompletion(childId, weekStart) {
      const start = weekStartOf(weekStart ?? todayIST(c.now()));
      const { tasks, logs } = await tasksAndLogsForChild(c, childId, start, addDays(start, 6));
      return weeklyCompletion(
        childId,
        start,
        tasks.map((t) => ({ frequencyPerWeek: t.frequency_per_week, activeFrom: t.active_from, activeTo: t.active_to, status: t.status })),
        logs.map((l) => ({ outcome: l.outcome, createdAt: l.created_at })),
      );
    },

    getLog: logById,
  };
}
