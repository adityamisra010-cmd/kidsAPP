/** Care-team and staff-only threads with realistic conversations, read state, and announcements. */
import type { Thread, UUID } from '@/domain/types';
import { formatDate } from '@/lib/dates';
import { stableId } from '@/lib/id';

import { at, ids, notAfterNow, profileName, type Build, type SchoolKey } from './context';

const A = 'anvaya' as const;
const S = 'sahaj' as const;

export function careThreadId(childId: UUID): UUID {
  return stableId(`thread:care:${childId}`);
}
export function staffThreadId(childId: UUID): UUID {
  return stableId(`thread:staff:${childId}`);
}

export function buildThreads(b: Build): void {
  const st = b.store;
  const roleOf = (userId: UUID) => st.memberships.find((m) => m.userId === userId)!.role;
  for (const child of st.children) {
    const staff = st.childTherapists.filter((t) => t.childId === child.id).map((t) => t.userId);
    const coordinator = st.memberships.find((m) => m.organizationId === child.organizationId && m.role === 'coordinator')!.userId;
    const admin = st.memberships.find((m) => m.organizationId === child.organizationId && m.role === 'school_admin')!.userId;
    const guardians = st.guardians.filter((g) => g.childId === child.id).map((g) => g.userId);
    addThread(b, { id: careThreadId(child.id), organizationId: child.organizationId, childId: child.id, kind: 'care_team', title: `${child.fullName} · Care team`, createdAt: child.createdAt }, [...guardians, ...staff, coordinator]);
    addThread(b, { id: staffThreadId(child.id), organizationId: child.organizationId, childId: child.id, kind: 'staff_only', title: `${child.fullName} · Staff only`, createdAt: child.createdAt }, [...staff, coordinator, admin]);
  }

  const msg = (threadId: UUID, who: UUID, day: number, time: string, body: string) => {
    const createdAt = notAfterNow(b, at(b, day, time));
    st.messages.push({ id: stableId(`msg:${threadId}:${day}:${time}`), threadId, senderId: who, senderName: profileName(b, who), senderRole: roleOf(who), body, attachments: [], createdAt });
    return createdAt;
  };
  const p = (s: SchoolKey, k: string) => ids.parent(s, k);
  const t = (s: SchoolKey, k: string) => ids.staff(s, k);
  const care = (s: SchoolKey, k: string) => careThreadId(ids.child(s, k));
  const staff = (s: SchoolKey, k: string) => staffThreadId(ids.child(s, k));
  const leaveTo = b.meta.poojaLeaveTo ? formatDate(b.meta.poojaLeaveTo) : 'later this week';

  // Aarav — care team.
  const aCare = care(A, 'aarav');
  msg(aCare, p(A, 'priya'), -6, '18:42', "Good evening Ma'am. Aarav's home task says the bubble game 5 times a week — should we do it before or after dinner? He gets very excited after dinner.");
  msg(aCare, t(A, 'riya'), -6, '19:10', 'Good evening Priya ji! Before dinner is better — he is hungry and more motivated to ask. Keep it to 5 minutes and stop while he is still enjoying it.');
  msg(aCare, p(A, 'priya'), -5, '08:15', "Thank you! He said 'more bubble' twice yesterday!");
  msg(aCare, t(A, 'riya'), -5, '10:02', "That's wonderful! I've added it to today's notes. Please send a short video when you get a chance.");
  const nehaAt = msg(aCare, t(A, 'neha'), -3, '16:30', 'Hi Priya ji, in OT this week we are working on his pincer grasp. If you have rajma or chana at home, the bean-posting game in the app is perfect.');
  msg(aCare, t(A, 'meera'), -2, '12:05', 'Dear parents, a quick update: Ms. Pooja is on leave this week, so a few sessions are being covered by other therapists. Aarav’s sessions are not affected.');
  const priyaAt = msg(aCare, p(A, 'priya'), -1, '20:14', "Noted, thank you. Also, can we move next week's OT session? We have a family wedding in Agra. I've sent a request in the app.");
  msg(aCare, t(A, 'meera'), 0, '09:05', "Received, Priya ji. I'll check Ms. Neha's schedule and confirm by this evening.");
  setRead(b, aCare, p(A, 'priya'), priyaAt);
  setRead(b, aCare, t(A, 'riya'), nehaAt);

  // Aarav — staff only.
  const aStaff = staff(A, 'aarav');
  msg(aStaff, t(A, 'arjun'), -8, '13:20', 'Aarav had two meltdowns on Saturday at clean-up time. The 2-minute timer helped the second time. Can we all use the same timer picture?');
  msg(aStaff, t(A, 'riya'), -8, '15:02', 'Yes — I will use the red sand-timer card from his schedule. His 2-word requests are picking up nicely in speech.');
  msg(aStaff, t(A, 'neha'), -7, '11:48', 'Agreed. In OT he touched dough with a spoon for 2 minutes today — a big step for him.');
  msg(aStaff, t(A, 'meera'), -4, '17:30', "Lovely progress, team. Riya, I've moved 'responds to name' to Wins — please keep a probe every couple of weeks.");
  msg(aStaff, t(A, 'riya'), -2, '17:50', 'Will do. He settles faster when sessions start with the swing — added that to his Do’s.');

  // Anaya — care team and staff only.
  const nCare = care(A, 'anaya');
  msg(nCare, t(A, 'riya'), -4, '13:10', "Hi Priya ji, Anaya is getting the 'k' sound in words like cat and cup almost every time now. If this continues we'll mark the goal as achieved soon!");
  msg(nCare, p(A, 'priya'), -4, '14:02', "That's so good to hear! She has been playing the ticking-clock game with her brother.");
  msg(nCare, p(A, 'priya'), -1, '08:40', "Ma'am, Anaya has a mild cold. Is it okay to send her for the next session?");
  msg(nCare, t(A, 'riya'), -1, '09:15', "Yes, if there's no fever she can come. We'll keep the session lighter.");
  const nStaff = staff(A, 'anaya');
  msg(nStaff, t(A, 'riya'), -3, '17:05', 'Meera, Anaya has met the mastery criterion for /k/ and /g/ (3 sessions at 80%+). I will confirm after the next probe.');
  msg(nStaff, t(A, 'meera'), -3, '18:20', "Great. Let's add /k/ in the middle of words as the next goal.");

  // Vihaan — declining; staff discussion and a call with parents.
  const vStaff = staff(A, 'vihaan');
  msg(vStaff, t(A, 'arjun'), -1, '13:05', 'Flagging Vihaan — his last 3 behaviour sessions were much harder: calling out, two refusals. Mother mentioned poor sleep since the baby arrived.');
  msg(vStaff, t(A, 'meera'), -1, '14:40', "Thanks Arjun, I've seen the alert. Let's call the parents this week and check whether medicine timing has changed.");
  msg(vStaff, t(A, 'riya'), 0, '08:50', 'Seeing the same in speech — shorter attention. I will keep tasks to 5 minutes.');
  const vCare = care(A, 'vihaan');
  const meeraAt = msg(vCare, t(A, 'meera'), -1, '15:10', 'Dear Mr. and Mrs. Agarwal, could we have a short call this week about Vihaan’s sessions? Nothing to worry about — we would like to understand how his sleep has been.');
  msg(vCare, p(A, 'deepika'), -1, '19:25', "Sure Ma'am, Thursday after 5 PM works for us.");
  setRead(b, vCare, t(A, 'meera'), meeraAt);

  // Substitution handover for the child Riya covers today (Ishaan or Advik, depending on the weekday).
  const subAppt = st.appointments.find((a) => a.id === b.meta.substituteToday);
  if (subAppt) {
    const subChild = st.children.find((c) => c.id === subAppt.childId)!;
    const isIshaan = subChild.id === ids.child(A, 'ishaan');
    const thread = staffThreadId(subChild.id);
    st.threadMembers.push({ threadId: thread, userId: t(A, 'riya') });
    const tip = isIshaan ? 'he settles after lining up 3 cars' : 'keep his AAC device within reach and offer the break card early';
    const plan = isIshaan
      ? "'I want' requests with juice and cars. He may script Chhota Bheem lines — just redirect with a choice."
      : "'more' and 'stop' on the AAC core page during bubbles. Whining or flapping means he needs the break card.";
    msg(thread, t(A, 'meera'), -1, '11:30', `Riya, you're covering ${subChild.preferredName}'s speech session today while Pooja is on leave (until ${leaveTo}). Please read the brief first — ${tip}.`);
    msg(thread, t(A, 'pooja'), -1, '12:10', `Thanks Riya! The plan is on the brief: ${plan}`);
    msg(thread, t(A, 'riya'), -1, '12:25', 'Got it, I will read it before the session.');
  }

  // Sahaj.
  const adCare = care(S, 'aditya');
  msg(adCare, p(S, 'shruti'), -3, '18:10', 'Hello Lakshmi ma’am, Adi is saying "neeru beku" (want water) at home now! Should we keep mixing Kannada and English?');
  msg(adCare, t(S, 'lakshmi'), -2, '10:20', 'Lovely! Yes, please use whichever words come naturally at home. Two languages will not confuse him.');
  const rStaff = staff(S, 'rahul');
  msg(rStaff, t(S, 'rohan'), -1, '12:40', 'Rahul had 3 incidents today — mostly when water play ended. I will try a visual timer and a trade token next session.');
  msg(rStaff, t(S, 'shalini'), -1, '16:05', 'Thanks Rohan. Please share the plan with Deepa too so OT ends the same way.');

  buildAnnouncements(b);
}

