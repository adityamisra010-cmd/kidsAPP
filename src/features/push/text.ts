/** Notification wording for planned reminders (`settings:push.*`). */
import type { TFunction } from 'i18next';

import { formatDay, formatTime, sameDay } from '@/lib/dates';

import type { PlannedReminder } from './plan';

function dayWord(t: TFunction, when: Date, fireAt: Date): string {
  if (sameDay(when, fireAt)) return t('settings:push.today');
  const tomorrow = new Date(fireAt);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(when, tomorrow)) return t('settings:push.tomorrow');
  return t('settings:push.onDay', { day: formatDay(when) });
}

export function reminderText(t: TFunction, r: PlannedReminder): { title: string; body: string } {
  switch (r.type) {
    case 'session':
      return {
        title: t('settings:push.session.title', { child: r.childName, when: dayWord(t, r.startsAt, r.fireAt) }),
        body: t('settings:push.session.body', { therapy: r.therapyTypeName, time: formatTime(r.startsAt), therapist: r.therapistName }),
      };
    case 'brief':
      return {
        title: t('settings:push.brief.title', { child: r.childName }),
        body: t(r.isSubstitute ? 'settings:push.brief.bodyCover' : 'settings:push.brief.bodyNew', {
          therapy: r.therapyTypeName,
          time: formatTime(r.startsAt),
          when: dayWord(t, r.startsAt, r.fireAt),
        }),
      };
    case 'agenda':
      return {
        title: t('settings:push.agenda.title', { count: r.count }),
        body: t('settings:push.agenda.body', { time: formatTime(r.firstAt), child: r.firstChildName }),
      };
  }
}

/** Fire time + wording: when either changes the reminder is replaced. */
export function reminderSignature(r: PlannedReminder, text: { title: string; body: string }): string {
  return `${r.fireAt.getTime()}|${r.route}|${text.title}|${text.body}`;
}
