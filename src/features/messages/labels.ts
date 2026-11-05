import type { TFunction } from 'i18next';

import type { Announcement, ThreadSummary, TherapyType } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { formatDay, formatTime } from '@/lib/dates';

import type { Receipt } from './grouping';
import { membersSummary, threadTimeLabel } from './threads';

/** "Aarav · Care team". Parents see the child's first name; staff see the full name. */
export function threadTitle(t: TFunction, th: Pick<ThreadSummary, 'kind' | 'childName' | 'title'>, short: boolean): string {
  if (th.kind === 'direct' || !th.childName) return th.title;
  const child = short ? th.childName.split(' ')[0] : th.childName;
  return t('messages:threadTitle', { child, kind: t(`messages:kinds.${th.kind}`) });
}

export function membersText(t: TFunction, memberNames: string[], myName: string): string {
  const { names, more } = membersSummary(memberNames, myName);
  if (names.length === 0) return '';
  return more ? t('messages:members.more', { names: names.join(', '), count: more }) : t('messages:members.list', { names: names.join(', ') });
}

export function timeText(t: TFunction, at: string, now: Date = new Date()): string {
  const l = threadTimeLabel(at, now);
  if (l.kind === 'time') return formatTime(l.at);
  if (l.kind === 'yesterday') return t('common:time.yesterday');
  return formatDay(l.at);
}

export function receiptText(t: TFunction, r: Receipt): string {
  if (r.kind === 'sent') return t('messages:thread.sent');
  const [a, b] = r.names;
  if (r.more > 0) return t('messages:thread.seenMany', { a, b, count: r.more });
  if (b) return t('messages:thread.seenTwo', { a, b });
  return t('messages:thread.seenOne', { a });
}

export function audienceText(t: TFunction, a: Pick<Announcement, 'audience' | 'therapyTypeId'>, therapyTypes: TherapyType[] = []): string {
  if (a.audience === 'therapy_type') {
    const tt = therapyTypes.find((x) => x.id === a.therapyTypeId);
    return tt ? t('messages:audience.group', { name: therapyTypeLabel(t, tt) }) : t('messages:audience.therapy_type');
  }
  return t(`messages:audience.${a.audience}`);
}
