/** Parent check-ins, home-practice tasks, parent logs (3 with videos) and therapist reviews. */
import { isAttended } from '@/domain/derive';
import type { Appointment, HomeLogDifficulty, HomeLogOutcome, HomeTask, ParentCheckin, ReviewReaction, UUID } from '@/domain/types';
import { parse, toISODate } from '@/lib/dates';
import { stableId } from '@/lib/id';

import { rng, type Rng } from '../../rng';
import type { StoredHomeLog } from '../../store';
import { goalBankItem } from '../content/goalBank';
import { PARENT_LOG_NOTES, REVIEW_COMMENTS, fill, pronouns } from '../content/phrases';
import { apptDate } from './apptOps';
import { at, childSeed, dayDiff, dayOffset, ids, notAfterNow, profileName, type Build } from './context';

const HOUR = 3_600_000;
const CHANGE_NOTES = ['Cousin’s wedding at home this weekend — late nights.', 'Started cough syrup yesterday.', 'Grandparents visiting; routine is different.', 'Mild cold since yesterday.'];

export function buildCheckins(b: Build): void {
  const primary = (childId: UUID) => b.store.guardians.find((g) => g.childId === childId && g.isPrimary)!.userId;
  const personaKids = new Set([ids.child('anvaya', 'aarav'), ids.child('anvaya', 'anaya')]);
  const firstOfDay = new Map<string, Appointment>();
  for (const a of [...b.store.appointments].sort((x, y) => x.startsAt.localeCompare(y.startsAt))) {
    const key = `${a.childId}|${apptDate(a)}`;
    if (!firstOfDay.has(key) && (isAttended(a) || apptDate(a) === b.today) && apptDate(a) <= b.today) firstOfDay.set(key, a);
  }
  const vihaan = ids.child('anvaya', 'vihaan');
  const vihaanRecent = new Set(
    b.store.appointments
      .filter((a) => a.childId === vihaan && a.therapyTypeId === ids.therapyType('anvaya', 'behaviour') && isAttended(a) && new Date(a.endsAt) <= b.now && !b.meta.unlogged.has(a.id))
      .sort((x, y) => x.startsAt.localeCompare(y.startsAt))
      .slice(-3)
      .map((a) => a.id),
  );
  for (const a of firstOfDay.values()) {
    const r = rng(`checkin:${a.id}`);
    const isToday = apptDate(a) === b.today;
    const forced = a.id === b.meta.substituteToday || vihaanRecent.has(a.id);
    if (personaKids.has(a.childId) && isToday) continue; // Priya can try the check-in herself.
    if (!forced && !r.chance(isToday ? 0.55 : 0.2)) continue;
    const decline = vihaanRecent.has(a.id);
    const checkin: ParentCheckin & { clientId: UUID } = {
      id: stableId(`checkin:${a.id}`),
      clientId: stableId(`checkin-client:${a.id}`),
      organizationId: a.organizationId,
      childId: a.childId,
      appointmentId: a.id,
      date: apptDate(a),
      sleep: decline ? 'poor' : r.pick(['good', 'good', 'good', 'ok', 'ok', 'poor'] as const),
      ateBreakfast: r.chance(0.85),
      mood: decline ? 'okay' : r.pick(['happy', 'happy', 'okay', 'okay', 'upset'] as const),
      changeFlag: decline || r.chance(0.12),
      changeNote: '',
      submittedBy: primary(a.childId),
      createdAt: notAfterNow(b, at(b, dayDiff(b.today, apptDate(a)), `07:${String(r.int(30, 59)).padStart(2, '0')}`)),
    };
    if (checkin.changeFlag) checkin.changeNote = decline ? 'New baby sister is up at night, so Vihaan is sleeping late.' : r.pick(CHANGE_NOTES);
    b.store.checkins.push(checkin);
  }
}