function addThread(b: Build, thread: Thread, members: UUID[]): void {
  b.store.threads.push(thread);
  for (const userId of [...new Set(members)]) b.store.threadMembers.push({ threadId: thread.id, userId });
}

function setRead(b: Build, threadId: UUID, userId: UUID, lastReadAt: string): void {
  b.store.threadReads.push({ threadId, userId, lastReadAt });
}

/** Everyone who has not got an explicit read marker has read their threads fully. */
export function finaliseReads(b: Build): void {
  const st = b.store;
  for (const m of st.threadMembers) {
    if (st.threadReads.some((r) => r.threadId === m.threadId && r.userId === m.userId)) continue;
    const last = st.messages.filter((x) => x.threadId === m.threadId).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
    if (last) st.threadReads.push({ threadId: m.threadId, userId: m.userId, lastReadAt: last.createdAt });
  }
}

function buildAnnouncements(b: Build): void {
  for (const sKey of [A, S]) {
    const org = b.store.organizations.find((o) => o.id === ids.org(sKey))!;
    const admin = ids.staff(sKey, sKey === A ? 'sunita' : 'ananya');
    const coord = ids.staff(sKey, sKey === A ? 'meera' : 'shalini');
    const next = org.settings.holidays.find((h) => h.date > b.today);
    const add = (key: string, by: UUID, day: number, time: string, a: { title: string; body: string; audience: 'everyone' | 'all_parents' | 'all_staff'; urgent?: boolean }) =>
      b.store.announcements.push({
        id: stableId(`announcement:${sKey}:${key}`),
        organizationId: org.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
        urgent: Boolean(a.urgent),
        createdBy: by,
        createdByName: profileName(b, by),
        createdAt: notAfterNow(b, at(b, day, time)),
        readBy: [],
      });
    if (next) {
      add('holiday', admin, -3, '11:00', {
        title: `Centre closed on ${formatDate(next.date)} (${next.label})`,
        body: `${org.shortName} will be closed on ${formatDate(next.date)} for ${next.label}. Sessions that day will not run; your coordinator will offer make-up slots. Wishing all our families a happy and safe festival!`,
        audience: 'everyone',
      });
    }
    if (sKey === A) {
      add('workshop', coord, -6, '16:00', {
        title: 'Parent workshop: managing meltdowns at home',
        body: 'This Saturday, 11:00 AM–12:30 PM in Classroom B. Mr. Arjun Mehta will share simple strategies for transitions and waiting. Siblings welcome; tea and snacks provided. Reply in the care-team chat if you plan to attend.',
        audience: 'all_parents',
      });
      add('pooja-leave', coord, -1, '10:30', {
        title: 'Schedule change: Ms. Pooja Malhotra on leave',
        body: `Ms. Pooja is on leave until ${b.meta.poojaLeaveTo ? formatDate(b.meta.poojaLeaveTo) : 'later this week'}. Her sessions are being covered by other therapists. If your child's session is affected you will get a separate notification.`,
        audience: 'everyone',
        urgent: true,
      });
      add('case-review', admin, -4, '09:30', {
        title: 'Monthly case review — Friday 4:30 PM',
        body: 'Please bring 2 children each whose goals need discussion. Meera will share the attention list on Thursday.',
        audience: 'all_staff',
      });
    } else {
      add('deepavali', coord, -8, '15:00', {
        title: 'Sensory-friendly Deepavali tips',
        body: 'Crackers can be hard for our children. We have added a short guide to Resources — ear defenders, a quiet room plan and a picture story you can read together.',
        audience: 'all_parents',
      });
    }
  }
}
