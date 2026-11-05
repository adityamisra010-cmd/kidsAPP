/**
 * Shared helpers for the cron-style Edge Functions (Deno).
 *
 * These functions run with the service-role key (RLS bypassed), so they only do narrowly scoped
 * work and are callable only by the scheduler: the caller must present CRON_SECRET in the
 * `x-cron-secret` header, or the service-role key as a Bearer token.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const IST = 'Asia/Kolkata';

/** Mirrors the parts of OrgSettings (src/domain/types.ts) the functions need. */
export interface OrgSettingsSubset {
  quietHours: { start: string; end: string };
  videoRetentionDays: number;
}

export const DEFAULT_SETTINGS: OrgSettingsSubset = {
  quietHours: { start: '21:00', end: '08:00' },
  videoRetentionDays: 180,
};

/** Schedule changes are never muted and ignore quiet hours (UNMUTABLE_NOTIFICATION_KINDS). */
export const UNMUTABLE_KINDS: ReadonlySet<string> = new Set([
  'appointment_changed',
  'substitute_assigned',
  'reschedule_response',
]);

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Returns a 403 response unless the request comes from the scheduler. */
export function rejectUnlessCron(req: Request): Response | null {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const okSecret = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
  const okService = !!serviceKey && bearer === serviceKey;
  return okSecret || okService ? null : json({ error: 'forbidden' }, 403);
}

/** "HH:mm" wall-clock time in India for an instant. */
export function istClock(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
}

/** Quiet hours may wrap midnight (21:00 → 08:00). */
export function inQuietHours(at: Date, quiet: { start: string; end: string }): boolean {
  const t = istClock(at);
  if (quiet.start === quiet.end) return false;
  return quiet.start < quiet.end ? t >= quiet.start && t < quiet.end : t >= quiet.start || t < quiet.end;
}

export function mergeSettings(raw: unknown): OrgSettingsSubset {
  const s = (raw ?? {}) as Partial<OrgSettingsSubset>;
  return {
    quietHours: s.quietHours?.start && s.quietHours?.end ? s.quietHours : DEFAULT_SETTINGS.quietHours,
    videoRetentionDays: typeof s.videoRetentionDays === 'number' ? s.videoRetentionDays : DEFAULT_SETTINGS.videoRetentionDays,
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
