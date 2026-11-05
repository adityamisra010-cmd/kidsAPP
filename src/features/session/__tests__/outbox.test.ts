import { waitFor } from '@testing-library/react-native';

import { startOutbox, stopOutbox, useOutboxStore } from '@/data/outbox';
import type { Repository } from '@/data/repository';
import type { SessionInput } from '@/domain/types';

import { allRated } from '../__fixtures__/session';
import { enqueueSessionSave, isSessionInput, payloadClientId, registerSessionOutbox, SESSION_SAVE } from '../outbox';

const input: SessionInput = {
  clientId: 'client-1',
  appointmentId: 'appt-1',
  actualMinutes: 45,
  startedLate: false,
  regulationState: 'regulated',
  ratings: allRated(4),
  goalTrials: [],
  incidents: [],
  breaksCount: 0,
  comparedToLast: 'same',
  workedTags: [],
  workedText: '',
  notWorkedTags: [],
  notWorkedText: '',
  notes: { subjective: '', objective: '', assessment: '', planNext: 'Plan', planGoalIds: [], parentSummary: '' },
};

afterEach(() => stopOutbox());

describe('session outbox', () => {
  it('recognises session payloads and their client ids', () => {
    expect(isSessionInput(input)).toBe(true);
    expect(isSessionInput({ clientId: 'x' })).toBe(false);
    expect(payloadClientId(input)).toBe('client-1');
    expect(payloadClientId(null)).toBeUndefined();
  });

  it('syncs a queued log through repo.sessions.save and clears it', async () => {
    const save = jest.fn(async () => ({}));
    const repo = { sessions: { save } } as unknown as Repository; // only the method the handler uses
    registerSessionOutbox();
    await enqueueSessionSave(input, 'Session log · Aarav');
    expect(useOutboxStore.getState().items.some((i) => i.kind === SESSION_SAVE)).toBe(true);
    await startOutbox({ repo: () => repo, demo: true });
    await waitFor(() => expect(useOutboxStore.getState().items).toHaveLength(0));
    expect(save).toHaveBeenCalledWith(input);
  });
});
