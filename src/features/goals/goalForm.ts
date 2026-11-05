/** New-goal form model: defaults, Goal Bank prefill, validation and the create payload. */
import { DEFAULT_MASTERY_RULE } from '@/domain/constants';
import type { Goal, GoalBankItem, GoalDomain, GoalStatus, ISODate, TherapyType, UUID } from '@/domain/types';

export interface GoalDraft {
  therapyTypeId: UUID | null;
  domain: GoalDomain | null;
  staffText: string;
  parentText: string;
  baseline: string;
  accuracy: number;
  consecutiveSessions: number;
  startDate: ISODate;
  status: GoalStatus;
  /** Set when the goal was picked from the bank (for display only). */
  bankItemId?: UUID;
}

export type GoalDraftField = 'therapyTypeId' | 'domain' | 'staffText' | 'parentText' | 'accuracy' | 'consecutiveSessions' | 'startDate';
/** Values are i18n keys. */
export type GoalDraftErrors = Partial<Record<GoalDraftField, string>>;

export const ACCURACY_RANGE = { min: 50, max: 100, step: 5 } as const;
export const SESSIONS_RANGE = { min: 1, max: 10 } as const;
export const MAX_GOAL_TEXT = 240;

export function emptyGoalDraft(today: ISODate, therapyTypeId?: UUID | null): GoalDraft {
  return {
    therapyTypeId: therapyTypeId ?? null,
    domain: null,
    staffText: '',
    parentText: '',
    baseline: '',
    accuracy: DEFAULT_MASTERY_RULE.accuracy,
    consecutiveSessions: DEFAULT_MASTERY_RULE.consecutiveSessions,
    startDate: today,
    status: 'not_started',
  };
}

/**
 * Prefill from a bank item. The therapy type follows the bank item's key when the child (or school)
 * has that type; otherwise the current choice is kept so the therapist can pick.
 */
export function draftFromBankItem(item: GoalBankItem, base: GoalDraft, therapyTypes: Pick<TherapyType, 'id' | 'key'>[]): GoalDraft {
  const match = therapyTypes.find((t) => t.key === item.therapyTypeKey);
  return {
    ...base,
    domain: item.domain,
    staffText: item.staffText,
    parentText: item.parentText,
    therapyTypeId: match?.id ?? base.therapyTypeId,
    bankItemId: item.id,
  };
}

export function validateGoalDraft(d: GoalDraft): GoalDraftErrors {
  const e: GoalDraftErrors = {};
  if (!d.therapyTypeId) e.therapyTypeId = 'goals:form.errors.therapyType';
  if (!d.domain) e.domain = 'goals:form.errors.domain';
  if (!d.staffText.trim()) e.staffText = 'goals:form.errors.staffText';
  else if (d.staffText.trim().length > MAX_GOAL_TEXT) e.staffText = 'goals:form.errors.tooLong';
  if (!d.parentText.trim()) e.parentText = 'goals:form.errors.parentText';
  else if (d.parentText.trim().length > MAX_GOAL_TEXT) e.parentText = 'goals:form.errors.tooLong';
  if (!Number.isFinite(d.accuracy) || d.accuracy < ACCURACY_RANGE.min || d.accuracy > ACCURACY_RANGE.max) e.accuracy = 'goals:form.errors.accuracy';
  if (!Number.isInteger(d.consecutiveSessions) || d.consecutiveSessions < SESSIONS_RANGE.min || d.consecutiveSessions > SESSIONS_RANGE.max)
    e.consecutiveSessions = 'goals:form.errors.sessions';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate)) e.startDate = 'goals:form.errors.startDate';
  return e;
}

export type GoalCreateInput = Omit<Goal, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'masteredAt'>;

/** Call only after `validateGoalDraft` returned no errors. */
export function toGoalInput(d: GoalDraft, childId: UUID): GoalCreateInput {
  return {
    childId,
    therapyTypeId: d.therapyTypeId as UUID,
    domain: d.domain as GoalDomain,
    staffText: d.staffText.trim(),
    parentText: d.parentText.trim(),
    baseline: d.baseline.trim(),
    masteryRule: { accuracy: d.accuracy, consecutiveSessions: d.consecutiveSessions },
    status: d.status,
    startDate: d.startDate,
  };
}

/** Client-side bank filter (the bank is small; filtering locally keeps typing smooth). */
export function filterBank(
  items: GoalBankItem[],
  f: { search?: string; domain?: GoalDomain | null; therapyTypeKey?: string | null },
): GoalBankItem[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return items.filter(
    (i) =>
      (!f.domain || i.domain === f.domain) &&
      (!f.therapyTypeKey || i.therapyTypeKey === f.therapyTypeKey) &&
      (!q || i.staffText.toLowerCase().includes(q) || i.parentText.toLowerCase().includes(q)),
  );
}

/** Bank items for the add-to-bank sheet. */
export interface BankDraft {
  domain: GoalDomain | null;
  therapyTypeKey: string | null;
  staffText: string;
  parentText: string;
}

export function validateBankDraft(d: BankDraft): Partial<Record<keyof BankDraft, string>> {
  const e: Partial<Record<keyof BankDraft, string>> = {};
  if (!d.domain) e.domain = 'goals:form.errors.domain';
  if (!d.therapyTypeKey) e.therapyTypeKey = 'goals:form.errors.therapyType';
  if (!d.staffText.trim()) e.staffText = 'goals:form.errors.staffText';
  if (!d.parentText.trim()) e.parentText = 'goals:form.errors.parentText';
  return e;
}
