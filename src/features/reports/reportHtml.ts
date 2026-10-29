/**
 * Child Progress Report → a self-contained A4 HTML document for expo-print. Pure: no React
 * Native imports, so it is unit-tested directly. Colours come from the theme tokens (light
 * palette: paper is always light) so the PDF looks like the app.
 */
import { lightPalette } from '@/theme/tokens';

import { escapeHtml, initials, paragraphs, safeColor, safeImageSrc } from './html';
import { lineChartSvg } from './reportChart';
import type { ReportGoal, ReportModel, ReportTherapy, StatusTone } from './reportModel';

/** Translator with full keys, e.g. t('reports:pdf.title') or t('common:trend.up'). */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface ReportHtmlOptions {
  t: Translate;
  appName: string;
  lang: 'en' | 'hi';
  /** The (possibly edited) therapist summary paragraph. */
  therapistSummary: string;
  /** "24 May 2026" style formatter (follows the app language). */
  formatDate: (iso: string) => string;
  /** data: URI or https URL; local files must be converted to data URIs first. */
  logoSrc?: string;
}

const c = lightPalette;

const TONE: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: c.successSoft, fg: c.success },
  info: { bg: c.infoSoft, fg: c.info },
  neutral: { bg: c.surfaceAlt, fg: c.textMuted },
  warning: { bg: c.warningSoft, fg: c.warning },
  primary: { bg: c.primarySoft, fg: c.primaryText },
};

const ARROW = { up: '↑', flat: '→', down: '↓' } as const;

function css(): string {
  return `
@page { size: A4; margin: 14mm 13mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #FFFFFF; }
body { font-family: Roboto, 'Noto Sans', 'Noto Sans Devanagari', 'Helvetica Neue', Arial, sans-serif; color: ${c.text}; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3, p { margin: 0; }
.masthead { display: flex; align-items: center; gap: 14px; background: ${c.bg}; border-top: 4px solid ${c.primary}; border-radius: 10px; padding: 14px 16px; }
.logo { width: 54px; height: 54px; border-radius: 12px; object-fit: cover; background: ${c.surface}; }
.monogram { width: 54px; height: 54px; border-radius: 27px; background: ${c.primary}; color: ${c.onPrimary}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18pt; }
.school { flex: 1; }
.school h1 { font-size: 15pt; font-weight: 700; }
.muted { color: ${c.textMuted}; }
.small { font-size: 9pt; }
.title { text-align: right; }
.title h2 { font-size: 13pt; color: ${c.primaryText}; font-weight: 700; }
.pill { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 8.5pt; font-weight: 600; }
section { margin-top: 16px; }
section.keep { break-inside: avoid; page-break-inside: avoid; }
h3 { font-size: 11.5pt; font-weight: 700; color: ${c.primaryText}; padding-bottom: 4px; border-bottom: 2px solid ${c.primarySoft}; margin-bottom: 8px; break-after: avoid; page-break-after: avoid; }
.grid { display: flex; flex-wrap: wrap; gap: 8px; }
.kv { flex: 1 1 22%; min-width: 120px; background: ${c.surface}; border: 1px solid ${c.border}; border-radius: 8px; padding: 7px 10px; }
.kv .k { font-size: 8.5pt; color: ${c.textMuted}; }
.kv .v { font-size: 12pt; font-weight: 600; }
.therapy { border: 1px solid ${c.border}; border-left-width: 5px; border-radius: 8px; padding: 9px 12px; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; }
.therapy .row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.therapy .name { font-weight: 700; font-size: 11pt; }
.trend { font-weight: 600; }
.trend.up { color: ${c.success}; } .trend.flat { color: ${c.textMuted}; } .trend.down { color: ${c.warning}; }
.chart { display: block; margin-top: 6px; max-height: 130px; }
.note { margin-top: 6px; font-style: italic; color: ${c.textMuted}; }
table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th { text-align: left; font-size: 8.5pt; font-weight: 600; color: ${c.textMuted}; border-bottom: 1.5px solid ${c.borderStrong}; padding: 5px 6px; }
td { border-bottom: 1px solid ${c.border}; padding: 6px; vertical-align: top; }
tbody tr:nth-child(even) td { background: ${c.surface}; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 4px; margin-right: 5px; vertical-align: middle; }
.num { text-align: right; white-space: nowrap; }
ul.wins { margin: 0; padding-left: 18px; } ul.wins li { margin-bottom: 4px; }
.bar { height: 10px; border-radius: 5px; background: ${c.surfaceAlt}; overflow: hidden; margin: 6px 0 4px; }
.bar > div { height: 10px; background: ${c.accent}; }
.summary { background: ${c.surface}; border: 1px solid ${c.border}; border-radius: 8px; padding: 10px 12px; }
.summary p + p { margin-top: 6px; }
footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid ${c.border}; font-size: 8.5pt; color: ${c.textMuted}; display: flex; justify-content: space-between; gap: 12px; }
`;
}

