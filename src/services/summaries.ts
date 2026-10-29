/**
 * Summary drafting service (v1 stub).
 *
 * v1 ships a LOCAL, rule-based implementation: no network, works offline, nothing leaves the
 * phone. It wraps the pure drafting functions in `src/features/session/summaries.ts`.
 *
 * v2 (planned): a Claude API implementation will slot in behind this same interface, e.g.
 * `setSummaryService(createClaudeSummaryService({ endpoint }))`, called through a Supabase Edge
 * Function so no API key ships in the app. Before enabling it:
 *   - send only the structured snapshot (ratings, goal parent wording, chips), never internal notes
 *     or identifiers beyond the child's first name;
 *   - record the school's opt-in and mention it in PRIVACY_NOTES.md (DPDP);
 *   - keep the local service as the offline fallback.
 * Remote drafts are not live-updated as ratings change (each draft is a network call), which is
 * why the interface exposes `kind`.
 *
 * Do NOT call any external API from this file in v1.
 */
import type { TFunction } from 'i18next';

import { draftObjective, draftParentSummary, type ObjectiveInput, type ParentSummaryInput } from '@/features/session/summaries';
import i18n from '@/i18n';

export type { ObjectiveInput, ParentSummaryInput } from '@/features/session/summaries';

export interface SummaryService {
  /** 'local' drafts are instant and can be kept in sync while the therapist logs. */
  readonly kind: 'local' | 'remote';
  /** Plain-language note for parents (no numbers, no internal notes). */
  draftParentSummary(input: ParentSummaryInput): Promise<string>;
  /** The "O" (objective) part of the SOAP note. */
  draftObjective(input: ObjectiveInput): Promise<string>;
}

function translatorFor(lang: ParentSummaryInput['language']): TFunction {
  return i18n.getFixedT(lang);
}

export const localSummaryService: SummaryService = {
  kind: 'local',
  async draftParentSummary(input) {
    return draftParentSummary(translatorFor(input.language), input);
  },
  async draftObjective(input) {
    return draftObjective(translatorFor(input.language), input);
  },
};

let current: SummaryService = localSummaryService;

export function getSummaryService(): SummaryService {
  return current;
}

/** Swap the implementation (v2 Claude service, or a fake in tests). */
export function setSummaryService(service: SummaryService | null): void {
  current = service ?? localSummaryService;
}
