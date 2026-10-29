import { parseDate, parseGender, parseStaffRole, parseTime, parseWeekdays, reader, splitList } from '../imports-parse';

describe('import parsing', () => {
  it('reads values by key regardless of case and separators', () => {
    const get = reader({ 'Full Name': ' Aarav Sharma ', date_of_birth: '12/04/2018', Empty: '' });
    expect(get('fullName')).toBe('Aarav Sharma');
    expect(get('dob', 'dateOfBirth')).toBe('12/04/2018');
    expect(get('empty', 'missing')).toBe('');
  });

  it('parses Indian and ISO dates', () => {
    expect(parseDate('2018-04-12')).toBe('2018-04-12');
    expect(parseDate('12/04/2018')).toBe('2018-04-12');
    expect(parseDate('12-4-18')).toBe('2018-04-12');
    expect(parseDate('12 Apr 2018')).toBe('2018-04-12');
    expect(parseDate('31/02/2018')).toBeNull();
    expect(parseDate('43202')).toBe('2018-04-12'); // Excel serial
    expect(parseDate('soon')).toBeNull();
  });

  it('parses times and weekdays', () => {
    expect(parseTime('10:30')).toBe('10:30');
    expect(parseTime('9.15')).toBe('09:15');
    expect(parseTime('4 PM')).toBe('16:00');
    expect(parseTime('12:00 am')).toBe('00:00');
    expect(parseTime('25:00')).toBeNull();
    expect(parseWeekdays('Mon, Wed & Fri')).toEqual([1, 3, 5]);
    expect(parseWeekdays('MO/TH')).toEqual([1, 4]);
    expect(parseWeekdays('0 6')).toEqual([0, 6]);
    expect(parseWeekdays('someday')).toEqual([]);
  });

  it('parses gender, staff role and lists', () => {
    expect(parseGender('Girl')).toBe('female');
    expect(parseGender('M')).toBe('male');
    expect(parseGender('')).toBeUndefined();
    expect(parseStaffRole('Clinical Coordinator')).toBe('coordinator');
    expect(parseStaffRole('Principal')).toBe('school_admin');
    expect(parseStaffRole('Speech therapist')).toBe('therapist');
    expect(splitList('Speech Therapy; Occupational Therapy | ')).toEqual(['Speech Therapy', 'Occupational Therapy']);
  });
});
