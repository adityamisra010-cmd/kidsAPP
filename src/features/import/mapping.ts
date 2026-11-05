/**
 * Column matching: template column key → index of the file column (null = "Not in my file").
 * Exact matches (header or synonym) win first, then whole-word partial matches, and each file
 * column is used at most once.
 */
import type { ImportKind } from '@/domain/types';

import { IMPORT_COLUMNS, type ImportColumn } from './columns';
import { normalizeHeader } from './normalize';

export type ColumnMapping = Record<string, number | null>;

function forms(col: ImportColumn): string[] {
  return [col.header, ...col.synonyms].map(normalizeHeader).filter(Boolean);
}

function containsWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

/** 3 = exact, 1–2 = partial (longer overlap scores higher), 0 = no match. */
export function headerScore(col: ImportColumn, header: string): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  const fs = forms(col);
  if (fs.includes(h)) return 3;
  // A partial match must share a meaningful phrase, e.g. "Mobile No. (Mother)" ↔ "mobile no".
  let best = 0;
  for (const f of fs) {
    if (f.length < 3) continue;
    if (containsWords(h, f)) best = Math.max(best, f.includes(' ') ? 2 : 1);
  }
  return best;
}

export function autoMap(kind: ImportKind, headers: string[]): ColumnMapping {
  const cols = IMPORT_COLUMNS[kind];
  const mapping: ColumnMapping = Object.fromEntries(cols.map((c) => [c.key, null]));
  const used = new Set<number>();

  const candidates: { key: string; idx: number; score: number; order: number }[] = [];
  cols.forEach((col, order) => {
    headers.forEach((h, idx) => {
      const score = headerScore(col, h);
      if (score > 0) candidates.push({ key: col.key, idx, score, order });
    });
  });
  // Highest score first; ties go to the earlier template column, then the earlier file column.
  candidates.sort((a, b) => b.score - a.score || a.order - b.order || a.idx - b.idx);
  for (const c of candidates) {
    if (mapping[c.key] != null || used.has(c.idx)) continue;
    mapping[c.key] = c.idx;
    used.add(c.idx);
  }
  return mapping;
}

export function missingRequired(kind: ImportKind, mapping: ColumnMapping): ImportColumn[] {
  return IMPORT_COLUMNS[kind].filter((c) => c.required && mapping[c.key] == null);
}

/** File columns that no template column uses (shown as "will be ignored"). */
export function unusedHeaders(headers: string[], mapping: ColumnMapping): string[] {
  const used = new Set(Object.values(mapping).filter((v): v is number => v != null));
  return headers.filter((_, i) => !used.has(i));
}

/** Assigns a file column to a template column, freeing it from any other column first. */
export function setMapping(mapping: ColumnMapping, key: string, idx: number | null): ColumnMapping {
  const next: ColumnMapping = { ...mapping };
  if (idx != null) {
    for (const k of Object.keys(next)) if (next[k] === idx) next[k] = null;
  }
  next[key] = idx;
  return next;
}
