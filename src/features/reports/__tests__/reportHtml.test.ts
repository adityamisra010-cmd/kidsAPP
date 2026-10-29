import { t as i18nT } from 'i18next';

import { initI18n } from '@/i18n';
import { formatDate } from '@/lib/dates';

import { escapeHtml, paragraphs, safeColor, safeImageSrc } from '../html';
import { lineChartSvg } from '../reportChart';
import { buildReportHtml, type ReportHtmlOptions } from '../reportHtml';
import { attendanceRate, buildReportModel, practiceBand, reportFileName } from '../reportModel';
import { reportData } from '../__fixtures__/reportData';

initI18n('en');

const opts = (p: Partial<ReportHtmlOptions> = {}): ReportHtmlOptions => ({
  t: (k, v) => i18nT(k, v),
  appName: "My Kid's Tracker",
  lang: 'en',
  therapistSummary: 'Aarav is settling well.',
  formatDate,
  ...p,
});

const textOf = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

describe('buildReportModel', () => {
  it('keeps everything for staff', () => {
    const m = buildReportModel(reportData());
    expect(m.showScores).toBe(true);
    expect(m.therapies[0]).toMatchObject({ name: 'Speech Therapy', sessionsCount: 3, averageScore: 65, latestNote: undefined });
    // Points are sorted by date even if the adapter didn't.
    expect(m.therapies[0].points.map((p) => p.date)).toEqual(['2026-10-02', '2026-10-14', '2026-10-21']);
    expect(m.therapies[0].points[2].score).toBe(72);
    expect(m.goals[0]).toMatchObject({ text: expect.stringContaining('2-word phrases'), statusKey: 'goalStatus.progressing', accuracy: 72, promptLevel: 4 });
    expect(m.goals[1]).toMatchObject({ therapyName: 'Occupational Therapy', statusKey: 'goalStatus.emerging', accuracy: undefined });
    expect(m.wins[0]).toMatchObject({ text: 'Initiates greetings with peers', date: '2026-10-10' });
  });

  it('simplifies for parents: no scores, parent wording, status words, latest parent note', () => {
    const m = buildReportModel(reportData({ audience: 'parent' }));
    expect(m.showScores).toBe(false);
    expect(m.therapies.every((t) => t.averageScore === undefined && t.points.length === 0)).toBe(true);
    expect(m.therapies[0].latestNote).toBe('Used two-word requests for bubbles.');
    expect(m.goals[0]).toEqual(expect.objectContaining({ text: 'Asks for things using two words', statusKey: 'parentGoalStatus.getting_there' }));
    expect(m.goals[0].accuracy).toBeUndefined();
    // Falls back to staff wording when no parent text exists.
    expect(m.goals[1].text).toBe('Holds crayon with tripod grasp');
    expect(m.wins[0].text).toBe('Says hello to friends');
  });

  it('shows the average (still no charts) to parents when the school allows numeric scores', () => {
    const data = reportData({ audience: 'parent' });
    data.organization.settings.parentsSeeNumericScore = true;
    const m = buildReportModel(data);
    expect(m.therapies[0].averageScore).toBe(65);
    expect(m.therapies[0].points).toEqual([]);
  });

  it('computes attendance and practice bands', () => {
    expect(attendanceRate({ scheduled: 12, attended: 10, late: 1, absent: 1, cancelledBySchool: 1, cancelledByParent: 0 })).toBe(91);
    expect(attendanceRate({ scheduled: 0, attended: 0, late: 0, absent: 0, cancelledBySchool: 0, cancelledByParent: 0 })).toBeNull();
    expect(practiceBand(80)).toBe('most');
    expect(practiceBand(50)).toBe('half');
    expect(practiceBand(10)).toBe('low');
  });

  it('names the file safely', () => {
    const m = buildReportModel(reportData({ child: { ...reportData().child, fullName: 'Zoë D’Souza / Test' } }));
    expect(reportFileName(m)).toBe('Progress-Report_Zoe-DSouza-Test_2026-10-01_to_2026-10-29_Staff.pdf');
  });
});

