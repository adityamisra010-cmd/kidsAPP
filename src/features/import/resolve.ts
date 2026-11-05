/**
 * Name → id lookups against the school's existing data (ImportContext). Case, spacing and
 * honorifics ("Ms.", "Dr.", "Smt.") are ignored; near-misses come back as suggestions.
 */
import type { ImportContext } from '@/domain/types';

import { normalizeHeader, normalizeName, parsePhone, suggest, type Candidate } from './normalize';

export type RefKind = 'child' | 'therapist' | 'therapyType';

/** User choices from "Did you mean …?": refKind → normalised typed value → id. */
export type Resolutions = Partial<Record<RefKind, Record<string, string>>>;

export type Resolved =
  | { ok: true; id: string; label: string }
  | { ok: false; code: string; normalized: string; suggestions: { id: string; label: string }[] };

/** Common short names schools use in their sheets, by default therapy-type key. */
export const THERAPY_ALIASES: Record<string, string[]> = {
  speech: [
    'speech',
    'speech therapy',
    'speech therapist',
    'st',
    'slp',
    'salt',
    'speech language',
    'speech and language',
    'speech language therapy',
    'speech and language therapy',
  ],
  occupational: ['ot', 'occupational', 'occupational therapy', 'occupational therapist', 'sensory integration'],
  behaviour: [
    'aba',
    'bt',
    'behaviour',
    'behavior',
    'behaviour therapy',
    'behavior therapy',
    'behavioural therapy',
    'behavioral therapy',
    'behaviour therapy aba',
    'behavior therapy aba',
    'applied behaviour analysis',
    'applied behavior analysis',
  ],
  special_ed: ['special education', 'special ed', 'sped', 'spl ed', 'special educator', 'remedial', 'remedial education'],
  physio: ['physio', 'physiotherapy', 'physiotherapist', 'pt', 'physical therapy'],
  audiology: ['audiology', 'audiology support', 'audiologist', 'hearing', 'auditory verbal therapy', 'avt'],
};

/** Distinct unknown names that get "Did you mean …?" suggestions (keeps big files fast). */
export const MAX_SUGGESTED = 100;

type Ctx = ImportContext;

/** Lookups built once per validation run (files can have thousands of rows). */
export interface ContextIndex {
  childrenByName: Map<string, Ctx['children']>;
  therapistsByName: Map<string, Ctx['therapists']>;
  therapistByPhone: Map<string, Ctx['therapists'][number]>;
  parentByPhone: Map<string, Ctx['parents'][number]>;
}

function group<T>(list: T[], keyOf: (x: T) => string | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = keyOf(x);
    if (k) m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

function firstBy<T>(list: T[], keyOf: (x: T) => string | undefined): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of list) {
    const k = keyOf(x);
    if (k && !m.has(k)) m.set(k, x);
  }
  return m;
}

export function indexContext(ctx: ImportContext): ContextIndex {
  return {
    childrenByName: group(ctx.children, (c) => normalizeName(c.fullName)),
    therapistsByName: group(ctx.therapists, (t) => normalizeName(t.name)),
    therapistByPhone: firstBy(ctx.therapists, (t) => normalizedPhone(t.phone)),
    parentByPhone: firstBy(ctx.parents, (p) => normalizedPhone(p.phone)),
  };
}

export interface Resolver {
  index: ContextIndex;
  child(name: string, dob?: string): Resolved;
  therapist(nameOrPhone: string): Resolved;
  therapyType(name: string): Resolved;
  /** Normalised comparison form used as the key for Resolutions. */
  key(kind: RefKind, raw: string): string;
}

