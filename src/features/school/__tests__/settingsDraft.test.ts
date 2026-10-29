import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { Organization } from '@/domain/types';

import {
  addHoliday,
  buildPatches,
  canEditSchool,
  canViewSchool,
  draftFromOrg,
  isDirty,
  removeHoliday,
  validateDraft,
  type SchoolDraft,
} from '../settingsDraft';

const org: Organization = {
  id: 'org1',
  name: 'Sunrise Child Development Centre',
  shortName: 'Sunrise CDC',
  city: 'Noida',
  address: 'C-24, Sector 62',
  phone: '+91 120 456 7890',
  status: 'active',
  settings: { ...DEFAULT_ORG_SETTINGS, holidays: [{ date: '2026-11-08', label: 'Diwali' }] },
  createdAt: '2025-01-01T00:00:00.000Z',
};

const edit = (fn: (d: SchoolDraft) => void) => {
  const d = draftFromOrg(org);
  fn(d);
  return d;
};

describe('school settings draft', () => {
  it('copies the org without sharing nested objects', () => {
    const d = draftFromOrg(org);
    d.settings.workingHours.days.push(0);
    d.settings.holidays[0].label = 'Changed';
    expect(org.settings.workingHours.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(org.settings.holidays[0].label).toBe('Diwali');
    expect(d.org.email).toBe('');
  });

  it('sends nothing when nothing changed', () => {
    expect(buildPatches(org, draftFromOrg(org))).toEqual({ orgPatch: null, settingsPatch: null });
    expect(isDirty(org, draftFromOrg(org))).toBe(false);
    // Reordering the same reminder hours is not a change.
    expect(isDirty(org, edit((d) => (d.settings.reminderHoursBefore = [1, 24])))).toBe(false);
  });

  it('splits org fields and settings, trimming text', () => {
    const d = edit((x) => {
      x.org.name = '  Sunrise Centre  ';
      x.org.email = 'hello@sunrise.example.com ';
      x.settings.parentsSeeNumericScore = true;
      x.settings.quietHours.start = '22:00';
    });
    expect(buildPatches(org, d)).toEqual({
      orgPatch: { name: 'Sunrise Centre', email: 'hello@sunrise.example.com' },
      settingsPatch: { parentsSeeNumericScore: true, quietHours: { start: '22:00', end: '08:00' } },
    });
  });

  it('sorts lists so the saved shape is stable', () => {
    const d = edit((x) => {
      x.settings.workingHours.days = [6, 1, 3, 1];
      x.settings.reminderHoursBefore = [1, 2, 24];
    });
    expect(buildPatches(org, d).settingsPatch).toEqual({
      workingHours: { start: '08:30', end: '17:30', days: [1, 3, 6] },
      reminderHoursBefore: [24, 2, 1],
    });
  });

  it('records logo changes, including removing it', () => {
    expect(buildPatches(org, edit((x) => (x.org.logoUrl = 'file:///logo.png'))).orgPatch).toEqual({ logoUrl: 'file:///logo.png' });
    const withLogo = { ...org, logoUrl: 'file:///old.png' };
    const d = draftFromOrg(withLogo);
    d.org.logoUrl = undefined;
    expect(buildPatches(withLogo, d).orgPatch).toEqual({ logoUrl: undefined });
  });

  it('adds, replaces and removes holidays in date order', () => {
    let list = addHoliday(org.settings.holidays, '2026-08-15', ' Independence Day ');
    expect(list).toEqual([
      { date: '2026-08-15', label: 'Independence Day' },
      { date: '2026-11-08', label: 'Diwali' },
    ]);
    list = addHoliday(list, '2026-11-08', 'Deepavali');
    expect(list.map((h) => h.label)).toEqual(['Independence Day', 'Deepavali']);
    expect(removeHoliday(list, '2026-08-15')).toEqual([{ date: '2026-11-08', label: 'Deepavali' }]);
  });

  it('validates the form in plain terms', () => {
    expect(validateDraft(draftFromOrg(org))).toEqual({});
    const d = edit((x) => {
      x.org.name = ' ';
      x.org.shortName = 'A very long short name for a school';
      x.org.phone = '123';
      x.org.email = 'not-an-email';
      x.settings.workingHours = { start: '17:00', end: '09:00', days: [] };
      x.settings.quietHours = { start: '21:00', end: '21:00' };
    });
    expect(validateDraft(d)).toEqual({
      name: 'errors.nameRequired',
      shortName: 'errors.shortNameLong',
      phone: 'errors.phoneInvalid',
      email: 'errors.emailInvalid',
      workingHours: 'errors.workingHours',
      workingDays: 'errors.workingDays',
      quietHours: 'errors.quietHours',
    });
    expect(validateDraft(edit((x) => (x.org.phone = ''))).phone).toBe('errors.phoneRequired');
  });

  it('lets school admins edit and coordinators view', () => {
    expect(canEditSchool('school_admin')).toBe(true);
    expect(canEditSchool('coordinator')).toBe(false);
    expect(canViewSchool('coordinator')).toBe(true);
    expect(canViewSchool('therapist')).toBe(false);
    expect(canViewSchool(undefined)).toBe(false);
  });
});
