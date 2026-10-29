/**
 * Auth session storage for supabase-js.
 *
 * Login tokens belong in the device's secure storage (PRIVACY_NOTES.md). expo-secure-store values
 * should stay under ~2 KB, and a Supabase session (JWT + refresh token + user) is usually larger,
 * so values over the limit are split into numbered SecureStore chunks behind a small header
 * (`chunks:<n>`). AsyncStorage is the fallback only when the secure store is unavailable (web) or
 * fails on a device; it is also read once so sessions written by older builds still restore.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Characters per SecureStore entry (ASCII JSON, so characters ≈ bytes; limit is 2048). */
export const SECURE_CHUNK_SIZE = 1800;
const HEADER = 'chunks:';

function chunkKey(key: string, i: number): string {
  return `${key}.${i}`;
}

function chunkCount(head: string | null): number {
  if (!head || !head.startsWith(HEADER)) return 0;
  const n = Number(head.slice(HEADER.length));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function createSessionStorage(secure: KeyValueStore | null, fallback: KeyValueStore): KeyValueStore {
  if (!secure) return fallback;

  async function removeSecure(key: string): Promise<void> {
    const n = chunkCount(await secure!.getItem(key));
    await Promise.all(Array.from({ length: n }, (_, i) => secure!.removeItem(chunkKey(key, i))));
    await secure!.removeItem(key);
  }

  return {
    async getItem(key) {
      try {
        const head = await secure.getItem(key);
        if (head == null) return await fallback.getItem(key);
        const n = chunkCount(head);
        if (n === 0) return head;
        const parts = await Promise.all(Array.from({ length: n }, (_, i) => secure.getItem(chunkKey(key, i))));
        // A missing chunk means an interrupted write: treat as signed out rather than corrupt JSON.
        return parts.some((p) => p == null) ? null : parts.join('');
      } catch {
        return fallback.getItem(key);
      }
    },

    async setItem(key, value) {
      try {
        await removeSecure(key);
        if (value.length <= SECURE_CHUNK_SIZE) {
          await secure.setItem(key, value);
        } else {
          const parts: string[] = [];
          for (let i = 0; i < value.length; i += SECURE_CHUNK_SIZE) parts.push(value.slice(i, i + SECURE_CHUNK_SIZE));
          for (let i = 0; i < parts.length; i++) await secure.setItem(chunkKey(key, i), parts[i]);
          await secure.setItem(key, `${HEADER}${parts.length}`);
        }
        await fallback.removeItem(key);
      } catch {
        await fallback.setItem(key, value);
      }
    },

    async removeItem(key) {
      try {
        await removeSecure(key);
      } catch {
        // fall through: still clear the fallback copy
      }
      await fallback.removeItem(key);
    },
  };
}
