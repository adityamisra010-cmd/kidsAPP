/**
 * Messaging: per-child care-team / staff-only threads, direct threads, read watermarks
 * (message_reads = one "read up to" timestamp per member per thread) and announcements.
 * Thread lists are summarised with a fixed number of batched queries.
 */
import type { Attachment, Message, Role, ThreadSummary, UUID } from '@/domain/types';

import { RepoError, type MessagingRepo } from '../repository';
import type { AdapterContext } from './context';
import { todayIST } from './derive-local';
import { announcementFromRow, threadFromRow } from './mappers';
import { done, inChunks, many, single } from './query';
import type { AnnouncementRow, ChildTherapistRow, MessageReadRow, MessageRow, ThreadMemberRow, ThreadRow } from './rows';

type ThreadJoined = ThreadRow & { child: { full_name: string; photo_url: string | null } | null };
const THREAD_SELECT = '*, child:children(full_name,photo_url)';
const ROLE_RANK: Role[] = ['school_admin', 'coordinator', 'therapist', 'parent', 'platform_admin'];

function attachmentsOf(raw: unknown[] | null): Attachment[] {
  return (raw ?? []).filter((a): a is Attachment => !!a && typeof a === 'object' && typeof (a as Attachment).url === 'string');
}

/** Unread messages per thread for `uid`, given each thread's watermark (1 query). */
async function unreadByThread(c: AdapterContext, threadIds: UUID[], uid: UUID): Promise<Map<UUID, number>> {
  const out = new Map<UUID, number>();
  if (threadIds.length === 0) return out;
  const reads = await inChunks(threadIds, (part) =>
    many<MessageReadRow>(c.sb.from('message_reads').select('thread_id,user_id,last_read_at').eq('user_id', uid).in('thread_id', part)),
  );
  const mark = new Map(reads.map((r) => [r.thread_id, r.last_read_at]));
  const floor = threadIds.every((id) => mark.has(id)) ? reads.map((r) => r.last_read_at).sort()[0] : undefined;
  const msgs = await inChunks(threadIds, (part) => {
    let q = c.sb.from('messages').select('thread_id,created_at').in('thread_id', part).neq('sender_id', uid);
    if (floor) q = q.gt('created_at', floor);
    return many<Pick<MessageRow, 'thread_id' | 'created_at'>>(q.order('created_at', { ascending: false }).limit(2000));
  });
  for (const m of msgs) {
    const w = mark.get(m.thread_id);
    if (!w || Date.parse(m.created_at) > Date.parse(w)) out.set(m.thread_id, (out.get(m.thread_id) ?? 0) + 1);
  }
  return out;
}

