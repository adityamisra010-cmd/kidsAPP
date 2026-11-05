/**
 * Report view model shared by the on-screen preview and the PDF, so both always say the same
 * thing. Audience rules live here: parents get parent wording and status words, never the 0–100
 * Session Score (unless the school turned it on) and never internal notes.
 */
import { parentGoalStatus } from '@/domain/constants';
import type { AttendanceSummary, ChildReportData, GoalStatus, ISODate, ISODateTime, PromptLevel, Trend } from '@/domain/types';

export type Audience = 'staff' | 'parent';
export type StatusTone = 'success' | 'info' | 'neutral' | 'warning' | 'primary';

export interface ReportTherapy {
  name: string;
  color: string;
  sessionsCount: number;
  trend: Trend;
  averageScore?: number;
  /** Session scores oldest → newest (staff only). */
  points: { date: ISODate; score: number }[];
  /** Latest parent-visible note from the therapist (parent copy only). */
  latestNote?: string;
}

export interface ReportGoal {
  id: string;
  text: string;
  therapyName?: string;
  therapyColor?: string;
  /** i18n key inside `reports:` (goalStatus.* or parentGoalStatus.*). */
  statusKey: string;
  statusTone: StatusTone;
  accuracy?: number;
  sessionsTracked?: number;
  promptLevel?: PromptLevel;
  masterySuggested?: boolean;
}

export interface ReportModel {
  audience: Audience;
  showScores: boolean;
  school: { name: string; shortName: string; address: string; phone: string; email?: string; logoUrl?: string };
  child: { name: string; preferredName?: string; ageLabel: string; dob: ISODate; classGroup?: string };
  range: { from: ISODate; to: ISODate };
  attendance: AttendanceSummary & { rate: number | null };
  therapies: ReportTherapy[];
  goals: ReportGoal[];
  wins: { id: string; text: string; therapyName?: string; date?: ISODate }[];
  homePractice: { percent: number; band: 'most' | 'half' | 'low' };
  generatedAt: ISODateTime;
}

const STAFF_TONE: Record<GoalStatus, StatusTone> = {
  not_started: 'neutral',
  emerging: 'info',
  progressing: 'primary',
  mastered: 'success',
  maintenance: 'success',
  paused: 'warning',
};

const PARENT_TONE = { working_on_it: 'info', getting_there: 'primary', achieved: 'success', paused: 'neutral' } as const;

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Share of sessions the child came to. `attended` is read as including late arrivals (late is a
 * subset), and sessions the school cancelled don't count against the family.
 */
export function attendanceRate(a: AttendanceSummary): number | null {
  const due = a.scheduled - a.cancelledBySchool;
  if (due <= 0) return null;
  return clampPct((a.attended / due) * 100);
}

export function practiceBand(percent: number): 'most' | 'half' | 'low' {
  if (percent >= 75) return 'most';
  if (percent >= 40) return 'half';
  return 'low';
}

export function buildReportModel(data: ChildReportData, opts: { audience?: Audience } = {}): ReportModel {
  const audience = opts.audience ?? data.audience;
  const isStaff = audience === 'staff';
  const showScores = isStaff || data.organization.settings.parentsSeeNumericScore;

  // Therapy names/colours by id, learned from the sessions in range.
  const typeById = new Map<string, { name: string; color: string }>();
  for (const th of data.byTherapy) for (const s of th.sessions) typeById.set(s.therapyTypeId, { name: th.therapyTypeName, color: th.therapyTypeColor });

  const therapies: ReportTherapy[] = data.byTherapy.map((th) => {
    const sessions = [...th.sessions].sort((a, b) => a.date.localeCompare(b.date));
    const note = [...sessions].reverse().find((s) => s.parentSummary.trim())?.parentSummary.trim();
    return {
      name: th.therapyTypeName,
      color: th.therapyTypeColor,
      sessionsCount: sessions.length,
      trend: th.trend,
      averageScore: showScores && th.averageScore != null ? Math.round(th.averageScore) : undefined,
      points: isStaff ? sessions.map((s) => ({ date: s.date, score: Math.round(s.sessionScore) })) : [],
      latestNote: isStaff ? undefined : note,
    };
  });

  const goals: ReportGoal[] = data.goals.map((g) => {
    const type = typeById.get(g.therapyTypeId);
    const base = { id: g.id, therapyName: type?.name, therapyColor: type?.color };
    if (isStaff) {
      return {
        ...base,
        text: g.staffText,
        statusKey: `goalStatus.${g.status}`,
        statusTone: STAFF_TONE[g.status],
        accuracy: g.lastAccuracy != null ? Math.round(g.lastAccuracy) : undefined,
        sessionsTracked: g.sessionsTracked,
        promptLevel: g.lastPromptLevel,
        masterySuggested: g.masterySuggested,
      };
    }
    const ps = parentGoalStatus(g.status);
    return { ...base, text: g.parentText.trim() || g.staffText, statusKey: `parentGoalStatus.${ps}`, statusTone: PARENT_TONE[ps] };
  });

  const wins = data.wins.map((w) => ({
    id: w.id,
    text: isStaff ? w.staffText : w.parentText.trim() || w.staffText,
    therapyName: typeById.get(w.therapyTypeId)?.name,
    date: w.masteredAt?.slice(0, 10),
  }));

  const o = data.organization;
  const percent = clampPct(data.homePracticeCompletion);
  return {
    audience,
    showScores,
    school: { name: o.name, shortName: o.shortName, address: o.address, phone: o.phone, email: o.email, logoUrl: o.logoUrl },
    child: {
      name: data.child.fullName,
      preferredName: data.child.preferredName,
      ageLabel: data.ageLabel,
      dob: data.child.dob,
      classGroup: data.child.classGroup,
    },
    range: data.range,
    attendance: { ...data.attendance, rate: attendanceRate(data.attendance) },
    therapies,
    goals,
    wins,
    homePractice: { percent, band: practiceBand(percent) },
    generatedAt: data.generatedAt,
  };
}

/** "Progress-Report_Aarav-Sharma_2026-10-01_to_2026-10-29.pdf" (safe for WhatsApp/email). */
export function reportFileName(model: Pick<ReportModel, 'child' | 'range' | 'audience'>): string {
  const name = model.child.name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const who = model.audience === 'parent' ? 'Parent' : 'Staff';
  return `Progress-Report_${name || 'Child'}_${model.range.from}_to_${model.range.to}_${who}.pdf`;
}
