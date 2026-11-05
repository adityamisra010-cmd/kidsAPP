/**
 * Pure helpers for the resource library (validation, grouping, filters). Tested.
 */
import type { GoalDomain, Resource, ResourceAudience, ResourceKind, ResourceShare } from '@/domain/types';
import { parse } from '@/lib/dates';

export const RESOURCE_KINDS: ResourceKind[] = ['pdf', 'video', 'link', 'image'];
export const AGE_BANDS: NonNullable<Resource['ageBand']>[] = ['0-3', '3-6', '6-10', '10+'];
export const AUDIENCES: ResourceAudience[] = ['parents', 'staff', 'all'];

/** Full http(s) link with a host, e.g. https://example.org/guide.pdf */
export function isValidResourceUrl(url: string): boolean {
  const v = url.trim();
  if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v)) return false;
  const host = v.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
  return host.includes('.') || host.startsWith('localhost');
}

export type ParentResource = Resource & { share?: ResourceShare };

/** Parent view: "Shared with you" (newest share first) and "From your school" (A–Z). */
export function splitParentResources(items: ParentResource[]): { shared: ParentResource[]; school: ParentResource[] } {
  const shared = items.filter((r) => !!r.share).sort((a, b) => parse(b.share!.at).getTime() - parse(a.share!.at).getTime());
  const school = items.filter((r) => !r.share).sort((a, b) => a.title.localeCompare(b.title));
  return { shared, school };
}

export interface LibraryFilter {
  search: string;
  kind?: ResourceKind;
  therapyTypeKey?: string;
  domain?: GoalDomain;
}

export function activeFilterCount(f: Pick<LibraryFilter, 'therapyTypeKey' | 'domain'>): number {
  return (f.therapyTypeKey ? 1 : 0) + (f.domain ? 1 : 0);
}

/** Repository filter: trims search, drops empty values (stable query keys). */
export function toRepoFilter(f: LibraryFilter): { search?: string; kind?: ResourceKind; therapyTypeKey?: string; domain?: GoalDomain } {
  const search = f.search.trim();
  return {
    ...(search ? { search } : {}),
    ...(f.kind ? { kind: f.kind } : {}),
    ...(f.therapyTypeKey ? { therapyTypeKey: f.therapyTypeKey } : {}),
    ...(f.domain ? { domain: f.domain } : {}),
  };
}

/** Lower-case, trimmed, de-duplicated tags. */
export function normaliseTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const v = t.replace(/\s+/g, ' ').trim().toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

export interface ResourceDraft {
  title: string;
  description: string;
  kind?: ResourceKind;
  url: string;
  tags: string[];
  therapyTypeKeys: string[];
  domains: GoalDomain[];
  ageBand?: Resource['ageBand'];
  audience: ResourceAudience;
}

export const EMPTY_RESOURCE_DRAFT: ResourceDraft = {
  title: '',
  description: '',
  url: '',
  tags: [],
  therapyTypeKeys: [],
  domains: [],
  audience: 'all',
};

/** Values are i18n keys in the `resources` namespace. */
export type ResourceDraftErrors = Partial<Record<'title' | 'kind' | 'url', string>>;

export function validateResourceDraft(d: ResourceDraft): ResourceDraftErrors {
  const e: ResourceDraftErrors = {};
  if (!d.title.trim()) e.title = 'new.errors.title';
  if (!d.kind) e.kind = 'new.errors.kind';
  if (!isValidResourceUrl(d.url)) e.url = 'new.errors.url';
  return e;
}

export function toResourceInput(d: ResourceDraft): Omit<Resource, 'id' | 'organizationId' | 'createdAt'> {
  if (!d.kind) throw new Error('toResourceInput: kind missing');
  return {
    title: d.title.replace(/\s+/g, ' ').trim(),
    description: d.description.trim(),
    kind: d.kind,
    url: d.url.trim(),
    tags: normaliseTags(d.tags),
    therapyTypeKeys: d.therapyTypeKeys,
    domains: d.domains,
    ...(d.ageBand ? { ageBand: d.ageBand } : {}),
    audience: d.audience,
  };
}

/** Video resources play in the app; everything else opens in the in-app browser. */
export function opensInPlayer(kind: ResourceKind): boolean {
  return kind === 'video';
}
