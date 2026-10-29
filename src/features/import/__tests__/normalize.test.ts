import {
  academicYearEnd,
  ageInYears,
  cleanText,
  excelFractionToClock,
  excelSerialToISODate,
  formatPhone,
  normalizeHeader,
  normalizeName,
  normalizeRelation,
  parseDate,
  parseDuration,
  parseGender,
  parsePhone,
  parseRole,
  parseTime,
  parseWeekdays,
  parseYesNo,
  splitList,
  suggest,
} from '../normalize';

const TODAY = new Date(2026, 9, 29); // 29 Oct 2026

describe('cleanText / normalizeHeader / normalizeName', () => {
  it('cleans invisible characters and spacing', () => {
    expect(cleanText('  Aarav  Sharma​ ')).toBe('Aarav Sharma');
    expect(cleanText(null)).toBe('');
    expect(cleanText(42)).toBe('42');
  });

  it('normalises headers', () => {
    expect(normalizeHeader('Phone No.')).toBe('phone no');
    expect(normalizeHeader("Child's Name")).toBe('childs name');
    expect(normalizeHeader('Date of Birth (DD/MM/YYYY)')).toBe('date of birth');
    expect(normalizeHeader('  E-mail ID ')).toBe('e mail id');
    expect(normalizeHeader('नाम')).toBe('नाम');
  });

  it('ignores case, spacing and honorifics in names', () => {
    expect(normalizeName('Ms. Priya  Nair')).toBe('priya nair');
    expect(normalizeName('DR KAVITA MENON')).toBe('kavita menon');
    expect(normalizeName('Smt. Lakshmi Iyer')).toBe('lakshmi iyer');
    expect(normalizeName('Mr.Rahul Verma')).toBe('rahul verma');
    // A name that is only a title is kept.
    expect(normalizeName('Miss')).toBe('miss');
    expect(normalizeName('दिया अय्यर')).toBe('दिया अय्यर');
  });

  it('splits lists without breaking "Speech & Language Therapy"', () => {
    expect(splitList('Speech; OT / Physio')).toEqual(['Speech', 'OT', 'Physio']);
    expect(splitList('Speech & Language Therapy')).toEqual(['Speech & Language Therapy']);
    expect(splitList('')).toEqual([]);
  });
});

describe('parsePhone', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    ['(+91) 98765 43210', '+919876543210'],
    ['098765 43210', '+919876543210'],
    ['91 9876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['0091 98765 43210', '+919876543210'],
    ['9876543210.0', '+919876543210'],
    ['  6123456789 ', '+916123456789'],
  ])('accepts %s', (raw, expected) => {
    const r = parsePhone(raw);
    expect(r).toEqual({ ok: true, value: expected });
  });

  it('uses the first of several numbers with a warning', () => {
    expect(parsePhone('98765 43210 / 91234 56780')).toEqual({ ok: true, value: '+919876543210', warning: 'phone_multiple' });
    expect(parsePhone('9876543210, 9123456780')).toMatchObject({ ok: true, value: '+919876543210', warning: 'phone_multiple' });
  });

  it.each([
    ['', 'required'],
    ['N/A', 'required'],
    ['-', 'required'],
    ['98765 4321', 'phone_invalid'],
    ['12345', 'phone_invalid'],
    ['987654321012', 'phone_invalid'],
    ['011 2345 6789', 'phone_landline'],
    ['5876543210', 'phone_landline'],
    ['+1 415 555 0100', 'phone_foreign'],
    ['+44 7700 900123', 'phone_foreign'],
    ['9.87654321E+09', 'phone_shortened'],
    ['9.88e9', 'phone_shortened'],
  ])('rejects %s as %s', (raw, code) => {
    expect(parsePhone(raw)).toEqual({ ok: false, code });
  });

  it('formats for display', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('weird')).toBe('weird');
  });
});