describe('buildReportHtml (staff)', () => {
  const html = buildReportHtml(buildReportModel(reportData()), opts());
  const text = textOf(html);

  it('is a complete A4 document', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8"/>');
    expect(html).toContain('size: A4');
    expect(html).toContain('</html>');
  });

  it('has the school header, child details and period', () => {
    expect(text).toContain('Sunrise Child Development Centre');
    expect(text).toContain('C-24, Sector 62, Noida');
    expect(text).toContain('Child Progress Report');
    expect(text).toContain('1 Oct 2026 – 29 Oct 2026');
    expect(text).toContain('Aarav Sharma (Aaru)');
    expect(text).toContain('7 yrs 7 mo');
    expect(text).toContain('14 Mar 2019');
    expect(text).toContain('Staff copy');
    // No logo given → monogram
    expect(html).toContain('class="monogram">SC<');
  });

  it('shows attendance with the rate', () => {
    expect(text).toContain('Sessions planned');
    expect(text).toContain('10 (1 late)');
    expect(text).toContain('Attendance 91%');
  });

  it('draws one chart per therapy with scores and trend words', () => {
    expect(html.match(/<svg /g)).toHaveLength(2);
    expect(html).toContain('<polyline');
    expect(text).toContain('Average Session Score 65/100');
    expect(text).toContain('↑ Improving');
    expect(text).toContain('↓ Declining');
    expect(text).toContain('3 sessions');
    expect(text).toContain('1 session');
  });

  it('has the staff goal table with accuracy and prompt level', () => {
    expect(text).toContain('Last accuracy');
    expect(text).toContain('72%');
    expect(text).toContain('Verbal');
    expect(text).toContain('Progressing');
    expect(html).toContain('<thead>');
  });

  it('lists wins, practice and the summary, and the footer', () => {
    expect(text).toContain('Initiates greetings with peers');
    expect(text).toContain('64% of planned practice done');
    expect(text).toContain('Aarav is settling well.');
    expect(text).toContain("Generated by My Kid's Tracker on 29 Oct 2026");
    expect(text).toContain('share only with the care team');
  });
});

describe('buildReportHtml (parents)', () => {
  const html = buildReportHtml(buildReportModel(reportData({ audience: 'parent' })), opts());
  const text = textOf(html);

  it('never shows scores, charts or staff-only columns', () => {
    expect(html).not.toContain('<svg');
    expect(text).not.toContain('Session Score');
    expect(text).not.toContain('/100');
    expect(text).not.toContain('Last accuracy');
    expect(text).not.toContain('72%');
    expect(text).not.toContain('Requests preferred items');
  });

  it('uses parent wording, gentle trend words and status words', () => {
    expect(text).toContain('Family copy');
    expect(text).toContain('↑ Making progress');
    expect(text).toContain('↓ Finding it harder lately');
    expect(text).toContain('Asks for things using two words');
    expect(text).toContain('Getting there');
    expect(text).toContain('Working on it');
    expect(text).toContain('Says hello to friends');
    expect(text).toContain('Latest note from the therapist');
    expect(text).toContain("Prepared for Aaru's family");
  });
});

describe('safety and edge cases', () => {
  it('escapes everything that comes from data', () => {
    const data = reportData();
    data.child.fullName = '<script>alert(1)</script>';
    data.organization.name = 'A & B "School"';
    data.byTherapy[0].therapyTypeColor = 'red;background:url(x)';
    const html = buildReportHtml(buildReportModel(data), opts({ therapistSummary: '<img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;School&quot;');
    expect(html).not.toContain('url(x)');
  });

  it('turns the summary into paragraphs', () => {
    expect(paragraphs('One.\nTwo.\n\nThree.')).toBe('<p>One.<br/>Two.</p><p>Three.</p>');
    expect(paragraphs('   ')).toBe('');
  });

  it('shows friendly empty states', () => {
    const html = buildReportHtml(
      buildReportModel(reportData({ byTherapy: [], goals: [], wins: [] })),
      opts({ therapistSummary: '' }),
    );
    const text = textOf(html);
    expect(text).toContain('No sessions were logged in this period.');
    expect(text).toContain('No goals have been set yet.');
    expect(text).toContain('Progress takes time');
    expect(text).toContain('No summary was added.');
  });

  it('accepts only https and inline image logos', () => {
    expect(safeImageSrc('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
    expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(safeImageSrc('file:///data/logo.png')).toBeUndefined();
    expect(safeImageSrc('javascript:alert(1)')).toBeUndefined();
    expect(safeImageSrc('https://x.com/a.png" onerror="x')).toBeUndefined();
    const html = buildReportHtml(buildReportModel(reportData()), opts({ logoSrc: 'data:image/png;base64,iVBORw0KGgo=' }));
    expect(html).toContain('<img class="logo" src="data:image/png;base64,iVBORw0KGgo="');
  });

  it('validates colours and escapes text helpers', () => {
    expect(safeColor('#C66B4E', '#000')).toBe('#C66B4E');
    expect(safeColor('#abc', '#000')).toBe('#abc');
    expect(safeColor('blue', '#000')).toBe('#000');
    expect(escapeHtml(`<a href='x'>&</a>`)).toBe('&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('draws a single-point chart without a line', () => {
    const svg = lineChartSvg([{ date: '2026-10-05', score: 49 }], { color: '#C9A227', gridColor: '#eee', labelColor: '#999', label: 'x', formatDate });
    expect(svg).not.toContain('<polyline');
    expect(svg.match(/<circle/g)).toHaveLength(1);
  });

  it('prints Hindi labels when the app is in Hindi (data stays as entered)', () => {
    initI18n('hi');
    const html = buildReportHtml(buildReportModel(reportData({ audience: 'parent' })), opts({ lang: 'hi' }));
    initI18n('en');
    expect(html).toContain('<html lang="hi">');
    expect(html).toContain('बच्चे की प्रगति रिपोर्ट');
    expect(html).toContain('Asks for things using two words');
    expect(html).toContain('Sunrise Child Development Centre');
  });
});