function pill(label: string, tone: StatusTone): string {
  return `<span class="pill" style="background:${TONE[tone].bg};color:${TONE[tone].fg}">${escapeHtml(label)}</span>`;
}

function trendHtml(t: Translate, therapy: ReportTherapy, audience: ReportModel['audience']): string {
  const word = audience === 'parent' ? t(`reports:parentTrend.${therapy.trend}`) : t(`common:trend.${therapy.trend}`);
  return `<span class="trend ${therapy.trend}">${ARROW[therapy.trend]} ${escapeHtml(word)}</span>`;
}

function therapySection(m: ReportModel, o: ReportHtmlOptions): string {
  const { t } = o;
  const body = m.therapies.length
    ? m.therapies
        .map((th) => {
          const color = safeColor(th.color, c.primary);
          const meta = [t('reports:pdf.sessions', { count: th.sessionsCount })];
          if (th.averageScore != null) meta.push(t('reports:pdf.averageScore', { score: th.averageScore }));
          const chart =
            m.audience === 'staff' && th.points.length > 1
              ? lineChartSvg(th.points, {
                  color,
                  gridColor: c.border,
                  labelColor: c.textSubtle,
                  label: t('reports:pdf.chartLabel', { therapy: th.name, count: th.points.length }),
                  formatDate: o.formatDate,
                })
              : '';
          const note = th.latestNote ? `<p class="note">${escapeHtml(t('reports:pdf.latestNote'))}: “${escapeHtml(th.latestNote)}”</p>` : '';
          return `<div class="therapy" style="border-left-color:${color}">
  <div class="row"><span class="name"><span class="dot" style="background:${color}"></span>${escapeHtml(th.name)}</span>${trendHtml(t, th, m.audience)}</div>
  <p class="small muted">${escapeHtml(meta.join(' · '))}</p>${chart}${note}
</div>`;
        })
        .join('')
    : `<p class="muted">${escapeHtml(t('reports:pdf.noSessions'))}</p>`;
  const explain = m.audience === 'staff' ? `<p class="small muted" style="margin-bottom:6px">${escapeHtml(t('reports:pdf.scoreExplain'))}</p>` : '';
  return `<section><h3>${escapeHtml(t('reports:pdf.therapyTitle'))}</h3>${explain}${body}</section>`;
}

function goalCells(g: ReportGoal, m: ReportModel, t: Translate): string {
  const dot = g.therapyColor ? `<span class="dot" style="background:${safeColor(g.therapyColor, c.primary)}"></span>` : '';
  const goal = `<td>${escapeHtml(g.text)}${g.masterySuggested ? `<br/>${pill(t('reports:pdf.masterySuggested'), 'success')}` : ''}</td>`;
  const status = `<td>${pill(t(`reports:${g.statusKey}`), g.statusTone)}</td>`;
  if (m.audience === 'parent') return `${goal}<td>${dot}${escapeHtml(g.therapyName ?? '')}</td>${status}`;
  return `${goal}<td>${dot}${escapeHtml(g.therapyName ?? '')}</td>${status}<td class="num">${g.accuracy != null ? `${g.accuracy}%` : '—'}</td><td class="num">${g.sessionsTracked ?? 0}</td><td>${g.promptLevel ? escapeHtml(t(`reports:prompt.${g.promptLevel}`)) : '—'}</td>`;
}

