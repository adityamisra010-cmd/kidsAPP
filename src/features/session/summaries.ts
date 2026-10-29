/**
 * Rule-based text drafts for the Session Logger (pure, tested, works offline).
 * - draftObjective: the "O" of SOAP, written from the snapshot, goal trials and behaviour log.
 * - draftParentSummary: a short, warm, plain-language note for parents.
 * Wording lives in i18n (`session:summary.*`) so drafts follow the therapist's language.
 * `src/services/summaries.ts` wraps these behind the SummaryService interface (v2: Claude API).
 */
import type { TFunction } from 'i18next';

import { PARENT_HIGHLIGHT_KEYS } from '@/domain/constants';
import { sessionScore as computeScore } from '@/domain/metrics';
import type {
  BehaviourIncident,
  Language,
  PromptLevel,
  RatingDimension,
  RatingValue,
  RegulationState,
} from '@/domain/types';
import { chipLabel, dimensionText, vocabLabel } from '@/i18n/labels';

import { joinWords, promptPhrase } from './labels';
import { bucketForSeconds, enabledDimensions } from './logic/draft';

export interface TrialSummary {
  goalText: string;
  attempted: number;
  successful: number;
  promptLevel?: PromptLevel;
}

export interface ObjectiveInput {
  language: Language;
  dimensions: RatingDimension[];
  ratings: Partial<Record<string, RatingValue>>;
  regulationState?: RegulationState;
  trials: TrialSummary[];
  incidents: BehaviourIncident[];
  breaksCount: number;
  actualMinutes?: number;
  startedLate?: boolean;
  /** Used when a trial has no prompt level (the session's Independence rating). */
  fallbackPromptLevel?: PromptLevel;
}

export interface ParentSummaryInput {
  language: Language;
  childName: string;
  dimensions: RatingDimension[];
  ratings: Partial<Record<string, RatingValue>>;
  regulationState?: RegulationState;
  /** Rating change per dimension vs the last session. Omit when there is no previous session. */
  deltaLast?: Partial<Record<string, number | undefined>>;
  /** Parent wording of the goals worked on. */
  goalTexts: string[];
}

const lowerFirst = (lang: Language, s: string) => (lang === 'en' && s ? s[0].toLowerCase() + s.slice(1) : s);
const upperFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Words in a sentence list: first keeps its capital, the rest are lower-cased (English only). */
function sentenceList(t: TFunction, lang: Language, labels: string[]): string {
  return joinWords(
    t,
    labels.map((l, i) => (i === 0 ? l : lowerFirst(lang, l))),
  );
}

