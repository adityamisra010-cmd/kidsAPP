/**
 * Row validation for imports. Pure: (kind, rows, mapping, context) → per-row status + reasons.
 *
 * Natural keys (re-importing the same file updates instead of duplicating):
 *   children = name + date of birth · staff = mobile · parents = mobile (+ child for the link)
 *   schedule = child + therapist + therapy type + weekday + start time
 * Adapters must upsert on the same keys. Issue codes are translated in `import:issues.*`.
 */
import type { ImportContext, ImportKind, ImportRow } from '@/domain/types';

import { IMPORT_COLUMNS } from './columns';
import type { ColumnMapping } from './mapping';
import { cleanText, normalizeName, todayISO, toMinutes } from './normalize';
import type { RawRow } from './parse';
import { createResolver, type RefKind, type Resolutions } from './resolve';
import { issue, VALIDATORS, type Env } from './rowValidators';

export type { RefKind, Resolutions } from './resolve';

export interface RowIssue {
  code: string;
  column?: string;
  params?: Record<string, string | number>;
}

export type RowStatus = 'new' | 'update' | 'duplicate' | 'error';

export interface ValidatedRow {
  rowNumber: number;
  status: RowStatus;
  /** Cleaned cell text per template key (for display, also when the row has errors). */
  raw: Record<string, string>;
  /** Normalised values sent to the adapter. */
  values: Record<string, string>;
  errors: RowIssue[];
  warnings: RowIssue[];
  duplicateOf?: number;
  existingId?: string;
}

export interface UnresolvedRef {
  refKind: RefKind;
  column: string;
  raw: string;
  normalized: string;
  rowNumbers: number[];
  suggestions: { id: string; label: string }[];
}

export interface ValidationCounts {
  total: number;
  new: number;
  update: number;
  duplicate: number;
  error: number;
  withWarnings: number;
  /** Rows with data only in columns we don't use (e.g. a pre-filled "S.No."). */
  emptyIgnored: number;
}

export interface ValidationResult {
  kind: ImportKind;
  rows: ValidatedRow[];
  counts: ValidationCounts;
  unresolved: UnresolvedRef[];
}

export interface ValidateOptions {
  today?: Date;
  resolutions?: Resolutions;
  /** Default session length when the file has none. */
  defaultDurationMinutes?: number;
}

// ---------------------------------------------------------------------------
// Cross-row checks
// ---------------------------------------------------------------------------

interface Slot {
  row: ValidatedRow;
  day: number;
  start: number;
  end: number;
}

function crossCheckSchedule(rows: ValidatedRow[]) {
  const seen = new Map<string, number>();
  const childSlots = new Map<string, Slot[]>();
  const therapistSlots = new Map<string, Slot[]>();
  for (const row of rows) {
    const v = row.values;
    if (row.errors.length || !v.childId || !v.therapistId || !v.therapyTypeId || !v.weekdays || !v.startTime) continue;
    const days = v.weekdays.split(',').map(Number);
    const base = `${v.childId}|${v.therapistId}|${v.therapyTypeId}|${v.startTime}`;
    const firstSeen = days.map((d) => seen.get(`${base}|${d}`));
    if (firstSeen.every((n) => n != null)) {
      row.duplicateOf = firstSeen[0];
      continue;
    }
    days.forEach((d) => !seen.has(`${base}|${d}`) && seen.set(`${base}|${d}`, row.rowNumber));

    const start = toMinutes(v.startTime);
    const end = start + Number(v.durationMinutes || 0);
    for (const day of days) {
      const slot: Slot = { row, day, start, end };
      const clash = (list: Slot[] | undefined) => list?.find((s) => s.day === day && s.row !== row && s.start < end && start < s.end);
      const c1 = clash(childSlots.get(v.childId));
      if (c1 && !row.warnings.some((w) => w.code === 'child_double_booked')) row.warnings.push(issue('child_double_booked', 'startTime', { row: c1.row.rowNumber }));
      const c2 = clash(therapistSlots.get(v.therapistId));
      if (c2 && !row.warnings.some((w) => w.code === 'therapist_double_booked')) row.warnings.push(issue('therapist_double_booked', 'therapist', { row: c2.row.rowNumber }));
      childSlots.set(v.childId, [...(childSlots.get(v.childId) ?? []), slot]);
      therapistSlots.set(v.therapistId, [...(therapistSlots.get(v.therapistId) ?? []), slot]);
    }
  }
}

