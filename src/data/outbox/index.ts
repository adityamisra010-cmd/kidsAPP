/**
 * Offline outbox. Writes that must never be lost (session logs, parent home-practice logs,
 * check-ins, video uploads) are saved on the phone first, then synced in order when online.
 *
 *   registerOutboxHandler('session.save', async (payload, repo) => { await repo.sessions.save(payload as SessionInput) });
 *   await enqueue('session.save', input, 'Session log · Aarav');
 *
 * Handlers must be idempotent (payloads carry a clientId). Permanent errors (validation,
 * forbidden, locked, consent) mark the item failed so the user can see and fix it; transient
 * errors retry with backoff.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';

import { uuid } from '@/lib/id';

import { RepoError, type Repository } from '../repository';
import { createStorage } from './storage';
import type { OutboxItem, OutboxStorage } from './storage.types';

export type { OutboxItem } from './storage.types';

export type OutboxHandler = (payload: unknown, repo: Repository) => Promise<void>;

interface HandlerEntry {
  run: OutboxHandler;
  /** Return true when this item should wait for Wi-Fi (e.g. video + "Wi-Fi only" setting). */
  needsWifi?: (payload: unknown) => boolean;
  /** Called after a successful sync (e.g. invalidate queries). */
  onSynced?: (payload: unknown) => void;
}

const handlers = new Map<string, HandlerEntry>();

export function registerOutboxHandler(kind: string, run: OutboxHandler, opts?: Omit<HandlerEntry, 'run'>) {
  handlers.set(kind, { run, ...opts });
}

const PERMANENT: RepoError['code'][] = ['validation', 'forbidden', 'locked', 'consent_required', 'not_found', 'conflict'];
const MAX_ATTEMPTS = 8;

interface OutboxState {
  items: OutboxItem[];
  syncing: boolean;
  online: boolean;
  onWifi: boolean;
  lastSyncedAt?: string;
}

export const useOutboxStore = create<OutboxState>(() => ({ items: [], syncing: false, online: true, onWifi: true }));

let storage: OutboxStorage | null = null;
let getRepo: (() => Repository | null) | null = null;
let alwaysOnline = false;
let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribeNet: (() => void) | null = null;

async function refreshItems() {
  if (!storage) return;
  useOutboxStore.setState({ items: await storage.all() });
}

function applyNet(s: NetInfoState) {
  useOutboxStore.setState({
    online: alwaysOnline || (!!s.isConnected && s.isInternetReachable !== false),
    onWifi: s.type === 'wifi' || s.type === 'ethernet',
  });
}

/**
 * Starts the outbox. `demo: true` treats the device as always online (the demo backend is local),
 * so pitches work on flaky venue Wi-Fi.
 */
export async function startOutbox(opts: { repo: () => Repository | null; demo: boolean }) {
  getRepo = opts.repo;
  alwaysOnline = opts.demo;
  if (!storage) storage = createStorage();
  await refreshItems();
  unsubscribeNet?.();
  unsubscribeNet = NetInfo.addEventListener((s) => {
    const wasOnline = useOutboxStore.getState().online;
    applyNet(s);
    if (!wasOnline && useOutboxStore.getState().online) void processOutbox();
  });
  NetInfo.fetch()
    .then(applyNet)
    .catch(() => undefined);
  if (timer) clearInterval(timer);
  timer = setInterval(() => void processOutbox(), 60_000);
  void processOutbox();
}

export function stopOutbox() {
  unsubscribeNet?.();
  unsubscribeNet = null;
  if (timer) clearInterval(timer);
  timer = null;
}

export async function enqueue(kind: string, payload: unknown, label: string): Promise<string> {
  if (!storage) storage = createStorage();
  const item: OutboxItem = { id: uuid(), kind, payload, label, createdAt: new Date().toISOString(), attempts: 0, status: 'pending' };
  await storage.put(item);
  await refreshItems();
  void processOutbox();
  return item.id;
}

/** Retry everything that failed (user tapped "Try again"). */
export async function retryFailed() {
  if (!storage) return;
  for (const i of await storage.all()) {
    if (i.status === 'failed') await storage.put({ ...i, status: 'pending', attempts: 0, lastError: undefined });
  }
  await refreshItems();
  void processOutbox();
}

/** Drop a failed item the user chose to discard. */
export async function discard(id: string) {
  await storage?.remove(id);
  await refreshItems();
}

function backoffMs(attempts: number) {
  return Math.min(60_000, 1000 * 2 ** attempts);
}

const nextTry = new Map<string, number>();

export async function processOutbox(): Promise<void> {
  if (running || !storage || !getRepo) return;
  const repo = getRepo();
  if (!repo) return;
  running = true;
  useOutboxStore.setState({ syncing: true });
  try {
    for (const item of await storage.all()) {
      const { online, onWifi } = useOutboxStore.getState();
      if (!online) break;
      if (item.status === 'failed') continue;
      if ((nextTry.get(item.id) ?? 0) > Date.now()) continue;
      const h = handlers.get(item.kind);
      if (!h) continue; // handler registers when its feature module loads
      if (h.needsWifi?.(item.payload) && !onWifi && !alwaysOnline) continue;
      try {
        await h.run(item.payload, repo);
        await storage.remove(item.id);
        nextTry.delete(item.id);
        h.onSynced?.(item.payload);
        useOutboxStore.setState({ lastSyncedAt: new Date().toISOString() });
      } catch (e) {
        const code = e instanceof RepoError ? e.code : 'unknown';
        const attempts = item.attempts + 1;
        const permanent = PERMANENT.includes(code) || attempts >= MAX_ATTEMPTS;
        await storage.put({ ...item, attempts, status: permanent ? 'failed' : 'pending', lastError: code });
        if (!permanent) nextTry.set(item.id, Date.now() + backoffMs(attempts));
        if (code === 'offline') break;
      }
    }
  } finally {
    running = false;
    await refreshItems();
    useOutboxStore.setState({ syncing: false });
  }
}

/** UI hook: counts and state for the sync badge. */
export function useOutbox() {
  const items = useOutboxStore((s) => s.items);
  const syncing = useOutboxStore((s) => s.syncing);
  const online = useOutboxStore((s) => s.online);
  const pending = items.filter((i) => i.status === 'pending');
  const failed = items.filter((i) => i.status === 'failed');
  return { items, pending, failed, syncing, online };
}

/** True when an item with this clientId is still waiting (for "Saved on phone" labels). */
export function isQueued(clientId: string): boolean {
  return useOutboxStore
    .getState()
    .items.some((i) => (i.payload as { clientId?: string } | null)?.clientId === clientId);
}
