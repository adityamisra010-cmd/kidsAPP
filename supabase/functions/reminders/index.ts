/**
 * reminders — queues time-based notifications, then triggers delivery.
 *
 * Schedule: every 15 minutes (see ../README.md).
 *
 * The logic lives in SQL (public.enqueue_reminders, service role only) so it runs in one
 * transaction, is covered by `npm run test:db`, and is idempotent through notification dedupe keys:
 *   - appointment reminders per school setting reminderHoursBefore (default 24 h and 1 h), to
 *     the child's guardians;
 *   - the therapist's daily agenda at dailyAgendaTime (default 08:00 IST), once per day;
 *   - unlogged sessions (attended or unmarked, ended more than logLockHours ago, no log): a push
 *     to the therapist, plus an `unlogged_session` alert and a notification for the coordinator.
 * Afterwards it calls send-push so reminders do not wait for the next send-push run.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
 */
import { adminClient, json, rejectUnlessCron, requireEnv } from '../_shared/runtime.ts';

interface EnqueueResult {
  reminders: number;
  agendas: number;
  unlogged: number;
  alerts: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;

  const db = adminClient();
  const { data, error } = await db.rpc('enqueue_reminders', { p_now: new Date().toISOString() });
  if (error) return json({ error: error.message }, 500);
  const queued = data as EnqueueResult;

  let push: unknown = null;
  try {
    const res = await fetch(`${requireEnv('SUPABASE_URL')}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${requireEnv('SUPABASE_SERVICE_ROLE_KEY')}`,
        'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    push = await res.json();
  } catch (e) {
    // Not fatal: the scheduled send-push run will deliver them.
    push = { error: e instanceof Error ? e.message : String(e) };
  }

  return json({ queued, push });
});
