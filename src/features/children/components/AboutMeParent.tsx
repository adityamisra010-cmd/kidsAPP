import { router } from 'expo-router';
import { Heart, Leaf, MessageCircle, MessageSquarePlus, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { ChildDetail } from '@/domain/types';
import { vocabLabel } from '@/i18n/labels';
import { Badge, Button, Card, Stack, Text } from '@/ui';

import { ChipCloud, InfoSection, NotesText } from './AboutBlocks';

/**
 * Parent-friendly About Me: four plain questions, read-only. Families suggest changes through the
 * care-team chat so the lead therapist keeps one source of truth. Never shows clinical fields.
 */
export function AboutMeParent({ detail }: { detail: ChildDetail }) {
  const { t } = useTranslation('child');
  const p = detail.profile;
  const name = detail.child.preferredName || detail.child.fullName.split(' ')[0];

  return (
    <Stack gap={3} testID="about-me-parent">
      <Text color="textMuted">{t('parent.aboutIntro', { name })}</Text>

      <InfoSection icon={MessageCircle} title={t('parent.howCommunicates', { name })}>
        <Badge label={vocabLabel(t, 'commModes', p.communicationMode)} tone="primary" icon={MessageCircle} />
        <ChipCloud group="commTools" values={p.commTools} />
        <NotesText text={p.commNotes} />
      </InfoSection>

      <InfoSection
        icon={Heart}
        title={t('parent.motivates', { name })}
        isEmpty={!p.reinforcers.length && !p.reinforcersNotes?.trim()}
        emptyText={t('parent.notAddedYet')}
      >
        <ChipCloud group="reinforcers" values={p.reinforcers} />
        <NotesText text={p.reinforcersNotes} />
      </InfoSection>

      <InfoSection icon={Zap} title={t('parent.upsets', { name })} isEmpty={!p.triggers.length && !p.triggersNotes?.trim()} emptyText={t('parent.notAddedYet')}>
        <ChipCloud group="triggers" values={p.triggers} />
        <NotesText text={p.triggersNotes} />
      </InfoSection>

      <InfoSection icon={Leaf} title={t('parent.calms', { name })} isEmpty={!p.calming.length && !p.calmingNotes?.trim()} emptyText={t('parent.notAddedYet')}>
        <ChipCloud group="calming" values={p.calming} />
        <NotesText text={p.calmingNotes} />
      </InfoSection>

      <Card tone="sunken">
        <Stack gap={3}>
          <Text variant="subheading">{t('parent.suggestTitle')}</Text>
          <Text color="textMuted">{t('parent.suggestBody', { name })}</Text>
          <Button label={t('parent.suggest')} icon={MessageSquarePlus} variant="secondary" onPress={() => router.push('/messages')} />
        </Stack>
      </Card>
    </Stack>
  );
}
