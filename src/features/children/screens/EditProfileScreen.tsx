import { Hand, Heart, Leaf, Lock, MessageCircle, Save, Zap, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildDetail } from '@/data/hooks';
import { CHIPS, type ChipGroup as ChipVocab } from '@/domain/constants';
import { STAFF_ROLES, type ChildDetail, type CommunicationMode, type UUID } from '@/domain/types';
import { chipLabel, vocabLabel } from '@/i18n/labels';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Button, Card, ChipGroup, EmptyState, ErrorState, errorMessageKey, Row, Screen, SkeletonList, Stack, Text, TextField, toast } from '@/ui';

import { BulletListEditor } from '../components/BulletListEditor';
import { buildProfilePatch, changedFields, draftFromProfile, type ProfileDraft } from '../profileDiff';
import { useUpdateProfile } from '../queries';
import { useUnsavedGuard } from '../useUnsavedGuard';
import { COMM_MODES, COMMON_DIAGNOSES } from '../vocab';

/** About Me editor (`/child/edit-profile/[id]`). Only staff with full access can edit. */
export function EditProfileScreen({ childId }: { childId: UUID }) {
  const { t } = useTranslation('child');
  const q = useChildDetail(childId);
  const role = useRequiredActive().role;
  if (q.isPending) {
    return (
      <Screen back title={t('edit.title')}>
        <SkeletonList rows={4} height={140} />
      </Screen>
    );
  }
  if (q.error || !q.data) {
    return (
      <Screen back title={t('edit.title')}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  if (q.data.access !== 'full' || !STAFF_ROLES.includes(role)) {
    return (
      <Screen back title={t('edit.title')}>
        <EmptyState title={t('workspace.noAccessTitle')} body={t('edit.noAccessBody')} />
      </Screen>
    );
  }
  return <Editor detail={q.data} />;
}

function Editor({ detail }: { detail: ChildDetail }) {
  const { t } = useTranslation('child');
  const original = useMemo(() => draftFromProfile(detail.profile), [detail.profile]);
  const [draft, setDraft] = useState<ProfileDraft>(original);
  const includeClinical = detail.access === 'full';
  const changed = changedFields(original, draft, { includeClinical });
  const save = useUpdateProfile(detail.child.id);
  const guard = useUnsavedGuard(changed.length > 0 && !save.isSuccess);
  const name = detail.child.preferredName || detail.child.fullName.split(' ')[0];

  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setClinical = (patch: Partial<ProfileDraft['clinical']>) => setDraft((d) => ({ ...d, clinical: { ...d.clinical, ...patch } }));
  const chipOptions = (group: ChipVocab) => (CHIPS[group] as readonly string[]).map((v) => ({ value: v, label: chipLabel(t, group, v) }));

  const onSave = async () => {
    const patch = buildProfilePatch(original, draft, { includeClinical });
    if (Object.keys(patch).length === 0) return;
    try {
      await save.mutateAsync(patch);
      toast.success(t('edit.saved'));
      guard.leave();
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  return (
    <Screen
      back
      title={t('edit.title')}
      subtitle={detail.child.fullName}
      testID="edit-profile"
      footer={
        <Stack gap={1}>
          <Button
            label={changed.length ? t('edit.saveCount', { count: changed.length }) : t('edit.noChanges')}
            icon={Save}
            onPress={() => void onSave()}
            disabled={changed.length === 0}
            loading={save.isPending}
            fullWidth
            testID="save-profile"
          />
        </Stack>
      }
    >
      <Text color="textMuted">{t('edit.intro', { name })}</Text>

      <Section icon={MessageCircle} title={t('about.communication')}>
        <ChipGroup
          single
          options={COMM_MODES.map((m) => ({ value: m, label: vocabLabel(t, 'commModes', m) }))}
          value={[draft.communicationMode]}
          onChange={(v) => v[0] && set('communicationMode', v[0] as CommunicationMode)}
        />
        <Text variant="label">{t('edit.commTools')}</Text>
        <ChipGroup options={chipOptions('commTools')} value={draft.commTools} onChange={(v) => set('commTools', v)} allowCustom size="sm" />
        <TextField label={t('edit.notes')} value={draft.commNotes} onChangeText={(v) => set('commNotes', v)} multiline minLines={2} placeholder={t('edit.commNotesPh')} />
      </Section>

      <ChipSection icon={Heart} title={t('about.reinforcers')} group="reinforcers" options={chipOptions('reinforcers')} draft={draft} notesKey="reinforcersNotes" set={set} />
      <ChipSection icon={Zap} title={t('about.triggers')} group="triggers" options={chipOptions('triggers')} draft={draft} notesKey="triggersNotes" set={set} />
      <ChipSection icon={Leaf} title={t('about.calming')} group="calming" options={chipOptions('calming')} draft={draft} notesKey="calmingNotes" set={set} />

      <Section icon={Hand} title={t('about.sensory')}>
        <TextField value={draft.sensoryNotes} onChangeText={(v) => set('sensoryNotes', v)} multiline minLines={3} placeholder={t('edit.sensoryPh')} accessibilityLabel={t('about.sensory')} />
      </Section>

      <Card>
        <Stack gap={5}>
          <BulletListEditor kind="do" label={t('about.do')} helper={t('edit.rulesHelper')} items={draft.dos} onChange={(v) => set('dos', v)} placeholder={t('edit.doPh')} testID="dos-editor" />
          <BulletListEditor kind="dont" label={t('about.dont')} items={draft.donts} onChange={(v) => set('donts', v)} placeholder={t('edit.dontPh')} testID="donts-editor" />
        </Stack>
      </Card>

      {includeClinical ? (
        <Section icon={Lock} title={t('about.clinical')} badge={<Badge label={t('about.staffOnly')} tone="warning" icon={Lock} />} tone="sunken">
          <Text variant="caption" color="textMuted">
            {t('edit.clinicalNote')}
          </Text>
          <Text variant="label">{t('fields.diagnosis')}</Text>
          <ChipGroup
            options={COMMON_DIAGNOSES.map((d) => ({ value: d.value, label: t(`diagnoses.${d.key}`, { defaultValue: d.value }) }))}
            value={draft.clinical.diagnosis}
            onChange={(v) => setClinical({ diagnosis: v })}
            allowCustom
            size="sm"
          />
          <TextField label={t('fields.allergies')} value={draft.clinical.allergies} onChangeText={(v) => setClinical({ allergies: v })} />
          <TextField label={t('fields.medications')} value={draft.clinical.medications} onChangeText={(v) => setClinical({ medications: v })} />
          <TextField label={t('fields.medicalNotes')} value={draft.clinical.medicalNotes} onChangeText={(v) => setClinical({ medicalNotes: v })} multiline minLines={3} />
        </Section>
      ) : null}
    </Screen>
  );
}

function Section({ icon: Icon, title, children, badge, tone }: { icon: LucideIcon; title: string; children: ReactNode; badge?: ReactNode; tone?: 'sunken' }) {
  const theme = useTheme();
  return (
    <Card tone={tone ?? 'default'}>
      <Stack gap={3}>
        <Row gap={2} justify="between">
          <Row gap={2} flex={1}>
            <Icon size={20} color={theme.colors.primaryText} />
            <Text variant="subheading" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Text>
          </Row>
          {badge}
        </Row>
        {children}
      </Stack>
    </Card>
  );
}

type NotesKey = 'reinforcersNotes' | 'triggersNotes' | 'calmingNotes';
type ListKey = 'reinforcers' | 'triggers' | 'calming';

function ChipSection({
  icon,
  title,
  group,
  options,
  draft,
  notesKey,
  set,
}: {
  icon: LucideIcon;
  title: string;
  group: ListKey;
  options: { value: string; label: string }[];
  draft: ProfileDraft;
  notesKey: NotesKey;
  set: <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => void;
}) {
  const { t } = useTranslation('child');
  return (
    <Section icon={icon} title={title}>
      <ChipGroup options={options} value={draft[group]} onChange={(v) => set(group, v)} allowCustom size="sm" testID={`chips-${group}`} />
      <TextField label={t('edit.notes')} value={draft[notesKey]} onChangeText={(v) => set(notesKey, v)} multiline minLines={2} />
    </Section>
  );
}
