import { IMPORT_COLUMNS } from '../columns';
import { autoMap, headerScore, missingRequired, setMapping, unusedHeaders } from '../mapping';

describe('autoMap', () => {
  it('maps the template headers exactly', () => {
    for (const kind of ['children', 'staff', 'parents', 'schedule'] as const) {
      const headers = IMPORT_COLUMNS[kind].map((c) => c.header);
      const mapping = autoMap(kind, headers);
      IMPORT_COLUMNS[kind].forEach((c, i) => expect(mapping[c.key]).toBe(i));
    }
  });

  it('understands the way schools name columns', () => {
    const headers = ['S.No.', 'Name of Child', 'D.O.B', 'Sex', 'Class/Section', "Father's Name"];
    expect(autoMap('children', headers)).toEqual({ fullName: 1, preferredName: null, dob: 2, gender: 3, classGroup: 4 });
  });

  it('maps synonyms like "Child Name", "Student", "DOB", "Phone No."', () => {
    expect(autoMap('children', ['Student', 'Date of Birth']).fullName).toBe(0);
    expect(autoMap('children', ['Child Name', 'DOB']).dob).toBe(1);
    expect(autoMap('staff', ['Name', 'Phone No.', 'Designation', 'Department'])).toMatchObject({ fullName: 0, phone: 1, title: 2, therapyTypes: 3 });
    expect(autoMap('staff', ['Staff Name', 'Mobile']).phone).toBe(1);
  });

  it('prefers exact matches and never uses one file column twice', () => {
    const m = autoMap('parents', ['Name', 'Child Name', 'Mobile', 'DOB']);
    expect(m).toMatchObject({ fullName: 0, childName: 1, phone: 2, childDob: 3 });
    const used = Object.values(m).filter((v) => v != null);
    expect(new Set(used).size).toBe(used.length);
  });

  it('falls back to partial matches ("Mother Mobile No")', () => {
    expect(autoMap('parents', ['Parent Name', 'Mother Mobile No', 'Student Name']).phone).toBe(1);
  });

  it('maps schedule columns including ranges and bracketed hints', () => {
    const m = autoMap('schedule', ['Student Name', 'Therapist Name', 'Therapy', 'Session Days', 'Time Slot', 'Duration (mins)', 'From Date', 'Till', 'Room No']);
    expect(m).toEqual({
      childName: 0,
      childDob: null,
      therapist: 1,
      therapyType: 2,
      weekdays: 3,
      startTime: 4,
      durationMinutes: 5,
      startDate: 6,
      endDate: 7,
      room: 8,
    });
  });

  it('leaves unknown columns unmapped', () => {
    expect(autoMap('children', ['Foo', 'Bar'])).toEqual({ fullName: null, preferredName: null, dob: null, gender: null, classGroup: null });
  });
});

describe('mapping helpers', () => {
  it('scores headers', () => {
    const name = IMPORT_COLUMNS.children[0];
    expect(headerScore(name, 'Full Name')).toBe(3);
    expect(headerScore(name, 'Student Full Name 2026')).toBeGreaterThan(0);
    expect(headerScore(name, '')).toBe(0);
  });

  it('lists missing required columns', () => {
    const m = autoMap('children', ['Name']);
    expect(missingRequired('children', m).map((c) => c.key)).toEqual(['dob']);
  });

  it('lists unused file columns', () => {
    expect(unusedHeaders(['S.No.', 'Name', 'DOB'], { fullName: 1, dob: 2 })).toEqual(['S.No.']);
  });

  it('moves a file column between template columns', () => {
    const next = setMapping({ fullName: 0, preferredName: null }, 'preferredName', 0);
    expect(next).toEqual({ fullName: null, preferredName: 0 });
    expect(setMapping(next, 'preferredName', null)).toEqual({ fullName: null, preferredName: null });
  });
});
