/**
 * Offline outbox handler for session logs. Logs are saved on the phone first and synced in order;
 * `repo.sessions.save` is idempotent on `clientId`, so retries never create duplicates.
 *
 * The integrator calls `registerSessionOutbox()` once at app start (so logs queued in an earlier
 * run sync). The logger also calls it on load; registering twice is harmless.
 */
import { enqueue, registerOutboxHandler } from '@/data/outbox';
import { invalidate } from '@/data/queryClient';
import { RepoError } from '@/data/repository';
import type { SessionInput } from '@/domain/types';

export const SESSION_SAVE = 'session.save';

export function isSessionInput(p: unknown): p is SessionInput {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.clientId === 'string' &&
    typeof o.appointmentId === 'string' &&
    typeof o.ratings === 'object' &&
    o.ratings !== null &&
    Array.isArray(o.goalTrials) &&
    typeof o.notes === 'object' &&
    o.notes !== null
  );
}

/** clientId of a queued payload, if it has one. */
export function payloadClientId(p: unknown): string | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const id = (p as { clientId?: unknown }).clientId;
  return typeof id === 'string' ? id : undefined;
}

export function registerSessionOutbox(): void {
  registerOutboxHandler(SESSION_SAVE, async (payload, repo) => {
    if (!isSessionInput(payload)) throw new RepoError('validation', 'Invalid session log payload');
    await repo.sessions.save(payload);
    void invalidate('sessions', 'dashboards', 'appointments', 'progress', 'alerts', 'goals', 'notifications');
  });
}

/** Queue a session log. Returns the outbox item id. */
export function enqueueSessionSave(input: SessionInput, label: string): Promise<string> {
  return enqueue(SESSION_SAVE, input, label);
}
