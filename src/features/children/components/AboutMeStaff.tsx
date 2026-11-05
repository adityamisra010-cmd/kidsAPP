import { router } from 'expo-router';
import { Hand, Heart, History, Leaf, ListChecks, Lock, MessageCircle, Pencil, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChildDetail } from '@/domain/types';
import { vocabLabel } from '@/i18n/labels';
import { Badge, Button, Card, Row, Stack, Text } from '@/ui';

import { hasClinical, isProfileEmpty } from '../profileDiff';
import { ChipCloud, InfoSection, NotesText, RuleList } from './AboutBlocks';
import { ProfileHistorySheet } from './ProfileHistorySheet';

/** Staff "About Me": everything a therapist needs in 30 seconds. Clinical only for full access. */
export function AboutMeStaff({ detail, canEdit }: { detail: ChildDetail; canEdit: boolean }) {
  const { t } = useTranslation('child');
  const [historyOpen, setHistoryOpen] = useState(false);
  const p = detail.profile;
  const name = detail.child.preferredName || detail.child.fullName.split(' ')[0];
  const showClinical = detail.access === 'full' && hasClinical(p.clinical);

  return (
    <Stack gap={3} testID="about-me-staff">
      {canEdit ? (
        <Row gap={2} wrap>
          <Button label={t('about.edit')} icon={Pencil} size="sm" variant="secondary" onPress={() => router.push(`/child/edit-profile/${detail.child.id}`)} />
          <Button label={t('about.history')} icon={History} size="sm" variant="outline" onPress={() => setHistoryOpen(true)} />
        </Row>
      ) : null}

      {isProfileEmpty(p) ? (
        <Card tone="info">
          <Text color="info">{t('about.emptyStaff', { name })}</Text>
        </Card>
      ) : null}

      <InfoSection icon={MessageCircle} title={t('about.communication')}>
        <Badge label={vocabLabel(t, 'commModes', p.communicationMode)} tone="primary" icon={MessageCircle} />
        <ChipCloud group="commTools" values={p.commTools} />
        <NotesText text={p.commNotes} />
      </InfoSection>

      <InfoSection icon={ListChecks} title={t('about.dosDonts')} isEmpty={p.dos.length + p.donts.length === 0} emptyText={t('about.noneYet')}>
        {p.dos.length ? (
          <Stack gap={2}>
            <Text variant="overline" color="textMuted">
              {t('about.do')}
            </Text>
            <RuleList items={p.dos} kind="do" />
          </Stack>
        ) : null}
        {p.donts.length ? (
          <Stack gap={2}>
            <Text variant="overline" color="textMuted">
              {t('about.dont')}
            </Text>
            <RuleList items={p.donts} kind="dont" />
          </Stack>
        ) : null}
      </InfoSection>

      <InfoSection icon={Heart} title={t('about.reinforcers')} isEmpty={!p.reinforcers.length && !p.reinforcersNotes?.trim()} emptyText={t('about.noneYet')}>
        <ChipCloud group="reinforcers" values={p.reinforcers} />
        <NotesText text={p.reinforcersNotes} />
      </InfoSection>

      <InfoSection icon={Zap} title={t('about.triggers')} isEmpty={!p.triggers.length && !p.triggersNotes?.trim()} emptyText={t('about.noneYet')}>
        <ChipCloud group="triggers" values={p.triggers} />
        <NotesText text={p.triggersNotes} />
      </InfoSection>

      <InfoSection icon={Leaf} title={t('about.calming')} isEmpty={!p.calming.length && !p.calmingNotes?.trim()} emptyText={t('about.noneYet')}>
        <ChipCloud group="calming" values={p.calming} />
        <NotesText text={p.calmingNotes} />
      </InfoSection>

      <InfoSection icon={Hand} title={t('about.sensory')} isEmpty={!p.sensoryNotes?.trim()} emptyText={t('about.noneYet')}>
        <NotesText text={p.sensoryNotes} />
      </InfoSection>

      {showClinical && p.clinical ? (
        <InfoSection
          icon={Lock}
          title={t('about.clinical')}
          tone="sunken"
          badge={<Badge label={t('about.staffOnly')} tone="warning" icon={Lock} testID="staff-only" />}
          testID="clinical-section"
        >
          {p.clinical.diagnosis.length ? <ClinicalRow label={t('fields.diagnosis')} value={p.clinical.diagnosis.join(', ')} /> : null}
          {p.clinical.allergies?.trim() ? <ClinicalRow label={t('fields.allergies')} value={p.clinical.allergies} /> : null}
          {p.clinical.medications?.trim() ? <ClinicalRow label={t('fields.medications')} value={p.clinical.medications} /> : null}
          {p.clinical.medicalNotes?.trim() ? <ClinicalRow label={t('fields.medicalNotes')} value={p.clinical.medicalNotes} /> : null}
        </InfoSection>
      ) : null}

      <ProfileHistorySheet childId={detail.child.id} visible={historyOpen} onClose={() => setHistoryOpen(false)} />
    </Stack>
  );
}

function ClinicalRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={1}>
      <Text variant="label" color="textMuted">
        {label}
      </Text>
      <Text>{value}</Text>
    </Stack>
  );
}
