import type { ImportContext, ImportKind } from '@/domain/types';

import { autoMap } from '../mapping';
import { parseCsvText } from '../parse';
import { TEMPLATES } from '../templates';
import { toImportRows, validateRows, type ValidateOptions, type ValidatedRow } from '../validate';

const TODAY = new Date(2026, 9, 29); // Thu 29 Oct 2026

const ctx: ImportContext = {
  therapists: [
    { id: 't1', name: 'Ms. Priya Nair', phone: '+919820145678' },
    { id: 't2', name: 'Rahul Verma', phone: '9811223344' },
    { id: 't3', name: 'Dr. Kavitha Menon', phone: '+91 98450 12345' },
  ],
  children: [
    { id: 'c1', fullName: 'Aarav Sharma', dob: '2019-03-14' },
    { id: 'c2', fullName: 'Diya Iyer', dob: '2017-11-02' },
    { id: 'c3', fullName: 'Rohan Gupta', dob: '2018-01-01' },
    { id: 'c4', fullName: 'Rohan Gupta', dob: '2016-05-05' },
    { id: 'c5', fullName: 'Mohammed Faizan Khan', dob: '2018-07-23' },
  ],
  therapyTypes: [
    { id: 'tt1', name: 'Speech Therapy', key: 'speech' },
    { id: 'tt2', name: 'Occupational Therapy', key: 'occupational' },
    { id: 'tt3', name: 'Behaviour Therapy (ABA)', key: 'behaviour' },
    { id: 'tt5', name: 'Physiotherapy', key: 'physio' },
    { id: 'tt4', name: 'Music Therapy', key: 'custom' },
  ],
  parents: [{ id: 'p1', name: 'Neha Sharma', phone: '+919910023456' }],
};

function run(kind: ImportKind, csv: string, opts: ValidateOptions = {}, context: ImportContext = ctx) {
  const sheet = parseCsvText(csv, kind);
  return validateRows(kind, sheet.rows, autoMap(kind, sheet.headers), context, { today: TODAY, ...opts });
}

const codes = (row: ValidatedRow) => row.errors.map((e) => e.code);
const warns = (row: ValidatedRow) => row.warnings.map((e) => e.code);

describe('templates validate cleanly against matching data', () => {
  it('children template: all new', () => {
    const r = run('children', TEMPLATES.children, {}, { ...ctx, children: [] });
    expect(r.counts).toMatchObject({ total: 3, new: 3, error: 0 });
  });

  it('staff template: two updates (known phones) and one new', () => {
    const r = run('staff', TEMPLATES.staff);
    expect(r.rows.map((x) => x.status)).toEqual(['update', 'update', 'update']);
    expect(r.rows[0].values).toMatchObject({ role: 'coordinator', phone: '+919845012345', therapyTypeIds: 'tt1' });
    expect(r.rows[2].values).toMatchObject({ therapyTypes: 'Occupational Therapy, Physiotherapy', therapyTypeIds: 'tt2,tt5' });
  });

  it('parents template', () => {
    const r = run('parents', TEMPLATES.parents);
    expect(r.counts.error).toBe(0);
    expect(r.rows.map((x) => x.status)).toEqual(['update', 'new', 'new']);
    expect(r.rows[0].values).toMatchObject({ childId: 'c1', relation: 'Mother', isPrimary: 'true' });
    expect(r.rows[1].values.isPrimary).toBe('false');
  });

  it('schedule template', () => {
    const r = run('schedule', TEMPLATES.schedule);
    expect(r.counts.error).toBe(0);
    expect(r.rows[0].values).toMatchObject({
      childId: 'c1',
      therapistId: 't1',
      therapyTypeId: 'tt1',
      weekdays: '1,3,5',
      startTime: '10:30',
      durationMinutes: '45',
      startDate: '2026-11-03',
      endDate: '2027-03-31',
      room: 'Room 2',
    });
    expect(warns(r.rows[2])).toContain('end_date_defaulted');
  });
});