function crossCheckParents(rows: ValidatedRow[]) {
  const nameByPhone = new Map<string, { name: string; row: number }>();
  const explicitPrimary = new Set<string>();
  for (const row of rows) if (row.values.isPrimary === 'true' && row.values.childId) explicitPrimary.add(row.values.childId);
  const implicitTaken = new Set<string>();
  for (const row of rows) {
    const v = row.values;
    if (v.phone && v.fullName) {
      const first = nameByPhone.get(v.phone);
      if (!first) nameByPhone.set(v.phone, { name: v.fullName, row: row.rowNumber });
      else if (normalizeName(first.name) !== normalizeName(v.fullName)) {
        row.warnings.push(issue('phone_different_name', 'phone', { row: first.row, name: first.name }));
      }
    }
    if (!v.isPrimary && v.childId && !row.errors.length && row.duplicateOf == null) {
      const primary = !explicitPrimary.has(v.childId) && !implicitTaken.has(v.childId);
      v.isPrimary = primary ? 'true' : 'false';
      if (primary) implicitTaken.add(v.childId);
    }
  }
}

// ---------------------------------------------------------------------------

export function validateRows(kind: ImportKind, rows: RawRow[], mapping: ColumnMapping, ctx: ImportContext, opts: ValidateOptions = {}): ValidationResult {
  const today = opts.today ?? new Date();
  const env: Env = {
    ctx,
    today,
    todayISO: todayISO(today),
    resolver: createResolver(ctx, opts.resolutions),
    defaultDuration: opts.defaultDurationMinutes ?? 45,
    unresolved: new Map(),
    rowNumber: 0,
  };
  const cols = IMPORT_COLUMNS[kind];
  const out: ValidatedRow[] = [];
  const firstByKey = new Map<string, number>();
  let emptyIgnored = 0;

  for (const r of rows) {
    const raw: Record<string, string> = {};
    for (const c of cols) {
      const idx = mapping[c.key];
      raw[c.key] = idx == null ? '' : cleanText(r.cells[idx]);
    }
    if (Object.values(raw).every((v) => !v)) {
      emptyIgnored++;
      continue;
    }
    env.rowNumber = r.rowNumber;
    const d = VALIDATORS[kind]((k) => raw[k] ?? '', env);
    const row: ValidatedRow = { rowNumber: r.rowNumber, status: 'new', raw, values: d.values, errors: d.errors, warnings: d.warnings };
    if (d.existingId) row.existingId = d.existingId;
    if (d.key && !d.errors.length) {
      const first = firstByKey.get(d.key);
      if (first != null) row.duplicateOf = first;
      else firstByKey.set(d.key, r.rowNumber);
    }
    out.push(row);
  }

  if (kind === 'schedule') crossCheckSchedule(out);
  if (kind === 'parents') crossCheckParents(out);

  const counts: ValidationCounts = { total: out.length, new: 0, update: 0, duplicate: 0, error: 0, withWarnings: 0, emptyIgnored };
  for (const row of out) {
    row.status = row.errors.length ? 'error' : row.duplicateOf != null ? 'duplicate' : row.existingId ? 'update' : 'new';
    counts[row.status]++;
    if (row.warnings.length) counts.withWarnings++;
  }
  return { kind, rows: out, counts, unresolved: [...env.unresolved.values()] };
}

/** Rows to send to `repo.imports.commit`: new + update, with `existingId` when known. */
export function toImportRows(result: ValidationResult): ImportRow[] {
  return result.rows
    .filter((r) => r.status === 'new' || r.status === 'update')
    .map((r) => ({ rowNumber: r.rowNumber, values: r.existingId ? { ...r.values, existingId: r.existingId } : { ...r.values } }));
}
