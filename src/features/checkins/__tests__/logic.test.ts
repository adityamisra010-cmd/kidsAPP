import { answeredCount, buildCheckinInput, CHANGE_NOTE_MAX, EMPTY_ANSWERS, isCheckinComplete, isCheckinInput } from '../logic';

const appt = { id: 'a1', childId: 'c1', startsAt: new Date(2026, 9, 29, 10, 30).toISOString() };

describe('check-in payload', () => {
  it('waits until all four questions are answered', () => {
    const partial = { ...EMPTY_ANSWERS, sleep: 'good' as const, mood: 'happy' as const };
    expect(answeredCount(partial)).toBe(2);
    expect(isCheckinComplete(partial)).toBe(false);
    expect(buildCheckinInput(appt, partial, 'cid')).toBeNull();
  });

  it('counts "No" answers as answered', () => {
    expect(answeredCount({ ...EMPTY_ANSWERS, ateBreakfast: false, changeFlag: false })).toBe(2);
  });

  it('builds the input for the appointment day', () => {
    const input = buildCheckinInput(appt, { sleep: 'poor', ateBreakfast: false, mood: 'upset', changeFlag: true, changeNote: '  Had a cold  ' }, 'cid');
    expect(input).toEqual({
      clientId: 'cid',
      childId: 'c1',
      appointmentId: 'a1',
      date: '2026-10-29',
      sleep: 'poor',
      ateBreakfast: false,
      mood: 'upset',
      changeFlag: true,
      changeNote: 'Had a cold',
    });
    expect(isCheckinInput(input)).toBe(true);
  });

  it('drops a leftover note when there was no change, and caps note length', () => {
    const noChange = buildCheckinInput(appt, { sleep: 'good', ateBreakfast: true, mood: 'happy', changeFlag: false, changeNote: 'typed then changed mind' }, 'cid');
    expect(noChange?.changeNote).toBe('');
    const long = buildCheckinInput(appt, { sleep: 'good', ateBreakfast: true, mood: 'happy', changeFlag: true, changeNote: 'x'.repeat(500) }, 'cid');
    expect(long?.changeNote).toHaveLength(CHANGE_NOTE_MAX);
  });

  it('rejects malformed outbox payloads', () => {
    expect(isCheckinInput(null)).toBe(false);
    expect(isCheckinInput({ clientId: 'x' })).toBe(false);
  });
});
