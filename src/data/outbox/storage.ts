import * as SQLite from 'expo-sqlite';

import type { OutboxItem, OutboxStorage } from './storage.types';

/** SQLite-backed outbox so queued writes survive app restarts and phone reboots. */
export function createStorage(): OutboxStorage {
  const db = SQLite.openDatabaseSync('outbox.db');
  db.execSync(
    `create table if not exists outbox (
      id text primary key not null,
      kind text not null,
      payload text not null,
      label text not null,
      created_at text not null,
      attempts integer not null default 0,
      status text not null,
      last_error text
    );`,
  );
  type Row = { id: string; kind: string; payload: string; label: string; created_at: string; attempts: number; status: string; last_error: string | null };
  return {
    all: async () => {
      const rows = await db.getAllAsync<Row>('select * from outbox order by created_at asc');
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        payload: JSON.parse(r.payload) as unknown,
        label: r.label,
        createdAt: r.created_at,
        attempts: r.attempts,
        status: r.status as OutboxItem['status'],
        lastError: r.last_error ?? undefined,
      }));
    },
    put: async (i) => {
      await db.runAsync(
        'insert or replace into outbox (id, kind, payload, label, created_at, attempts, status, last_error) values (?, ?, ?, ?, ?, ?, ?, ?)',
        i.id,
        i.kind,
        JSON.stringify(i.payload),
        i.label,
        i.createdAt,
        i.attempts,
        i.status,
        i.lastError ?? null,
      );
    },
    remove: async (id) => {
      await db.runAsync('delete from outbox where id = ?', id);
    },
  };
}
