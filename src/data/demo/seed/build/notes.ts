/** SOAP notes and the warm parent summary for a generated session. */
import { PROMPT_LEVEL_KEYS } from '@/domain/constants';
import type { BehaviourIncident, GoalTrial, ParentCheckin, RatingValue, RegulationState, SessionNotes, UUID } from '@/domain/types';
import { trialAccuracy } from '@/domain/metrics';

import type { Rng } from '../../rng';
import { goalBankItem } from '../content/goalBank';
import { ASSESSMENT, NOT_WORKED_LABELS, PARENT_SUMMARY, PLAN, STATE_PARENT, SUBJECTIVE_GENERIC, WORKED_LABELS, fill, pronouns } from '../content/phrases';
import type { ChildSeed } from '../content/types';

export interface NoteInput {
  child: ChildSeed;
  relation: string;
  ratings: Record<string, RatingValue>;
  regulationState: RegulationState;
  trials: (GoalTrial & { bankKey: string })[];
  planGoals: { id: UUID; bankKey: string }[];
  incidents: BehaviourIncident[];
  breaks: number;
  workedTags: string[];
  notWorkedTags: string[];
  bucket: 'good' | 'steady' | 'hard';
  substitute?: { therapistShort: string; regularShort: string };
  checkin?: ParentCheckin;
}

const PROMPT_WORDS: Record<string, string> = {
  full_physical: 'full physical prompt',
  partial_physical: 'partial physical prompt',
  model_gestural: 'model/gesture',
  verbal: 'verbal prompt',
  independent: 'independent',
};

const STATE_WORDS: Record<RegulationState, string> = { under: 'under-aroused', regulated: 'regulated', over: 'over-aroused' };

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

export function objectiveText(i: Pick<NoteInput, 'ratings' | 'regulationState' | 'trials' | 'incidents' | 'breaks'>): string {
  const r = i.ratings;
  const head = `Engagement ${r.engagement}/5, attention ${r.attention}/5, cooperation ${r.cooperation}/5, regulation ${r.regulation}/5 (${STATE_WORDS[i.regulationState]}).`;
  const trials = i.trials
    .map((t) => `${goalBankItem(t.bankKey).short}: ${t.successful}/${t.attempted} (${trialAccuracy(t) ?? 0}%), ${PROMPT_WORDS[PROMPT_LEVEL_KEYS[t.promptLevel]]}`)
    .join('; ');
  const incidents = i.incidents.length
    ? `${i.incidents.length} incident${i.incidents.length > 1 ? 's' : ''} (${i.incidents.map((x) => x.type.replace('_', ' ')).join(', ')}).`
    : 'No behaviour incidents.';
  return `${head} ${trials ? `${trials}.` : ''} ${incidents} Breaks: ${i.breaks}.`.replace(/\s+/g, ' ').trim();
}

export function buildNotes(i: NoteInput, r: Rng): SessionNotes {
  const p = pronouns(i.child.gender);
  const name = i.child.preferredName;
  const main = goalBankItem(i.trials[0]?.bankKey ?? i.planGoals[0]?.bankKey ?? 'comm-follow-1step');
  const strategyKey = i.workedTags[0] ?? i.child.worked[0];
  const strategy = fill(WORKED_LABELS[strategyKey] ?? strategyKey, p);
  const avoid = NOT_WORKED_LABELS[i.notWorkedTags[0] ?? i.child.notWorked[0]] ?? 'long tasks';
  const vars: Record<string, string> = {
    ...p,
    name,
    goal: main.short,
    goalParent: lowerFirst(main.parent),
    strategy,
    strategyParent: strategy,
    avoid,
    task: main.task.title,
    relation: i.relation.toLowerCase(),
    state: STATE_WORDS[i.regulationState],
    stateParent: STATE_PARENT[i.regulationState],
    therapist: i.substitute?.therapistShort ?? '',
    regular: i.substitute?.regularShort ?? '',
  };
  const subjective = i.checkin
    ? `${i.relation} reports sleep ${i.checkin.sleep}, ${i.checkin.ateBreakfast ? 'had breakfast' : 'skipped breakfast'}, mood ${i.checkin.mood} at home.${i.checkin.changeFlag ? ` ${i.checkin.changeNote}` : ''}`
    : fill(r.pick(SUBJECTIVE_GENERIC), vars);
  const assessment = fill(r.pick(i.substitute ? ASSESSMENT.substitute : ASSESSMENT[i.bucket]), vars);
  const planMain = goalBankItem(i.planGoals[0]?.bankKey ?? main.key);
  const planNext = fill(r.pick(PLAN), { ...vars, goal: i.planGoals.map((g) => goalBankItem(g.bankKey).short).join(' and ') || planMain.short });
  const summaryPool = i.substitute ? PARENT_SUMMARY.substitute : PARENT_SUMMARY[i.bucket];
  return {
    subjective,
    objective: objectiveText(i),
    assessment,
    planNext,
    planGoalIds: i.planGoals.map((g) => g.id),
    parentSummary: fill(r.pick(summaryPool), vars),
  };
}
