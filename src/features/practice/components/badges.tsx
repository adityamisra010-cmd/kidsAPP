/**
 * Icon + word vocabulary for outcomes, difficulty and therapist reactions, plus their badges.
 * Couldn't-do is neutral (not red): trying and stopping is information, not failure.
 */
import {
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Feather,
  Gauge,
  Lightbulb,
  MessageCircle,
  Mountain,
  Star,
  ThumbsUp,
  Video,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { HomeLogDifficulty, HomeLogOutcome, ReviewReaction } from '@/domain/types';
import { Badge, type Tone } from '@/ui';

export const OUTCOME_META: Record<HomeLogOutcome, { icon: LucideIcon; tone: Tone }> = {
  done: { icon: CircleCheck, tone: 'success' },
  partly: { icon: CircleDashed, tone: 'info' },
  could_not: { icon: CircleSlash, tone: 'neutral' },
};

export const DIFFICULTY_META: Record<HomeLogDifficulty, { icon: LucideIcon }> = {
  easy: { icon: Feather },
  ok: { icon: Gauge },
  hard: { icon: Mountain },
};

export const REACTION_META: Record<ReviewReaction, { icon: LucideIcon; tone: Tone }> = {
  great_job: { icon: Star, tone: 'success' },
  good_effort: { icon: ThumbsUp, tone: 'primary' },
  try_next_time: { icon: Lightbulb, tone: 'info' },
  lets_discuss: { icon: MessageCircle, tone: 'warning' },
};

export function OutcomeBadge({ outcome }: { outcome: HomeLogOutcome }) {
  const { t } = useTranslation('practice');
  const m = OUTCOME_META[outcome];
  return <Badge label={t(`outcome.${outcome}`)} tone={m.tone} icon={m.icon} />;
}

export function DifficultyBadge({ difficulty }: { difficulty: HomeLogDifficulty }) {
  const { t } = useTranslation('practice');
  return <Badge label={t(`difficultyBadge.${difficulty}`)} tone="neutral" icon={DIFFICULTY_META[difficulty].icon} />;
}

export function ReactionBadge({ reaction }: { reaction: ReviewReaction }) {
  const { t } = useTranslation('practice');
  const m = REACTION_META[reaction];
  return <Badge label={t(`reaction.${reaction}`)} tone={m.tone} icon={m.icon} />;
}

export function VideoBadge() {
  const { t } = useTranslation('practice');
  return <Badge label={t('video.badge')} tone="primary" icon={Video} />;
}
