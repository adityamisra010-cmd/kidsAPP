/**
 * School settings form state (pure). The screen edits a draft; saving sends only what changed,
 * split into the organisation fields and the settings jsonb.
 */
import type { ClockTime, ISODate, Organization, OrgSettings, Role } from '@/domain/types';

export type OrgFields = Pick<Organization, 'name' | 'shortName' | 'city' | 'address' | 'phone' | 'email' | 'logoUrl'>;

export interface SchoolDraft {
  org: { name: string; shortName: string; city: string; address: string; phone: string; email: string; logoUrl?: string };
  settings: OrgSettings;
}

export const REMINDER_OPTIONS = [24, 2, 1] as const;
export const RETENTION_OPTIONS = [90, 180, 365] as const;
export const LOCK_OPTIONS = [12, 24, 48, 72] as const;
/** Monday first, as Indian school weeks are shown. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function canEditSchool(role: Role | undefined): boolean {
  return role === 'school_admin';
}

export function canViewSchool(role: Role | undefined): boolean {
  return role === 'school_admin' || role === 'coordinator';
}

export function draftFromOrg(org: Organization): SchoolDraft {
  return {
    org: {
      name: org.name,
      shortName: org.shortName,
      city: org.city,
      address: org.address,
      phone: org.phone,
      email: org.email ?? '',
      logoUrl: org.logoUrl,
    },
    settings: {
      ...org.settings,
      reminderHoursBefore: [...org.settings.reminderHoursBefore],
      quietHours: { ...org.settings.quietHours },
      workingHours: { ...org.settings.workingHours, days: [...org.settings.workingHours.days] },
      holidays: org.settings.holidays.map((h) => ({ ...h })),
    },
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only the fields that changed (null when nothing did). Text is trimmed; empty email clears it. */
export function buildPatches(org: Organization, draft: SchoolDraft): { orgPatch: Partial<OrgFields> | null; settingsPatch: Partial<OrgSettings> | null } {
  const before = draftFromOrg(org);
  const orgPatch: Partial<OrgFields> = {};
  const o = draft.org;
  const trimmed = { name: o.name.trim(), shortName: o.shortName.trim(), city: o.city.trim(), address: o.address.trim(), phone: o.phone.trim(), email: o.email.trim() };
  (Object.keys(trimmed) as (keyof typeof trimmed)[]).forEach((k) => {
    if (trimmed[k] !== before.org[k]) {
      if (k === 'email') orgPatch.email = trimmed.email || undefined;
      else orgPatch[k] = trimmed[k];
    }
  });
  if (o.logoUrl !== before.org.logoUrl) orgPatch.logoUrl = o.logoUrl;

  const settingsPatch: Partial<OrgSettings> = {};
  const s = normaliseSettings(draft.settings);
  (Object.keys(s) as (keyof OrgSettings)[]).forEach((k) => {
    if (!same(s[k], before.settings[k])) (settingsPatch as Record<string, unknown>)[k] = s[k];
  });
  return {
    orgPatch: Object.keys(orgPatch).length ? orgPatch : null,
    settingsPatch: Object.keys(settingsPatch).length ? settingsPatch : null,
  };
}

/** Sorted, de-duplicated lists so the saved shape is stable. */
export function normaliseSettings(s: OrgSettings): OrgSettings {
  return {
    ...s,
    reminderHoursBefore: [...new Set(s.reminderHoursBefore)].sort((a, b) => b - a),
    workingHours: { ...s.workingHours, days: [...new Set(s.workingHours.days)].sort((a, b) => a - b) },
    holidays: sortHolidays(s.holidays),
  };
}

export function isDirty(org: Organization, draft: SchoolDraft): boolean {
  const p = buildPatches(org, draft);
  return !!(p.orgPatch || p.settingsPatch);
}

export function sortHolidays(list: { date: ISODate; label: string }[]): { date: ISODate; label: string }[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

/** Adds a holiday; the same date replaces the old label. */
export function addHoliday(list: { date: ISODate; label: string }[], date: ISODate, label: string): { date: ISODate; label: string }[] {
  return sortHolidays([...list.filter((h) => h.date !== date), { date, label: label.trim() }]);
}

export function removeHoliday(list: { date: ISODate; label: string }[], date: ISODate) {
  return list.filter((h) => h.date !== date);
}

const toMin = (t: ClockTime) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export type DraftField = 'name' | 'shortName' | 'phone' | 'email' | 'workingHours' | 'workingDays' | 'quietHours';

/** Field → i18n key (in the `school` namespace) of the problem. */
export function validateDraft(d: SchoolDraft): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {};
  if (!d.org.name.trim()) e.name = 'errors.nameRequired';
  if (!d.org.shortName.trim()) e.shortName = 'errors.shortNameRequired';
  else if (d.org.shortName.trim().length > 24) e.shortName = 'errors.shortNameLong';
  const digits = d.org.phone.replace(/\D/g, '');
  if (!digits) e.phone = 'errors.phoneRequired';
  else if (digits.length < 8 || digits.length > 13) e.phone = 'errors.phoneInvalid';
  if (d.org.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.org.email.trim())) e.email = 'errors.emailInvalid';
  const wh = d.settings.workingHours;
  if (toMin(wh.end) <= toMin(wh.start)) e.workingHours = 'errors.workingHours';
  if (!wh.days.length) e.workingDays = 'errors.workingDays';
  if (d.settings.quietHours.start === d.settings.quietHours.end) e.quietHours = 'errors.quietHours';
  return e;
}
