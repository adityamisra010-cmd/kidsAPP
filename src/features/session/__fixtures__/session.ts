/** Shared test fixtures for the session feature. */
import { DEFAULT_DIMENSIONS, DEFAULT_MASTERY_RULE, DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type {
  AppointmentView,
  AuthUser,
  GoalWithStats,
  HandoverBrief,
  RatingDimension,
  RatingValue,
  SessionLog,
  SessionSummary,
} from '@/domain/types';

export const ORG_ID = 'org-1';
export const THERAPIST_ID = 'user-therapist';
export const CHILD_ID = 'child-1';
export const SPEECH_ID = 'tt-speech';

export const dims: RatingDimension[] = DEFAULT_DIMENSIONS.map((d, i) => ({
  ...d,
  id: `dim-${i}`,
  organizationId: ORG_ID,
}));

export const allRated = (v: RatingValue): Record<string, RatingValue> =>
  Object.fromEntries(dims.map((d) => [d.key, v]));

export function goal(id: string, overrides: Partial<GoalWithStats> = {}): GoalWithStats {
  return {
    id,
    organizationId: ORG_ID,
    childId: CHILD_ID,
    therapyTypeId: SPEECH_ID,
    domain: 'communication',
    staffText: `Staff goal ${id}`,
    parentText: `Asks for help with two words (${id})`,
    baseline: '',
    masteryRule: DEFAULT_MASTERY_RULE,
    status: 'progressing',
    startDate: '2026-09-01',
    createdBy: THERAPIST_ID,
    createdAt: '2026-09-01T09:00:00+05:30',
    sessionsTracked: 3,
    masterySuggested: false,
    ...overrides,
  };
}

export function appointment(overrides: Partial<AppointmentView> = {}): AppointmentView {
  return {
    id: 'appt-1',
    organizationId: ORG_ID,
    childId: CHILD_ID,
    therapistId: THERAPIST_ID,
    therapyTypeId: SPEECH_ID,
    startsAt: '2026-10-29T10:30:00+05:30',
    endsAt: '2026-10-29T11:15:00+05:30',
    status: 'scheduled',
    wasRescheduled: false,
    createdAt: '2026-10-01T09:00:00+05:30',
    childName: 'Aarav Sharma',
    therapistName: 'Ms. Priya Nair',
    therapyTypeName: 'Speech Therapy',
    therapyTypeColor: '#C66B4E',
    therapyTypeIcon: 'message-circle',
    displayStatus: 'confirmed',
    logState: 'in_progress',
    isSubstitute: false,
    briefRequired: false,
    briefAcknowledged: false,
    hasCheckin: false,
    ...overrides,
  };
}

export function summary(
  id: string,
  date: string,
  score: number,
  rating: RatingValue,
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id,
    appointmentId: `appt-${id}`,
    childId: CHILD_ID,
    date,
    therapyTypeId: SPEECH_ID,
    therapyTypeName: 'Speech Therapy',
    therapyTypeColor: '#C66B4E',
    therapistName: 'Ms. Priya Nair',
    isSubstitute: false,
    sessionScore: score,
    trend: 'flat',
    ratings: allRated(rating),
    incidentCount: 0,
    comparedToLast: 'same',
    parentSummary: '',
    ...overrides,
  };
}

export function sessionLog(overrides: Partial<SessionLog> = {}): SessionLog {
  return {
    id: 'session-1',
    organizationId: ORG_ID,
    appointmentId: 'appt-1',
    childId: CHILD_ID,
    therapistId: THERAPIST_ID,
    therapistName: 'Ms. Priya Nair',
    therapyTypeId: SPEECH_ID,
    isSubstitute: false,
    date: '2026-10-29',
    actualMinutes: 45,
    startedLate: false,
    regulationState: 'regulated',
    ratings: allRated(4),
    goalTrials: [{ goalId: 'g1', attempted: 10, successful: 7, promptLevel: 4 }],
    incidents: [],
    breaksCount: 1,
    comparedToLast: 'better',
    workedTags: ['visual_schedule'],
    workedText: '',
    notWorkedTags: [],
    notWorkedText: '',
    notes: {
      subjective: '',
      objective: 'Obs',
      assessment: 'Good',
      planNext: 'Continue g1',
      planGoalIds: ['g1'],
      parentSummary: 'A good day.',
    },
    metrics: { sessionScore: 75, trend: 'flat', dimensions: {}, incidentCount: 0 },
    createdAt: '2026-10-29T11:20:00+05:30',
    updatedAt: '2026-10-29T11:20:00+05:30',
    lockedAt: '2026-10-30T11:20:00+05:30',
    amendmentCount: 0,
    ...overrides,
  };
}

export const therapistUser: AuthUser = {
  profile: { id: THERAPIST_ID, fullName: 'Ms. Priya Nair', preferredLanguage: 'en' },
  memberships: [{ id: 'm-1', userId: THERAPIST_ID, organizationId: ORG_ID, role: 'therapist', status: 'active' }],
  organizations: [
    {
      id: ORG_ID,
      name: 'Sunrise Centre',
      shortName: 'Sunrise',
      city: 'Noida',
      address: '',
      phone: '',
      status: 'active',
      settings: DEFAULT_ORG_SETTINGS,
      createdAt: '2026-01-01T00:00:00+05:30',
    },
  ],
  childIds: [],
};

export function brief(overrides: Partial<HandoverBrief> = {}): HandoverBrief {
  return {
    appointment: appointment({ isSubstitute: true, briefRequired: true }),
    child: {
      id: CHILD_ID,
      organizationId: ORG_ID,
      fullName: 'Aarav Sharma',
      preferredName: 'Aarav',
      dob: '2019-03-02',
      status: 'active',
      createdAt: '2026-01-01',
    },
    ageLabel: '7 yrs 7 mo',
    profile: {
      childId: CHILD_ID,
      communicationMode: 'limited_verbal',
      commTools: ['pecs'],
      commNotes: '',
      reinforcers: ['bubbles'],
      reinforcersNotes: '',
      triggers: ['loud_sounds'],
      triggersNotes: '',
      calming: ['deep_pressure'],
      calmingNotes: '',
      sensoryNotes: '',
      dos: ['Give a 2-minute warning before transitions'],
      donts: ["Don't touch without telling him first"],
      updatedAt: '2026-10-01',
    },
    planForToday: {
      text: 'Work on two-word requests with bubbles.',
      goalIds: ['g1'],
      byName: 'Ms. Priya Nair',
      date: '2026-10-27',
    },
    goals: [goal('g1', { lastAccuracy: 70, lastPromptLevel: 4 })],
    recentSessions: [summary('s1', '2026-10-27', 62, 3), summary('s2', '2026-10-24', 55, 3)],
    whatWorked: ['visual_schedule', 'Bubbles break'],
    whatDidnt: ['noisy_room'],
    openHomeTasks: [],
    activeAlerts: [],
    mustAcknowledge: true,
    acknowledged: false,
    access: 'brief_only',
    ...overrides,
  };
}
