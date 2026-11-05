// E. Therapist judgement: compared to last session, what worked / what didn't (feeds the brief).
import { PencilLine } from 'lucide-react-native';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { CHIPS, COMPARED_TO_LAST } from '@/domain/constants';
import type { ComparedToLast } from '@/domain/types';
import { chipLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, ChipGroup, Divider, SectionHeader, Stack, Text, TextField } from '@/ui';

import { comparedLabel } from '../../labels';
import type { LoggerDraft } from '../../logic/draft';

type JudgementPatch = Partial<
  Pick<LoggerDraft, 'comparedToLast' | 'workedTags' | 'workedText' | 'notWorkedTags' | 'notWorkedText'>
>;

function DetailsField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const [open, setOpen] = useState(value.length > 0);
  if (open) {
    return (
      <TextField
        label={tr('logger.judgement.details')}
        accessibilityLabel={label}
        placeholder={tr('logger.judgement.detailsPlaceholder')}
        value={value}
        onChangeText={onChange}
        multiline
        minLines={2}
      />
    );
  }
  return (
    <Pressable
      onPress={() => setOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={`${tr('logger.judgement.addDetails')}: ${label}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, alignSelf: 'flex-start' }}
    >
      <PencilLine size={16} color={t.colors.primaryText} />
      <Text variant="label" color="primaryText" weight="semibold">
        {tr('logger.judgement.addDetails')}
      </Text>
    </Pressable>
  );
}

function JudgementSectionBase({
  hasPrevious,
  comparedToLast,
  workedTags,
  workedText,
  notWorkedTags,
  notWorkedText,
  onChange,
}: {
  hasPrevious: boolean;
  comparedToLast?: ComparedToLast;
  workedTags: string[];
  workedText: string;
  notWorkedTags: string[];
  notWorkedText: string;
  onChange: (patch: JudgementPatch) => void;
}) {
  const { t } = useTranslation('session');
  return (
    <Stack gap={2}>
      <SectionHeader title={t('logger.sections.judgement')} />
      <Card padding={4}>
        <Stack gap={3}>
          {hasPrevious ? (
            <>
              <Stack gap={1}>
                <Text variant="subheading">{t('logger.judgement.compared')}</Text>
                <Text variant="caption" color="textSubtle">
                  {t('logger.judgement.comparedHint')}
                </Text>
              </Stack>
              <ChipGroup
                single
                testID="compared-to-last"
                options={COMPARED_TO_LAST.map((v) => ({ value: v, label: comparedLabel(t, v) }))}
                value={comparedToLast ? [comparedToLast] : []}
                onChange={(v) => onChange({ comparedToLast: v[0] as ComparedToLast | undefined })}
              />
              <Divider />
            </>
          ) : null}
          <Text variant="subheading">{t('logger.judgement.worked')}</Text>
          <ChipGroup
            allowCustom
            options={CHIPS.worked.map((v) => ({ value: v, label: chipLabel(t, 'worked', v) }))}
            value={workedTags}
            onChange={(workedTags) => onChange({ workedTags })}
          />
          <DetailsField
            label={t('logger.judgement.worked')}
            value={workedText}
            onChange={(workedText) => onChange({ workedText })}
          />
          <Divider />
          <Text variant="subheading">{t('logger.judgement.notWorked')}</Text>
          <ChipGroup
            allowCustom
            options={CHIPS.notWorked.map((v) => ({ value: v, label: chipLabel(t, 'notWorked', v) }))}
            value={notWorkedTags}
            onChange={(notWorkedTags) => onChange({ notWorkedTags })}
          />
          <DetailsField
            label={t('logger.judgement.notWorked')}
            value={notWorkedText}
            onChange={(notWorkedText) => onChange({ notWorkedText })}
          />
        </Stack>
      </Card>
    </Stack>
  );
}

export const JudgementSection = memo(JudgementSectionBase);
