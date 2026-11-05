import { router } from 'expo-router';
import { Ban, FileSpreadsheet, Search, UserPlus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildren, useMembers, useTherapyTypes } from '@/data/hooks';
import type { Member } from '@/domain/types';
import { filterCaseload } from '@/features/children/caseload';
import { ChildRow } from '@/features/children/components/ChildRow';
import { therapyTypeLabel } from '@/i18n/labels';
import { Avatar, Badge, Button, Card, Divider, EmptyState, LabeledIconButton, ListItem, QueryView, Screen, SegmentedControl, SkeletonList, Stack, Text, TextField } from '@/ui';

import { InvitesList } from '../components/InvitesList';
import { childrenByGuardian, searchMembers, sortMembers } from '../people';

type Segment = 'children' | 'staff' | 'parents' | 'invites';

/** Admin/coordinator "People" tab: children, staff, parents and pending invites. */
export function PeopleScreen() {
  const { t } = useTranslation('admin');
  const [segment, setSegment] = useState<Segment>('children');
  const [search, setSearch] = useState('');

  return (
    <Screen
      title={t('people.title')}
      right={<LabeledIconButton icon={FileSpreadsheet} label={t('people.import')} onPress={() => router.push('/import')} testID="import-entry" />}
      headerExtra={
        <Stack gap={2}>
          <SegmentedControl
            options={(['children', 'staff', 'parents', 'invites'] as const).map((s) => ({ value: s, label: t(`people.segments.${s}`) }))}
            value={segment}
            onChange={(s) => setSegment(s)}
            testID="people-segments"
          />
          <TextField icon={Search} value={search} onChangeText={setSearch} placeholder={t('people.search')} accessibilityLabel={t('people.search')} autoCorrect={false} />
        </Stack>
      }
      testID="people-screen"
    >
      {segment === 'children' ? <ChildrenList search={search} /> : null}
      {segment === 'staff' ? <StaffList search={search} /> : null}
      {segment === 'parents' ? <ParentsList search={search} /> : null}
      {segment === 'invites' ? <InvitesList search={search} /> : null}
    </Screen>
  );
}

function ImportHint() {
  const { t } = useTranslation('admin');
  return (
    <Card tone="sunken">
      <Stack gap={2}>
        <Text variant="subheading">{t('people.importTitle')}</Text>
        <Text color="textMuted">{t('people.importBody')}</Text>
        <Button label={t('people.importCta')} icon={FileSpreadsheet} variant="secondary" onPress={() => router.push('/import')} />
      </Stack>
    </Card>
  );
}

function ChildrenList({ search }: { search: string }) {
  const { t } = useTranslation('admin');
  const q = useChildren();
  const types = useTherapyTypes().data ?? [];
  const shown = useMemo(
    () => filterCaseload(q.data ?? [], { search }).sort((a, b) => a.child.fullName.localeCompare(b.child.fullName)),
    [q.data, search],
  );
  return (
    <Stack gap={3}>
      <Button label={t('people.addChild')} icon={UserPlus} onPress={() => router.push('/child/new')} testID="add-child" />
      <QueryView query={q} skeleton={<SkeletonList rows={4} height={104} />} isEmpty={(d) => d.length === 0} empty={<ImportHint />}>
        {(all) => (
          <Stack gap={3}>
            <Text variant="caption" color="textMuted">
              {t('people.childrenCount', { count: all.length })}
            </Text>
            {shown.length === 0 ? <EmptyState compact title={t('people.noMatch')} /> : shown.map((s) => <ChildRow key={s.child.id} summary={s} therapyTypes={types} />)}
          </Stack>
        )}
      </QueryView>
    </Stack>
  );
}

function MemberList({ members, subtitle }: { members: Member[]; subtitle: (m: Member) => string }) {
  const { t } = useTranslation('admin');
  if (members.length === 0) return <EmptyState compact title={t('people.noMatch')} />;
  return (
    <Card padding={2}>
      {members.map((m, i) => (
        <Stack key={m.membership.id} gap={0}>
          {i > 0 ? <Divider inset={2} /> : null}
          <ListItem
            title={m.profile.fullName}
            subtitle={subtitle(m)}
            left={<Avatar name={m.profile.fullName} uri={m.profile.avatarUrl} size={40} />}
            right={m.membership.status === 'suspended' ? <Badge label={t('member.statusSuspended')} tone="danger" icon={Ban} /> : undefined}
            onPress={() => router.push(`/people/member/${m.profile.id}`)}
          />
        </Stack>
      ))}
    </Card>
  );
}

function StaffList({ search }: { search: string }) {
  const { t } = useTranslation('admin');
  const q = useMembers(['school_admin', 'coordinator', 'therapist']);
  const types = useTherapyTypes().data ?? [];
  return (
    <Stack gap={3}>
      <Button label={t('people.inviteStaff')} icon={UserPlus} onPress={() => router.push('/people/invite?role=therapist')} />
      <QueryView query={q} skeleton={<SkeletonList rows={4} height={64} />} isEmpty={(d) => d.length === 0} empty={<ImportHint />}>
        {(all) => (
          <MemberList
            members={sortMembers(searchMembers(all, search))}
            subtitle={(m) =>
              [
                t(`common:roles.${m.membership.role}`),
                m.therapyTypeIds
                  .map((id) => types.find((x) => x.id === id))
                  .filter((x): x is NonNullable<typeof x> => !!x)
                  .map((x) => therapyTypeLabel(t, x))
                  .join(', '),
              ]
                .filter(Boolean)
                .join(' · ')
            }
          />
        )}
      </QueryView>
    </Stack>
  );
}

function ParentsList({ search }: { search: string }) {
  const { t } = useTranslation('admin');
  const q = useMembers(['parent']);
  const children = useChildren().data;
  const linked = useMemo(() => childrenByGuardian(children ?? []), [children]);
  return (
    <Stack gap={3}>
      <Button label={t('people.inviteParent')} icon={UserPlus} onPress={() => router.push('/people/invite?role=parent')} />
      <QueryView query={q} skeleton={<SkeletonList rows={4} height={64} />} isEmpty={(d) => d.length === 0} empty={<ImportHint />}>
        {(all) => (
          <MemberList
            members={sortMembers(
              all.filter((m) => searchMembers([m], search).length > 0 || (linked.get(m.profile.id) ?? []).some((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))),
            )}
            subtitle={(m) => {
              const kids = linked.get(m.profile.id) ?? [];
              return kids.length ? kids.map((k) => t('people.parentOf', { relation: k.relation, name: k.name })).join(', ') : t('people.noLinkedChild');
            }}
          />
        )}
      </QueryView>
    </Stack>
  );
}
