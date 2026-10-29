import { RepoError } from '@/data/repository';

import { parseDate, parseTime, parseWeekdays } from '../adapter/imports';
import { signedIn } from '../testing';

const code = (c: RepoError['code']) => expect.objectContaining({ name: 'RepoError', code: c });
const row = (rowNumber: number, values: Record<string, string>) => ({ rowNumber, values });

describe('import parsing', () => {
  it('reads Indian date formats, weekdays and times', () => {
    expect(parseDate('05/03/2019')).toBe('2019-03-05');
    expect(parseDate('2019-3-5')).toBe('2019-03-05');
    expect(parseDate('March 5')).toBeUndefined();
    expect(parseWeekdays('Mon/Wed/Fri')).toEqual([1, 3, 5]);
    expect(parseWeekdays('tuesday, thursday')).toEqual([2, 4]);
    expect(parseTime('4:30 PM')).toBe('16:30');
    expect(parseTime('10.30')).toBe('10:30');
    expect(parseTime('25:00')).toBeUndefined();
  });
});

describe('imports.commit', () => {
  it('is idempotent for children (name + DOB)', async () => {
    const repo = await signedIn('school_admin');
    const rows = [
      row(2, { 'Full Name': 'Ritvik Arora', DOB: '12/04/2019', 'Class Group': 'Butterfly (Early Years)', Gender: 'male' }),
      row(3, { full_name: 'Meher Khanna', dob: '2018-09-30' }),
      row(4, { full_name: 'No Birthday' }),
    ];
    const first = await repo.imports.commit('children', rows);
    expect(first).toMatchObject({ kind: 'children', created: 2, updated: 0, skipped: 0 });
    expect(first.errors).toEqual([{ rowNumber: 4, message: expect.stringContaining('date of birth') }]);
    const again = await repo.imports.commit('children', rows.slice(0, 2));
    expect(again).toMatchObject({ created: 0, updated: 0, skipped: 2, errors: [] });
    const changed = await repo.imports.commit('children', [row(2, { full_name: 'ritvik arora', dob: '2019-04-12', class_group: 'Sunflower (Primary 2)' })]);
    expect(changed.updated).toBe(1);
    expect((await repo.children.list({ search: 'Ritvik' }))[0].child.classGroup).toBe('Sunflower (Primary 2)');
    expect((await repo.imports.context()).children.some((c) => c.fullName === 'Meher Khanna')).toBe(true);
  });

  it('is idempotent for staff and parents (phone) and links children', async () => {
    const repo = await signedIn('school_admin');
    const staff = [row(2, { full_name: 'Farah Khan', phone: '98111 22334', email: 'farah@anvaya.demo', role: 'Therapist', title: 'Speech Therapist', therapy_types: 'Speech Therapy; speech' })];
    expect(await repo.imports.commit('staff', staff)).toMatchObject({ created: 1, skipped: 0 });
    expect(await repo.imports.commit('staff', staff)).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    const ctx = await repo.imports.context();
    expect(ctx.therapists.find((t) => t.name === 'Farah Khan')?.phone).toBe('+919811122334');

    const parents = [
      row(2, { parent_name: 'Gaurav Kapoor', phone: '+91 98111 55667', relation: 'Father', child_name: 'Myra Kapoor' }),
      row(3, { name: 'Unknown Child Parent', phone: '9811100000', child_name: 'Nobody Here' }),
      row(4, { name: 'Bad Phone', phone: '12345', child_name: 'Myra Kapoor' }),
    ];
    const first = await repo.imports.commit('parents', parents);
    expect(first).toMatchObject({ created: 1 });
    expect(first.errors.map((e) => e.rowNumber)).toEqual([3, 4]);
    expect(await repo.imports.commit('parents', parents.slice(0, 1))).toMatchObject({ created: 0, skipped: 1 });
    const myra = (await repo.children.list({ search: 'Myra' }))[0];
    expect(myra.guardians.map((g) => g.name)).toContain('Gaurav Kapoor');
  });

  it('is idempotent for schedules (child + therapist + therapy + weekday + time)', async () => {
    const repo = await signedIn('coordinator');
    const before = repo.demo.store.appointments.length;
    const rows = [row(2, { child_name: 'Diya Bhatia', therapist_name: 'Arjun Mehta', therapy_type: 'Special Education', weekdays: 'Sat', start_time: '12:30 PM', duration_minutes: '45', start_date: '02/11/2026', end_date: '28/11/2026' })];
    expect(await repo.imports.commit('schedule', rows)).toMatchObject({ created: 1, skipped: 0, errors: [] });
    expect(repo.demo.store.appointments.length - before).toBe(4);
    expect(await repo.imports.commit('schedule', rows)).toMatchObject({ created: 0, skipped: 1 });
    expect(repo.demo.store.appointments.length - before).toBe(4);
    const bad = await repo.imports.commit('schedule', [row(5, { child_name: 'Diya Bhatia', therapist_name: 'Nobody', therapy_type: 'Speech', weekdays: 'Mon', start_time: '10:00' })]);
    expect(bad.errors).toEqual([{ rowNumber: 5, message: 'Unknown therapist name.' }]);
  });

  it('is limited to school admins and coordinators', async () => {
    const repo = await signedIn('therapist');
    await expect(repo.imports.commit('children', [])).rejects.toEqual(code('forbidden'));
    await expect(repo.imports.context()).rejects.toEqual(code('forbidden'));
  });
});
