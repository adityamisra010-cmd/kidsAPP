/**
 * Small seeded PRNG (mulberry32) for the demo dataset. Each entity derives its own stream from a
 * string key, so adding data in one place never reshuffles random choices elsewhere.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** `n` distinct items in a stable random order. */
  sample<T>(items: readonly T[], n: number): T[];
  /** Approximately normal (mean 0, sd 1). */
  normal(): number;
}

function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function rng(seed: string): Rng {
  let a = hash(seed) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const self: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    sample: (items, n) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, Math.max(0, n));
    },
    normal: () => (next() + next() + next() + next() - 2) * 1.732,
  };
  return self;
}

/** Deterministic Indian mobile number (+91 98xxxxxxxx) for a seed key. */
export function demoPhone(key: string): string {
  const r = rng(`phone:${key}`);
  let digits = '';
  for (let i = 0; i < 8; i++) digits += String(r.int(0, 9));
  return `+9198${digits}`;
}
