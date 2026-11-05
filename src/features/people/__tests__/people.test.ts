import type { ChildSummary, Member } from '@/domain/types';

import {
  caseloadCount,
  childrenByGuardian,
  invitableRoles,
  qualifiedFor,
  sortMembers,
  toInviteInput,
  validateInvite,
  validateNewChild,
  withPrimaryGuardian,
  type InviteDraft,
  type NewChildDraft,
} from '../people';
import { formatIndianPhone, isValidIndianMobile, normaliseIndianPhone, telLink } from '../phone';

describe('Indian phone numbers', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['+91-9876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['(0) 98765 43210', '+919876543210'],
    ['6123456789', '+916123456789'],
  ])('normalises %s', (input, out) => {
    expect(normaliseIndianPhone(input)).toBe(out);
  });

  it.each(['', '12345', '5876543210', '+1 415 555 0100', '98765432100', 'abc9876543210', '+44 9876543210'])('rejects %s', (input) => {
    expect(normaliseIndianPhone(input)).toBeNull();
    expect(isValidIndianMobile(input)).toBe(false);
  });

  it('formats for display and dialling', () => {
    expect(formatIndianPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatIndianPhone('011-2345678')).toBe('011-2345678');
    expect(formatIndianPhone(undefined)).toBe('');
    expect(telLink('98765 43210')).toBe('tel:+919876543210');
  });
});

function summary(id: string, guardians: ChildSummary['guardians'], therapists: ChildSummary['therapists'] = []): ChildSummary {
  return {
    child: { id, organizationId: 'o1', fullName: `Child ${id}`, dob: '2019-01-01', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
    guardians,
    therapists,
    openAlerts: 0,
  };
}

function member(id: string, role: Member['membership']['role'], extra: Partial<Member> = {}, status: Member['membership']['status'] = 'active'): Member {
  return {
    profile: { id, fullName: `Name ${id}`, preferredLanguage: 'en' },
    membership: { id: `m-${id}`, userId: id, organizationId: 'o1', role, status },
    therapyTypeIds: [],
    ...extra,
  };
}

describe('people helpers', () => {
  it('links parents to their children', () => {
    const map = childrenByGuardian([
      summary('a', [{ userId: 'p1', name: 'Priya', relation: 'Mother' }]),
      summary('b', [
        { userId: 'p1', name: 'Priya', relation: 'Mother' },
        { userId: 'p2', name: 'Rahul', relation: 'Father' },
      ]),
    ]);
    expect(map.get('p1')?.map((c) => c.childId)).toEqual(['a', 'b']);
    expect(map.get('p2')).toEqual([{ childId: 'b', name: 'Child b', relation: 'Father' }]);
  });

  it('counts a therapist caseload', () => {
    const list = [
      summary('a', [], [{ userId: 't1', name: 'T', therapyTypeId: 'sp', isLead: true }]),
      summary('b', [], [{ userId: 't2', name: 'T2', therapyTypeId: 'sp', isLead: true }]),
    ];
    expect(caseloadCount(list, 't1')).toBe(1);
  });

  it('sorts staff by role with suspended members last', () => {
    const sorted = sortMembers([member('t', 'therapist'), member('s', 'therapist', {}, 'suspended'), member('a', 'school_admin'), member('c', 'coordinator')]);
    expect(sorted.map((m) => m.profile.id)).toEqual(['a', 'c', 't', 's']);
  });

  it('suggests qualified therapists, or all therapists when none are tagged', () => {
    const list = [member('t1', 'therapist', { therapyTypeIds: ['sp'] }), member('t2', 'therapist'), member('p', 'parent')];
    expect(qualifiedFor(list, 'sp').map((m) => m.profile.id)).toEqual(['t1']);
    expect(qualifiedFor(list, 'ot').map((m) => m.profile.id)).toEqual(['t1', 't2']);
  });

  it('keeps exactly one primary guardian', () => {
    expect(withPrimaryGuardian([{ isPrimary: false }, { isPrimary: false }]).map((g) => g.isPrimary)).toEqual([true, false]);
    expect(withPrimaryGuardian([{ isPrimary: false }, { isPrimary: true }, { isPrimary: true }]).map((g) => g.isPrimary)).toEqual([false, true, false]);
  });
});

describe('invite validation', () => {
  const base: InviteDraft = { role: 'parent', fullName: 'Priya Sharma', phone: '98765 43210', email: '', childIds: ['c1'], relation: 'mother' };

  it('accepts a valid parent invite and normalises the phone', () => {
    expect(validateInvite(base)).toEqual({});
    expect(toInviteInput(base, 'o1')).toEqual({
      organizationId: 'o1',
      role: 'parent',
      fullName: 'Priya Sharma',
      phone: '+919876543210',
      email: undefined,
      childIds: ['c1'],
      relation: 'Mother',
    });
  });

  it('flags missing children, bad phone, bad email and duplicates', () => {
    expect(validateInvite({ ...base, childIds: [] }).childIds).toBeDefined();
    expect(validateInvite({ ...base, phone: '12345' }).phone).toBe('admin:invite.errors.phone');
    expect(validateInvite({ ...base, email: 'not-an-email' }).email).toBeDefined();
    expect(validateInvite(base, { existingPhones: ['+91 98765 43210'] }).phone).toBe('admin:invite.errors.phoneTaken');
  });

  it('does not attach children to staff invites', () => {
    const staff = { ...base, role: 'therapist' as const, childIds: [] };
    expect(validateInvite(staff)).toEqual({});
    expect(toInviteInput({ ...staff, childIds: ['c1'] }, 'o1')).toMatchObject({ childIds: [], relation: undefined });
  });

  it('only lets school admins invite school admins', () => {
    expect(invitableRoles('coordinator')).not.toContain('school_admin');
    expect(invitableRoles('school_admin')).toContain('school_admin');
    expect(validateInvite({ ...base, role: 'school_admin', childIds: [] }, { allowedRoles: invitableRoles('coordinator') }).role).toBeDefined();
  });
});

describe('new child validation', () => {
  const draft: NewChildDraft = { fullName: 'Aarav Sharma', preferredName: '', dob: '2019-05-01', gender: null, classGroup: '', therapists: {}, guardians: [], newParent: null };

  it('requires a name and a past date of birth', () => {
    expect(validateNewChild(draft, '2026-10-29')).toEqual({});
    expect(validateNewChild({ ...draft, fullName: ' ', dob: null }, '2026-10-29')).toEqual({
      fullName: 'admin:newChild.errors.name',
      dob: 'admin:newChild.errors.dob',
    });
    expect(validateNewChild({ ...draft, dob: '2027-01-01' }, '2026-10-29').dob).toBe('admin:newChild.errors.dobFuture');
  });

  it('validates an invited parent', () => {
    expect(validateNewChild({ ...draft, newParent: { fullName: 'P', phone: '123', relation: 'mother' } }, '2026-10-29')).toEqual({
      newParentName: 'admin:invite.errors.name',
      newParentPhone: 'admin:invite.errors.phone',
    });
  });
});
