/** Formats About Me edit-history values (stored as text or JSON) into readable words. */
import type { ChipGroup } from '@/domain/constants';

const CHIP_FIELDS: Record<string, ChipGroup> = {
  commTools: 'commTools',
  reinforcers: 'reinforcers',
  triggers: 'triggers',
  calming: 'calming',
};

export interface EditValueLabels {
  chip: (group: ChipGroup, value: string) => string;
  commMode: (value: string) => string;
  empty: string;
}

function parseList(raw: string): string[] | null {
  const s = raw.trim();
  if (!s.startsWith('[')) return null;
  try {
    const v: unknown = JSON.parse(s);
    return Array.isArray(v) ? v.map((x) => String(x)) : null;
  } catch {
    return null;
  }
}

/** Short, human value for one side of an edit. Long text is cut at `max` characters. */
export function formatEditValue(field: string, raw: string | undefined, labels: EditValueLabels, max = 160): string {
  if (raw == null || raw.trim() === '' || raw.trim() === '[]') return labels.empty;
  const base = field.split('.')[0];
  const list = parseList(raw);
  let out: string;
  if (list) {
    const group = CHIP_FIELDS[base];
    out = list.map((v) => (group ? labels.chip(group, v) : v)).join(base === 'dos' || base === 'donts' ? ' · ' : ', ');
  } else if (base === 'communicationMode') {
    out = labels.commMode(raw.trim());
  } else if (raw.trim().startsWith('{')) {
    // Clinical block: never show raw JSON; the staff can open the profile for detail.
    out = '…';
  } else {
    out = raw.trim();
  }
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/** i18n key for a field name in the history list (`clinical.allergies` → `fields.clinical`). */
export function fieldLabelKey(field: string): string {
  return `child:fields.${field.split('.')[0]}`;
}
