/** In-app inbox for every persona (every notification kind appears) plus session summaries for parents. */
import type { AppNotification, NotificationKind, UUID } from '@/domain/types';
import { formatDay, formatTime } from '@/lib/dates';
import { stableId } from '@/lib/id';

import { apptDate } from './apptOps';
import { careThreadId } from './comms';
import { at, ids, minutesAgo, notAfterNow, type Build } from './context';

const A = 'anvaya' as const;

export function buildNotifications(b: Build): void {
  const st = b.store;
  let n = 0;
  const notify = (userId: UUID, kind: NotificationKind, title: string, body: string, route: string | undefined, createdAt: string, read: boolean) => {
    const created = notAfterNow(b, createdAt);
    const note: AppNotification = { id: stableId(`notif:${userId}:${kind}:${n++}`), userId, kind, title, body, route, createdAt: created };
    if (read) note.readAt = new Date(Math.min(new Date(created).getTime() + 40 * 60_000, b.now.getTime())).toISOString();
    st.notifications.push(note);
  };
  const name = (userId: UUID) => st.profiles.find((p) => p.id === userId)?.fullName ?? '';
  const child = (id: UUID) => st.children.find((c) => c.id === id)!;
  const tt = (id: UUID) => st.therapyTypes.find((t) => t.id === id)!;
  const priya = ids.parent(A, 'priya');
  const riya = ids.staff(A, 'riya');
  const meera = ids.staff(A, 'meera');
  const sunita = ids.staff(A, 'sunita');
  const kabir = ids.platformAdmin();
  const aarav = ids.child(A, 'aarav');
  const anaya = ids.child(A, 'anaya');

  // Session summaries for parents (sessions from the last 2 days).
  for (const s of st.sessions.filter((x) => new Date(x.createdAt).getTime() >= b.now.getTime() - 2 * 86_400_000)) {
    const c = child(s.childId);
    for (const g of st.guardians.filter((x) => x.childId === s.childId)) {
      const fresh = new Date(s.createdAt).getTime() > b.now.getTime() - 20 * 3_600_000;
      notify(g.userId, 'session_summary', `${c.preferredName}'s ${tt(s.therapyTypeId).name} session`, s.notes.parentSummary.slice(0, 140), `/session/${s.id}`, s.createdAt, !fresh);
    }
  }
  // Make sure Priya always has a recent summary for each child (even older than 2 days).
  for (const childId of [aarav, anaya]) {
    const latest = st.sessions.filter((s) => s.childId === childId).slice(-1)[0];
    if (latest && !st.notifications.some((x) => x.userId === priya && x.route === `/session/${latest.id}`)) notify(priya, 'session_summary', `${child(childId).preferredName}'s ${tt(latest.therapyTypeId).name} session`, latest.notes.parentSummary.slice(0, 140), `/session/${latest.id}`, latest.createdAt, childId === anaya);
  }

  // Priya.
  const next = st.appointments
    .filter((a) => (a.childId === aarav || a.childId === anaya) && a.status === 'scheduled' && new Date(a.startsAt) > b.now)
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt))[0];
  if (next) notify(priya, 'appointment_reminder', `Reminder: ${tt(next.therapyTypeId).name} on ${formatDay(next.startsAt)}`, `${child(next.childId).preferredName} with ${name(next.therapistId)} at ${formatTime(next.startsAt)}.`, `/appointment/${next.id}`, minutesAgo(b, 50), false);
  if (b.meta.rescheduled) {
    const a = st.appointments.find((x) => x.id === b.meta.rescheduled!.appointmentId)!;
    notify(priya, 'reschedule_response', 'Your change request was approved', `Aarav's speech session is now on ${formatDay(a.startsAt)} at ${formatTime(a.startsAt)}.`, `/appointment/${a.id}`, at(b, -2, '10:16'), true);
    notify(priya, 'appointment_changed', 'Appointment moved', `${formatDay(a.startsAt)}: Speech Therapy moved to ${formatTime(a.startsAt)} with Riya Menon.`, `/appointment/${a.id}`, at(b, -2, '10:16'), true);
  }
  if (b.meta.counteredRequest) {
    notify(priya, 'reschedule_response', 'New times suggested for Anaya', 'Dr. Meera Iyer suggested two other times on the same day. Tap to choose one.', `/appointment/${b.meta.counteredRequest.appointmentId}`, at(b, -1, '11:21'), false);
  }
  const aaravTask = st.homeTasks.filter((t) => t.childId === aarav && t.status === 'active').sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
  if (aaravTask) notify(priya, 'home_task_assigned', 'New home activity for Aarav', `${aaravTask.assignedByName} added "${aaravTask.title}" (${aaravTask.frequencyPerWeek}× a week).`, `/practice/task/${aaravTask.id}`, aaravTask.createdAt, true);
  const reviewed = st.homeLogs.filter((l) => (l.childId === aarav || l.childId === anaya) && l.reviewedAt).sort((x, y) => y.reviewedAt!.localeCompare(x.reviewedAt!));
  reviewed.slice(0, 2).forEach((l, i) =>
    notify(priya, 'home_log_feedback', `${l.reviewedByName} replied to your practice log`, l.reviewComment ?? 'Great job!', `/practice/task/${l.taskId}`, l.reviewedAt!, i > 0),
  );
  notify(priya, 'new_message', 'Dr. Meera Iyer · Aarav care team', "Received, Priya ji. I'll check Ms. Neha's schedule and confirm by this evening.", `/messages/${careThreadId(aarav)}`, at(b, 0, '09:05'), false);
  const ann = (key: string) => st.announcements.find((x) => x.id === stableId(`announcement:${key}`));
  const urgent = ann('anvaya:pooja-leave');
  if (urgent) notify(priya, 'announcement', urgent.title, urgent.body.slice(0, 120), `/announcements/${urgent.id}`, urgent.createdAt, false);
  const workshop = ann('anvaya:workshop');
  if (workshop) notify(priya, 'announcement', workshop.title, workshop.body.slice(0, 120), `/announcements/${workshop.id}`, workshop.createdAt, true);

  // Riya.
  const todayCount = st.appointments.filter((a) => a.therapistId === riya && apptDate(a) === b.today && a.status !== 'cancelled').length;
  notify(riya, 'daily_agenda', `Good morning! ${todayCount} sessions today`, 'One is a substitute session — please read the Handover Brief before you start.', '/today', at(b, 0, '08:00'), false);
  if (b.meta.substituteToday) {
    const a = st.appointments.find((x) => x.id === b.meta.substituteToday)!;
    notify(riya, 'substitute_assigned', `You're covering ${child(a.childId).preferredName}'s session`, `${tt(a.therapyTypeId).name} today at ${formatTime(a.startsAt)} for ${name(a.originalTherapistId!)}. Please read the brief first.`, `/appointment/${a.id}`, at(b, -1, '11:35'), false);
  }
  for (const l of st.homeLogs.filter((x) => x.mediaId && !x.reviewedAt)) {
    notify(riya, 'home_log_submitted', `${l.loggedByName} sent a practice video`, `${l.childName} · ${l.taskTitle}`, `/practice/task/${l.taskId}`, l.createdAt, false);
  }
  notify(riya, 'new_message', 'Priya Sharma · Aarav care team', "Noted, thank you. Also, can we move next week's OT session?", `/messages/${careThreadId(aarav)}`, at(b, -1, '20:14'), false);
  for (const id of b.meta.unlogged) {
    const a = st.appointments.find((x) => x.id === id)!;
    if (a.therapistId !== riya) continue;
    notify(riya, 'unlogged_session', 'Session not logged yet', `${child(a.childId).preferredName} · ${formatTime(a.startsAt)}. Log it while it's fresh.`, `/appointment/${a.id}`, new Date(new Date(a.endsAt).getTime() + 30 * 60_000).toISOString(), false);
  }
  const alerts = st.alerts.filter((x) => x.status === 'open' && x.organizationId === ids.org(A));
  for (const al of alerts) {
    const onCaseload = st.childTherapists.some((t) => t.childId === al.childId && t.userId === riya);
    if (onCaseload) notify(riya, 'child_alert', `Alert: ${al.childName}`, al.message, `/child/${al.childId}`, al.createdAt, true);
    notify(meera, 'child_alert', `Alert: ${al.childName}`, al.message, `/child/${al.childId}`, al.createdAt, false);
    notify(sunita, 'child_alert', `Alert: ${al.childName}`, al.message, `/child/${al.childId}`, al.createdAt, true);
  }
  if (urgent) notify(riya, 'announcement', urgent.title, urgent.body.slice(0, 120), `/announcements/${urgent.id}`, urgent.createdAt, true);

  // Meera & Sunita.
  if (b.meta.pendingRequest) {
    for (const u of [meera, sunita]) notify(u, 'reschedule_request', 'Change request from Priya Sharma', "Aarav's OT session — family wedding in Agra. 2 alternative slots proposed.", `/appointment/${b.meta.pendingRequest.appointmentId}`, minutesAgo(b, 60 * 17), false);
  }
  [...b.meta.unlogged]
    .map((id) => st.appointments.find((x) => x.id === id)!)
    .filter((a) => a.organizationId === ids.org(A) && a.therapistId !== riya)
    .forEach((a, i) => notify(meera, 'unlogged_session', `Not logged: ${child(a.childId).preferredName}`, `${tt(a.therapyTypeId).name} with ${name(a.therapistId)} on ${formatDay(a.startsAt)} is still unlogged.`, `/appointment/${a.id}`, new Date(new Date(a.endsAt).getTime() + 24 * 3_600_000).toISOString(), i > 0));
  notify(meera, 'new_message', 'Deepika Agarwal · Vihaan care team', "Sure Ma'am, Thursday after 5 PM works for us.", `/messages/${careThreadId(ids.child(A, 'vihaan'))}`, at(b, -1, '19:25'), false);
  const review = ann('anvaya:case-review');
  if (review) notify(meera, 'announcement', review.title, review.body, `/announcements/${review.id}`, review.createdAt, true);
  if (urgent) notify(sunita, 'announcement', urgent.title, urgent.body.slice(0, 120), `/announcements/${urgent.id}`, urgent.createdAt, true);

  // Sahaj coordinator.
  for (const al of st.alerts.filter((x) => x.status === 'open' && x.organizationId === ids.org('sahaj'))) {
    notify(ids.staff('sahaj', 'shalini'), 'child_alert', `Alert: ${al.childName}`, al.message, `/child/${al.childId}`, al.createdAt, false);
  }

  // Platform admin.
  notify(kabir, 'announcement', 'Sahaj finished onboarding', 'Sahaj Therapy & Learning Centre imported 12 children and 15 parents. All parents have app access.', `/platform/school/${ids.org('sahaj')}`, at(b, -20, '12:00'), true);
  notify(kabir, 'announcement', 'Weekly usage report ready', 'Both schools logged more than 90% of attended sessions this week.', '/platform', at(b, -1, '09:00'), false);
}
