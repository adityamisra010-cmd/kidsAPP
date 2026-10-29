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
import {
  academicYearEnd,
  ageInYears,
  cleanText,
  hasLetter,
  isEmail,
  normalizeName,
  normalizeRelation,
  parseDate,
  parseDuration,
  parseGender,
  parsePhone,
  parseRole,
  parseTime,
  parseWeekdays,
  parseYesNo,
  splitList,
  todayISO,
  toMinutes,
} from './normalize';
import type { RawRow } from './parse';
import { createResolver, normalizedPhone, type RefKind, type Resolutions, type Resolver } from './resolve';

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

const issue = (code: string, column?: string, params?: RowIssue['params']): RowIssue => (params ? { code, column, params } : { code, column });

interface RowDraft {
  values: Record<string, string>;
  errors: RowIssue[];
  warnings: RowIssue[];
  key?: string;
  existingId?: string;
}

interface Env {
  ctx: ImportContext;
  today: Date;
  todayISO: string;
  resolver: Resolver;
  defaultDuration: number;
  unresolved: Map<string, UnresolvedRef>;
  rowNumber: number;
}

function noteUnresolved(env: Env, refKind: RefKind, column: string, raw: string, normalized: string, suggestions: UnresolvedRef['suggestions']) {
  const k = `${refKind}|${column}|${normalized}`;
  const existing = env.unresolved.get(k);
  if (existing) existing.rowNumbers.push(env.rowNumber);
  else env.unresolved.set(k, { refKind, column, raw, normalized, rowNumbers: [env.rowNumber], suggestions });
}

function suggestionText(s: { label: string }[]): string {
  return s.map((x) => x.label).join(' / ');
}

// ---------------------------------------------------------------------------
// Shared field checks
// ---------------------------------------------------------------------------

function nameField(d: RowDraft, get: (k: string) => string, key: string) {
  const v = get(key);
  if (!v) d.errors.push(issue('required', key));
  else if (!hasLetter(v)) d.errors.push(issue('name_invalid', key, { value: v }));
  else d.values[key] = v;
}

function phoneField(d: RowDraft, get: (k: string) => string) {
  const raw = get('phone');
  const p = parsePhone(raw);
  if (!p.ok) d.errors.push(issue(p.code, 'phone', { value: raw }));
  else {
    d.values.phone = p.value;
    if (p.warning) d.warnings.push(issue(p.warning, 'phone', { value: raw }));
  }
}

function emailField(d: RowDraft, get: (k: string) => string) {
  const v = get('email');
  if (!v) return;
  if (isEmail(v)) d.values.email = v.toLowerCase();
  else d.warnings.push(issue('email_invalid', 'email', { value: v }));
}

function childRef(d: RowDraft, get: (k: string) => string, env: Env) {
  const name = get('childName');
  const dobRaw = get('childDob');
  let dob: string | undefined;
  if (dobRaw) {
    const p = parseDate(dobRaw, env.today);
    if (p.ok) {
      dob = p.value;
      d.values.childDob = p.value;
    } else d.warnings.push(issue('child_dob_ignored', 'childDob', { value: dobRaw }));
  }
  if (!name) {
    d.errors.push(issue('required', 'childName'));
    return;
  }
  d.values.childName = name;
  const r = env.resolver.child(name, dob);
  if (r.ok) {
    d.values.childId = r.id;
    return;
  }
  d.errors.push(issue(r.code, 'childName', { value: name, suggestions: suggestionText(r.suggestions) }));
  if (r.code === 'child_unknown') noteUnresolved(env, 'child', 'childName', name, r.normalized, r.suggestions);
}

// ---------------------------------------------------------------------------
// Per kind
// ---------------------------------------------------------------------------

