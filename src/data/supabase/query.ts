/**
 * Thin, typed helpers around supabase-js query builders: unwrap `{ data, error }`, map errors to
 * RepoError, paginate past PostgREST's max_rows, and split long `in (...)` lists into chunks.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { RepoError } from '../repository';
import { chunk } from './derive-local';
import { toRepoError } from './errors';

export type Sb = SupabaseClient;

/** The shape every supabase-js builder resolves to. */
export interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
  status?: number;
}

/** PostgREST `max_rows` in supabase/config.toml. */
export const PAGE_SIZE = 1000;
/** Ids per `in (...)` filter, keeps request URLs well under proxy limits. */
export const IN_CHUNK = 150;

async function exec(q: PromiseLike<QueryResult>): Promise<QueryResult> {
  let res: QueryResult;
  try {
    res = await q;
  } catch (e) {
    throw toRepoError(e);
  }
  if (res.error) throw toRepoError(res.error, res.status);
  return res;
}

/** Rows of a select (empty array when nothing matched). */
export async function many<T>(q: PromiseLike<QueryResult>): Promise<T[]> {
  const { data } = await exec(q);
  return Array.isArray(data) ? (data as T[]) : data == null ? [] : [data as T];
}

/** Exactly one row, else RepoError('not_found'). */
export async function single<T>(q: PromiseLike<QueryResult>, what = 'row'): Promise<T> {
  const { data } = await exec(q);
  const row = Array.isArray(data) ? data[0] : data;
  if (row == null) throw new RepoError('not_found', `${what} not found`);
  return row as T;
}

/** Zero or one row. */
export async function maybe<T>(q: PromiseLike<QueryResult>): Promise<T | null> {
  const { data } = await exec(q);
  const row = Array.isArray(data) ? data[0] : data;
  return row == null ? null : (row as T);
}

/** Runs a write whose result is not needed. */
export async function done(q: PromiseLike<QueryResult>): Promise<void> {
  await exec(q);
}

/** `count` of a `select(..., { count: 'exact', head: true })`. */
export async function countOf(q: PromiseLike<QueryResult>): Promise<number> {
  const { count } = await exec(q);
  return count ?? 0;
}

/** Calls a Postgres function; `T` is the jsonb/text it returns. */
export async function rpc<T>(sb: Sb, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data } = await exec(sb.rpc(fn, args ?? {}));
  return data as T;
}

/**
 * Reads every page of a query. `make(from, to)` must build a FRESH builder per page (supabase-js
 * builders run once) with a stable `order`. Stops at `max` rows as a safety net.
 */
export async function selectAll<T>(
  make: (from: number, to: number) => PromiseLike<QueryResult>,
  opts: { pageSize?: number; max?: number } = {},
): Promise<T[]> {
  const size = opts.pageSize ?? PAGE_SIZE;
  const max = opts.max ?? 20_000;
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const page = await many<T>(make(from, from + size - 1));
    out.push(...page);
    if (page.length < size) break;
  }
  return out;
}

/** Runs `fetch` for each chunk of ids in parallel and concatenates the rows. */
export async function inChunks<T>(ids: string[], fetch: (ids: string[]) => Promise<T[]>, size = IN_CHUNK): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const parts = await Promise.all(chunk(unique, size).map(fetch));
  return parts.flat();
}

/**
 * Makes free text safe inside a PostgREST `or=(...)` ilike filter: drops characters that are
 * operators or wildcards there. Returns '' when nothing searchable is left.
 */
export function searchTerm(text: string | undefined): string {
  return (text ?? '').replace(/[%_*\\"(),.:]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** `col1.ilike.*term*,col2.ilike.*term*` for `.or(...)`. */
export function ilikeAny(columns: string[], term: string): string {
  return columns.map((c) => `${c}.ilike.*${term}*`).join(',');
}

export function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}