describe('children', () => {
  it('requires a name and a valid date of birth', () => {
    const r = run('children', 'Name,DOB\n,14/03/2019\nAarav,\nKabir,31/02/2019\n12345,01/01/2020\nZoya,01/01/2030\n');
    expect(r.rows.map(codes)).toEqual([['required'], ['required'], ['date_invalid'], ['name_invalid'], ['dob_future']]);
    expect(r.rows[0].errors[0].column).toBe('fullName');
    expect(r.counts.error).toBe(5);
  });

  it('marks re-imports of known children as updates (case, spaces and date style ignored)', () => {
    const r = run('children', 'Child Name,Date of Birth\n  aarav   SHARMA ,14-03-2019\nNew Kid,2020-01-05\n');
    expect(r.rows[0]).toMatchObject({ status: 'update', existingId: 'c1' });
    expect(r.rows[1].status).toBe('new');
  });

  it('flags duplicates within the file and keeps the first', () => {
    const r = run('children', 'Name,DOB\nKabir Singh,05/06/2019\nKabir  singh,2019-06-05\nKabir Singh,06/06/2019\n', {}, { ...ctx, children: [] });
    expect(r.rows.map((x) => x.status)).toEqual(['new', 'duplicate', 'new']);
    expect(r.rows[1].duplicateOf).toBe(2);
    expect(r.counts).toMatchObject({ new: 2, duplicate: 1 });
  });

  it('warns when the same name exists with another date of birth', () => {
    const r = run('children', 'Name,DOB\nAarav Sharma,15/03/2019\n');
    expect(r.rows[0].status).toBe('new');
    expect(warns(r.rows[0])).toEqual(['child_same_name_exists']);
  });

  it('normalises gender and keeps optional fields', () => {
    const r = run('children', 'Name,DOB,Gender,Class,Nickname\nKabir,05/06/2019,Boy,Lotus,Kabu\nZoya,05/06/2019,?,,\n', {}, { ...ctx, children: [] });
    expect(r.rows[0].values).toEqual({ fullName: 'Kabir', dob: '2019-06-05', gender: 'male', classGroup: 'Lotus', preferredName: 'Kabu' });
    expect(warns(r.rows[1])).toEqual(['gender_unknown']);
  });

  it('warns about unusual ages and US-order dates', () => {
    const r = run('children', 'Name,DOB\nOld Student,01/01/1990\nKabir,03/25/2019\n', {}, { ...ctx, children: [] });
    expect(warns(r.rows[0])).toEqual(['dob_unusual']);
    expect(warns(r.rows[1])).toEqual(['date_us_order']);
    expect(r.rows[1].values.dob).toBe('2019-03-25');
  });

  it('ignores rows that only have a serial number', () => {
    const r = run('children', 'S.No.,Name,DOB\n1,Kabir,05/06/2019\n2,,\n3,,\n');
    expect(r.counts).toMatchObject({ total: 1, emptyIgnored: 2 });
  });
});

