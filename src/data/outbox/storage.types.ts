export type OutboxStatus = 'pending' | 'failed';

export interface OutboxItem {
  id: string;
  kind: string;
  /** JSON-serialisable payload passed to the handler. */
  payload: unknown;
  /** Short human label shown in the sync sheet, e.g. "Session log · Aarav". */
  label: string;
  createdAt: string;
  attempts: number;
  status: OutboxStatus;
  lastError?: string;
}

export interface OutboxStorage {
  all(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
}
