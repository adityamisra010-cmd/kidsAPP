/** Children, About Me profiles, guardians, therapist assignments, goals and profile edit history. */
import { addDays, subMonths } from 'date-fns';

import { DEFAULT_MASTERY_RULE } from '@/domain/constants';
import type { Goal, GoalStatus } from '@/domain/types';
import { parse, toISODate } from '@/lib/dates';
import { stableId } from '@/lib/id';

import { goalBankItem } from '../content/goalBank';
import type { GoalScenario } from '../content/types';
import { at, dayOffset, ids, type Build } from './context';

/** Days before today a goal was mastered, by scenario. */
export const MASTERED_DAYS_AGO: Partial<Record<GoalScenario, number>> = { mastered: 16, maintenance: 38 };

const STATUS: Record<GoalScenario, GoalStatus> = {
  not_started: 'not_started',
  emerging: 'emerging',
  progressing: 'progressing',
  suggest: 'progressing',
  mastered: 'mastered',
  maintenance: 'maintenance',
};

export function buildChildren(b: Build): void {
  const st = b.store;
  for (const s of b.schools) {
    const orgId = ids.org(s.key);
    s.children.forEach((c, idx) => {
      const childId = ids.child(s.key, c.key);
      const dob = toISODate(addDays(subMonths(parse(b.today), c.ageMonths), -9));
      const lead = c.therapies.find((t) => t.lead) ?? c.therapies[0];
      const leadId = ids.staff(s.key, lead.therapist);
      st.children.push({
        id: childId,
        organizationId: orgId,
        fullName: c.fullName,
        preferredName: c.preferredName,
        dob,
        gender: c.gender,
        classGroup: c.classGroup,
        status: 'active',
        createdAt: at(b, -200 + idx * 3, '11:00'),
      });
      st.childProfiles.push({ ...c.profile, childId, clinical: c.clinical, updatedAt: at(b, -9 - idx, '17:20'), updatedBy: leadId });
      for (const g of c.guardians) {
        st.guardians.push({ childId, userId: ids.parent(s.key, g.parent), relation: g.relation, isPrimary: Boolean(g.primary) });
      }
      const seen = new Set<string>();
      for (const t of c.therapies) {
        const key = `${t.therapist}:${t.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        st.childTherapists.push({
          childId,
          userId: ids.staff(s.key, t.therapist),
          therapyTypeId: ids.therapyType(s.key, t.type),
          isLead: t === lead,
          activeFrom: dayOffset(b, -180),
        });
      }
      c.goals.forEach((g, gi) => {
        const bank = goalBankItem(g.bank);
        const therapist = c.therapies.find((t) => t.type === g.type)?.therapist ?? lead.therapist;
        const start = dayOffset(b, g.scenario === 'emerging' ? -63 : -84 + gi * 3);
        const masteredDays = MASTERED_DAYS_AGO[g.scenario];
        const goal: Goal = {
          id: ids.goal(s.key, c.key, g.bank),
          organizationId: orgId,
          childId,
          therapyTypeId: ids.therapyType(s.key, g.type),
          domain: bank.domain,
          staffText: bank.staff,
          parentText: bank.parent,
          baseline: g.baseline,
          masteryRule: { ...DEFAULT_MASTERY_RULE },
          status: STATUS[g.scenario],
          startDate: start,
          masteredAt: masteredDays != null ? at(b, -masteredDays, '16:40') : undefined,
          createdBy: ids.staff(s.key, therapist),
          createdAt: at(b, -84 + gi * 3, '15:00'),
        };
        st.goals.push(goal);
      });
    });
  }
  buildProfileEdits(b);
}

function buildProfileEdits(b: Build): void {
  const aarav = ids.child('anvaya', 'aarav');
  const riya = ids.staff('anvaya', 'riya');
  const arjun = ids.staff('anvaya', 'arjun');
  const profile = b.store.childProfiles.find((p) => p.childId === aarav)!;
  b.store.profileEdits.push(
    {
      id: stableId('edit:aarav:dos'),
      childId: aarav,
      field: 'dos',
      oldValue: profile.dos.slice(0, 3).join(' | '),
      newValue: profile.dos.join(' | '),
      by: riya,
      byName: 'Riya Menon',
      at: at(b, -2, '17:45'),
    },
    {
      id: stableId('edit:aarav:triggers'),
      childId: aarav,
      field: 'triggers',
      oldValue: 'loud_sounds | transitions | waiting',
      newValue: profile.triggers.join(' | '),
      by: arjun,
      byName: 'Arjun Mehta',
      at: at(b, -23, '13:10'),
    },
    {
      id: stableId('edit:aarav:calming'),
      childId: aarav,
      field: 'calmingNotes',
      oldValue: 'Firm squeezes on the shoulders, then count 1–10.',
      newValue: profile.calmingNotes,
      by: riya,
      byName: 'Riya Menon',
      at: at(b, -41, '16:05'),
    },
  );
  profile.updatedAt = at(b, -2, '17:45');
  profile.updatedBy = riya;
}
