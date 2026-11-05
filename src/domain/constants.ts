/**
 * Seeded defaults. Schools can edit dimension wording/weights and add custom therapy types;
 * these are the starting templates (and the platform "global templates").
 *
 * Chip vocabularies are stored as stable keys. Labels come from i18n (`chips:<group>.<key>`),
 * so they translate. Custom chips typed by staff are stored as raw text and shown as typed.
 */
import type {
  ComparedToLast,
  GoalDomain,
  GoalStatus,
  IncidentType,
  OrgSettings,
  ParentGoalStatus,
  PromptLevel,
  RatingDimension,
  RatingValue,
} from './types';

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  reminderHoursBefore: [24, 1],
  dailyAgendaTime: '08:00',
  quietHours: { start: '21:00', end: '08:00' },
  videoRetentionDays: 180,
  parentsSeeNumericScore: false,
  workingHours: { start: '08:30', end: '17:30', days: [1, 2, 3, 4, 5, 6] },
  holidays: [],
  checkinEnabled: true,
  alertDropThreshold: 15,
  alertIncidentThreshold: 3,
  logLockHours: 24,
};

export interface TherapyTypeTemplate {
  key: string;
  name: string;
  color: string;
  icon: string;
}

/** Muted, distinguishable markers. Used only as dots/chips, never as large fills. */
export const DEFAULT_THERAPY_TYPES: TherapyTypeTemplate[] = [
  { key: 'speech', name: 'Speech Therapy', color: '#C66B4E', icon: 'message-circle' },
  { key: 'occupational', name: 'Occupational Therapy', color: '#C9A227', icon: 'hand' },
  { key: 'behaviour', name: 'Behaviour Therapy (ABA)', color: '#6F9A7A', icon: 'sprout' },
  { key: 'special_ed', name: 'Special Education', color: '#8A6A8F', icon: 'book-open' },
  { key: 'physio', name: 'Physiotherapy', color: '#5B7A99', icon: 'activity' },
  { key: 'audiology', name: 'Audiology Support', color: '#4E8C8A', icon: 'ear' },
];

export const GOAL_DOMAINS: GoalDomain[] = [
  'communication',
  'fine_motor',
  'gross_motor',
  'self_care',
  'social',
  'behaviour',
  'cognition',
  'sensory',
];

export const GOAL_STATUS_FLOW: GoalStatus[] = ['not_started', 'emerging', 'progressing', 'mastered', 'maintenance'];

export function parentGoalStatus(status: GoalStatus): ParentGoalStatus {
  switch (status) {
    case 'not_started':
    case 'emerging':
      return 'working_on_it';
    case 'progressing':
      return 'getting_there';
    case 'mastered':
    case 'maintenance':
      return 'achieved';
    case 'paused':
      return 'paused';
  }
}

export const DEFAULT_MASTERY_RULE = { accuracy: 80, consecutiveSessions: 3 };

export const PROMPT_LEVELS: PromptLevel[] = [1, 2, 3, 4, 5];
/** i18n keys: `session:prompt.<key>` */
export const PROMPT_LEVEL_KEYS: Record<PromptLevel, string> = {
  1: 'full_physical',
  2: 'partial_physical',
  3: 'model_gestural',
  4: 'verbal',
  5: 'independent',
};

export const COMPARED_TO_LAST: ComparedToLast[] = ['much_worse', 'worse', 'same', 'better', 'much_better'];

type DimensionTemplate = Omit<RatingDimension, 'id' | 'organizationId'>;

const anchors = (a1: string, a2: string, a3: string, a4: string, a5: string): Record<RatingValue, string> => ({
  1: a1,
  2: a2,
  3: a3,
  4: a4,
  5: a5,
});

/**
 * The 8 anchored dimensions. Anchors are what make two therapists score the same session the same
 * way. Values 2 and 4 are "between" anchors so every tap has a concrete description.
 */