/** Priority order: dimensions parents care about most first, then the school's order. */
function byParentPriority(dims: RatingDimension[]): RatingDimension[] {
  const rank = (d: RatingDimension) => {
    const i = PARENT_HIGHLIGHT_KEYS.indexOf(d.key);
    return i === -1 ? PARENT_HIGHLIGHT_KEYS.length + d.sortOrder : i;
  };
  return [...dims].sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------------------
// Objective ("O")
// ---------------------------------------------------------------------------

export function draftObjective(t: TFunction, input: ObjectiveInput): string {
  const lang = input.language;
  const lines: string[] = [];
  const dims = enabledDimensions(input.dimensions);

  const rated = dims.filter((d) => input.ratings[d.key] != null);
  if (rated.length) {
    const list = rated.map((d) => t('session:summary.objective.ratingItem', { label: dimensionText(t, d).label, value: input.ratings[d.key] }));
    lines.push(t('session:summary.objective.ratings', { list: list.join(', ') }));
  }
  if (input.regulationState) {
    lines.push(t('session:summary.objective.state', { state: lowerFirst(lang, vocabLabel(t, 'regulation', input.regulationState)) }));
  }

  for (const tr of input.trials) {
    if (tr.attempted <= 0) continue;
    const successful = Math.min(tr.successful, tr.attempted);
    const level = tr.promptLevel ?? input.fallbackPromptLevel;
    const base = t('session:summary.objective.trial', {
      goal: tr.goalText,
      successful,
      attempted: tr.attempted,
      accuracy: Math.round((successful / tr.attempted) * 100),
    });
    lines.push(level ? t('session:summary.objective.trialPrompt', { trial: base, prompt: promptPhrase(t, level) }) : `${base}.`);
  }

  if (input.incidents.length === 0) {
    lines.push(t('session:summary.objective.noIncidents'));
  } else {
    const items = input.incidents.map((inc) => {
      let s = lowerFirst(lang, vocabLabel(t, 'incidents', inc.type));
      const bucket = bucketForSeconds(inc.durationSeconds);
      if (bucket) s = t('session:summary.objective.incidentDuration', { incident: s, duration: t(`session:duration.${bucket}`) });
      if (inc.antecedentTags.length) {
        const ants = inc.antecedentTags.map((a) => lowerFirst(lang, chipLabel(t, 'antecedents', a)));
        s = t('session:summary.objective.incidentAfter', { incident: s, antecedents: joinWords(t, ants) });
      }
      return s;
    });
    lines.push(t('session:summary.objective.incidents', { count: input.incidents.length, list: items.join('; ') }));
  }
  if (input.breaksCount > 0) lines.push(t('session:summary.objective.breaks', { count: input.breaksCount }));

  if (input.actualMinutes != null && input.actualMinutes > 0) {
    lines.push(
      t(input.startedLate ? 'session:summary.objective.lengthLate' : 'session:summary.objective.length', { minutes: input.actualMinutes }),
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Parent summary
// ---------------------------------------------------------------------------

type Opening = 'settled' | 'great' | 'good' | 'mixed' | 'hard';

export function parentOpening(score: number, ratings: Partial<Record<string, RatingValue>>): Opening {
  const mood = ratings.mood ?? 0;
  const regulation = ratings.regulation ?? 0;
  if (score >= 55 && mood >= 4 && regulation >= 4) return 'settled';
  if (score >= 75) return 'great';
  if (score >= 55) return 'good';
  if (score >= 40) return 'mixed';
  return 'hard';
}

/**
 * "Aarav had a calm, settled session today. Focus was better than last time. We worked on:
 * asking for help with two words." Kind, factual, never numeric.
 */
export function draftParentSummary(t: TFunction, input: ParentSummaryInput): string {
  const lang = input.language;
  const dims = enabledDimensions(input.dimensions);
  const rated = dims.filter((d) => input.ratings[d.key] != null);
  if (rated.length === 0) return '';

  const ratings: Record<string, number> = {};
  for (const d of rated) ratings[d.key] = input.ratings[d.key] as number;
  const score = computeScore(ratings, rated);
  const opening = parentOpening(score, input.ratings);
  const sentences: string[] = [t(`session:summary.parent.open.${opening}`, { name: input.childName })];
  const label = (d: RatingDimension) => dimensionText(t, d).parentLabel;
  const ordered = byParentPriority(rated);

  if (input.deltaLast) {
    const deltas = input.deltaLast;
    const better = ordered.filter((d) => (deltas[d.key] ?? 0) >= 1).slice(0, 2);
    if (better.length) {
      sentences.push(t('session:summary.parent.better', { count: better.length, list: sentenceList(t, lang, better.map(label)) }));
    } else {
      const strengths = ordered.filter((d) => (input.ratings[d.key] ?? 0) >= 4).slice(0, 2);
      if (strengths.length) sentences.push(t('session:summary.parent.strengths', { count: strengths.length, list: sentenceList(t, lang, strengths.map(label)) }));
    }
    if (opening !== 'hard') {
      const harder = ordered
        .filter((d) => (deltas[d.key] ?? 0) <= -1)
        .sort((a, b) => (deltas[a.key] ?? 0) - (deltas[b.key] ?? 0))[0];
      if (harder) sentences.push(t('session:summary.parent.harder', { label: upperFirst(label(harder)) }));
    }
  } else {
    const strengths = ordered.filter((d) => (input.ratings[d.key] ?? 0) >= 4).slice(0, 2);
    if (strengths.length) sentences.push(t('session:summary.parent.strengths', { count: strengths.length, list: sentenceList(t, lang, strengths.map(label)) }));
  }

  if (input.regulationState === 'under') sentences.push(t('session:summary.parent.energyLow'));
  if (input.regulationState === 'over') sentences.push(t('session:summary.parent.energyHigh'));

  const goals = input.goalTexts.filter(Boolean).slice(0, 2);
  if (goals.length) {
    sentences.push(t('session:summary.parent.goals', { goals: joinWords(t, goals.map((g) => lowerFirst(lang, g.replace(/[.\s]+$/, '')))) }));
  }
  return sentences.join(' ');
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

/** Merge chip lists, dropping repeats case-insensitively and keeping first-seen order. */
export function dedupeChips(...lists: (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const v = raw.trim();
      const k = v.toLowerCase();
      if (!v || seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}
