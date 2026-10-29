/**
 * Global goal bank: filtering and the add/edit form validation (error messages are i18n keys).
 */
import { z } from 'zod';

import { DEFAULT_THERAPY_TYPES, GOAL_DOMAINS } from '@/domain/constants';
import type { GoalBankItem, GoalDomain } from '@/domain/types';

export const goalBankSchema = z.object({
  domain: z.string().refine((v) => (GOAL_DOMAINS as string[]).includes(v), 'platform:goalBank.errors.domain'),
  therapyTypeKey: z.string().refine((v) => DEFAULT_THERAPY_TYPES.some((t) => t.key === v), 'platform:goalBank.errors.therapy'),
  staffText: z.string().trim().min(8, 'platform:goalBank.errors.staffText'),
  parentText: z.string().trim().min(8, 'platform:goalBank.errors.parentText'),
});

export interface GoalBankDraft {
  id?: string;
  domain: GoalDomain | '';
  therapyTypeKey: string;
  staffText: string;
  parentText: string;
}

export const EMPTY_GOAL_DRAFT: GoalBankDraft = { domain: '', therapyTypeKey: '', staffText: '', parentText: '' };

export type GoalDraftErrors = Partial<Record<keyof Omit<GoalBankDraft, 'id'>, string>>;

/** Validates a draft; returns the payload for `upsertGlobalGoalBankItem` or per-field error keys. */
export function validateGoalDraft(d: GoalBankDraft): { ok: true; value: Omit<GoalBankItem, 'id' | 'organizationId'> & { id?: string } } | { ok: false; errors: GoalDraftErrors } {
  const res = goalBankSchema.safeParse(d);
  if (!res.success) {
    const errors: GoalDraftErrors = {};
    for (const issue of res.error.issues) {
      const field = issue.path[0] as keyof GoalDraftErrors;
      errors[field] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      ...(d.id ? { id: d.id } : {}),
      domain: res.data.domain as GoalDomain,
      therapyTypeKey: res.data.therapyTypeKey,
      staffText: res.data.staffText,
      parentText: res.data.parentText,
    },
  };
}

/** Filter by domain ('all' for every domain) and a case-insensitive search over both wordings. */
export function filterGoalBank(list: GoalBankItem[], domain: GoalDomain | 'all', search: string): GoalBankItem[] {
  const q = search.trim().toLowerCase();
  return list
    .filter((g) => domain === 'all' || g.domain === domain)
    .filter((g) => !q || g.staffText.toLowerCase().includes(q) || g.parentText.toLowerCase().includes(q))
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.staffText.localeCompare(b.staffText));
}