export function createMessagingRepo(c: AdapterContext): MessagingRepo {
  const sb = c.sb;

  /** Threads the user takes part in: member threads + their children's threads (parents, therapists). */
  async function myThreads(childFilter?: UUID): Promise<ThreadJoined[]> {
    const uid = c.requireUserId();
    const org = c.requireOrg();
    if (childFilter) {
      // All threads of one child the user may read (RLS decides), e.g. from the child workspace.
      return many<ThreadJoined>(sb.from('threads').select(THREAD_SELECT).eq('organization_id', org).eq('child_id', childFilter));
    }
    let childIds: UUID[] = [];
    if (c.isParent()) childIds = await c.guardianChildIds();
    else if (c.isTherapist()) {
      const today = todayIST(c.now());
      const rows = await many<Pick<ChildTherapistRow, 'child_id' | 'active_from' | 'active_to'>>(
        sb.from('child_therapists').select('child_id,active_from,active_to').eq('user_id', uid).eq('organization_id', org),
      );
      childIds = rows.filter((r) => r.active_from <= today && (!r.active_to || r.active_to >= today)).map((r) => r.child_id);
    }
    const memberOf = await many<Pick<ThreadMemberRow, 'thread_id'>>(sb.from('thread_members').select('thread_id').eq('user_id', uid).eq('organization_id', org));
    const [byMember, byChild] = await Promise.all([
      inChunks(memberOf.map((m) => m.thread_id), (part) => many<ThreadJoined>(sb.from('threads').select(THREAD_SELECT).in('id', part))),
      inChunks(childIds, (part) =>
        many<ThreadJoined>(sb.from('threads').select(THREAD_SELECT).eq('organization_id', org).in('child_id', part).in('kind', c.isParent() ? ['care_team'] : ['care_team', 'staff_only'])),
      ),
    ]);
    return [...new Map([...byMember, ...byChild].map((t) => [t.id, t])).values()];
  }

  async function summarize(threads: ThreadJoined[]): Promise<ThreadSummary[]> {
    if (threads.length === 0) return [];
    const uid = c.requireUserId();
    const ids = threads.map((t) => t.id);
    const [members, recent, unread] = await Promise.all([
      inChunks(ids, (part) => many<ThreadMemberRow>(sb.from('thread_members').select('thread_id,user_id').in('thread_id', part))),
      inChunks(ids, (part) =>
        many<MessageRow>(sb.from('messages').select('id,thread_id,sender_id,body,attachments,created_at').in('thread_id', part).order('created_at', { ascending: false }).limit(500)),
      ),
      unreadByThread(c, ids, uid),
    ]);
    const last = new Map<UUID, MessageRow>();
    for (const m of recent) if (!last.has(m.thread_id)) last.set(m.thread_id, m);
    // Quiet threads fall outside the recent window: fetch their last message individually (rare).
    const quiet = ids.filter((id) => !last.has(id)).slice(0, 25);
    const quietRows = await Promise.all(
      quiet.map((id) => many<MessageRow>(sb.from('messages').select('id,thread_id,sender_id,body,attachments,created_at').eq('thread_id', id).order('created_at', { ascending: false }).limit(1))),
    );
    for (const rows of quietRows) if (rows[0]) last.set(rows[0].thread_id, rows[0]);
    const names = await c.names([...members.map((m) => m.user_id), ...[...last.values()].map((m) => m.sender_id)]);
    return threads
      .map((t) => {
        const m = last.get(t.id);
        return {
          ...threadFromRow(t),
          childName: t.child?.full_name,
          childPhotoUrl: t.child?.photo_url ?? undefined,
          memberNames: members.filter((x) => x.thread_id === t.id && x.user_id !== uid).map((x) => names.get(x.user_id) ?? '').filter(Boolean),
          lastMessage: m ? { body: m.body, senderName: names.get(m.sender_id) ?? '', createdAt: m.created_at } : undefined,
          unreadCount: unread.get(t.id) ?? 0,
        };
      })
      .sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt));
  }

  async function markRead(threadId: UUID): Promise<void> {
    await done(
      sb
        .from('message_reads')
        .upsert({ thread_id: threadId, user_id: c.requireUserId(), last_read_at: c.now().toISOString() }, { onConflict: 'thread_id,user_id' }),
    );
  }

  return {
    listThreads: async () => summarize(await myThreads()),
    threadsForChild: async (childId) => summarize(await myThreads(childId)),

    async getThread(threadId) {
      const [s] = await summarize([await single<ThreadJoined>(sb.from('threads').select(THREAD_SELECT).eq('id', threadId), 'thread')]);
      return s;
    },

    async listMessages(threadId, opts) {
      const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 200);
      let q = sb.from('messages').select('id,thread_id,sender_id,body,attachments,created_at').eq('thread_id', threadId);
      if (opts?.before) q = q.lt('created_at', opts.before);
      const rows = (await many<MessageRow>(q.order('created_at', { ascending: false }).limit(limit))).reverse();
      const thread = await single<Pick<ThreadRow, 'organization_id'>>(sb.from('threads').select('organization_id').eq('id', threadId), 'thread');
      const senders = [...new Set(rows.map((r) => r.sender_id))];
      const [reads, roles] = await Promise.all([
        many<MessageReadRow>(sb.from('message_reads').select('thread_id,user_id,last_read_at').eq('thread_id', threadId)),
        senders.length
          ? many<{ user_id: UUID; role: Role }>(sb.from('memberships').select('user_id,role').eq('organization_id', thread.organization_id).in('user_id', senders))
          : Promise.resolve([] as { user_id: UUID; role: Role }[]),
      ]);
      const names = await c.names([...senders, ...reads.map((r) => r.user_id)]);
      const roleOf = new Map<UUID, Role>();
      for (const r of [...roles].sort((a, b) => ROLE_RANK.indexOf(a.role) - ROLE_RANK.indexOf(b.role))) if (!roleOf.has(r.user_id)) roleOf.set(r.user_id, r.role);
      return rows.map(
        (m): Message => ({
          id: m.id,
          threadId: m.thread_id,
          senderId: m.sender_id,
          senderName: names.get(m.sender_id) ?? '',
          senderRole: roleOf.get(m.sender_id) ?? 'parent',
          body: m.body ?? '',
          attachments: attachmentsOf(m.attachments),
          createdAt: m.created_at,
          readBy: reads
            .filter((r) => r.user_id !== m.sender_id && Date.parse(r.last_read_at) >= Date.parse(m.created_at))
            .map((r) => names.get(r.user_id) ?? '')
            .filter(Boolean),
        }),
      );
    },

    async send(threadId, body, attachments) {
      const uid = c.requireUserId();
      if (!body.trim() && !attachments?.length) throw new RepoError('validation', 'Message is empty');
      const row = await single<MessageRow>(
        sb.from('messages').insert({ thread_id: threadId, sender_id: uid, body: body.trim(), attachments: attachments ?? [] }).select('*'),
        'message',
      );
      await markRead(threadId).catch(() => undefined);
      const user = c.getUser();
      return {
        id: row.id,
        threadId: row.thread_id,
        senderId: uid,
        senderName: user?.profile.fullName ?? '',
        senderRole: c.role() ?? 'parent',
        body: row.body,
        attachments: attachmentsOf(row.attachments),
        createdAt: row.created_at,
        readBy: [],
      };
    },

    markRead,

    async unreadCount() {
      if (!c.orgOrNull()) return 0;
      const threads = await myThreads();
      const counts = await unreadByThread(c, threads.map((t) => t.id), c.requireUserId());
      return [...counts.values()].reduce((s, n) => s + n, 0);
    },

    async listAnnouncements() {
      const rows = await many<AnnouncementRow>(sb.from('announcements').select('*').eq('organization_id', c.requireOrg()).order('created_at', { ascending: false }).limit(100));
      const names = await c.names(rows.map((r) => r.created_by));
      return rows.map((r) => announcementFromRow(r, (r.created_by && names.get(r.created_by)) || ''));
    },

    async createAnnouncement(input) {
      if (input.audience === 'therapy_type' && !input.therapyTypeId) throw new RepoError('validation', 'Choose a therapy type');
      const row = await single<AnnouncementRow>(
        sb
          .from('announcements')
          .insert({
            organization_id: c.requireOrg(),
            title: input.title.trim(),
            body: input.body.trim(),
            audience: input.audience,
            therapy_type_id: input.audience === 'therapy_type' ? input.therapyTypeId : null,
            urgent: input.urgent,
          })
          .select('*'),
        'announcement',
      );
      return announcementFromRow(row, c.getUser()?.profile.fullName ?? '');
    },
  };
}