export const DEFAULT_DIMENSIONS: DimensionTemplate[] = [
  {
    key: 'engagement',
    label: 'Engagement',
    parentLabel: 'Engagement',
    description: 'How much the child took part in the session activities.',
    anchors: anchors(
      'Refused or withdrawn most of the session',
      'Joined briefly, mostly needed coaxing',
      'Participated with frequent redirection',
      'Participated well with occasional redirection',
      'Actively participated and initiated activities',
    ),
    weight: 1,
    enabled: true,
    sortOrder: 1,
    icon: 'sparkles',
  },
  {
    key: 'attention',
    label: 'Attention / Focus',
    parentLabel: 'Focus',
    description: 'How long the child could stay with a task.',
    anchors: anchors(
      'Could not stay on task beyond brief moments',
      'Stayed on task for very short spells with constant support',
      'Sustained attention for short blocks with redirection',
      'Sustained attention for most blocks with light support',
      'Sustained attention through full activity blocks',
    ),
    weight: 1,
    enabled: true,
    sortOrder: 2,
    icon: 'target',
  },
  {
    key: 'regulation',
    label: 'Regulation',
    parentLabel: 'Calmness',
    description: 'How well the child stayed regulated. Energy state is recorded separately.',
    anchors: anchors(
      'Could not be regulated',
      'Regulated only briefly with full support',
      'Regulated with significant support',
      'Regulated with light support',
      'Self-regulated or stayed regulated',
    ),
    weight: 1,
    enabled: true,
    sortOrder: 3,
    icon: 'waves',
  },
  {
    key: 'mood',
    label: 'Mood / Affect',
    parentLabel: 'Mood',
    description: 'Overall emotional state during the session.',
    anchors: anchors(
      'Distressed or crying most of the session',
      'Upset for long stretches',
      'Neutral or variable',
      'Mostly content',
      'Happy and settled',
    ),
    weight: 1,
    enabled: true,
    sortOrder: 4,
    icon: 'smile',
  },
  {
    key: 'cooperation',
    label: 'Cooperation',
    parentLabel: 'Following instructions',
    description: 'How readily the child followed instructions.',
    anchors: anchors(
      'Did not follow instructions',
      'Followed very few instructions, with full support',
      'Followed some instructions with repetition',
      'Followed most instructions with a reminder',
      'Followed instructions readily',
    ),
    weight: 1,
    enabled: true,
    sortOrder: 5,
    icon: 'handshake',
  },
  {
    key: 'independence',
    label: 'Independence (prompt level)',
    parentLabel: 'Doing it independently',
    description: 'The most common prompt level used in the session.',
    anchors: anchors(
      'Full physical prompt',
      'Partial physical prompt',
      'Model or gestural prompt',
      'Verbal prompt',
      'Independent',
    ),
    weight: 1,
    enabled: true,
    sortOrder: 6,
    icon: 'footprints',
  },
  {
    key: 'communication',
    label: 'Communication / Interaction',
    parentLabel: 'Communication',
    description: 'Attempts to communicate in any mode: speech, sign, AAC, gesture.',
    anchors: anchors(
      'No attempts',
      'Rare attempts, only with full prompting',
      'Some attempts when prompted',
      'Regular attempts, some spontaneous',
      'Frequent spontaneous attempts',
    ),
    weight: 1,
    enabled: true,
    sortOrder: 7,
    icon: 'message-circle',
  },
  {
    key: 'transitions',
    label: 'Transitions',
    parentLabel: 'Moving between activities',
    description: 'How the child managed changes between activities.',
    anchors: anchors(
      'Major difficulty or meltdown at transitions',
      'Difficulty at most transitions',
      'Managed with support',
      'Managed with a warning or visual cue',
      'Smooth',
    ),
    weight: 1,
    enabled: true,
    sortOrder: 8,
    icon: 'repeat',
  },
];

/** Dimensions highlighted on parent session cards, in order of preference. */
export const PARENT_HIGHLIGHT_KEYS = ['attention', 'mood', 'engagement', 'communication'];

export const INCIDENT_TYPES: IncidentType[] = ['meltdown', 'aggression', 'self_injury', 'elopement', 'refusal', 'other'];

/** Chip vocabularies (keys). Labels: i18n `chips:<group>.<key>`. */
export const CHIPS = {
  commTools: ['speech', 'sign', 'pecs', 'aac_device', 'gestures', 'pointing', 'visual_schedule'],
  reinforcers: [
    'bubbles',
    'music',
    'songs',
    'favourite_toy',
    'tablet_time',
    'praise',
    'high_five',
    'stickers',
    'swing',
    'snack',
    'cars',
    'blocks',
    'tickles',
    'books',
  ],
  triggers: [
    'loud_sounds',
    'transitions',
    'waiting',
    'textures',
    'crowds',
    'bright_lights',
    'being_touched',
    'change_in_routine',
    'hunger',
    'tiredness',
    'no_answer',
  ],
  calming: [
    'deep_pressure',
    'quiet_corner',
    'counting',
    'favourite_song',
    'weighted_blanket',
    'swinging',
    'breathing',
    'visual_timer',
    'fidget',
    'water_break',
  ],
  antecedents: ['transition', 'demand', 'sensory', 'waiting', 'denied_item', 'peer', 'unknown'],
  worked: [
    'visual_schedule',
    'first_then',
    'timer',
    'movement_break',
    'reinforcer_choice',
    'modelling',
    'short_tasks',
    'quiet_room',
    'parent_present',
    'song_cue',
    'hand_over_hand',
    'choice_of_two',
  ],
  notWorked: [
    'long_tasks',
    'noisy_room',
    'verbal_only_instructions',
    'waiting_turns',
    'new_material',
    'tablet_reinforcer',
    'group_activity',
    'touch_prompts',
  ],
} as const;

export type ChipGroup = keyof typeof CHIPS;

export const HOME_TASK_FREQUENCIES = [1, 2, 3, 4, 5, 6, 7];

export const VIDEO_LIMITS = {
  maxDurationS: 60,
  maxSizeBytes: 25 * 1024 * 1024,
  maxHeight: 720,
};

export const CONSENT_VERSION = '2026-10';
