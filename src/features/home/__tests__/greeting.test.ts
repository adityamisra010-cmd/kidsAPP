import { dayPeriod, firstName, pickCheckinPrompts } from '../greeting';
import { makeAppointment } from '../testing';

const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m);

describe('dayPeriod', () => {
  it.each([
    [4, 'morning'],
    [9, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [22, 'evening'],
    [1, 'evening'],
  ] as const)('%i:00 is %s', (h, expected) => {
    expect(dayPeriod(at(h))).toBe(expected);
  });

  it('switches at 11:59 → 12:00', () => {
    expect(dayPeriod(at(11, 59))).toBe('morning');
    expect(dayPeriod(at(12, 0))).toBe('afternoon');
  });
});

describe('firstName', () => {
  it.each([
    ['Priya Sharma', 'Priya'],
    ['Ms. Riya Menon', 'Riya'],
    ['Dr Anil Kumar', 'Anil'],
    ['  Kavya  ', 'Kavya'],
    ['Smt. Lakshmi Iyer', 'Lakshmi'],
    ['Ms.', 'Ms.'],
  ])('%s → %s', (full, expected) => {
    expect(firstName(full)).toBe(expected);
  });
});

const appt = makeAppointment;

describe('pickCheckinPrompts', () => {
  it('keeps one prompt per child (earliest session) with the active child first', () => {
    const list = [
      appt({ id: 'a2', childId: 'aarav', startsAt: '2026-10-29T11:00:00+05:30' }),
      appt({ id: 'm1', childId: 'meera', startsAt: '2026-10-29T09:00:00+05:30' }),
      appt({ id: 'a1', childId: 'aarav', startsAt: '2026-10-29T10:00:00+05:30' }),
    ];
    expect(pickCheckinPrompts(list, 'aarav').map((a) => a.id)).toEqual(['a1', 'm1']);
    expect(pickCheckinPrompts(list, null).map((a) => a.id)).toEqual(['m1', 'a1']);
  });

  it('skips cancelled sessions and ones already checked in', () => {
    const list = [
      appt({ id: 'x', childId: 'aarav', startsAt: '2026-10-29T09:00:00+05:30', status: 'cancelled' }),
      appt({ id: 'y', childId: 'meera', startsAt: '2026-10-29T09:00:00+05:30', hasCheckin: true }),
    ];
    expect(pickCheckinPrompts(list, 'aarav')).toEqual([]);
  });
});
