import type { TFunction } from 'i18next';

import { DEFAULT_DIMENSIONS } from '@/domain/constants';
import type { ISODate, Trend } from '@/domain/types';
import { formatDate } from '@/lib/dates';

/** "24 May" (locale-aware) for chart axes. */
export function shortDate(d: ISODate): string {
  return formatDate(d).replace(/\s\d{4}$/, '');
}

/** First word of a dimension label, for narrow bar-chart axes ("Attention / Focus" → "Attention"). */
export function shortDimLabel(label: string): string {
  const first = label.split(/[\s/(]+/).filter(Boolean)[0] ?? label;
  return first.length > 9 ? `${first.slice(0, 8)}…` : first;
}

/** Parent label for a dimension: the reviewed translation when the school kept the default wording. */
export function parentDimLabel(t: TFunction, key: string, label: string): string {
  const def = DEFAULT_DIMENSIONS.find((d) => d.key === key);
  if (def && def.parentLabel === label) return t(`dims:${key}.parentLabel`, { defaultValue: label });
  return label;
}

/** Same for the staff label. */
export function staffDimLabel(t: TFunction, key: string, label: string): string {
  const def = DEFAULT_DIMENSIONS.find((d) => d.key === key);
  if (def && def.label === label) return t(`dims:${key}.label`, { defaultValue: label });
  return label;
}

/** Parents see gentle words for a trend; the arrow carries the direction. */
export function parentTrendKey(trend: Trend): string {
  return `progress:parent.trend.${trend}`;
}

/** Trend → the change wording used by TrendIndicator (better / same / harder). */
export function trendToChange(trend: Trend): 'better' | 'same' | 'harder' {
  return trend === 'up' ? 'better' : trend === 'down' ? 'harder' : 'same';
}
