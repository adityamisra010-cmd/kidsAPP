/**
 * Marker colours a school can give a therapy type. These are DATA (stored on the therapy type and
 * shown only as small dots/stripes), not UI colours, so they live here rather than in theme tokens.
 * The first six match the default therapy types; all are muted and distinguishable.
 */
export const THERAPY_SWATCHES: { key: string; color: string }[] = [
  { key: 'terracotta', color: '#C66B4E' },
  { key: 'mustard', color: '#C9A227' },
  { key: 'sage', color: '#6F9A7A' },
  { key: 'plum', color: '#8A6A8F' },
  { key: 'slate', color: '#5B7A99' },
  { key: 'teal', color: '#4E8C8A' },
  { key: 'rose', color: '#B9788A' },
  { key: 'olive', color: '#7D8452' },
];

export const THERAPY_ICONS = ['message-circle', 'hand', 'sprout', 'book-open', 'activity', 'ear', 'puzzle', 'heart'] as const;

/** First swatch not used yet (so a new type looks different from the others). */
export function nextFreeSwatch(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return (THERAPY_SWATCHES.find((s) => !taken.has(s.color.toLowerCase())) ?? THERAPY_SWATCHES[0]).color;
}

export function isNameTaken(name: string, existing: { id: string; name: string }[], exceptId?: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return existing.some((t) => t.id !== exceptId && t.name.trim().toLowerCase().replace(/\s+/g, ' ') === n);
}