function validateChild(get: (k: string) => string, env: Env): RowDraft {
  const d: RowDraft = { values: {}, errors: [], warnings: [] };
  nameField(d, get, 'fullName');
  const preferred = get('preferredName');
  if (preferred) d.values.preferredName = preferred;

  const dobRaw = get('dob');
  const dob = parseDate(dobRaw, env.today);
  if (!dob.ok) d.errors.push(issue(dob.code, 'dob', { value: dobRaw }));
  else if (dob.value > env.todayISO) d.errors.push(issue('dob_future', 'dob', { value: dobRaw }));
  else {
    d.values.dob = dob.value;
    if (dob.warning) d.warnings.push(issue(dob.warning, 'dob', { value: dobRaw, date: dob.value }));
    const age = ageInYears(dob.value, env.today);
    if (age > 25) d.warnings.push(issue('dob_unusual', 'dob', { age }));
  }

  const g = get('gender');
  if (g) {
    const pg = parseGender(g);
    if (pg) d.values.gender = pg;
    else d.warnings.push(issue('gender_unknown', 'gender', { value: g }));
  }
  const cls = get('classGroup');
  if (cls) d.values.classGroup = cls;

  if (d.values.fullName && d.values.dob) {
    const n = normalizeName(d.values.fullName);
    d.key = `${n}|${d.values.dob}`;
    const same = env.ctx.children.filter((c) => normalizeName(c.fullName) === n);
    const existing = same.find((c) => c.dob === d.values.dob);
    if (existing) d.existingId = existing.id;
    else if (same.length) d.warnings.push(issue('child_same_name_exists', 'dob', { name: same[0].fullName, date: same[0].dob }));
  }
  return d;
}

function validateStaff(get: (k: string) => string, env: Env): RowDraft {
  const d: RowDraft = { values: {}, errors: [], warnings: [] };
  nameField(d, get, 'fullName');
  phoneField(d, get);
  emailField(d, get);

  const title = get('title');
  if (title) d.values.title = title;
  const roleRaw = get('role');
  if (roleRaw) {
    const r = parseRole(roleRaw);
    if (r) d.values.role = r;
    else d.errors.push(issue('role_unknown', 'role', { value: roleRaw }));
  } else {
    const fromTitle = title ? parseRole(title) : null;
    d.values.role = fromTitle ?? 'therapist';
    d.warnings.push(issue(fromTitle ? 'role_from_title' : 'role_defaulted', 'role', { role: d.values.role }));
  }

  const typesRaw = get('therapyTypes');
  const ids: string[] = [];
  const names: string[] = [];
  const add = (id: string, label: string) => {
    if (ids.includes(id)) return;
    ids.push(id);
    names.push(label);
  };
  for (const piece of splitList(typesRaw)) {
    const r = env.resolver.therapyType(piece);
    if (r.ok) {
      add(r.id, r.label);
      continue;
    }
    // "OT & Speech" → two types, but "Speech & Language Therapy" is one.
    const parts = piece.split(/\s*(?:&|\+|\band\b)\s*/i).filter(Boolean);
    const sub = parts.length > 1 ? parts.map((p) => env.resolver.therapyType(p)) : [];
    if (sub.length && sub.every((s) => s.ok)) {
      for (const s of sub) if (s.ok) add(s.id, s.label);
      continue;
    }
    d.errors.push(issue('therapy_type_unknown', 'therapyTypes', { value: piece, suggestions: suggestionText(r.suggestions) }));
    noteUnresolved(env, 'therapyType', 'therapyTypes', piece, r.normalized, r.suggestions);
  }
  if (ids.length) {
    d.values.therapyTypes = names.join(', ');
    d.values.therapyTypeIds = ids.join(',');
  } else if (d.values.role === 'therapist' && !typesRaw) {
    d.warnings.push(issue('therapist_no_types', 'therapyTypes'));
  }

  if (d.values.phone) {
    d.key = d.values.phone;
    const existing = env.ctx.therapists.find((t) => normalizedPhone(t.phone) === d.values.phone);
    if (existing) {
      d.existingId = existing.id;
      if (d.values.fullName && normalizeName(existing.name) !== normalizeName(d.values.fullName)) {
        d.warnings.push(issue('phone_belongs_to', 'phone', { name: existing.name }));
      }
    }
  }
  return d;
}

function validateParent(get: (k: string) => string, env: Env): RowDraft {
  const d: RowDraft = { values: {}, errors: [], warnings: [] };
  nameField(d, get, 'fullName');
  phoneField(d, get);
  emailField(d, get);
  d.values.relation = normalizeRelation(get('relation'));
  childRef(d, get, env);

  const primaryRaw = get('isPrimary');
  if (primaryRaw) {
    const yn = parseYesNo(primaryRaw);
    if (yn == null) d.warnings.push(issue('yesno_unknown', 'isPrimary', { value: primaryRaw }));
    else d.values.isPrimary = yn ? 'true' : 'false';
  }

  if (d.values.phone) {
    const existing = env.ctx.parents.find((p) => normalizedPhone(p.phone) === d.values.phone);
    if (existing) d.existingId = existing.id;
    if (d.values.childId) d.key = `${d.values.phone}|${d.values.childId}`;
  }
  return d;
}

