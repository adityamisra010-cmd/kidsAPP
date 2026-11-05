/** Pure helpers for short Do / Don't bullet lists (add, edit, remove, reorder). */

export const MAX_BULLET_LENGTH = 140;
export const MAX_BULLETS = 10;

/** Adds a trimmed bullet; ignores empty text, duplicates (any case) and lists already full. */
export function addBullet(list: string[], text: string): string[] {
  const v = text.trim().slice(0, MAX_BULLET_LENGTH);
  if (!v || list.length >= MAX_BULLETS) return list;
  if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return list;
  return [...list, v];
}

export function updateBullet(list: string[], index: number, text: string): string[] {
  if (index < 0 || index >= list.length) return list;
  const next = [...list];
  next[index] = text.slice(0, MAX_BULLET_LENGTH);
  return next;
}

export function removeBullet(list: string[], index: number): string[] {
  if (index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

/** Moves the item at `from` to `to` (clamped). Returns the same list when nothing moves. */
export function moveBullet(list: string[], from: number, to: number): string[] {
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}
