/** "Today  Thu, 29 Oct" style day heading for grouped lists. */
import { useTranslation } from 'react-i18next';

import type { ISODate } from '@/domain/types';
import { formatDay } from '@/lib/dates';
import { Row, Text } from '@/ui';

import { dayHeading } from '../lib/grouping';

export function DayHeading({ day, now = new Date() }: { day: ISODate; now?: Date }) {
  const { t } = useTranslation('calendar');
  const heading = dayHeading(day, now, { today: t('day.today'), tomorrow: t('day.tomorrow'), yesterday: t('day.yesterday') });
  const full = formatDay(day);
  return (
    <Row gap={2} align="baseline" accessibilityRole="header" accessibilityLabel={heading === full ? full : `${heading}, ${full}`} style={{ marginTop: 4 }}>
      <Text variant="subheading">{heading}</Text>
      {heading !== full ? (
        <Text variant="caption" color="textMuted">
          {full}
        </Text>
      ) : null}
    </Row>
  );
}
