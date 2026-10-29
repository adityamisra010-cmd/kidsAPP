/**
 * Goal status presentation: staff statuses, the simplified parent statuses (via the domain's
 * `parentGoalStatus`), icon + tone for each (status is never colour alone), and ordering/grouping.
 */
import {
  Award,
  CircleDashed,
  CirclePause,
  Repeat,
  Sprout,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native';

import { GOAL_STATUS_FLOW, parentGoalStatus } from '@/domain/constants';
import type { GoalStatus, ParentGoalStatus, TherapyType, UUID } from '@/domain/types';
import type { Tone } from '@/ui';

export interface StatusMeta {
  tone: Tone;
  icon: LucideIcon;
}

export const STAFF_STATUS_META: Record<GoalStatus, StatusMeta> = {
  not_started: { tone: 'neutral', icon: CircleDashed },
  emerging: { tone: 'info', icon: Sprout },
  progressing: { tone: 'primary', icon: TrendingUp },
  mastered: { tone: 'success', icon: Award },
  maintenance: { tone: 'success', icon: Repeat },
  paused: { tone: 'neutral', icon: CirclePause },
};

export const PARENT_STATUS_META: Record<ParentGoalStatus, StatusMeta> = {
  working_on_it: { tone: 'info', icon: Sprout },
  getting_there: { tone: 'primary', icon: TrendingUp },
  achieved: { tone: 'success', icon: Award },
  paused: { tone: 'neutral', icon: CirclePause },
};

/** The status changer: the normal flow, then Paused. */
export const STATUS_OPTIONS: GoalStatus[] = [...GOAL_STATUS_FLOW, 'paused'];
/** A new goal starts in one of these. */
export const INITIAL_STATUS_OPTIONS: GoalStatus[] = ['not_started', 'emerging', 'progressing'];

/** i18n key + icon/tone for what a parent sees for a staff status. */
export function parentStatusView(status: GoalStatus): { status: ParentGoalStatus; labelKey: string } & StatusMeta {
  const p = parentGoalStatus(status);
  return { status: p, labelKey: `goals:parentStatus.${p}`, ...PARENT_STATUS_META[p] };
}

export function staffStatusView(status: GoalStatus): { labelKey: string } & StatusMeta {
  return { labelKey: `goals:status.${status}`, ...STAFF_STATUS_META[status] };
}

export function isAchieved(status: GoalStatus): boolean {
  return status === 'mastered' || status === 'maintenance';
}

/** Goals still being actively taught. */
export function isActiveGoal(status: GoalStatus): boolean {
  return status === 'not_started' || status === 'emerging' || status === 'progressing';
}

const PARENT_ORDER: Record<ParentGoalStatus, number> = { getting_there: 0, working_on_it: 1, paused: 2, achieved: 3 };

/** Parent list: closest to success first, achieved last. Stable within a status. */
export function sortForParent<T extends { status: GoalStatus }>(goals: T[]): T[] {
  return goals
    .map((g, i) => ({ g, i }))
    .sort((a, b) => PARENT_ORDER[parentGoalStatus(a.g.status)] - PARENT_ORDER[parentGoalStatus(b.g.status)] || a.i - b.i)
    .map((x) => x.g);
}

const STAFF_ORDER: Record<GoalStatus, number> = {
  progressing: 0,
  emerging: 1,
  not_started: 2,
  paused: 3,
  maintenance: 4,
  mastered: 5,
};

/** Staff list: goals waiting for a mastery confirmation first, then active, paused, achieved. */
export function sortForStaff<T extends { status: GoalStatus; masterySuggested?: boolean }>(goals: T[]): T[] {
  return goals
    .map((g, i) => ({ g, i }))
    .sort(
      (a, b) =>
        Number(!!b.g.masterySuggested && isActiveGoal(b.g.status)) - Number(!!a.g.masterySuggested && isActiveGoal(a.g.status)) ||
        STAFF_ORDER[a.g.status] - STAFF_ORDER[b.g.status] ||
        a.i - b.i,
    )
    .map((x) => x.g);
}

export interface TherapyGroup<T> {
  therapyTypeId: UUID;
  therapyType?: TherapyType;
  goals: T[];
}

/** Groups goals by therapy type in the school's therapy-type order (unknown types last). */
export function groupByTherapy<T extends { therapyTypeId: UUID }>(goals: T[], types: TherapyType[]): TherapyGroup<T>[] {
  const map = new Map<UUID, T[]>();
  for (const g of goals) map.set(g.therapyTypeId, [...(map.get(g.therapyTypeId) ?? []), g]);
  const order = (id: UUID) => {
    const i = types.findIndex((t) => t.id === id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...map.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([therapyTypeId, list]) => ({ therapyTypeId, therapyType: types.find((t) => t.id === therapyTypeId), goals: list }));
}