describe('staff', () => {
  it('validates phones in plain language codes', () => {
    const r = run('staff', 'Name,Mobile\nA,98765 4321\nB,011 2345 6789\nC,+44 7700 900123\nD,9.87654321E+09\nE,\nF,98765 43210 / 91234 56780\n');
    expect(r.rows.map(codes)).toEqual([['phone_invalid'], ['phone_landline'], ['phone_foreign'], ['phone_shortened'], ['required'], []]);
    expect(warns(r.rows[5])).toContain('phone_multiple');
  });

  it('reads roles, infers from the job title, defaults to therapist', () => {
    const r = run('staff', 'Name,Mobile,Role,Designation\nA,9000000001,Principal,\nB,9000000002,,Clinical Coordinator\nC,9000000003,,\nD,9000000004,Driver,\n');
    expect(r.rows[0].values.role).toBe('school_admin');
    expect(r.rows[1].values.role).toBe('coordinator');
    expect(warns(r.rows[1])).toContain('role_from_title');
    expect(r.rows[2].values.role).toBe('therapist');
    expect(warns(r.rows[2])).toEqual(['role_defaulted', 'therapist_no_types']);
    expect(codes(r.rows[3])).toEqual(['role_unknown']);
  });

  it('resolves therapy type lists with short names and suggests for unknown ones', () => {
    const r = run('staff', 'Name,Mobile,Role,Therapy Types\nA,9000000001,Therapist,"ST, OT"\nB,9000000002,Therapist,Speech & Language Therapy\nC,9000000003,Therapist,OT & ABA\nD,9000000004,Therapist,Musc Therapy\nE,9000000005,Therapist,Dance\n');
    expect(r.rows[0].values.therapyTypeIds).toBe('tt1,tt2');
    expect(r.rows[1].values.therapyTypeIds).toBe('tt1');
    expect(r.rows[2].values.therapyTypeIds).toBe('tt2,tt3');
    expect(codes(r.rows[3])).toEqual(['therapy_type_unknown']);
    expect(r.rows[3].errors[0].params?.suggestions).toBe('Music Therapy');
    expect(r.unresolved.map((u) => [u.refKind, u.raw, u.rowNumbers])).toEqual([
      ['therapyType', 'Musc Therapy', [5]],
      ['therapyType', 'Dance', [6]],
    ]);
  });

  it('lets the admin accept a suggestion for every row with that value', () => {
    const csv = 'Name,Mobile,Therapy\nA,9000000001,Musc Therapy\nB,9000000002,musc therapy\n';
    const before = run('staff', csv);
    expect(before.counts.error).toBe(2);
    expect(before.unresolved).toHaveLength(1);
    const after = run('staff', csv, { resolutions: { therapyType: { [before.unresolved[0].normalized]: 'tt4' } } });
    expect(after.counts.error).toBe(0);
    expect(after.rows[1].values.therapyTypeIds).toBe('tt4');
  });

  it('matches existing staff on mobile and warns when the name differs', () => {
    const r = run('staff', 'Name,Mobile\nPriya Nair,98201 45678\nSomeone Else,9811223344\n');
    expect(r.rows[0]).toMatchObject({ status: 'update', existingId: 't1' });
    expect(warns(r.rows[0])).not.toContain('phone_belongs_to');
    expect(warns(r.rows[1])).toContain('phone_belongs_to');
  });

  it('treats the same mobile twice in a file as a duplicate', () => {
    const r = run('staff', 'Name,Mobile\nAnita,9000000001\nAnita R,+91 90000 00001\n');
    expect(r.rows.map((x) => x.status)).toEqual(['new', 'duplicate']);
  });

  it('drops an invalid optional email with a warning', () => {
    const r = run('staff', 'Name,Mobile,Email\nAnita,9000000001,anita@\nBina,9000000002,Bina@Example.com\n');
    expect(r.rows[0].values.email).toBeUndefined();
    expect(warns(r.rows[0])).toContain('email_invalid');
    expect(r.rows[1].values.email).toBe('bina@example.com');
  });
});

