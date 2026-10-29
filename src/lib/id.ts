/** RFC 4122 v4 UUID. Uses crypto.randomUUID when the runtime has it. */
export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deterministic UUID-shaped id from a string (FNV-1a based). Used by the seed generator so the
 * Demo dataset and supabase/seed.sql share the same ids.
 */
export function stableId(seed: string): string {
  const hex: string[] = [];
  let h = 0x811c9dc5;
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i) + round * 31;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex.push(h.toString(16).padStart(8, '0'));
  }
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${((parseInt(s[16], 16) & 0x3) | 0x8).toString(16)}${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
