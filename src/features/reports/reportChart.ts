/** Tiny inline-SVG line chart for the PDF (no JS, prints crisply, works in the print WebView). */
import { escapeHtml, safeColor } from './html';

export interface ChartOptions {
  color: string;
  gridColor: string;
  labelColor: string;
  width?: number;
  height?: number;
  /** Accessible description, e.g. "Session Score, 8 sessions". */
  label: string;
  /** Formats the first/last x-axis labels. */
  formatDate: (iso: string) => string;
}

/** Scores 0–100 over time. Gridlines at 25/50/75, first and last dates under the axis. */
export function lineChartSvg(points: { date: string; score: number }[], opts: ChartOptions): string {
  const W = opts.width ?? 480;
  const H = opts.height ?? 120;
  const padL = 28;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const color = safeColor(opts.color, '#B85418');
  const y = (v: number) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * ih;
  const x = (i: number) => (points.length <= 1 ? padL + iw / 2 : padL + (i * iw) / (points.length - 1));

  const grid = [0, 25, 50, 75, 100]
    .map(
      (v) =>
        `<line x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${opts.gridColor}" stroke-width="${v === 0 ? 1 : 0.6}"/>` +
        `<text x="${padL - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="${opts.labelColor}">${v}</text>`,
    )
    .join('');

  const coords = points.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`);
  const line = points.length > 1 ? `<polyline points="${coords.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : '';
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="${i === points.length - 1 ? 3.5 : 2.5}" fill="${color}"/>`).join('');

  const first = points[0];
  const last = points[points.length - 1];
  const xLabels = first
    ? `<text x="${padL}" y="${H - 6}" font-size="8" fill="${opts.labelColor}">${escapeHtml(opts.formatDate(first.date))}</text>` +
      (points.length > 1 ? `<text x="${W - padR}" y="${H - 6}" text-anchor="end" font-size="8" fill="${opts.labelColor}">${escapeHtml(opts.formatDate(last.date))}</text>` : '')
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(opts.label)}">${grid}${line}${dots}${xLabels}</svg>`;
}
