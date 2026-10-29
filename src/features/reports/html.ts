/** Small HTML helpers for the PDF builder. */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only #rgb / #rrggbb colours reach the CSS (therapy-type colours come from data). */
export function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback;
}

/** Plain text → paragraphs; blank lines split paragraphs, single newlines become <br>. */
export function paragraphs(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/** Only image sources we trust in the print WebView: https URLs and inline data images. */
export function safeImageSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(src)) return src;
  if (/^https:\/\/[^\s"'<>]+$/i.test(src)) return src;
  return undefined;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