export function buildHomePractice(b: Build): void {
  for (const s of b.schools) {
    for (const c of s.children) {
      const childId = ids.child(s.key, c.key);
      const goals = b.store.goals.filter((g) => g.childId === childId);
      const ordered = [...goals.filter((g) => g.status !== 'mastered' && g.status !== 'maintenance'), ...goals.filter((g) => g.status === 'mastered' || g.status === 'maintenance')];
      const chosen = ordered.slice(0, Math.max(2, Math.min(3, ordered.length)));
      const diligence = c.key === 'aarav' || c.key === 'anaya' ? 0.9 : 0.55 + rng(`diligence:${childId}`).next() * 0.4;
      for (const goal of chosen) {
        const seed = c.goals.find((g) => ids.goal(s.key, c.key, g.bank) === goal.id)!;
        const tpl = goalBankItem(seed.bank).task;
        const r = rng(`task:${goal.id}`);
        const from = -r.int(21, 30);
        const task: HomeTask = {
          id: stableId(`task:${goal.id}`),
          organizationId: goal.organizationId,
          childId,
          goalId: goal.id,
          assignedBy: goal.createdBy,
          assignedByName: profileName(b, goal.createdBy),
          title: tpl.title,
          steps: tpl.steps,
          frequencyPerWeek: tpl.freq,
          durationMinutes: tpl.minutes,
          activeFrom: dayOffset(b, from),
          activeTo: dayOffset(b, r.int(10, 30)),
          status: 'active',
          createdAt: at(b, from, '16:30'),
        };
        b.store.homeTasks.push(task);
        generateLogs(b, task, diligence, c.gender, s.region === 'south');
      }
    }
  }
  addCompletedTask(b);
  addVideoLogs(b);
}

function pickOutcome(r: Rng): { outcome: HomeLogOutcome; difficulty: HomeLogDifficulty } {
  const x = r.next();
  if (x < 0.66) return { outcome: 'done', difficulty: r.pick(['easy', 'easy', 'ok', 'ok', 'ok', 'hard'] as const) };
  if (x < 0.9) return { outcome: 'partly', difficulty: r.pick(['ok', 'ok', 'hard', 'easy'] as const) };
  return { outcome: 'could_not', difficulty: r.pick(['hard', 'hard', 'ok'] as const) };
}

const REACTIONS: ReviewReaction[] = ['great_job', 'great_job', 'great_job', 'good_effort', 'good_effort', 'try_next_time', 'lets_discuss'];

function generateLogs(b: Build, task: HomeTask, diligence: number, gender: 'male' | 'female', south: boolean): void {
  const guardians = b.store.guardians.filter((g) => g.childId === task.childId).sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary));
  const child = b.store.children.find((c) => c.id === task.childId)!;
  const vars = { ...pronouns(gender), name: child.preferredName ?? child.fullName };
  const start = Math.max(-21, dayDiff(b.today, task.activeFrom));
  for (let o = start; o <= 0; o++) {
    const r = rng(`log:${task.id}:${o}`);
    if (!r.chance(Math.min(0.95, (task.frequencyPerWeek / 7) * diligence))) continue;
    const createdAt = at(b, o, `${r.int(17, 21)}:${String(r.int(0, 59)).padStart(2, '0')}`);
    if (new Date(createdAt) > b.now) continue;
    const { outcome, difficulty } = pickOutcome(r);
    const by = guardians.length > 1 && r.chance(0.25) ? guardians[1] : guardians[0];
    const pool = [...(PARENT_LOG_NOTES[`${outcome}:${difficulty}`] ?? []), ...(south && outcome === 'done' ? PARENT_LOG_NOTES.south : [])];
    const log: StoredHomeLog = {
      id: stableId(`homelog:${task.id}:${o}`),
      clientId: stableId(`homelog-client:${task.id}:${o}`),
      organizationId: task.organizationId,
      taskId: task.id,
      taskTitle: task.title,
      childId: task.childId,
      childName: child.fullName,
      loggedBy: by.userId,
      loggedByName: profileName(b, by.userId),
      outcome,
      difficulty,
      note: pool.length && r.chance(0.65) ? fill(r.pick(pool), vars) : '',
      createdAt,
      useInNextSession: false,
    };
    const ageDays = -o;
    // Therapists keep up with reviews: older logs are all reviewed; some of yesterday's and today's wait.
    if (r.chance(ageDays > 1 ? 1 : 0.6)) review(b, log, task.assignedBy, r, vars);
    b.store.homeLogs.push(log);
  }
}

