/** Resources, messaging (threads, read receipts, announcements), notifications and alerts. */
import type { AlertsRepo, MessagingRepo, NotificationsRepo, ResourcesRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import type { Announcement, Message, RequestContext, Resource, Thread, ThreadSummary, UUID } from '@/domain/types';
import { STAFF_ROLES } from '@/domain/types';
import { uuid } from '@/lib/id';

import type { StoredAnnouncement, StoredMessage } from '../store';
import type { DemoCore } from './core';

export function createResourcesRepo(core: DemoCore): ResourcesRepo {
  const st = core.db;
  const parentVisible = (r: Resource) => r.audience === 'parents' || r.audience === 'all';
  const sharedWith = (ctx: RequestContext, r: Resource) =>
    st.resourceShares.find((s) => s.resourceId === r.id && ((s.childId && core.isGuardian(ctx.userId, s.childId)) || s.userId === ctx.userId));
  const visible = (ctx: RequestContext, r: Resource) =>
    (r.organizationId === null || r.organizationId === ctx.organizationId) && (ctx.role !== 'parent' || parentVisible(r) || Boolean(sharedWith(ctx, r)));
  return {
    list: (filter) =>
      core.run(() => {
        const ctx = core.requireOrg();
        const q = filter?.search?.trim().toLowerCase();
        return st.resources
          .filter(
            (r) =>
              visible(ctx, r) &&
              (!filter?.therapyTypeKey || r.therapyTypeKeys.includes(filter.therapyTypeKey)) &&
              (!filter?.domain || r.domains.includes(filter.domain)) &&
              (!filter?.kind || r.kind === filter.kind) &&
              (!q || [r.title, r.description, ...r.tags].some((v) => v.toLowerCase().includes(q))),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }),
    get: (id) =>
      core.run(() => {
        const ctx = core.requireOrg();
        const r = core.sameOrg(st.resources.find((x) => x.id === id), 'Resource');
        if (!visible(ctx, r)) throw new RepoError('forbidden', 'This resource has not been shared with you.');
        return r;
      }),
    create: (input) =>
      core.run(() => {
        const ctx = core.requireStaff();
        if (!input.title.trim() || !input.url.trim()) throw new RepoError('validation', 'Title and link are required.');
        const r: Resource = { ...input, id: uuid(), organizationId: ctx.organizationId, createdAt: core.nowIso() };
        st.resources.push(r);
        return r;
      }),
    share: (resourceId, target, note) =>
      core.run(() => {
        const ctx = core.requireStaff();
        core.sameOrg(st.resources.find((x) => x.id === resourceId), 'Resource');
        if (!target.childId && !target.userId) throw new RepoError('validation', 'Choose a child or a parent.');
        if (target.childId) core.requireChild(target.childId, ['full']);
        if (target.userId && core.roleIn(target.userId, ctx.organizationId) !== 'parent') throw new RepoError('validation', 'You can share only with parents at this school.');
        const share = { id: uuid(), resourceId, childId: target.childId, userId: target.userId, sharedBy: ctx.userId, sharedByName: core.name(ctx.userId), note, at: core.nowIso() };
        st.resourceShares.push(share);
        return share;
      }),
    forParent: (childId) =>
      core.run(() => {
        const ctx = core.requireOrg();
        core.requireChild(childId, ['parent', 'full']);
        const guardians = new Set(core.guardiansOf(childId));
        return st.resources
          .filter((r) => r.organizationId === null || r.organizationId === ctx.organizationId)
          .map((r) => ({ ...r, share: st.resourceShares.find((s) => s.resourceId === r.id && (s.childId === childId || (s.userId && guardians.has(s.userId)))) }))
          .filter((r) => r.share || parentVisible(r))
          .sort((a, b) => Number(Boolean(b.share)) - Number(Boolean(a.share)) || b.createdAt.localeCompare(a.createdAt));
      }),
  };
}

export function createMessagingRepo(core: DemoCore): MessagingRepo {
  const st = core.db;
  const isMember = (threadId: UUID, userId: UUID) => st.threadMembers.some((m) => m.threadId === threadId && m.userId === userId);
  const lastRead = (threadId: UUID, userId: UUID) => st.threadReads.find((r) => r.threadId === threadId && r.userId === userId)?.lastReadAt ?? '';
  const messagesOf = (threadId: UUID) => st.messages.filter((m) => m.threadId === threadId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  /** Members can read; admins/coordinators can read any thread about a child at their school. Parents never see staff-only threads. */
  const canRead = (ctx: RequestContext, t: Thread) =>
    t.organizationId === ctx.organizationId && !(ctx.role === 'parent' && t.kind === 'staff_only') && (isMember(t.id, ctx.userId) || (core.isAdmin(ctx) && Boolean(t.childId)));
  const loadThread = (threadId: UUID): Thread => {
    const ctx = core.requireOrg();
    const t = core.sameOrg(st.threads.find((x) => x.id === threadId), 'Conversation');
    if (!canRead(ctx, t)) throw new RepoError('forbidden', 'You are not part of this conversation.');
    return t;
  };
  const unreadIn = (t: Thread, userId: UUID) => {
    const since = lastRead(t.id, userId);
    return st.messages.filter((m) => m.threadId === t.id && m.senderId !== userId && m.createdAt > since).length;
  };
  const summary = (t: Thread, userId: UUID): ThreadSummary => {
    const msgs = messagesOf(t.id);
    const last = msgs[msgs.length - 1];
    const child = t.childId ? st.children.find((c) => c.id === t.childId) : undefined;
    return {
      ...t,
      childName: child?.fullName,
      childPhotoUrl: child?.photoUrl,
      memberNames: st.threadMembers.filter((m) => m.threadId === t.id).map((m) => core.name(m.userId)),
      lastMessage: last ? { body: last.body, senderName: last.senderName, createdAt: last.createdAt } : undefined,
      unreadCount: unreadIn(t, userId),
    };
  };
  const withReceipts = (m: StoredMessage): Message => ({
    ...m,
    readBy: st.threadReads.filter((r) => r.threadId === m.threadId && r.userId !== m.senderId && r.lastReadAt >= m.createdAt).map((r) => core.name(r.userId)),
  });
  const markRead = (threadId: UUID, userId: UUID) => {
    const row = st.threadReads.find((r) => r.threadId === threadId && r.userId === userId);
    if (row) row.lastReadAt = core.nowIso();
    else st.threadReads.push({ threadId, userId, lastReadAt: core.nowIso() });
  };
  const myThreads = (ctx: RequestContext) => st.threads.filter((t) => t.organizationId === ctx.organizationId && isMember(t.id, ctx.userId) && !(ctx.role === 'parent' && t.kind === 'staff_only'));
  const byRecent = (a: ThreadSummary, b: ThreadSummary) => (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt);
  /** Whether an announcement is addressed to this person (admins can additionally read all of them). */
  const inAudience = (userId: UUID, role: RequestContext['role'], a: Pick<Announcement, 'audience' | 'therapyTypeId'>) => {
    if (a.audience === 'everyone') return true;
    if (a.audience === 'all_parents') return role === 'parent';
    if (a.audience === 'all_staff') return STAFF_ROLES.includes(role);
    return role === 'parent'
      ? st.guardians.some((g) => g.userId === userId && st.childTherapists.some((t) => t.childId === g.childId && t.therapyTypeId === a.therapyTypeId))
      : st.qualifications.some((q) => q.userId === userId && q.therapyTypeId === a.therapyTypeId);
  };
  const audienceOf = (ctx: RequestContext, a: StoredAnnouncement) => core.isAdmin(ctx) || inAudience(ctx.userId, ctx.role, a);

  return {
    listThreads: () =>
      core.run(() => {
        const ctx = core.requireOrg();
        return myThreads(ctx).map((t) => summary(t, ctx.userId)).sort(byRecent);
      }),
    threadsForChild: (childId) =>
      core.run(() => {
        const ctx = core.requireOrg();
        core.requireChild(childId, ['full', 'parent']);
        return st.threads.filter((t) => t.childId === childId && canRead(ctx, t)).map((t) => summary(t, ctx.userId)).sort(byRecent);
      }),
    getThread: (threadId) => core.run(() => summary(loadThread(threadId), core.requireCtx().userId)),
    listMessages: (threadId, opts) =>
      core.run(() => {
        loadThread(threadId);
        const msgs = messagesOf(threadId).filter((m) => !opts?.before || m.createdAt < opts.before);
        return msgs.slice(-(opts?.limit ?? 50)).map(withReceipts);
      }),
    send: (threadId, body, attachments = []) =>
      core.run(() => {
        const ctx = core.requireOrg();
        const t = loadThread(threadId);
        if (!body.trim() && attachments.length === 0) throw new RepoError('validation', 'Type a message first.');
        if (!isMember(t.id, ctx.userId)) st.threadMembers.push({ threadId: t.id, userId: ctx.userId });
        const msg: StoredMessage = { id: uuid(), threadId, senderId: ctx.userId, senderName: core.name(ctx.userId), senderRole: ctx.role, body: body.trim(), attachments, createdAt: core.nowIso() };
        st.messages.push(msg);
        markRead(threadId, ctx.userId);
        const others = st.threadMembers.filter((m) => m.threadId === threadId).map((m) => m.userId);
        core.notify(others, 'new_message', `${msg.senderName} · ${t.title}`, msg.body.slice(0, 120) || 'Sent an attachment', `/messages/${threadId}`);
        return withReceipts(msg);
      }),
    markRead: (threadId) =>
      core.run(() => {
        loadThread(threadId);
        markRead(threadId, core.requireCtx().userId);
      }),
    unreadCount: () =>
      core.run(() => {
        const ctx = core.requireCtx();
        if (!ctx.organizationId) return 0;
        return myThreads(ctx).reduce((n, t) => n + unreadIn(t, ctx.userId), 0);
      }),
    listAnnouncements: () =>
      core.run((): Announcement[] => {
        const ctx = core.requireCtx();
        if (!ctx.organizationId) return [];
        return st.announcements
          .filter((a) => a.organizationId === ctx.organizationId && audienceOf(ctx, a))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(({ readBy: _readBy, ...a }) => a);
      }),
    createAnnouncement: (input) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        if (!input.title.trim() || !input.body.trim()) throw new RepoError('validation', 'Title and message are required.');
        if (input.audience === 'therapy_type' && !input.therapyTypeId) throw new RepoError('validation', 'Choose a therapy type.');
        const a: StoredAnnouncement = { ...input, id: uuid(), organizationId: ctx.organizationId, createdBy: ctx.userId, createdByName: core.name(ctx.userId), createdAt: core.nowIso(), readBy: [] };
        st.announcements.push(a);
        const recipients = st.memberships
          .filter((m) => m.organizationId === ctx.organizationId && m.status === 'active' && inAudience(m.userId, m.role, a))
          .map((m) => m.userId);
        core.notify(recipients, 'announcement', a.title, a.body.slice(0, 120), `/announcements/${a.id}`);
        const { readBy: _readBy, ...out } = a;
        return out;
      }),
  };
}

export function createNotificationsRepo(core: DemoCore): NotificationsRepo {
  const st = core.db;
  const mine = () => {
    const ctx = core.requireCtx();
    return st.notifications.filter((n) => n.userId === ctx.userId);
  };
  return {
    list: (opts) => core.run(() => mine().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, opts?.limit ?? 50)),
    unreadCount: () => core.run(() => mine().filter((n) => !n.readAt).length),
    markRead: (id) =>
      core.run(() => {
        const list = mine().filter((n) => !n.readAt && (id === 'all' || n.id === id));
        if (id !== 'all' && !mine().some((n) => n.id === id)) throw new RepoError('not_found', 'Notification not found.');
        for (const n of list) n.readAt = core.nowIso();
      }),
  };
}

