import { router } from 'expo-router';
import { Baby, HeartHandshake, Stethoscope, UserPlus } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useMembers, useTherapyTypes } from '@/data/hooks';
import { ADMIN_ROLES } from '@/domain/types';
import { useCreateChild } from '@/features/children/queries';
import { useUnsavedGuard } from '@/features/children/useUnsavedGuard';
import { toISODate } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ChipGroup, DateField, EmptyState, errorMessageKey, Row, Screen, Stack, Text, TextField, toast } from '@/ui';

import { GuardianPicker } from '../components/GuardianPicker';
import { TherapistAssignment } from '../components/TherapistAssignment';
import { RELATION_VALUE, validateNewChild, type NewChildDraft, type NewChildErrors } from '../people';
import { normaliseIndianPhone } from '../phone';

const EMPTY: NewChildDraft = { fullName: '', preferredName: '', dob: null, gender: null, classGroup: '', therapists: {}, guardians: [], newParent: null };

/** Add a child (`/child/new`): basics, therapists per therapy type, family. Admin/coordinator only. */
export function NewChildScreen() {
  const theme = useTheme();
  const { t } = useTranslation('admin');
  const active = useRequiredActive();
  const types = useTherapyTypes().data ?? [];
  const staff = useMembers(['therapist', 'coordinator', 'school_admin']).data ?? [];
  const parents = useMembers(['parent']).data ?? [];
  const create = useCreateChild();
  const [d, setD] = useState<NewChildDraft>(EMPTY);
  const [errors, setErrors] = useState<NewChildErrors>({});
  const today = toISODate(new Date());
  const dirty = JSON.stringify(d) !== JSON.stringify(EMPTY);
  const guard = useUnsavedGuard(dirty && !create.isSuccess);

  if (!ADMIN_ROLES.includes(active.role)) {
    return (
      <Screen back title={t('newChild.title')}>
        <EmptyState title={t('noAccessTitle')} body={t('noAccessBody')} />
      </Screen>
    );
  }

  const set = <K extends keyof NewChildDraft>(k: K, v: NewChildDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    const e = validateNewChild(d, today);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t('common:states.errorTitle'));
      return;
    }
    try {
      const child = await create.mutateAsync({
        child: {
          fullName: d.fullName.trim(),
          preferredName: d.preferredName.trim() || undefined,
          dob: d.dob!,
          gender: d.gender ?? undefined,
          classGroup: d.classGroup.trim() || undefined,
        },
        therapists: Object.entries(d.therapists).map(([therapyTypeId, a]) => ({ therapyTypeId, userId: a.userId, isLead: a.isLead })),
        guardians: d.guardians.map((g) => ({ userId: g.userId, relation: RELATION_VALUE[g.relation], isPrimary: g.isPrimary })),
        invite:
          d.newParent && active.orgId
            ? { organizationId: active.orgId, fullName: d.newParent.fullName.trim(), phone: normaliseIndianPhone(d.newParent.phone)!, relation: RELATION_VALUE[d.newParent.relation] }
            : undefined,
      });
      toast.success(t('newChild.saved', { name: child.preferredName || child.fullName }));
      guard.leave(() => router.replace(`/child/${child.id}`));
    } catch (err) {
      toast.error(t(errorMessageKey(err)));
    }
  };

  return (
    <Screen
      back
      title={t('newChild.title')}
      testID="new-child"
      footer={<Button label={t('newChild.save')} icon={UserPlus} onPress={() => void submit()} loading={create.isPending} fullWidth testID="save-child" />}
    >
      <Block icon={<Baby size={20} color={theme.colors.primaryText} />} title={t('newChild.basics')}>
        <TextField label={t('newChild.fullName')} required value={d.fullName} onChangeText={(v) => set('fullName', v)} error={errors.fullName ? t(errors.fullName) : undefined} autoCapitalize="words" />
        <TextField label={t('newChild.preferredName')} helper={t('newChild.preferredHelp')} value={d.preferredName} onChangeText={(v) => set('preferredName', v)} autoCapitalize="words" />
        <DateField label={t('newChild.dob')} value={d.dob ?? undefined} onChange={(v) => set('dob', v)} maxDate={today} error={errors.dob ? t(errors.dob) : undefined} />
        <Stack gap={2}>
          <Text variant="label">{t('newChild.gender')}</Text>
          <ChipGroup
            single
            options={(['female', 'male', 'other'] as const).map((g) => ({ value: g, label: t(`gender.${g}`) }))}
            value={d.gender ? [d.gender] : []}
            onChange={(v) => set('gender', (v[0] as NewChildDraft['gender']) ?? null)}
          />
        </Stack>
        <TextField label={t('newChild.classGroup')} value={d.classGroup} onChangeText={(v) => set('classGroup', v)} placeholder={t('newChild.classGroupPh')} />
      </Block>

      <Block icon={<Stethoscope size={20} color={theme.colors.primaryText} />} title={t('newChild.therapists')} subtitle={t('newChild.therapistsHelp')}>
        <TherapistAssignment therapyTypes={types} members={staff} value={d.therapists} onChange={(v) => set('therapists', v)} />
      </Block>

      <Block icon={<HeartHandshake size={20} color={theme.colors.primaryText} />} title={t('newChild.family')} subtitle={t('newChild.familyHelp')}>
        <GuardianPicker
          parents={parents}
          guardians={d.guardians}
          onGuardians={(v) => set('guardians', v)}
          newParent={d.newParent}
          onNewParent={(v) => set('newParent', v)}
          errors={{ name: errors.newParentName, phone: errors.newParentPhone }}
        />
      </Block>
    </Screen>
  );
}

function Block({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <Stack gap={3}>
        <Stack gap={1}>
          <Row gap={2}>
            {icon}
            <Text variant="subheading" accessibilityRole="header">
              {title}
            </Text>
          </Row>
          {subtitle ? (
            <Text variant="caption" color="textMuted">
              {subtitle}
            </Text>
          ) : null}
        </Stack>
        {children}
      </Stack>
    </Card>
  );
}
