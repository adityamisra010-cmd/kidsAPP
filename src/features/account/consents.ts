/**
 * Consent records (pure). Consents are append-only: every change writes a new timestamped row,
 * and the latest row per (kind, child) is the current choice.
 */
import type { Consent, ConsentKind, UUID } from '@/domain/types';

export interface ConsentInput {
  kind: ConsentKind;
  granted: boolean;
  childId?: UUID;
  version: string;
}

/** One record per child for each kind. Users without linked children get one unscoped record. */
export function buildConsentInputs(childIds: UUID[], allowVideo: boolean, version: string): ConsentInput[] {
  const scopes: (UUID | undefined)[] = childIds.length ? childIds : [undefined];
  return scopes.flatMap((childId) => [
    { kind: 'data_processing' as const, granted: true, version, ...(childId ? { childId } : {}) },
    { kind: 'video_upload' as const, granted: allowVideo, version, ...(childId ? { childId } : {}) },
  ]);
}

/** Records to write when the video choice changes later (one per child). */
export function videoConsentInputs(childIds: UUID[], granted: boolean, version: string): ConsentInput[] {
  const scopes: (UUID | undefined)[] = childIds.length ? childIds : [undefined];
  return scopes.map((childId) => ({ kind: 'video_upload' as const, granted, version, ...(childId ? { childId } : {}) }));
}

/** Latest record for a kind and child (child-less records count for every child). */
export function latestConsent(consents: Consent[], kind: ConsentKind, childId?: UUID): Consent | undefined {
  let best: Consent | undefined;
  for (const c of consents) {
    if (c.kind !== kind) continue;
    if (childId && c.childId && c.childId !== childId) continue;
    if (!childId && c.childId) continue;
    if (!best || Date.parse(c.at) >= Date.parse(best.at)) best = c;
  }
  return best;
}

/** True when the current data-processing consent is granted at this version for every child. */
export function hasCurrentConsent(consents: Consent[], childIds: UUID[], version: string): boolean {
  const scopes: (UUID | undefined)[] = childIds.length ? childIds : [undefined];
  return scopes.every((childId) => {
    const c = latestConsent(consents, 'data_processing', childId);
    return !!c && c.granted && c.version === version;
  });
}

/** Video uploads are allowed only when every linked child has a current "granted" record. */
export function videoUploadsAllowed(consents: Consent[], childIds: UUID[]): boolean {
  const scopes: (UUID | undefined)[] = childIds.length ? childIds : [undefined];
  return scopes.every((childId) => latestConsent(consents, 'video_upload', childId)?.granted === true);
}
