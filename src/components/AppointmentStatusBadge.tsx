// Owner: W3 (calendar). Shared status chip for appointments: icon + word, never colour alone.
import { CalendarCheck, CalendarClock, CalendarX, CircleCheck, Repeat, UserRoundCheck, UserX, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { AppointmentDisplayStatus } from '@/domain/types';
import { Badge, type Tone } from '@/ui';

/**
 * Calm tones: only a cancellation uses the (muted) danger tint. A substitute is information for
 * parents, not a warning, so it shares the soft info tone with "Rescheduled" (icons differ).
 */
const MAP: Record<AppointmentDisplayStatus, { tone: Tone; icon: LucideIcon }> = {
  confirmed: { tone: 'success', icon: CalendarCheck },
  rescheduled: { tone: 'info', icon: CalendarClock },
  substitute: { tone: 'info', icon: UserRoundCheck },
  cancelled: { tone: 'danger', icon: CalendarX },
  completed: { tone: 'neutral', icon: CircleCheck },
  absent: { tone: 'neutral', icon: UserX },
  makeup: { tone: 'primary', icon: Repeat },
};

export function AppointmentStatusBadge({ status }: { status: AppointmentDisplayStatus }) {
  const { t } = useTranslation();
  const m = MAP[status] ?? MAP.confirmed;
  return <Badge label={t(`common:status.${status}`)} tone={m.tone} icon={m.icon} testID={`status-${status}`} />;
}
