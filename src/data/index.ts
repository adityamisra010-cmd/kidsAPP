/**
 * Repository registry. The app talks to data only via `useRepo()` / `getRepo()`.
 * Demo mode: seeded local data (no backend). Supabase mode: real backend when configured.
 */
import Constants from 'expo-constants';

import type { Repository } from './repository';

let current: Repository | null = null;

export function setRepo(r: Repository | null) {
  current = r;
}

export function getRepo(): Repository {
  if (!current) throw new Error('Repository not initialised');
  return current;
}

export function peekRepo(): Repository | null {
  return current;
}

/** Hook form for components (the repository instance is stable for a signed-in session). */
export function useRepo(): Repository {
  return getRepo();
}

export function supabaseConfig(): { url: string; anonKey: string } | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseAnonKey?: string };
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey || '';
  return url && anonKey ? { url, anonKey } : null;
}

export async function createRepository(mode: 'demo' | 'supabase'): Promise<Repository> {
  if (mode === 'supabase') {
    const cfg = supabaseConfig();
    if (!cfg) throw new Error('Supabase is not configured');
    const { createSupabaseRepository } = await import('./supabase');
    return createSupabaseRepository(cfg);
  }
  const { createDemoRepository } = await import('./demo');
  return createDemoRepository();
}
