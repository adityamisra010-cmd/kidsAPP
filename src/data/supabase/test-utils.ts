/**
 * Test double for supabase-js (used by src/data/supabase/__tests__ only; never imported by app
 * code). Records every query (table, operation, filters, modifiers) and answers through a
 * responder, so tests can assert the query shape and that lists are batched, not N+1.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

export interface RecordedQuery {
  table: string;
  op: Op;
  columns?: string;
  values?: unknown;
  options?: Record<string, unknown>;
  filters: [string, ...unknown[]][];
  modifiers: [string, ...unknown[]][];
}

export interface FakeResult {
  data?: unknown;
  error?: unknown;
  count?: number;
  status?: number;
}

export type Responder = (q: RecordedQuery) => FakeResult | undefined;

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count: number | null; status: number }> {
  constructor(
    readonly q: RecordedQuery,
    private readonly respond: Responder,
  ) {}

  private f(name: string, ...args: unknown[]): this {
    this.q.filters.push([name, ...args]);
    return this;
  }

  private m(name: string, ...args: unknown[]): this {
    this.q.modifiers.push([name, ...args]);
    return this;
  }

  select(columns = '*', options?: Record<string, unknown>): this {
    if (this.q.op === 'select') {
      this.q.columns = columns;
      if (options) this.q.options = { ...this.q.options, ...options };
    } else this.m('select', columns);
    return this;
  }

  insert(values: unknown, options?: Record<string, unknown>): this {
    Object.assign(this.q, { op: 'insert', values, options });
    return this;
  }

  update(values: unknown): this {
    Object.assign(this.q, { op: 'update', values });
    return this;
  }

  upsert(values: unknown, options?: Record<string, unknown>): this {
    Object.assign(this.q, { op: 'upsert', values, options });
    return this;
  }

  delete(): this {
    this.q.op = 'delete';
    return this;
  }

  eq = (c: string, v: unknown) => this.f('eq', c, v);
  neq = (c: string, v: unknown) => this.f('neq', c, v);
  gt = (c: string, v: unknown) => this.f('gt', c, v);
  gte = (c: string, v: unknown) => this.f('gte', c, v);
  lt = (c: string, v: unknown) => this.f('lt', c, v);
  lte = (c: string, v: unknown) => this.f('lte', c, v);
  in = (c: string, v: unknown[]) => this.f('in', c, v);
  is = (c: string, v: unknown) => this.f('is', c, v);
  not = (c: string, op: string, v: unknown) => this.f('not', c, op, v);
  or = (v: string) => this.f('or', v);
  contains = (c: string, v: unknown) => this.f('contains', c, v);
  ilike = (c: string, v: unknown) => this.f('ilike', c, v);
  order = (c: string, o?: unknown) => this.m('order', c, o);
  limit = (n: number) => this.m('limit', n);
  range = (a: number, b: number) => this.m('range', a, b);
  single = () => this.m('single');
  maybeSingle = () => this.m('maybeSingle');

  then<A = { data: unknown; error: unknown; count: number | null; status: number }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count: number | null; status: number }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    const r = this.respond(this.q) ?? {};
    const value = {
      data: r.data === undefined ? (this.q.op === 'select' ? [] : null) : r.data,
      error: r.error ?? null,
      count: r.count ?? null,
      status: r.status ?? (r.error ? 400 : 200),
    };
    return Promise.resolve(value).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabase {
  client: SupabaseClient;
  queries: RecordedQuery[];
  rpcs: { fn: string; args: Record<string, unknown> }[];
  storage: { bucket: string; method: string; args: unknown[] }[];
  auth: { method: string; args: unknown[] }[];
  /** Queries against one table (any operation). */
  on(table: string): RecordedQuery[];
}

export interface FakeOptions {
  respond?: Responder;
  rpc?: (fn: string, args: Record<string, unknown>) => FakeResult | undefined;
  storage?: (bucket: string, method: string, args: unknown[]) => FakeResult | undefined;
  auth?: (method: string, args: unknown[]) => FakeResult | undefined;
}

export function createFakeSupabase(opts: FakeOptions = {}): FakeSupabase {
  const queries: RecordedQuery[] = [];
  const rpcs: FakeSupabase['rpcs'] = [];
  const storage: FakeSupabase['storage'] = [];
  const authCalls: FakeSupabase['auth'] = [];
  const respond: Responder = (q) => opts.respond?.(q);

  const client = {
    from(table: string) {
      const q: RecordedQuery = { table, op: 'select', filters: [], modifiers: [] };
      queries.push(q);
      return new FakeQuery(q, respond);
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      rpcs.push({ fn, args });
      const r = opts.rpc?.(fn, args) ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: null, status: r.status ?? (r.error ? 400 : 200) });
    },
    storage: {
      from(bucket: string) {
        const call = (method: string) => async (...args: unknown[]) => {
          storage.push({ bucket, method, args });
          const r = opts.storage?.(bucket, method, args) ?? {};
          return { data: r.data ?? null, error: r.error ?? null };
        };
        return {
          upload: call('upload'),
          remove: call('remove'),
          createSignedUrl: call('createSignedUrl'),
          createSignedUrls: call('createSignedUrls'),
        };
      },
    },
    auth: new Proxy(
      {},
      {
        get(_t, method: string) {
          return async (...args: unknown[]) => {
            authCalls.push({ method, args });
            const r = opts.auth?.(method, args) ?? {};
            return { data: r.data ?? {}, error: r.error ?? null };
          };
        },
      },
    ),
  };

  return {
    client: client as unknown as SupabaseClient,
    queries,
    rpcs,
    storage,
    auth: authCalls,
    on: (table) => queries.filter((q) => q.table === table),
  };
}

/** Filter value recorded for `name` on `column` (first match). */
export function filterValue(q: RecordedQuery, name: string, column: string): unknown {
  return q.filters.find((f) => f[0] === name && f[1] === column)?.[2];
}