describe('parents', () => {
  it('links a parent to two children with two rows (not a duplicate)', () => {
    const r = run('parents', 'Parent Name,Mobile,Child Name\nAnita Rao,9000000001,Aarav Sharma\nAnita Rao,9000000001,Diya Iyer\nAnita Rao,9000000001,aarav sharma\n');
    expect(r.rows.map((x) => x.status)).toEqual(['new', 'new', 'duplicate']);
    expect(r.rows[1].values.childId).toBe('c2');
  });

  it('needs a known child and suggests close names', () => {
    const r = run('parents', 'Parent Name,Mobile,Child Name\nAnita,9000000001,Arav Sharma\nBina,9000000002,\n');
    expect(codes(r.rows[0])).toEqual(['child_unknown']);
    expect(r.rows[0].errors[0].params?.suggestions).toBe('Aarav Sharma');
    expect(codes(r.rows[1])).toEqual(['required']);
    expect(r.unresolved[0]).toMatchObject({ refKind: 'child', suggestions: [{ id: 'c1', label: 'Aarav Sharma' }] });
  });

  it('uses the child date of birth when two children share a name', () => {
    const r = run('parents', 'Parent Name,Mobile,Child Name,Child DOB\nA,9000000001,Rohan Gupta,\nB,9000000002,Rohan Gupta,05/05/2016\nC,9000000003,Rohan Gupta,06/06/2016\n');
    expect(codes(r.rows[0])).toEqual(['child_ambiguous']);
    expect(r.rows[1].values.childId).toBe('c4');
    expect(codes(r.rows[2])).toEqual(['child_dob_mismatch']);
  });

  it('decides the primary contact when the column is empty', () => {
    const r = run('parents', 'Parent Name,Mobile,Child Name,Relation,Primary\nVikram,9000000002,Aarav Sharma,papa,\nNeha,9000000001,Aarav Sharma,Mummy,Yes\nLakshmi,9000000003,Diya Iyer,,\nRavi,9000000004,Diya Iyer,Father,\n');
    expect(r.rows.map((x) => x.values.isPrimary)).toEqual(['false', 'true', 'true', 'false']);
    expect(r.rows.map((x) => x.values.relation)).toEqual(['Father', 'Mother', 'Parent', 'Father']);
  });

  it('warns when one mobile is used for different names', () => {
    const r = run('parents', 'Parent Name,Mobile,Child Name\nNeha Sharma,9000000001,Aarav Sharma\nRekha Iyer,9000000001,Diya Iyer\n');
    expect(warns(r.rows[1])).toContain('phone_different_name');
  });

  it('marks known parents (by mobile) as updates', () => {
    const r = run('parents', 'Parent Name,Mobile,Child Name\nNeha Sharma,+91 99100 23456,Aarav Sharma\n');
    expect(r.rows[0]).toMatchObject({ status: 'update', existingId: 'p1' });
  });
});

describe('schedule', () => {
  const H = 'Child,Therapist,Therapy,Days,Time,Duration,Start Date,End Date\n';

  it('resolves names ignoring titles and case, and therapists by mobile', () => {
    const r = run('schedule', `${H}aarav sharma,Priya Nair,ST,M W F,10.30 am,45,,\nDiya Iyer,98450 12345,OT,Tue/Thu,11:15,1 hr,,\n`);
    expect(r.rows[0].values).toMatchObject({ childId: 'c1', therapistId: 't1', therapyTypeId: 'tt1', weekdays: '1,3,5', startTime: '10:30' });
    expect(r.rows[1].values).toMatchObject({ therapistId: 't3', durationMinutes: '60' });
  });

  it('explains unknown therapists with suggestions', () => {
    const r = run('schedule', `${H}Aarav Sharma,Kavita Menon,Speech,Mon,10:00,,,\nDiya Iyer,Kavita Menon,Speech,Tue,10:00,,,\n`);
    expect(codes(r.rows[0])).toEqual(['therapist_unknown']);
    expect(r.unresolved).toEqual([
      expect.objectContaining({ refKind: 'therapist', raw: 'Kavita Menon', rowNumbers: [2, 3], suggestions: [{ id: 't3', label: 'Dr. Kavitha Menon' }] }),
    ]);
    const fixed = run('schedule', `${H}Aarav Sharma,Kavita Menon,Speech,Mon,10:00,,,\n`, { resolutions: { therapist: { 'kavita menon': 't3' } } });
    expect(fixed.rows[0].values.therapistId).toBe('t3');
  });

  it('rejects bad days, times and durations', () => {
    const r = run('schedule', `${H}Aarav Sharma,Priya Nair,Speech,Funday,10:00,,,\nAarav Sharma,Priya Nair,Speech,Mon,25:00,,,\nAarav Sharma,Priya Nair,Speech,Mon,10:00,300,,\n`);
    expect(r.rows.map(codes)).toEqual([['days_invalid'], ['time_invalid'], ['duration_invalid']]);
  });

  it('fills sensible defaults and never schedules in the past', () => {
    const r = run('schedule', `${H}Aarav Sharma,Priya Nair,Speech,Mon,10:00,,01/06/2026,\n`);
    expect(r.rows[0].values).toMatchObject({ startDate: '2026-10-29', endDate: '2027-03-31', durationMinutes: '45' });
    expect(warns(r.rows[0])).toEqual(['duration_defaulted', 'start_date_moved', 'end_date_defaulted']);
  });

  it('takes the duration from a time range', () => {
    const r = run('schedule', `${H}Aarav Sharma,Priya Nair,Speech,Mon,10:30 - 11:15,,,31/03/2027\n`);
    expect(r.rows[0].values).toMatchObject({ startTime: '10:30', durationMinutes: '45' });
    expect(r.rows[0].warnings).toEqual([]);
  });

  it('rejects an end date before the start date', () => {
    const r = run('schedule', `${H}Aarav Sharma,Priya Nair,Speech,Mon,10:00,,10/11/2026,01/11/2026\n`);
    expect(codes(r.rows[0])).toEqual(['end_before_start']);
  });

  it('skips rows fully covered by an earlier row and warns about double bookings', () => {
    const r = run(
      'schedule',
      `${H}Aarav Sharma,Priya Nair,Speech,Mon/Wed,10:00,45,,31/03/2027\nAarav Sharma,Ms. Priya Nair,speech therapy,Wed,10:00,45,,31/03/2027\nAarav Sharma,Rahul Verma,OT,Mon,10:30,45,,31/03/2027\nDiya Iyer,Priya Nair,Speech,Wed,10:15,30,,31/03/2027\n`,
    );
    expect(r.rows.map((x) => x.status)).toEqual(['new', 'duplicate', 'new', 'new']);
    expect(r.rows[1].duplicateOf).toBe(2);
    expect(warns(r.rows[2])).toContain('child_double_booked');
    expect(warns(r.rows[3])).toContain('therapist_double_booked');
  });

  it('handles a missing required column mapping as row errors', () => {
    const sheet = parseCsvText('Child,Therapist\nAarav Sharma,Priya Nair\n');
    const r = validateRows('schedule', sheet.rows, autoMap('schedule', sheet.headers), ctx, { today: TODAY });
    expect(codes(r.rows[0])).toEqual(['required', 'required', 'required']);
  });
});

