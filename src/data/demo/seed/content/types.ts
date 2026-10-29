/** Shapes of the hand-written demo content (one SchoolSeed per centre). */
import type { ChildProfile, ClinicalInfo, DemoPersonaKey, GoalStatus, Role } from '@/domain/types';

export type TherapyKey = 'speech' | 'occupational' | 'behaviour' | 'special_ed' | 'physio' | 'audiology';

export interface StaffSeed {
  key: string;
  fullName: string;
  role: Exclude<Role, 'parent' | 'platform_admin'>;
  title: string;
  /** Therapy types this person may deliver (therapists only). */
  qualifications?: TherapyKey[];
  phone?: string;
  email: string;
  persona?: DemoPersonaKey;
  gender: 'female' | 'male';
}

export interface ParentSeed {
  key: string;
  fullName: string;
  phone?: string;
  persona?: DemoPersonaKey;
  language?: 'en' | 'hi';
  /** Withdrew video-upload consent after first agreeing. */
  withdrewVideoConsent?: boolean;
  /** Never completed the consent screen (no consent rows). */
  noConsent?: boolean;
}

export interface TherapySeed {
  type: TherapyKey;
  therapist: string;
  /** 0=Sun..6=Sat */
  days: number[];
  time: string;
  lead?: boolean;
  room?: string;
}

/**
 * Goal scenario drives the generated trial accuracies:
 * emerging 25→50 · progressing 45→75 · suggest (mastery met, not confirmed) · mastered (win) ·
 * maintenance (mastered earlier, still probed) · not_started (no trials yet).
 */
export type GoalScenario = Exclude<GoalStatus, 'paused'> | 'suggest';

export interface GoalSeed {
  bank: string;
  type: TherapyKey;
  scenario: GoalScenario;
  baseline: string;
}

export interface ChildSeed {
  key: string;
  fullName: string;
  preferredName: string;
  gender: 'male' | 'female';
  /** Age in whole months at "now" (keeps "8 yrs 4 mo" stable whatever the date). */
  ageMonths: number;
  classGroup: string;
  guardians: { parent: string; relation: string; primary?: boolean }[];
  profile: Omit<ChildProfile, 'childId' | 'updatedAt' | 'updatedBy' | 'clinical'>;
  clinical: ClinicalInfo;
  therapies: TherapySeed[];
  goals: GoalSeed[];
  /** Average rating level (1–5) at the start of the 8 weeks and gain per week. */
  level: number;
  gainPerWeek: number;
  /** Per-dimension offsets, e.g. { communication: -0.8 } for a non-speaking child. */
  dimBias?: Record<string, number>;
  /** Chance of a behaviour incident in a session. */
  incidentRate?: number;
  worked: string[];
  notWorked: string[];
  scenario?: 'decline' | 'incident_spike' | 'speech_improving';
}

export interface SchoolSeed {
  key: 'anvaya' | 'sahaj';
  name: string;
  shortName: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  email: string;
  emailDomain: string;
  /** Holiday table region (Bengaluru adds Kannada Rajyotsava). */
  region: 'north' | 'south';
  parentsSeeNumericScore: boolean;
  rooms: string[];
  staff: StaffSeed[];
  parents: ParentSeed[];
  children: ChildSeed[];
}
