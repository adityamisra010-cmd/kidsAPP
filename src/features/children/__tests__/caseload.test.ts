import type { ChildSummary } from '@/domain/types';

import { displayName, filterCaseload, sortCaseload, therapyTypeIdsIn } from '../caseload';

function child(id: string, name: string, extra: Partial<ChildSummary> = {}): ChildSummary {
  return {
    child: { id, organizationId: 'o1', fullName: name, dob: '2018-01-01', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
    therapists: [],
    guardians: [],
    openAlerts: 0,
    ...extra,
  };
}

const appt = (startsAt: string) => ({ startsAt }) as ChildSummary['nextAppointment'];

describe('caseload helpers', () => {
  const list = [
    child('a', 'Aarav Sharma', { therapists: [{ userId: 't1', name: 'Ms Rao', therapyTypeId: 'speech', isLead: true }], nextAppointment: appt('2026-11-02T10:00:00Z') }),
    child('b', 'Diya Patel', { therapists: [{ userId: 't1', name: 'Ms Rao', therapyTypeId: 'ot', isLead: false }], openAlerts: 1 }),
    child('c', 'Kabir Singh', { therapists: [{ userId: 't1', name: 'Ms Rao', therapyTypeId: 'speech', isLead: false }], nextAppointment: appt('2026-10-30T10:00:00Z') }),
  ];

  it('filters by search and therapy type', () => {
    expect(filterCaseload(list, { search: 'diya' }).map((c) => c.child.id)).toEqual(['b']);
    expect(filterCaseload(list, { therapyTypeId: 'speech' }).map((c) => c.child.id)).toEqual(['a', 'c']);
    expect(filterCaseload(list, { search: '  ' })).toHaveLength(3);
  });

  it('lists therapy types in first-seen order', () => {
    expect(therapyTypeIdsIn(list)).toEqual(['speech', 'ot']);
  });

  it('puts children needing attention first, then the soonest appointment', () => {
    expect(sortCaseload(list).map((c) => c.child.id)).toEqual(['b', 'c', 'a']);
  });

  it('prefers the preferred name', () => {
    expect(displayName({ fullName: 'Aarav Sharma', preferredName: 'Aaru' })).toBe('Aaru');
    expect(displayName({ fullName: 'Aarav Sharma', preferredName: ' ' })).toBe('Aarav Sharma');
  });
});
