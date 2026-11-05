/**
 * About Me editing helpers: build an editable draft from a profile, tidy it, and work out which
 * fields actually changed so `updateProfile` only receives (and the edit history only records) real edits.
 */
import type { ChildProfile, ClinicalInfo } from '@/domain/types';

export type ProfileDraft = Omit<ChildProfile, 'childId' | 'updatedAt' | 'updatedBy' | 'clinical'> & {
  /** Always present while editing; mapped back to `undefined`-safe patch on save. */
  clinical: ClinicalInfo;
};
export type ProfileField = keyof ProfileDraft;
export type ProfilePatch = Partial<Omit<ChildProfile, 'childId' | 'updatedAt' | 'updatedBy'>>;

export const EMPTY_CLINICAL: ClinicalInfo = { diagnosis: [], medicalNotes: '', allergies: '', medications: '' };

/** Chip sets: order does not matter. */
const SET_FIELDS = ['commTools', 'reinforcers', 'triggers', 'calming'] as const;
/** Bullet lists written by the lead therapist: order matters (most important first). */
const ORDERED_FIELDS = ['dos', 'donts'] as const;
const TEXT_FIELDS = ['commNotes', 'reinforcersNotes', 'triggersNotes', 'calmingNotes', 'sensoryNotes'] as const;

/** Field order used for display (edit history, change summaries). */
export const PROFILE_FIELDS: ProfileField[] = [
  'communicationMode',
  'commTools',
  'commNotes',
  'reinforcers',
  'reinforcersNotes',
  'triggers',
  'triggersNotes',
  'calming',
  'calmingNotes',
  'sensoryNotes',
  'dos',
  'donts',
  'clinical',
];

export function draftFromProfile(p: ChildProfile): ProfileDraft {
  const c = p.clinical ?? EMPTY_CLINICAL;
  return {
    communicationMode: p.communicationMode,
    commTools: [...p.commTools],
    commNotes: p.commNotes ?? '',
    reinforcers: [...p.reinforcers],
    reinforcersNotes: p.reinforcersNotes ?? '',
    triggers: [...p.triggers],
    triggersNotes: p.triggersNotes ?? '',
    calming: [...p.calming],
    calmingNotes: p.calmingNotes ?? '',
    sensoryNotes: p.sensoryNotes ?? '',
    dos: [...p.dos],
    donts: [...p.donts],
    clinical: { diagnosis: [...c.diagnosis], medicalNotes: c.medicalNotes ?? '', allergies: c.allergies ?? '', medications: c.medications ?? '' },
  };
}

function cleanList(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim();
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Trim notes, drop empty/duplicate bullets and chips. */
export function cleanDraft(d: ProfileDraft): ProfileDraft {
  return {
    ...d,
    commTools: cleanList(d.commTools),
    commNotes: d.commNotes.trim(),
    reinforcers: cleanList(d.reinforcers),
    reinforcersNotes: d.reinforcersNotes.trim(),
    triggers: cleanList(d.triggers),
    triggersNotes: d.triggersNotes.trim(),
    calming: cleanList(d.calming),
    calmingNotes: d.calmingNotes.trim(),
    sensoryNotes: d.sensoryNotes.trim(),
    dos: cleanList(d.dos),
    donts: cleanList(d.donts),
    clinical: {
      diagnosis: cleanList(d.clinical.diagnosis),
      medicalNotes: d.clinical.medicalNotes.trim(),
      allergies: d.clinical.allergies.trim(),
      medications: d.clinical.medications.trim(),
    },
  };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

function sameOrdered(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function sameClinical(a: ClinicalInfo, b: ClinicalInfo): boolean {
  return (
    sameSet(a.diagnosis, b.diagnosis) &&
    a.medicalNotes === b.medicalNotes &&
    a.allergies === b.allergies &&
    a.medications === b.medications
  );
}

/**
 * Fields that differ between the saved profile and the draft (both cleaned first, so trailing
 * spaces or re-ordered chips are not "changes"). Clinical is only compared when included.
 */
export function changedFields(original: ProfileDraft, draft: ProfileDraft, opts: { includeClinical: boolean }): ProfileField[] {
  const a = cleanDraft(original);
  const b = cleanDraft(draft);
  const out: ProfileField[] = [];
  for (const f of PROFILE_FIELDS) {
    if (f === 'communicationMode') {
      if (a.communicationMode !== b.communicationMode) out.push(f);
    } else if ((SET_FIELDS as readonly string[]).includes(f)) {
      const k = f as (typeof SET_FIELDS)[number];
      if (!sameSet(a[k], b[k])) out.push(f);
    } else if ((ORDERED_FIELDS as readonly string[]).includes(f)) {
      const k = f as (typeof ORDERED_FIELDS)[number];
      if (!sameOrdered(a[k], b[k])) out.push(f);
    } else if ((TEXT_FIELDS as readonly string[]).includes(f)) {
      const k = f as (typeof TEXT_FIELDS)[number];
      if (a[k] !== b[k]) out.push(f);
    } else if (f === 'clinical' && opts.includeClinical && !sameClinical(a.clinical, b.clinical)) {
      out.push(f);
    }
  }
  return out;
}

/** Patch with only the changed fields, cleaned. Empty object when nothing changed. */
export function buildProfilePatch(original: ProfileDraft, draft: ProfileDraft, opts: { includeClinical: boolean }): ProfilePatch {
  const clean = cleanDraft(draft);
  const patch: ProfilePatch = {};
  for (const f of changedFields(original, draft, opts)) {
    // Each field is copied with its own type; the record write is safe because keys match.
    (patch as Record<string, unknown>)[f] = clean[f];
  }
  return patch;
}

/** True when the profile has nothing filled in yet (shows a gentle "Add details" prompt). */
export function isProfileEmpty(p: Pick<ChildProfile, 'commTools' | 'reinforcers' | 'triggers' | 'calming' | 'dos' | 'donts' | 'commNotes' | 'sensoryNotes'>): boolean {
  return (
    p.commTools.length + p.reinforcers.length + p.triggers.length + p.calming.length + p.dos.length + p.donts.length === 0 &&
    !p.commNotes?.trim() &&
    !p.sensoryNotes?.trim()
  );
}

export function hasClinical(c: ClinicalInfo | undefined): c is ClinicalInfo {
  return !!c && (c.diagnosis.length > 0 || !!c.medicalNotes?.trim() || !!c.allergies?.trim() || !!c.medications?.trim());
}
