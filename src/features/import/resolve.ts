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

export interface Resolver {
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

  const key = (kind: RefKind, raw: string) => (kind === 'therapyType' ? normalizeHeader(raw) : normalizeName(raw));

  const chosen = (kind: RefKind, normalized: string) => resolutions[kind]?.[normalized];

  return {
    key,
    child(name, dob) {
      const normalized = key('child', name);
      const picked = chosen('child', normalized);
      if (picked) {
        const c = byId(ctx.children, picked);
        if (c) return { ok: true, id: c.id, label: c.fullName };
      }
      const matches = ctx.children.filter((c) => normalizeName(c.fullName) === normalized);
      if (dob) {
        const exact = matches.filter((c) => c.dob === dob);
        if (exact.length === 1) return { ok: true, id: exact[0].id, label: exact[0].fullName };
        if (matches.length > 0 && exact.length === 0) return { ok: false, code: 'child_dob_mismatch', normalized, suggestions: [] };
      }
      if (matches.length === 1) return { ok: true, id: matches[0].id, label: matches[0].fullName };
      if (matches.length > 1) return { ok: false, code: 'child_ambiguous', normalized, suggestions: [] };
      return { ok: false, code: 'child_unknown', normalized, suggestions: suggest(normalized, childCands) };
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
        const t = ctx.therapists.find((x) => normalizedPhone(x.phone) === phone.value);
        if (t) return { ok: true, id: t.id, label: t.name };
        return { ok: false, code: 'therapist_unknown', normalized, suggestions: [] };
      }
      const matches = ctx.therapists.filter((t) => normalizeName(t.name) === normalized);
      if (matches.length === 1) return { ok: true, id: matches[0].id, label: matches[0].name };
      if (matches.length > 1) return { ok: false, code: 'therapist_ambiguous', normalized, suggestions: matches.map((m) => ({ id: m.id, label: m.name })) };
      return { ok: false, code: 'therapist_unknown', normalized, suggestions: suggest(normalized, therapistCands) };
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
      return { ok: false, code: 'therapy_type_unknown', normalized, suggestions: suggest(normalized, typeCands) };
    },
  };
}

/** Phone of an existing person, normalised (or undefined when it isn't a valid mobile). */
export function normalizedPhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const p = parsePhone(raw);
  return p.ok ? p.value : undefined;
}
