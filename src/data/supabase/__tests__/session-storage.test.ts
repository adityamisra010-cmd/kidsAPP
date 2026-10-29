import { createSessionStorage, SECURE_CHUNK_SIZE, type KeyValueStore } from '../session-storage';

function memory(fail = false): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  const guard = () => {
    if (fail) throw new Error('keystore unavailable');
  };
  return {
    map,
    getItem: async (k) => (guard(), map.get(k) ?? null),
    setItem: async (k, v) => {
      guard();
      map.set(k, v);
    },
    removeItem: async (k) => {
      guard();
      map.delete(k);
    },
  };
}

describe('createSessionStorage', () => {
  it('keeps small values in the secure store', async () => {
    const secure = memory();
    const fallback = memory();
    const s = createSessionStorage(secure, fallback);
    await s.setItem('sb-auth', '{"a":1}');
    expect(secure.map.get('sb-auth')).toBe('{"a":1}');
    expect(fallback.map.size).toBe(0);
    expect(await s.getItem('sb-auth')).toBe('{"a":1}');
  });

  it('splits large sessions into secure chunks and reassembles them', async () => {
    const secure = memory();
    const s = createSessionStorage(secure, memory());
    const big = 'x'.repeat(SECURE_CHUNK_SIZE * 2 + 10);
    await s.setItem('sb-auth', big);
    expect(secure.map.get('sb-auth')).toBe('chunks:3');
    expect([...secure.map.values()].every((v) => v.length <= SECURE_CHUNK_SIZE)).toBe(true);
    expect(await s.getItem('sb-auth')).toBe(big);

    // Shrinking removes the old chunks.
    await s.setItem('sb-auth', 'small');
    expect([...secure.map.keys()]).toEqual(['sb-auth']);
    await s.removeItem('sb-auth');
    expect(secure.map.size).toBe(0);
  });

  it('treats a missing chunk as signed out', async () => {
    const secure = memory();
    const s = createSessionStorage(secure, memory());
    await s.setItem('k', 'y'.repeat(SECURE_CHUNK_SIZE + 1));
    secure.map.delete('k.1');
    expect(await s.getItem('k')).toBeNull();
  });

  it('falls back to AsyncStorage when the secure store fails', async () => {
    const fallback = memory();
    const s = createSessionStorage(memory(true), fallback);
    await s.setItem('k', 'v');
    expect(fallback.map.get('k')).toBe('v');
    expect(await s.getItem('k')).toBe('v');
    await s.removeItem('k');
    expect(fallback.map.size).toBe(0);
  });

  it('uses the fallback only when there is no secure store (web)', async () => {
    const fallback = memory();
    const s = createSessionStorage(null, fallback);
    await s.setItem('k', 'v');
    expect(fallback.map.get('k')).toBe('v');
  });
});