function goalsSection(m: ReportModel, t: Translate): string {
  if (!m.goals.length) return `<section class="keep"><h3>${escapeHtml(t('reports:pdf.goalsTitle'))}</h3><p class="muted">${escapeHtml(t('reports:pdf.noGoals'))}</p></section>`;
  const heads =
    m.audience === 'parent'
      ? ['goal', 'therapy', 'status']
      : ['goal', 'therapy', 'status', 'accuracy', 'sessionsTracked', 'promptLevel'];
  const th = heads.map((h) => `<th${['accuracy', 'sessionsTracked'].includes(h) ? ' class="num"' : ''}>${escapeHtml(t(`reports:pdf.col.${h}`))}</th>`).join('');
  const rows = m.goals.map((g) => `<tr>${goalCells(g, m, t)}</tr>`).join('');
  return `<section><h3>${escapeHtml(t('reports:pdf.goalsTitle'))}</h3><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function buildReportHtml(m: ReportModel, o: ReportHtmlOptions): string {
  const { t } = o;
  const logo = safeImageSrc(o.logoSrc);
  const school = m.school;
  const contact = [school.address, school.phone, school.email].filter(Boolean).map(escapeHtml).join(' · ');
  const audienceLabel = m.audience === 'parent' ? t('reports:pdf.audienceParent') : t('reports:pdf.audienceStaff');
  const period = t('reports:pdf.period', { from: o.formatDate(m.range.from), to: o.formatDate(m.range.to) });
  const a = m.attendance;

  const kv = (k: string, v: string | number) => `<div class="kv"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;

  const childKv = [
    kv(t('reports:pdf.childName'), m.child.preferredName && m.child.preferredName !== m.child.name ? `${m.child.name} (${m.child.preferredName})` : m.child.name),
    kv(t('reports:pdf.age'), m.child.ageLabel),
    kv(t('reports:pdf.dob'), o.formatDate(m.child.dob)),
    m.child.classGroup ? kv(t('reports:pdf.classGroup'), m.child.classGroup) : '',
  ].join('');

  const attendanceKv = [
    kv(t('reports:attendance.scheduled'), a.scheduled),
    kv(t('reports:attendance.attended'), a.late ? `${a.attended} (${t('reports:attendance.lateCount', { count: a.late })})` : a.attended),
    kv(t('reports:attendance.absent'), a.absent),
    kv(t('reports:attendance.cancelled'), `${a.cancelledBySchool + a.cancelledByParent}`),
  ].join('');
  const attendanceNote =
    a.rate != null
      ? `<p class="small muted" style="margin-top:6px">${escapeHtml(t('reports:attendance.rate', { rate: a.rate }))} · ${escapeHtml(
          t('reports:attendance.cancelledSplit', { school: a.cancelledBySchool, family: a.cancelledByParent }),
        )}</p>`
      : '';

  const wins = m.wins.length
    ? `<ul class="wins">${m.wins
        .map((w) => `<li><strong>${escapeHtml(w.text)}</strong>${w.therapyName || w.date ? ` <span class="small muted">${escapeHtml([w.therapyName, w.date ? o.formatDate(w.date) : ''].filter(Boolean).join(' · '))}</span>` : ''}</li>`)
        .join('')}</ul>`
    : `<p class="muted">${escapeHtml(t('reports:pdf.noWins'))}</p>`;

  const hp = m.homePractice;
  const summaryHtml = paragraphs(o.therapistSummary) || `<p class="muted">${escapeHtml(t('reports:pdf.noSummary'))}</p>`;
  const generated = t('reports:pdf.generated', { app: o.appName, date: o.formatDate(m.generatedAt) });
  const footNote = m.audience === 'parent' ? t('reports:pdf.parentNote', { name: m.child.preferredName || m.child.name.split(' ')[0] }) : t('reports:pdf.staffNote');

  return `<!DOCTYPE html>
<html lang="${o.lang}">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(`${t('reports:pdf.title')} – ${m.child.name}`)}</title>
<style>${css()}</style></head>
<body>
<header class="masthead">
  ${logo ? `<img class="logo" src="${logo}" alt="${escapeHtml(school.name)}"/>` : `<div class="monogram">${escapeHtml(initials(school.shortName || school.name))}</div>`}
  <div class="school"><h1>${escapeHtml(school.name)}</h1>${contact ? `<p class="small muted">${contact}</p>` : ''}</div>
  <div class="title"><h2>${escapeHtml(t('reports:pdf.title'))}</h2><p class="small muted">${escapeHtml(period)}</p>${pill(audienceLabel, m.audience === 'parent' ? 'info' : 'primary')}</div>
</header>
<section class="keep"><h3>${escapeHtml(t('reports:pdf.childTitle'))}</h3><div class="grid">${childKv}</div></section>
<section class="keep"><h3>${escapeHtml(t('reports:pdf.attendanceTitle'))}</h3><div class="grid">${attendanceKv}</div>${attendanceNote}</section>
${therapySection(m, o)}
${goalsSection(m, t)}
<section class="keep"><h3>${escapeHtml(t('reports:pdf.winsTitle'))}</h3>${wins}</section>
<section class="keep"><h3>${escapeHtml(t('reports:pdf.practiceTitle'))}</h3>
  <div class="bar"><div style="width:${hp.percent}%"></div></div>
  <p><strong>${escapeHtml(t('reports:practice.percent', { percent: hp.percent }))}</strong> · ${escapeHtml(t(`reports:practice.${hp.band}`))}</p>
</section>
<section class="keep"><h3>${escapeHtml(t('reports:pdf.summaryTitle'))}</h3><div class="summary">${summaryHtml}</div></section>
<footer><span>${escapeHtml(generated)}</span><span>${escapeHtml(footNote)}</span></footer>
</body>
</html>`;
}