describe('parseDate', () => {
  it.each([
    ['14/03/2019', '2019-03-14'],
    ['14-03-2019', '2019-03-14'],
    ['14.03.2019', '2019-03-14'],
    ['4/3/2019', '2019-03-04'],
    ['14/03/19', '2019-03-14'],
    ['14/03/98', '1998-03-14'],
    ['2019-03-14', '2019-03-14'],
    ['2019/3/14', '2019-03-14'],
    ['2019-03-14 00:00:00', '2019-03-14'],
    ['14/03/2019 10:30', '2019-03-14'],
    ['12 Mar 2019', '2019-03-12'],
    ['12-Mar-19', '2019-03-12'],
    ['12 March, 2019', '2019-03-12'],
    ['12th March 2019', '2019-03-12'],
    ['1st Sept 2020', '2020-09-01'],
    ['March 12, 2019', '2019-03-12'],
    ['Mar 12 2019', '2019-03-12'],
    ['43538', '2019-03-14'],
    ['43538.0', '2019-03-14'],
    ['29/02/2020', '2020-02-29'],
  ])('reads %s', (raw, expected) => {
    expect(parseDate(raw, TODAY)).toEqual({ ok: true, value: expected });
  });

  it('accepts unambiguous US order with a warning', () => {
    expect(parseDate('03/25/2019', TODAY)).toEqual({ ok: true, value: '2019-03-25', warning: 'date_us_order' });
  });

  it.each(['31/02/2019', '29/02/2019', '32/01/2019', '14/13/2019', 'next week', '2019', '12 Smarch 2019', '123456', '13/25/2019'])(
    'rejects %s',
    (raw) => {
      expect(parseDate(raw, TODAY)).toEqual({ ok: false, code: 'date_invalid' });
    },
  );

  it('flags an empty cell as required', () => {
    expect(parseDate('  ', TODAY)).toEqual({ ok: false, code: 'required' });
  });
});

describe('Excel serials', () => {
  it('converts serial dates in the 1900 system', () => {
    expect(excelSerialToISODate(43536)).toBe('2019-03-12');
    expect(excelSerialToISODate(1)).toBe('1900-01-01');
    expect(excelSerialToISODate(59)).toBe('1900-02-28');
    expect(excelSerialToISODate(61)).toBe('1900-03-01');
    expect(excelSerialToISODate(45000.75)).toBe('2023-03-15');
    expect(excelSerialToISODate(0)).toBeNull();
    expect(excelSerialToISODate(Number.NaN)).toBeNull();
  });

  it('converts day fractions to clock times', () => {
    expect(excelFractionToClock(0.4375)).toBe('10:30');
    expect(excelFractionToClock(0.5)).toBe('12:00');
    expect(excelFractionToClock(45000.75)).toBe('18:00');
  });
});

describe('ages and academic year', () => {
  it('computes whole years', () => {
    expect(ageInYears('2019-03-14', TODAY)).toBe(7);
    expect(ageInYears('2019-10-30', TODAY)).toBe(6);
    expect(ageInYears('2019-10-29', TODAY)).toBe(7);
  });

  it('ends the academic year on 31 March', () => {
    expect(academicYearEnd('2026-10-29')).toBe('2027-03-31');
    expect(academicYearEnd('2027-02-01')).toBe('2027-03-31');
    expect(academicYearEnd('2027-04-01')).toBe('2028-03-31');
  });
});

describe('parseTime', () => {
  it.each([
    ['10:30', '10:30'],
    ['10.30', '10:30'],
    ['10:30 AM', '10:30'],
    ['10.30 am', '10:30'],
    ['10:30am', '10:30'],
    ['10 AM', '10:00'],
    ['2 pm', '14:00'],
    ['2:15 p.m.', '14:15'],
    ['12:00 PM', '12:00'],
    ['12:30 am', '00:30'],
    ['14:00', '14:00'],
    ['14:00 hrs', '14:00'],
    ['09:00:00', '09:00'],
    ['1030', '10:30'],
    ['0.4375', '10:30'],
    ['noon', '12:00'],
  ])('reads %s', (raw, start) => {
    expect(parseTime(raw)).toEqual({ ok: true, value: { start } });
  });

  it('reads 1–6 o’clock without AM/PM as afternoon (with a warning)', () => {
    expect(parseTime('2:30')).toEqual({ ok: true, value: { start: '14:30' }, warning: 'time_assumed_pm' });
    expect(parseTime('7:30')).toEqual({ ok: true, value: { start: '07:30' } });
  });

  it('reads ranges and keeps the end time', () => {
    expect(parseTime('10:30 - 11:15')).toEqual({ ok: true, value: { start: '10:30', end: '11:15' } });
    expect(parseTime('10:30-11:15 AM')).toEqual({ ok: true, value: { start: '10:30', end: '11:15' } });
    expect(parseTime('11:30 to 12:15 pm')).toEqual({ ok: true, value: { start: '11:30', end: '12:15' } });
    expect(parseTime('2 – 3 pm')).toEqual({ ok: true, value: { start: '14:00', end: '15:00' } });
  });

  it.each(['25:00', '10:75', '13 pm', 'morning', '11:00 - 10:00', ''])('rejects %s', (raw) => {
    expect(parseTime(raw).ok).toBe(false);
  });
});