export function createAlertsRepo(core: DemoCore): AlertsRepo {
  const st = core.db;
  const load = (id: UUID) => {
    const ctx = core.requireStaff();
    const alert = core.sameOrg(st.alerts.find((a) => a.id === id), 'Alert');
    if (!core.isAdmin(ctx) && !core.isAssigned(ctx.userId, alert.childId)) throw new RepoError('forbidden', 'This alert is not for your caseload.');
    return alert;
  };
  return {
    list: (filter) =>
      core.run(() => {
        const ctx = core.requireStaff();
        if (filter?.childId) core.requireChild(filter.childId, ['full']);
        return st.alerts
          .filter(
            (a) =>
              a.organizationId === ctx.organizationId &&
              (core.isAdmin(ctx) || core.isAssigned(ctx.userId, a.childId)) &&
              (!filter?.status || filter.status.includes(a.status)) &&
              (!filter?.childId || a.childId === filter.childId),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }),
    acknowledge: (id) =>
      core.run(() => {
        const alert = load(id);
        if (alert.status === 'open') alert.status = 'acknowledged';
      }),
    resolve: (id) =>
      core.run(() => {
        const ctx = core.requireAdmin();
        const alert = load(id);
        Object.assign(alert, { status: 'resolved', resolvedBy: ctx.userId, resolvedAt: core.nowIso() });
        core.audit('alert.resolve', 'alert', id);
      }),
  };
}
