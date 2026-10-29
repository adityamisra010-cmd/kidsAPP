/**
 * Helpers for data-driven labels: chips, dimensions, therapy types.
 * Vocabulary chips are stored as keys and translated; custom chips are shown as typed.
 */
import type { TFunction } from 'i18next';

import { CHIPS, DEFAULT_DIMENSIONS, DEFAULT_THERAPY_TYPES, type ChipGroup } from '@/domain/constants';
import type { RatingDimension, RatingValue, TherapyType } from '@/domain/types';

const chipGroupKey: Record<ChipGroup, string> = {
  commTools: 'commTools',
  reinforcers: 'reinforcers',
  triggers: 'triggers',
  calming: 'calming',
  antecedents: 'antecedents',
  worked: 'worked',
  notWorked: 'notWorked',
};

/** Label for a chip value in a vocabulary group (custom values pass through). */
export function chipLabel(t: TFunction, group: ChipGroup, value: string): string {
  const known = (CHIPS[group] as readonly string[]).includes(value);
  return known ? t(`chips:${chipGroupKey[group]}.${value}`) : value;
}

/** Same as chipLabel but for groups not in CHIPS (incidents, domains, commModes, regulation). */
export function vocabLabel(
  t: TFunction,
  group: 'incidents' | 'domains' | 'commModes' | 'regulation',
  value: string,
): string {
  return t(`chips:${group}.${value}`, { defaultValue: value });
}

/** Therapy type name: translated when it's an unmodified default, otherwise the school's name. */
export function therapyTypeLabel(t: TFunction, tt: Pick<TherapyType, 'key' | 'name'>): string {
  const def = DEFAULT_THERAPY_TYPES.find((d) => d.key === tt.key);
  if (def && def.name === tt.name) return t(`chips:therapyTypes.${tt.key}`, { defaultValue: tt.name });
  return tt.name;
}

type DimText = Pick<RatingDimension, 'key' | 'label' | 'parentLabel' | 'description' | 'anchors'>;

function isDefaultWording(d: DimText): boolean {
  const def = DEFAULT_DIMENSIONS.find((x) => x.key === d.key);
  return !!def && def.label === d.label;
}

/**
 * Dimension wording in the current language. Schools may edit the English text; if a school kept
 * the default wording we show the reviewed translation, otherwise the school's own text.
 */
export function dimensionText(t: TFunction, d: DimText) {
  const translated = isDefaultWording(d) && t('dims:engagement.label', { defaultValue: '' }) !== '';
  const tr = (field: string, fallback: string) =>
    translated ? t(`dims:${d.key}.${field}`, { defaultValue: fallback }) : fallback;
  return {
    label: tr('label', d.label),
    parentLabel: tr('parentLabel', d.parentLabel),
    description: tr('description', d.description),
    anchor: (v: RatingValue) => tr(String(v), d.anchors[v]),
  };
}
