/** Turns validator output into plain-language text for the Check step. */
import type { TFunction } from 'i18next';

import type { ImportKind } from '@/domain/types';
import { formatDate } from '@/lib/dates';
import { formatClock } from '@/ui';

import { formatPhone } from './normalize';
import type { RowIssue, ValidatedRow } from './validate';

export function columnLabel(t: TFunction, kind: ImportKind, key: string): string {
  return t(`import:columns.${kind}.${key}.label`, { defaultValue: key });
}

export function issueText(t: TFunction, kind: ImportKind, issue: RowIssue): string {
  const p: Record<string, string | number> = { ...(issue.params ?? {}) };
  if (typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) p.date = formatDate(p.date);
  if (typeof p.time === 'string' && /^\d{2}:\d{2}$/.test(p.time)) p.time = formatClock(p.time);
  if (typeof p.role === 'string') p.role = t(`import:roles.${p.role}`, { defaultValue: p.role });
  const column = issue.column ? columnLabel(t, kind, issue.column) : '';
  const main = t(`import:issues.${issue.code}`, { ...p, column, defaultValue: t('import:issues.unknown') });
  const suggestions = typeof p.suggestions === 'string' && p.suggestions ? ` ${t('import:issues.suggestion', { names: p.suggestions })}` : '';
  return main + suggestions;
}

function daysLabel(t: TFunction, csv: string | undefined): string | undefined {
  if (!csv) return undefined;
  return csv
    .split(',')
    .map((d) => t(`import:days.${d}`))
    .join(', ');
}

/** Main line for a row (the person or child it is about). */
export function rowTitle(kind: ImportKind, row: ValidatedRow): string {
  const v = { ...row.raw, ...row.values };
  const title = kind === 'schedule' ? v.childName : v.fullName;
  return title || '—';
}

/** Second line: the details that tell rows apart. */
export function rowSubtitle(t: TFunction, kind: ImportKind, row: ValidatedRow): string {
  const v = row.values;
  const r = row.raw;
  const parts: (string | undefined)[] = [];
  switch (kind) {
    case 'children':
      parts.push(v.dob ? t('import:line.born', { date: formatDate(v.dob) }) : r.dob, v.classGroup);
      break;
    case 'staff':
      parts.push(v.role ? t(`import:roles.${v.role}`) : r.role, v.phone ? formatPhone(v.phone) : r.phone, v.therapyTypes ?? r.therapyTypes);
      break;
    case 'parents':
      parts.push(
        r.childName ? t('import:line.relationOf', { relation: v.relation ?? r.relation, child: r.childName }) : undefined,
        v.phone ? formatPhone(v.phone) : r.phone,
      );
      break;
    case 'schedule':
      parts.push(
        r.therapyType || r.therapist ? t('import:line.with', { therapy: r.therapyType, therapist: r.therapist }) : undefined,
        daysLabel(t, v.weekdays) ?? r.weekdays,
        v.startTime ? formatClock(v.startTime) : r.startTime,
      );
      break;
  }
  return parts.filter(Boolean).join(' · ');
}
