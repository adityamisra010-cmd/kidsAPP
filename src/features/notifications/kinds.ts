import {
  AlarmClock,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  FileText,
  ListChecks,
  Megaphone,
  MessageCircle,
  Sun,
  ThumbsUp,
  TriangleAlert,
  UserCheck,
  Video,
  type LucideIcon,
} from 'lucide-react-native';

import type { NotificationKind } from '@/domain/types';
import type { Tone } from '@/ui';

/** Icon + muted tone per notification kind (the title always carries the words). */
export const NOTIFICATION_KIND: Record<NotificationKind, { icon: LucideIcon; tone: Tone }> = {
  appointment_reminder: { icon: AlarmClock, tone: 'info' },
  appointment_changed: { icon: CalendarClock, tone: 'warning' },
  substitute_assigned: { icon: UserCheck, tone: 'warning' },
  reschedule_request: { icon: CalendarPlus, tone: 'info' },
  reschedule_response: { icon: CalendarCheck, tone: 'info' },
  session_summary: { icon: FileText, tone: 'primary' },
  home_task_assigned: { icon: ListChecks, tone: 'primary' },
  home_log_submitted: { icon: Video, tone: 'primary' },
  home_log_feedback: { icon: ThumbsUp, tone: 'success' },
  unlogged_session: { icon: ClipboardList, tone: 'warning' },
  child_alert: { icon: TriangleAlert, tone: 'warning' },
  new_message: { icon: MessageCircle, tone: 'primary' },
  announcement: { icon: Megaphone, tone: 'primary' },
  daily_agenda: { icon: Sun, tone: 'info' },
};
