/** Caseload list helpers: search, therapy-type filter and a calm, useful default order. */
import type { ChildSummary, UUID } from '@/domain/types';

export function matchesSearch(fields: (string | undefined)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => !!f && f.toLowerCase().includes(q));
}

export function filterCaseload(list: ChildSummary[], opts: { search?: string; therapyTypeId?: UUID | null }): ChildSummary[] {
  return list.filter(
    (c) =>
      matchesSearch([c.child.fullName, c.child.preferredName, c.child.classGroup], opts.search ?? '') &&
      (!opts.therapyTypeId || c.therapists.some((t) => t.therapyTypeId === opts.therapyTypeId)),
  );
}

/** Distinct therapy types present in a list, first-seen order. */
export function therapyTypeIdsIn(list: ChildSummary[]): UUID[] {
  const out: UUID[] = [];
  for (const c of list) for (const t of c.therapists) if (!out.includes(t.therapyTypeId)) out.push(t.therapyTypeId);
  return out;
}

/** Children needing attention first, then the soonest next appointment, then name. */
export function sortCaseload(list: ChildSummary[]): ChildSummary[] {
  const next = (c: ChildSummary) => (c.nextAppointment ? Date.parse(c.nextAppointment.startsAt) : Number.POSITIVE_INFINITY);
  return [...list].sort((a, b) => {
    const att = Number(b.openAlerts > 0) - Number(a.openAlerts > 0);
    if (att !== 0) return att;
    const n = next(a) - next(b);
    if (n !== 0 && Number.isFinite(n)) return n;
    if (next(a) !== next(b)) return Number.isFinite(next(a)) ? -1 : 1;
    return a.child.fullName.localeCompare(b.child.fullName);
  });
}

/** Short first name used in headers and switchers. */
export function displayName(child: { fullName: string; preferredName?: string }): string {
  return child.preferredName?.trim() || child.fullName;
}
