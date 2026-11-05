/**
 * send-push — delivers pending in-app notifications as Expo push notifications.
 *
 * Schedule: every minute (see ../README.md).
 *
 * For each `notifications` row with push_status = 'pending':
 *   - older than MAX_AGE_HOURS              → skipped (stale; still visible in the in-app inbox)
 *   - kind muted by the user (notification_mutes), unless a schedule-change kind
 *                                           → skipped ('muted')
 *   - inside the school's quiet hours (IST), unless a schedule-change kind or an urgent
 *     announcement                          → left pending, delivered after quiet hours end
 *   - user has no push token                → skipped ('no_device')
 *   - otherwise sent to every token of the user via https://exp.host/--/api/v2/push/send;
 *     tokens Expo reports as DeviceNotRegistered are deleted.
 *
 * Privacy: notification text transits Expo and Google FCM. Set PUSH_PRIVACY_MODE=generic to send
 * a neutral text ("You have a new update") and keep details inside the app.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, optional EXPO_ACCESS_TOKEN,
 *      optional PUSH_PRIVACY_MODE ('full' | 'generic').
 */
import { adminClient, chunk, inQuietHours, json, mergeSettings, rejectUnlessCron, UNMUTABLE_KINDS } from '../_shared/runtime.ts';

const BATCH = 500;
const MAX_AGE_HOURS = 24;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PendingNotification {
  id: string;
  user_id: string;
  organization_id: string | null;
  kind: string;
  title: string;
  body: string;
  route: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface PushToken {
  id: string;
  user_id: string;
  token: string;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'high' | 'default';
  channelId: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

type Outcome = { status: 'sent' | 'skipped' | 'failed'; error?: string };

Deno.serve(async (req: Request): Promise<Response> => {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;

  const db = adminClient();
  const now = new Date();
  const genericText = Deno.env.get('PUSH_PRIVACY_MODE') === 'generic';

  const { data: pendingRows, error } = await db
    .from('notifications')
    .select('id, user_id, organization_id, kind, title, body, route, payload, created_at')
    .eq('push_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);
  const pending = (pendingRows ?? []) as PendingNotification[];
  if (pending.length === 0) return json({ sent: 0, skipped: 0, deferred: 0, failed: 0 });

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const orgIds = [...new Set(pending.map((n) => n.organization_id).filter((o): o is string => !!o))];

  const [mutesRes, tokensRes, orgsRes] = await Promise.all([
    db.from('notification_mutes').select('user_id, kind').in('user_id', userIds),
    db.from('push_tokens').select('id, user_id, token').in('user_id', userIds),
    orgIds.length
      ? db.from('organizations').select('id, settings').in('id', orgIds)
      : Promise.resolve({ data: [] as { id: string; settings: unknown }[], error: null }),
  ]);
  if (mutesRes.error || tokensRes.error || orgsRes.error) {
    return json({ error: (mutesRes.error ?? tokensRes.error ?? orgsRes.error)?.message }, 500);
  }

  const muted = new Set((mutesRes.data ?? []).map((m: { user_id: string; kind: string }) => `${m.user_id}:${m.kind}`));
  const tokensByUser = new Map<string, PushToken[]>();
  for (const t of (tokensRes.data ?? []) as PushToken[]) {
    tokensByUser.set(t.user_id, [...(tokensByUser.get(t.user_id) ?? []), t]);
  }
  const settingsByOrg = new Map<string, ReturnType<typeof mergeSettings>>();
  for (const o of (orgsRes.data ?? []) as { id: string; settings: unknown }[]) settingsByOrg.set(o.id, mergeSettings(o.settings));

  const outcomes = new Map<string, Outcome>();
  const messages: { notificationId: string; tokenId: string; message: ExpoMessage }[] = [];
  let deferred = 0;

  for (const n of pending) {
    const ageHours = (now.getTime() - new Date(n.created_at).getTime()) / 3_600_000;
    const unmutable = UNMUTABLE_KINDS.has(n.kind);
    const urgent = n.kind === 'announcement' && n.payload?.urgent === true;
    if (ageHours > MAX_AGE_HOURS) {
      outcomes.set(n.id, { status: 'skipped', error: 'stale' });
      continue;
    }
    if (!unmutable && muted.has(`${n.user_id}:${n.kind}`)) {
      outcomes.set(n.id, { status: 'skipped', error: 'muted' });
      continue;
    }
    const settings = settingsByOrg.get(n.organization_id ?? '') ?? mergeSettings(null);
    if (!unmutable && !urgent && inQuietHours(now, settings.quietHours)) {
      deferred++;
      continue; // stays pending; picked up after quiet hours
    }
    const tokens = tokensByUser.get(n.user_id) ?? [];
    if (tokens.length === 0) {
      outcomes.set(n.id, { status: 'skipped', error: 'no_device' });
      continue;
    }
    for (const t of tokens) {
      messages.push({
        notificationId: n.id,
        tokenId: t.id,
        message: {
          to: t.token,
          title: genericText ? "My Kid's Tracker" : n.title,
          body: genericText ? 'You have a new update. Open the app to see it.' : n.body,
          data: { notificationId: n.id, kind: n.kind, route: n.route },
          sound: 'default',
          priority: unmutable || urgent ? 'high' : 'default',
          channelId: 'default',
        },
      });
    }
  }

  // Send in Expo-sized chunks (max 100 messages per request).
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.authorization = `Bearer ${expoToken}`;
  const deadTokens: string[] = [];
  const delivered = new Set<string>();
  const failures = new Map<string, string>();

  for (const batch of chunk(messages, 100)) {
    let tickets: ExpoTicket[] = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(batch.map((b) => b.message)) });
      const body = (await res.json()) as { data?: ExpoTicket[]; errors?: { message: string }[] };
      if (!res.ok || !body.data) throw new Error(body.errors?.[0]?.message ?? `Expo push HTTP ${res.status}`);
      tickets = body.data;
    } catch (e) {
      for (const b of batch) failures.set(b.notificationId, e instanceof Error ? e.message : String(e));
      continue;
    }
    batch.forEach((b, i) => {
      const ticket = tickets[i];
      if (ticket?.status === 'ok') {
        delivered.add(b.notificationId);
      } else {
        failures.set(b.notificationId, ticket?.message ?? 'unknown error');
        if (ticket?.details?.error === 'DeviceNotRegistered') deadTokens.push(b.tokenId);
      }
    });
  }

  for (const m of messages) {
    if (outcomes.has(m.notificationId)) continue;
    // A notification counts as sent if at least one of the user's devices accepted it.
    outcomes.set(
      m.notificationId,
      delivered.has(m.notificationId) ? { status: 'sent' } : { status: 'failed', error: failures.get(m.notificationId) },
    );
  }

  const pushedAt = now.toISOString();
  const byStatus = (s: Outcome['status']) => [...outcomes].filter(([, o]) => o.status === s);
  for (const status of ['sent', 'skipped', 'failed'] as const) {
    const rows = byStatus(status);
    // Group by error text so each update is a single statement.
    const groups = new Map<string, string[]>();
    for (const [nid, o] of rows) groups.set(o.error ?? '', [...(groups.get(o.error ?? '') ?? []), nid]);
    for (const [err, ids] of groups) {
      for (const idChunk of chunk(ids, 200)) {
        await db
          .from('notifications')
          .update({ push_status: status, pushed_at: pushedAt, push_error: err || null })
          .in('id', idChunk);
      }
    }
  }
  if (deadTokens.length) await db.from('push_tokens').delete().in('id', [...new Set(deadTokens)]);

  return json({
    sent: byStatus('sent').length,
    skipped: byStatus('skipped').length,
    failed: byStatus('failed').length,
    deferred,
    removedTokens: new Set(deadTokens).size,
  });
});
