/**
 * Test-only fixtures and render helper for children/goals/progress screens. Not imported by app code.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/data/queryClient';
import type {
  AuthUser,
  ChildDetail,
  ChildSummary,
  GoalWithStats,
  ParentProgress,
  ParentSessionSnapshot,
  Role,
  TherapyType,
} from '@/domain/types';
import { initI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ConfirmHost, ToastHost } from '@/ui';

export const ORG = 'org-1';

export const THERAPY_TYPES: TherapyType[] = [
  { id: 'tt-speech', organizationId: ORG, key: 'speech', name: 'Speech Therapy', color: '#C66B4E', icon: 'message-circle', active: true },
  { id: 'tt-ot', organizationId: ORG, key: 'occupational', name: 'Occupational Therapy', color: '#C9A227', icon: 'hand', active: true },
];

export function childDetail(access: ChildDetail['access']): ChildDetail {
  return {
    child: { id: 'c1', organizationId: ORG, fullName: 'Aarav Sharma', preferredName: 'Aarav', dob: '2018-03-10', classGroup: 'Sunflower', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
    profile: {
      childId: 'c1',
      communicationMode: 'limited_verbal',
      commTools: ['pecs', 'gestures'],
      commNotes: 'Uses 2-word phrases',
      reinforcers: ['bubbles', 'music'],
      reinforcersNotes: '',
      triggers: ['loud_sounds'],
      triggersNotes: '',
      calming: ['deep_pressure'],
      calmingNotes: 'Quiet corner with his blue blanket',
      sensoryNotes: 'Seeks movement',
      dos: ['Give a 2-minute warning before transitions'],
      donts: ["Don't touch without telling him first"],
      clinical: access === 'full' ? { diagnosis: ['Autism spectrum disorder'], medicalNotes: '', allergies: 'Peanuts', medications: '' } : undefined,
      updatedAt: '2026-10-01T10:00:00Z',
    },
    guardians: [{ childId: 'c1', userId: 'p1', relation: 'Mother', isPrimary: true, name: 'Priya Sharma', phone: '+919876543210' }],
    therapists: [{ childId: 'c1', userId: 't1', therapyTypeId: 'tt-speech', isLead: true, activeFrom: '2026-01-01', name: 'Ms. Kavya Rao' }],
    access,
  };
}

export const CHILD_SUMMARY: ChildSummary = {
  child: childDetail('full').child,
  therapists: [{ userId: 't1', name: 'Ms. Kavya Rao', therapyTypeId: 'tt-speech', isLead: true }],
  guardians: [{ userId: 'p1', name: 'Priya Sharma', relation: 'Mother' }],
  openAlerts: 0,
};

export const SNAPSHOT: ParentSessionSnapshot = {
  sessionId: 's1',
  date: '2026-10-27',
  therapyTypeName: 'Speech Therapy',
  therapyTypeColor: '#C66B4E',
  therapistName: 'Ms. Kavya Rao',
  isSubstitute: false,
  highlights: [{ key: 'attention', label: 'Focus', icon: 'target', value: 4, change: 'better' }],
  overall: 'better',
  parentSummary: 'Aarav asked for bubbles using two words today.',
  goalsWorkedOn: [],
};

const baseGoal = {
  organizationId: ORG,
  childId: 'c1',
  therapyTypeId: 'tt-speech',
  domain: 'communication' as const,
  baseline: '1 in 5 trials',
  masteryRule: { accuracy: 80, consecutiveSessions: 3 },
  startDate: '2026-08-01',
  createdBy: 't1',
  createdAt: '2026-08-01T00:00:00Z',
  sessionsTracked: 6,
};

export const GOALS: GoalWithStats[] = [
  { ...baseGoal, id: 'g1', staffText: 'Requests items using 2-word phrases in 4/5 trials', parentText: 'Asks for things using two words', status: 'progressing', lastAccuracy: 85, masterySuggested: true },
  { ...baseGoal, id: 'g2', staffText: 'Sustains joint attention for 2 minutes', parentText: 'Plays together for two minutes', status: 'emerging', lastAccuracy: 40, masterySuggested: false },
];

export const PARENT_PROGRESS: ParentProgress = {
  childId: 'c1',
  period: 'month',
  byTherapy: [
    {
      therapyTypeId: 'tt-speech',
      therapyTypeName: 'Speech Therapy',
      therapyTypeColor: '#C66B4E',
      dimensions: [{ key: 'attention', label: 'Focus', icon: 'target', trend: 'up', recent: [2, 3, 3, 4] }],
      sessionsCount: 8,
    },
  ],
  goalsSummary: [{ domain: 'communication', achieved: 1, inProgress: 2 }],
  attendance: { scheduled: 10, attended: 8, late: 1, absent: 1, cancelledBySchool: 1, cancelledByParent: 0 },
  homePracticeCompletion: 72,
};

export function signIn(role: Role, opts: { userId?: string; childId?: string } = {}) {
  const userId = opts.userId ?? (role === 'parent' ? 'p1' : 't1');
  const user: AuthUser = {
    profile: { id: userId, fullName: role === 'parent' ? 'Priya Sharma' : 'Ms. Kavya Rao', preferredLanguage: 'en' },
    memberships: [{ id: 'm1', userId, organizationId: ORG, role, status: 'active' }],
    organizations: [],
    childIds: role === 'parent' ? ['c1'] : [],
  };
  useSession.setState({ user, activeMembershipId: 'm1', activeChildId: opts.childId ?? (role === 'parent' ? 'c1' : null), mode: 'demo' });
}

/**
 * Call in afterEach: unmount first (so no observer re-creates a query), then drop cached queries
 * and mutations with their GC timers, so Jest can exit cleanly.
 */
export async function resetApp() {
  await cleanup();
  await queryClient.cancelQueries();
  // MutationCache.clear() keeps each mutation's 5-minute GC timer alive; destroy them first.
  queryClient.getMutationCache().getAll().forEach((m) => m.destroy());
  queryClient.clear();
}

/** Renders inside the app's providers (theme, query client, safe area, confirm + toast hosts). */
export async function renderWithApp(ui: ReactElement) {
  initI18n('en');
  queryClient.clear();
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          {ui}
          <ConfirmHost />
          <ToastHost />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}
