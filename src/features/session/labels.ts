/**
 * Small translation helpers used across the session feature (logger, brief, detail, parent card).
 * Data-driven labels (dimensions, chips, therapy types) go through `@/i18n/labels`; these cover the
 * session-specific vocabularies.
 */
import type { TFunction } from 'i18next';

import { DEFAULT_DIMENSIONS, DEFAULT_THERAPY_TYPES, PROMPT_LEVEL_KEYS } from '@/domain/constants';
import type { ComparedToLast, PromptLevel, RatingValue } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';

export const RATING_VALUES: RatingValue[] = [1, 2, 3, 4, 5];

/** "Verbal", "Independent"… (chip / pill wording). */
export function promptLabel(t: TFunction, level: PromptLevel): string {
  return t(`session:prompt.${PROMPT_LEVEL_KEYS[level]}`);
}

/** "verbal prompt", "independent" (mid-sentence wording for notes). */
export function promptPhrase(t: TFunction, level: PromptLevel): string {
  return t(`session:promptLong.${PROMPT_LEVEL_KEYS[level]}`);
}

export function comparedLabel(t: TFunction, value: ComparedToLast): string {
  return t(`session:compared.${value}`);
}

/**
 * Parent-facing dimension label. Snapshots carry the school's English wording; when it is the
 * default wording we show the reviewed translation instead.
 */
export function parentDimensionLabel(t: TFunction, key: string, label: string): string {
  const def = DEFAULT_DIMENSIONS.find((d) => d.key === key);
  if (!def || def.parentLabel !== label) return label;
  return t(`dims:${key}.parentLabel`, { defaultValue: label }) || label;
}

/** Therapy type name when only the name is known (snapshots): translate unmodified defaults. */
export function therapyNameLabel(t: TFunction, name: string): string {
  const def = DEFAULT_THERAPY_TYPES.find((d) => d.name === name);
  return def ? therapyTypeLabel(t, def) : name;
}

/** Joins words naturally: "A", "A and B", "A, B and C". */
export function joinWords(t: TFunction, items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const and = t('session:summary.and');
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}
