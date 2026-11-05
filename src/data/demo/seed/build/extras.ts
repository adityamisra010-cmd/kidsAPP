/** Resources and shares, brief acknowledgements, an amendment, data requests and the audit trail. */
import type { AuditEntry, UUID } from '@/domain/types';
import { stableId } from '@/lib/id';

import { RESOURCES } from '../content/resources';
import { at, dayDiff, ids, minutesAgo, profileName, type Build } from './context';

export function buildResources(b: Build): void {
  for (const r of RESOURCES) {
    const id = stableId(`resource:${r.key}`);
    const { key: _key, school, daysAgo, shares, ...rest } = r;
    b.store.resources.push({ ...rest, id, organizationId: school ? ids.org(school) : null, createdAt: at(b, -daysAgo, '12:00') });
    for (const s of shares ?? []) {
      const schoolKey = school ?? (b.schools.find((x) => x.children.some((c) => c.key === s.child))!.key);
      const by = ids.staff(schoolKey, s.by);
      b.store.resourceShares.push({
        id: stableId(`share:${r.key}:${s.child}`),
        resourceId: id,
        childId: ids.child(schoolKey, s.child),
        sharedBy: by,
        sharedByName: profileName(b, by),
        note: s.note,
        at: at(b, -Math.min(daysAgo, 12), '17:10'),
      });
    }
  }
}

export function buildExtras(b: Build): void {
  const st = b.store;
  // Substitutes who already ran a session read the brief beforehand.
  for (const a of st.appointments) {
    if (!a.originalTherapistId || !st.sessions.some((s) => s.appointmentId === a.id)) continue;
    st.briefAcks.push({ appointmentId: a.id, userId: a.therapistId, at: new Date(new Date(a.startsAt).getTime() - 20 * 60_000).toISOString() });
  }

  // One amended session (after the 24-hour lock) in Aarav's speech history.
  const aarav = ids.child('anvaya', 'aarav');
  const speech = ids.therapyType('anvaya', 'speech');
  const target = st.sessions
    .filter((s) => s.childId === aarav && s.therapyTypeId === speech && dayDiff(s.date, b.today) >= 9)
    .sort((x, y) => y.date.localeCompare(x.date))[0];
  if (target) {
    const oldPlan = target.notes.planNext;
    const newPlan = `${oldPlan} Share the bubble-game video with mother for home practice.`;
    target.notes = { ...target.notes, planNext: newPlan };
    target.amendmentCount = 1;
    target.updatedAt = at(b, -dayDiff(target.date, b.today) + 2, '10:05');
    st.amendments.push({
      id: stableId(`amendment:${target.id}:planNext`),
      sessionId: target.id,
      entity: 'session_notes',
      entityId: target.id,
      field: 'notes.planNext',
      oldValue: oldPlan,
      newValue: newPlan,
      reason: 'Added the home-practice video plan after talking to the parent at pickup.',
      by: target.therapistId,
      byName: target.therapistName,
      at: target.updatedAt,
    });
    audit(b, 'anvaya', target.therapistId, 'session.amend', 'session', target.id, target.updatedAt, { field: 'notes.planNext' });
  }

  st.dataRequests.push({
    id: stableId('datarequest:swati:ishaan'),
    organizationId: ids.org('anvaya'),
    userId: ids.parent('anvaya', 'swati'),
    userName: 'Swati Gupta',
    childId: ids.child('anvaya', 'ishaan'),
    childName: 'Ishaan Gupta',
    kind: 'export',
    status: 'open',
    createdAt: at(b, -5, '21:15'),
  });

  for (const e of st.profileEdits) audit(b, 'anvaya', e.by, 'child_profile.update', 'child_profile', e.childId, e.at, { field: e.field });
  if (b.meta.rescheduled) {
    const req = st.rescheduleRequests.find((r) => r.id === b.meta.rescheduled!.requestId)!;
    audit(b, 'anvaya', req.resolvedBy!, 'reschedule.approve', 'appointment', req.appointmentId, req.resolvedAt!, {});
  }
  if (b.meta.substituteToday) audit(b, 'anvaya', ids.staff('anvaya', 'meera'), 'appointment.assign_substitute', 'appointment', b.meta.substituteToday, minutesAgo(b, 60 * 22), { substitute: 'Riya Menon' });
  audit(b, 'sahaj', ids.staff('sahaj', 'ananya'), 'import.commit', 'children', ids.org('sahaj'), at(b, -190, '15:30'), { kind: 'children', created: 12 });
  st.audit.sort((x, y) => y.at.localeCompare(x.at));
}

function audit(b: Build, school: 'anvaya' | 'sahaj', actorId: UUID, action: string, entity: string, entityId: UUID, atIso: string, meta: Record<string, unknown>): void {
  const entry: AuditEntry = {
    id: stableId(`audit:${action}:${entityId}:${atIso}`),
    organizationId: ids.org(school),
    actorId,
    actorName: profileName(b, actorId),
    action,
    entity,
    entityId,
    at: atIso,
    meta,
  };
  b.store.audit.push(entry);
}
