/** In-app inbox (own rows only) and child alerts (staff acknowledge / resolve). */
import type { AlertsRepo, NotificationsRepo } from '../repository';
import type { AdapterContext } from './context';
import { alertFromRow, notificationFromRow } from './mappers';
import { countOf, done, many, single } from './query';
import type { AlertRow, NotificationRow } from './rows';

export function createNotificationsRepo(c: AdapterContext): NotificationsRepo {
  const sb = c.sb;
  return {
    async list(opts) {
      const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
      const rows = await many<NotificationRow>(
        sb.from('notifications').select('id,user_id,kind,title,body,route,read_at,created_at').eq('user_id', c.requireUserId()).order('created_at', { ascending: false }).limit(limit),
      );
      return rows.map(notificationFromRow);
    },

    async unreadCount() {
      return countOf(sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', c.requireUserId()).is('read_at', null));
    },

    async markRead(id) {
      const q = sb.from('notifications').update({ read_at: c.now().toISOString() }).eq('user_id', c.requireUserId()).is('read_at', null);
      await done(id === 'all' ? q : q.eq('id', id));
    },
  };
}

type AlertJoined = AlertRow & { child: { full_name: string } | null };

export function createAlertsRepo(c: AdapterContext): AlertsRepo {
  const sb = c.sb;
  return {
    async list(filter) {
      if (c.isParent()) return [];
      let q = sb.from('alerts').select('*, child:children(full_name)').eq('organization_id', c.requireOrg());
      if (filter?.status?.length) q = q.in('status', filter.status);
      if (filter?.childId) q = q.eq('child_id', filter.childId);
      const rows = await many<AlertJoined>(q.order('created_at', { ascending: false }).limit(300));
      return rows.map((r) => alertFromRow(r, r.child?.full_name ?? ''));
    },

    async acknowledge(id) {
      await single(sb.from('alerts').update({ status: 'acknowledged' }).eq('id', id).eq('status', 'open').select('id'), 'alert').catch(async (e: unknown) => {
        // Already acknowledged/resolved is fine; anything else (e.g. no access) is not.
        const row = await many<{ id: string }>(sb.from('alerts').select('id').eq('id', id));
        if (row.length === 0) throw e;
      });
    },

    async resolve(id) {
      // resolved_by / resolved_at are stamped by the alerts guard trigger.
      await single(sb.from('alerts').update({ status: 'resolved' }).eq('id', id).select('id'), 'alert');
    },
  };
}