function review(b: Build, log: StoredHomeLog, therapistId: UUID, r: Rng, vars: Record<string, string>): void {
  const reaction = r.pick(REACTIONS);
  log.reviewedBy = therapistId;
  log.reviewedByName = profileName(b, therapistId);
  log.reviewReaction = reaction;
  log.reviewComment = r.chance(0.7) ? fill(r.pick(REVIEW_COMMENTS[reaction]), vars) : undefined;
  log.reviewedAt = notAfterNow(b, new Date(new Date(log.createdAt).getTime() + r.int(12, 40) * HOUR).toISOString());
}

function addCompletedTask(b: Build): void {
  const goal = b.store.goals.find((g) => g.id === ids.goal('anvaya', 'aarav', 'comm-respond-name'))!;
  const tpl = goalBankItem('comm-respond-name').task;
  b.store.homeTasks.push({
    id: stableId(`task:${goal.id}`),
    organizationId: goal.organizationId,
    childId: goal.childId,
    goalId: goal.id,
    assignedBy: goal.createdBy,
    assignedByName: profileName(b, goal.createdBy),
    title: tpl.title,
    steps: tpl.steps,
    frequencyPerWeek: tpl.freq,
    durationMinutes: tpl.minutes,
    activeFrom: dayOffset(b, -70),
    activeTo: dayOffset(b, -16),
    status: 'completed',
    createdAt: at(b, -70, '16:00'),
  });
}

/** Three logs with the bundled practice videos: two in Riya's review queue, one already reviewed. */
function addVideoLogs(b: Build): void {
  const A = 'anvaya';
  const items = [
    { n: 1, child: 'aarav', bank: 'comm-request-2word', parent: 'priya', day: -2, time: '18:20', outcome: 'done', difficulty: 'ok', durationS: 28, size: 35119, note: "Here's today's bubble game — he said 'more bubble' and 'blow bubble'!" },
    { n: 2, child: 'aarav', bank: 'comm-request-2word', parent: 'priya', day: -9, time: '19:05', outcome: 'partly', difficulty: 'ok', durationS: 41, size: 35158, note: 'He got distracted halfway but asked for bubbles once on his own.' },
    { n: 3, child: 'myra', bank: 'comm-pecs-exchange', parent: 'ritu', day: -1, time: '17:45', outcome: 'done', difficulty: 'hard', durationS: 33, size: 35045, note: 'She gave me the biscuit card twice but cried when I held the snack back.' },
  ] as const;
  for (const v of items) {
    const goalId = ids.goal(A, v.child, v.bank);
    const task = b.store.homeTasks.find((t) => t.goalId === goalId)!;
    const userId = ids.parent(A, v.parent);
    const createdAt = notAfterNow(b, at(b, v.day, v.time));
    const mediaId = stableId(`media:practice-${v.n}`);
    b.store.media.push({
      id: mediaId,
      organizationId: task.organizationId,
      ownerId: userId,
      bucketPath: `demo/practice-${v.n}.mp4`,
      kind: 'video',
      durationS: v.durationS,
      sizeBytes: v.size,
      expiresAt: new Date(new Date(createdAt).getTime() + 180 * 24 * HOUR).toISOString(),
      uploadStatus: 'uploaded',
      createdAt,
    });
    // Drop a random log on the same day so the video log is the only one.
    b.store.homeLogs = b.store.homeLogs.filter((l) => !(l.taskId === task.id && toISODate(parse(l.createdAt)) === dayOffset(b, v.day)));
    const child = childSeed(b, A, v.child);
    const log: StoredHomeLog = {
      id: stableId(`homelog:video:${v.n}`),
      clientId: stableId(`homelog-client:video:${v.n}`),
      organizationId: task.organizationId,
      taskId: task.id,
      taskTitle: task.title,
      childId: task.childId,
      childName: child.fullName,
      loggedBy: userId,
      loggedByName: profileName(b, userId),
      outcome: v.outcome,
      difficulty: v.difficulty,
      note: v.note,
      mediaId,
      createdAt,
      useInNextSession: false,
    };
    if (v.n === 2) {
      log.reviewedBy = task.assignedBy;
      log.reviewedByName = profileName(b, task.assignedBy);
      log.reviewReaction = 'great_job';
      log.reviewComment = "Lovely! Notice how he looks at you before asking — that's exactly what we want. I'll use this clip in our next session.";
      log.reviewedAt = notAfterNow(b, at(b, v.day + 1, '09:40'));
      log.useInNextSession = true;
    }
    b.store.homeLogs.push(log);
  }
  b.store.homeLogs.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}
