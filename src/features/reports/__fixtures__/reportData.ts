import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { ChildReportData, GoalWithStats, SessionSummary } from '@/domain/types';

export function session(p: Partial<SessionSummary> & Pick<SessionSummary, 'date' | 'sessionScore'>): SessionSummary {
  return {
    id: `s-${p.date}-${p.therapyTypeId ?? 'tt1'}`,
    appointmentId: `a-${p.date}`,
    childId: 'c1',
    therapyTypeId: 'tt1',
    therapyTypeName: 'Speech Therapy',
    therapyTypeColor: '#C66B4E',
    therapistName: 'Priya Nair',
    isSubstitute: false,
    trend: 'up',
    ratings: {},
    incidentCount: 0,
    comparedToLast: 'better',
    parentSummary: '',
    ...p,
  };
}

export function goal(p: Partial<GoalWithStats> & Pick<GoalWithStats, 'id'>): GoalWithStats {
  return {
    organizationId: 'org1',
    childId: 'c1',
    therapyTypeId: 'tt1',
    domain: 'communication',
    staffText: 'Requests preferred items using 2-word phrases in 4/5 trials',
    parentText: 'Asks for things using two words',
    baseline: '1/5',
    masteryRule: { accuracy: 80, consecutiveSessions: 3 },
    status: 'progressing',
    startDate: '2026-08-01',
    createdBy: 't1',
    createdAt: '2026-08-01T05:00:00.000Z',
    lastAccuracy: 72.4,
    lastPromptLevel: 4,
    sessionsTracked: 9,
    masterySuggested: false,
    ...p,
  };
}

export function reportData(p: Partial<ChildReportData> = {}): ChildReportData {
  return {
    organization: {
      id: 'org1',
      name: 'Sunrise Child Development Centre',
      shortName: 'Sunrise CDC',
      city: 'Noida',
      address: 'C-24, Sector 62, Noida',
      phone: '+91 120 456 7890',
      email: 'hello@sunrisecdc.example.com',
      status: 'active',
      settings: { ...DEFAULT_ORG_SETTINGS },
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    child: {
      id: 'c1',
      organizationId: 'org1',
      fullName: 'Aarav Sharma',
      preferredName: 'Aaru',
      dob: '2019-03-14',
      classGroup: 'Sunflower',
      status: 'active',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    ageLabel: '7 yrs 7 mo',
    range: { from: '2026-10-01', to: '2026-10-29' },
    audience: 'staff',
    attendance: { scheduled: 12, attended: 10, late: 1, absent: 1, cancelledBySchool: 1, cancelledByParent: 0 },
    byTherapy: [
      {
        therapyTypeName: 'Speech Therapy',
        therapyTypeColor: '#C66B4E',
        sessions: [
          session({ date: '2026-10-14', sessionScore: 66, parentSummary: 'Used two-word requests for bubbles.' }),
          session({ date: '2026-10-02', sessionScore: 58 }),
          session({ date: '2026-10-21', sessionScore: 71.6, parentSummary: '' }),
        ],
        averageScore: 65.2,
        trend: 'up',
      },
      {
        therapyTypeName: 'Occupational Therapy',
        therapyTypeColor: '#C9A227',
        sessions: [session({ date: '2026-10-05', sessionScore: 49, therapyTypeId: 'tt2', therapyTypeName: 'Occupational Therapy', therapyTypeColor: '#C9A227' })],
        averageScore: 49,
        trend: 'down',
      },
    ],
    goals: [goal({ id: 'g1' }), goal({ id: 'g2', therapyTypeId: 'tt2', status: 'emerging', parentText: '', staffText: 'Holds crayon with tripod grasp', lastAccuracy: undefined })],
    wins: [goal({ id: 'g0', status: 'mastered', masteredAt: '2026-10-10T06:00:00.000Z', parentText: 'Says hello to friends', staffText: 'Initiates greetings with peers' })],
    homePracticeCompletion: 64,
    therapistSummary: 'Aarav is settling well.\nHe enjoys bubbles.\n\nNext: two-word requests at home.',
    generatedAt: '2026-10-29T09:00:00.000Z',
    ...p,
  };
}
