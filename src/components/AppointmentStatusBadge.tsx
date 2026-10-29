// Owner: W3 (calendar). Shared status chip for appointments.
import { CalendarCheck, CalendarClock, CalendarX, Repeat, UserCheck, UserX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { AppointmentDisplayStatus } from '@/domain/types';
import { Badge, type Tone } from '@/ui';

const MAP: Record<AppointmentDisplayStatus, { tone: Tone; icon: typeof CalendarCheck }> = {
  confirmed: { tone: 'success', icon: CalendarCheck },
  rescheduled: { tone: 'info', icon: CalendarClock },
  substitute: { tone: 'warning', icon: UserCheck },
  cancelled: { tone: 'danger', icon: CalendarX },
  completed: { tone: 'neutral', icon: CalendarCheck },
  absent: { tone: 'neutral', icon: UserX },
  makeup: { tone: 'primary', icon: Repeat },
};

export function AppointmentStatusBadge({ status }: { status: AppointmentDisplayStatus }) {
  const { t } = useTranslation();
  const m = MAP[status];
  return <Badge label={t(`common:status.${status}`)} tone={m.tone} icon={m.icon} />;
}