describe('large files', () => {
  it('validates 3,000 rows against a big school quickly', () => {
    const big: ImportContext = {
      therapists: ctx.therapists,
      therapyTypes: ctx.therapyTypes,
      children: Array.from({ length: 600 }, (_, i) => ({ id: `c${i}`, fullName: `Child Number${i} Kumar`, dob: '2018-01-01' })),
      parents: Array.from({ length: 1200 }, (_, i) => ({ id: `p${i}`, name: `Parent ${i}`, phone: `+9190000${String(i).padStart(5, '0')}` })),
    };
    const lines = Array.from(
      { length: 3000 },
      (_, i) => `Parent ${i},90000${String(i).padStart(5, '0')},${i % 3 === 0 ? `Unknown Kid${i}` : `Child Number${i % 600} Kumar`}`,
    );
    const started = Date.now();
    const r = run('parents', `Parent Name,Mobile,Child Name\n${lines.join('\n')}\n`, {}, big);
    expect(Date.now() - started).toBeLessThan(4000);
    expect(r.counts.total).toBe(3000);
    expect(r.counts.error).toBe(1000);
    // Known mobiles (first 1,200) whose child was found are updates.
    expect(r.counts.update).toBe(800);
  });
});

describe('toImportRows', () => {
  it('sends only new and updated rows, with existing ids', () => {
    const r = run('children', 'Name,DOB\nAarav Sharma,14/03/2019\nNew Kid,05/06/2019\nNew Kid,05/06/2019\n,\nBad,99/99/2019\n');
    expect(toImportRows(r)).toEqual([
      { rowNumber: 2, values: { fullName: 'Aarav Sharma', dob: '2019-03-14', existingId: 'c1' } },
      { rowNumber: 3, values: { fullName: 'New Kid', dob: '2019-06-05' } },
    ]);
  });
});