describe('parseDuration', () => {
  it.each([
    ['45', 45],
    ['45 min', 45],
    ['45 mins', 45],
    ['30 minutes', 30],
    ['1 hr', 60],
    ['1.5 hours', 90],
    ['1 hr 30 min', 90],
    ['1:15', 75],
    ['45.0', 45],
  ])('reads %s', (raw, minutes) => {
    expect(parseDuration(raw)).toEqual({ ok: true, value: minutes });
  });

  it('reads a bare small number as hours', () => {
    expect(parseDuration('1')).toEqual({ ok: true, value: 60, warning: 'duration_hours_assumed' });
  });

  it.each(['5', '300', 'long', '0'])('rejects %s', (raw) => {
    expect(parseDuration(raw)).toEqual({ ok: false, code: 'duration_invalid' });
  });
});

describe('parseWeekdays', () => {
  it.each([
    ['Mon/Wed/Fri', [1, 3, 5]],
    ['M W F', [1, 3, 5]],
    ['MWF', [1, 3, 5]],
    ['TTh', [2, 4]],
    ['Monday, Wednesday', [1, 3]],
    ['monday,wednesday', [1, 3]],
    ['Tue & Thu', [2, 4]],
    ['Tue and Thu', [2, 4]],
    ['Mon-Fri', [1, 2, 3, 4, 5]],
    ['Mon to Sat', [1, 2, 3, 4, 5, 6]],
    ['Mon - Wed', [1, 2, 3]],
    ['Sat/Sun', [0, 6]],
    ['Su', [0]],
    ['Fri, Mon, Fri', [1, 5]],
    ['Weekdays', [1, 2, 3, 4, 5]],
    ['सोम, बुध, शुक्र', [1, 3, 5]],
    ['Thurs.', [4]],
  ])('reads %s', (raw, days) => {
    expect(parseWeekdays(raw)).toEqual({ ok: true, value: days });
  });

  it('reads "Daily" as Monday–Saturday with a warning', () => {
    expect(parseWeekdays('Daily')).toEqual({ ok: true, value: [1, 2, 3, 4, 5, 6], warning: 'days_assumed_daily' });
  });

  it.each(['1,3,5', 'Funday', 'every other week', ''])('rejects %s', (raw) => {
    expect(parseWeekdays(raw).ok).toBe(false);
  });
});

describe('small vocabularies', () => {
  it('reads roles', () => {
    expect(parseRole('Therapist')).toBe('therapist');
    expect(parseRole('Speech Therapist')).toBe('therapist');
    expect(parseRole('OT')).toBe('therapist');
    expect(parseRole('Special Educator')).toBe('therapist');
    expect(parseRole('Coordinator')).toBe('coordinator');
    expect(parseRole('Clinical Lead')).toBe('coordinator');
    expect(parseRole('HOD Speech')).toBe('coordinator');
    expect(parseRole('School Admin')).toBe('school_admin');
    expect(parseRole('admin')).toBe('school_admin');
    expect(parseRole('Principal')).toBe('school_admin');
    expect(parseRole('Centre Head')).toBe('school_admin');
    expect(parseRole('Driver')).toBeNull();
    expect(parseRole('')).toBeNull();
  });

  it('reads gender', () => {
    expect(parseGender('M')).toBe('male');
    expect(parseGender('Girl')).toBe('female');
    expect(parseGender('other')).toBe('other');
    expect(parseGender('?')).toBeNull();
  });

  it('reads yes/no', () => {
    expect(parseYesNo('Yes')).toBe(true);
    expect(parseYesNo('y')).toBe(true);
    expect(parseYesNo('TRUE')).toBe(true);
    expect(parseYesNo('No')).toBe(false);
    expect(parseYesNo('0')).toBe(false);
    expect(parseYesNo('maybe')).toBeNull();
  });

  it('normalises relations', () => {
    expect(normalizeRelation('mummy')).toBe('Mother');
    expect(normalizeRelation('Papa')).toBe('Father');
    expect(normalizeRelation('Nani')).toBe('Grandmother');
    expect(normalizeRelation('')).toBe('Parent');
    expect(normalizeRelation('foster mother')).toBe('Foster Mother');
  });
});

describe('suggest', () => {
  const cands = [
    { id: 't1', label: 'Priya Nair', forms: ['priya nair'] },
    { id: 't2', label: 'Kavitha Menon', forms: ['kavitha menon'] },
    { id: 't3', label: 'Rahul Verma', forms: ['rahul verma'] },
  ];

  it('suggests close spellings and first-name matches', () => {
    expect(suggest('kavita menon', cands)).toEqual([{ id: 't2', label: 'Kavitha Menon' }]);
    expect(suggest('priya', cands)).toEqual([{ id: 't1', label: 'Priya Nair' }]);
    expect(suggest('verma', cands)).toEqual([{ id: 't3', label: 'Rahul Verma' }]);
  });

  it('suggests nothing for unrelated names', () => {
    expect(suggest('zubin', cands)).toEqual([]);
    expect(suggest('', cands)).toEqual([]);
  });
});
