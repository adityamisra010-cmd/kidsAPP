/** Reschedule request ordering for the coordinator list and the parent's appointment view. */
import type { RescheduleRequest, UUID } from '@/domain/types';

type Req = Pick<RescheduleRequest, 'id' | 'appointmentId' | 'status' | 'createdAt' | 'resolvedAt'>;

/**
 * Pending first (oldest first: whoever has waited longest is answered first), then those waiting
 * on the parent's answer to a counter-proposal, then resolved history (newest first).
 */
export function partitionRequests<T extends Req>(list: T[]): { pending: T[]; countered: T[]; resolved: T[] } {
  const byCreated = (a: T, b: T) => a.createdAt.localeCompare(b.createdAt);
  const byResolvedDesc = (a: T, b: T) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt);
  return {
    pending: list.filter((r) => r.status === 'pending').sort(byCreated),
    countered: list.filter((r) => r.status === 'countered').sort(byCreated),
    resolved: list.filter((r) => r.status === 'approved' || r.status === 'declined').sort(byResolvedDesc),
  };
}

/** The newest request for an appointment (any status), so the parent sees the latest answer. */
export function latestRequestFor<T extends Req>(list: T[], appointmentId: UUID): T | undefined {
  return list
    .filter((r) => r.appointmentId === appointmentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** "Travelling — back on Monday" (stored as plain text in the writer's language). */
export function composeReason(label: string, note: string): string {
  const n = note.trim();
  return n ? `${label} — ${n}` : label;
}