export function createResolver(ctx: ImportContext, resolutions: Resolutions = {}): Resolver {
  const childCands: Candidate[] = ctx.children.map((c) => ({ id: c.id, label: c.fullName, forms: [normalizeName(c.fullName)] }));
  const therapistCands: Candidate[] = ctx.therapists.map((t) => ({ id: t.id, label: t.name, forms: [normalizeName(t.name)] }));
  const typeCands: Candidate[] = ctx.therapyTypes.map((tt) => {
    const name = normalizeHeader(tt.name);
    const short = name.replace(/\b(therapy|support|education)\b/g, '').replace(/\s+/g, ' ').trim();
    return { id: tt.id, label: tt.name, forms: [name, short, normalizeHeader(tt.key), ...(THERAPY_ALIASES[tt.key] ?? [])].filter(Boolean) };
  });
  const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);
  const index = indexContext(ctx);

  const key = (kind: RefKind, raw: string) => (kind === 'therapyType' ? normalizeHeader(raw) : normalizeName(raw));

  const chosen = (kind: RefKind, normalized: string) => resolutions[kind]?.[normalized];

  // Suggestions are the slow part (edit distance against every name), so each typed value is
  // looked up once, and a file full of unknown names stops suggesting after a while.
  const suggestions = new Map<string, { id: string; label: string }[]>();
  const suggestFor = (kind: RefKind, normalized: string, cands: Candidate[]) => {
    const k = `${kind}|${normalized}`;
    let hit = suggestions.get(k);
    if (!hit) {
      hit = suggestions.size < MAX_SUGGESTED ? suggest(normalized, cands) : [];
      suggestions.set(k, hit);
    }
    return hit;
  };

  return {
    index,
    key,
    child(name, dob) {
      const normalized = key('child', name);
      const picked = chosen('child', normalized);
      if (picked) {
        const c = byId(ctx.children, picked);
        if (c) return { ok: true, id: c.id, label: c.fullName };
      }
      const matches = index.childrenByName.get(normalized) ?? [];
      if (dob) {
        const exact = matches.filter((c) => c.dob === dob);
        if (exact.length === 1) return { ok: true, id: exact[0].id, label: exact[0].fullName };
        if (matches.length > 0 && exact.length === 0) return { ok: false, code: 'child_dob_mismatch', normalized, suggestions: [] };
      }
      if (matches.length === 1) return { ok: true, id: matches[0].id, label: matches[0].fullName };
      if (matches.length > 1) return { ok: false, code: 'child_ambiguous', normalized, suggestions: [] };
      return { ok: false, code: 'child_unknown', normalized, suggestions: suggestFor('child', normalized, childCands) };
    },
    therapist(raw) {
      const normalized = key('therapist', raw);
      const picked = chosen('therapist', normalized);
      if (picked) {
        const t = byId(ctx.therapists, picked);
        if (t) return { ok: true, id: t.id, label: t.name };
      }
      const phone = /\d{6,}/.test(raw.replace(/\D/g, '')) ? parsePhone(raw) : null;
      if (phone?.ok) {
        const t = index.therapistByPhone.get(phone.value);
        if (t) return { ok: true, id: t.id, label: t.name };
        return { ok: false, code: 'therapist_unknown', normalized, suggestions: [] };
      }
      const matches = index.therapistsByName.get(normalized) ?? [];
      if (matches.length === 1) return { ok: true, id: matches[0].id, label: matches[0].name };
      if (matches.length > 1) return { ok: false, code: 'therapist_ambiguous', normalized, suggestions: matches.map((m) => ({ id: m.id, label: m.name })) };
      return { ok: false, code: 'therapist_unknown', normalized, suggestions: suggestFor('therapist', normalized, therapistCands) };
    },
    therapyType(raw) {
      const normalized = key('therapyType', raw);
      const picked = chosen('therapyType', normalized);
      if (picked) {
        const tt = byId(ctx.therapyTypes, picked);
        if (tt) return { ok: true, id: tt.id, label: tt.name };
      }
      const hit = typeCands.find((c) => c.forms.includes(normalized));
      if (hit) return { ok: true, id: hit.id, label: hit.label };
      return { ok: false, code: 'therapy_type_unknown', normalized, suggestions: suggestFor('therapyType', normalized, typeCands) };
    },
  };
}

/** Phone of an existing person, normalised (or undefined when it isn't a valid mobile). */
export function normalizedPhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const p = parsePhone(raw);
  return p.ok ? p.value : undefined;
}