function validateSchedule(get: (k: string) => string, env: Env): RowDraft {
  const d: RowDraft = { values: {}, errors: [], warnings: [] };
  childRef(d, get, env);

  const therapist = get('therapist');
  if (!therapist) d.errors.push(issue('required', 'therapist'));
  else {
    d.values.therapist = therapist;
    const r = env.resolver.therapist(therapist);
    if (r.ok) d.values.therapistId = r.id;
    else {
      d.errors.push(issue(r.code, 'therapist', { value: therapist, suggestions: suggestionText(r.suggestions) }));
      if (r.code === 'therapist_unknown') noteUnresolved(env, 'therapist', 'therapist', therapist, r.normalized, r.suggestions);
    }
  }

  const type = get('therapyType');
  if (!type) d.errors.push(issue('required', 'therapyType'));
  else {
    d.values.therapyType = type;
    const r = env.resolver.therapyType(type);
    if (r.ok) d.values.therapyTypeId = r.id;
    else {
      d.errors.push(issue('therapy_type_unknown', 'therapyType', { value: type, suggestions: suggestionText(r.suggestions) }));
      noteUnresolved(env, 'therapyType', 'therapyType', type, r.normalized, r.suggestions);
    }
  }

  const daysRaw = get('weekdays');
  const days = parseWeekdays(daysRaw);
  if (!days.ok) d.errors.push(issue(days.code, 'weekdays', { value: daysRaw }));
  else {
    d.values.weekdays = days.value.join(',');
    if (days.warning) d.warnings.push(issue(days.warning, 'weekdays', { value: daysRaw }));
  }

  const timeRaw = get('startTime');
  const time = parseTime(timeRaw);
  let rangeMinutes: number | undefined;
  if (!time.ok) d.errors.push(issue(time.code, 'startTime', { value: timeRaw }));
  else {
    d.values.startTime = time.value.start;
    if (time.value.end) rangeMinutes = toMinutes(time.value.end) - toMinutes(time.value.start);
    if (time.warning) d.warnings.push(issue(time.warning, 'startTime', { value: timeRaw, time: time.value.start }));
  }

  const durRaw = get('durationMinutes');
  if (durRaw) {
    const dur = parseDuration(durRaw);
    if (!dur.ok) d.errors.push(issue(dur.code, 'durationMinutes', { value: durRaw }));
    else {
      d.values.durationMinutes = String(dur.value);
      if (dur.warning) d.warnings.push(issue(dur.warning, 'durationMinutes', { value: durRaw, minutes: dur.value }));
    }
  } else if (rangeMinutes && rangeMinutes >= 10 && rangeMinutes <= 240) {
    d.values.durationMinutes = String(rangeMinutes);
  } else {
    d.values.durationMinutes = String(env.defaultDuration);
    d.warnings.push(issue('duration_defaulted', 'durationMinutes', { minutes: env.defaultDuration }));
  }

  const startRaw = get('startDate');
  let start = env.todayISO;
  if (startRaw) {
    const p = parseDate(startRaw, env.today);
    if (!p.ok) d.errors.push(issue(p.code, 'startDate', { value: startRaw }));
    else if (p.value < env.todayISO) d.warnings.push(issue('start_date_moved', 'startDate', { date: env.todayISO }));
    else start = p.value;
  }
  d.values.startDate = start;

  const endRaw = get('endDate');
  if (endRaw) {
    const p = parseDate(endRaw, env.today);
    if (!p.ok) d.errors.push(issue(p.code, 'endDate', { value: endRaw }));
    else if (p.value < start) d.errors.push(issue('end_before_start', 'endDate', { date: p.value }));
    else d.values.endDate = p.value;
  } else {
    d.values.endDate = academicYearEnd(start);
    d.warnings.push(issue('end_date_defaulted', 'endDate', { date: d.values.endDate }));
  }

  const room = get('room');
  if (room) d.values.room = room;
  return d;
}

const VALIDATORS: Record<ImportKind, (get: (k: string) => string, env: Env) => RowDraft> = {
  children: validateChild,
  staff: validateStaff,
  parents: validateParent,
  schedule: validateSchedule,
};

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
