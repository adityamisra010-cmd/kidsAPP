// Handover brief, "who is this child": header, do/don't rules, motivators / triggers / calming.
import type { LucideIcon } from 'lucide-react-native';
import { Ban, CircleCheck, Heart, MessageCircle, TriangleAlert, UserCheck, Waves } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ChipGroup as ChipVocab } from '@/domain/constants';
import type { HandoverBrief } from '@/domain/types';
import { chipLabel, vocabLabel } from '@/i18n/labels';
import { formatTimeRange } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Card, Chip, Row, Stack, Text, TypeTag } from '@/ui';

export function BriefHeader({ brief: b, allergies }: { brief: HandoverBrief; allergies?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('brief');
  const a = b.appointment;
  const name = b.child.preferredName ?? b.child.fullName;
  return (
    <Card padding={4}>
      <Stack gap={3}>
        <Row gap={4} align="flex-start">
          <Avatar name={b.child.fullName} uri={b.child.photoUrl} size={72} />
          <Stack gap={1} flex={1}>
            <Text variant="title">{name}</Text>
            <Text color="textMuted">{name !== b.child.fullName ? `${b.child.fullName} · ${b.ageLabel}` : b.ageLabel}</Text>
            <TypeTag name={a.therapyTypeName} color={a.therapyTypeColor} />
            <Text variant="label">{formatTimeRange(a.startsAt, a.endsAt)}</Text>
          </Stack>
        </Row>
        {a.isSubstitute ? <Badge label={tr('substitute')} tone="warning" icon={UserCheck} /> : null}
        <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'flex-start' }}>
          <MessageCircle size={18} color={t.colors.primaryText} />
          <Stack gap={2} flex={1}>
            <Text variant="bodyStrong">{`${tr('communication')}: ${vocabLabel(tr, 'commModes', b.profile.communicationMode)}`}</Text>
            {b.profile.commTools.length ? (
              <Row gap={2} wrap>
                {b.profile.commTools.map((c) => (
                  <Chip key={c} size="sm" label={chipLabel(tr, 'commTools', c)} />
                ))}
              </Row>
            ) : null}
            {b.profile.commNotes ? <Text color="textMuted">{b.profile.commNotes}</Text> : null}
          </Stack>
        </View>
        {allergies ? (
          <Row gap={2}>
            <TriangleAlert size={18} color={t.colors.danger} />
            <Text variant="bodyStrong" tint={t.colors.danger} style={{ flex: 1 }}>
              {`${tr('allergies')}: ${allergies}`}
            </Text>
          </Row>
        ) : null}
      </Stack>
    </Card>
  );
}

function RuleList({ items, kind }: { items: string[]; kind: 'do' | 'dont' }) {
  const t = useTheme();
  const { t: tr } = useTranslation('brief');
  const Icon = kind === 'do' ? CircleCheck : Ban;
  const color = kind === 'do' ? t.colors.success : t.colors.danger;
  return (
    <Stack gap={2}>
      <Row gap={2}>
        <Icon size={20} color={color} strokeWidth={2.4} />
        <Text variant="subheading" tint={color}>
          {tr(kind === 'do' ? 'dos' : 'donts')}
        </Text>
      </Row>
      {items.slice(0, 3).map((rule) => (
        <View
          key={rule}
          accessibilityLabel={tr(kind === 'do' ? 'doA11y' : 'dontA11y', { rule })}
          style={{ flexDirection: 'row', gap: t.space[2], paddingLeft: t.space[1] }}
        >
          <Text color="textMuted">•</Text>
          <Text style={{ flex: 1 }}>{rule}</Text>
        </View>
      ))}
    </Stack>
  );
}

export function DoDontCard({ dos, donts }: { dos: string[]; donts: string[] }) {
  const { t } = useTranslation('brief');
  if (!dos.length && !donts.length) {
    return (
      <Card tone="sunken">
        <Text color="textMuted">{t('noRules')}</Text>
      </Card>
    );
  }
  return (
    <Card padding={4}>
      <Stack gap={4}>
        {dos.length ? <RuleList items={dos} kind="do" /> : null}
        {donts.length ? <RuleList items={donts} kind="dont" /> : null}
      </Stack>
    </Card>
  );
}

function ChipBlock({ icon: Icon, title, items, group, notes }: { icon: LucideIcon; title: string; items: string[]; group: ChipVocab; notes: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('brief');
  return (
    <Stack gap={2}>
      <Row gap={2}>
        <Icon size={18} color={t.colors.primaryText} />
        <Text variant="subheading">{title}</Text>
      </Row>
      {items.length ? (
        <Row gap={2} wrap>
          {items.map((c) => (
            <Chip key={c} size="sm" label={chipLabel(tr, group, c)} />
          ))}
        </Row>
      ) : (
        <Text variant="label" color="textSubtle">
          {tr('none')}
        </Text>
      )}
      {notes ? (
        <Text variant="label" color="textMuted">
          {notes}
        </Text>
      ) : null}
    </Stack>
  );
}

export function ProfileChipsCard({ brief: b }: { brief: HandoverBrief }) {
  const { t } = useTranslation('brief');
  const p = b.profile;
  return (
    <Card padding={4}>
      <Stack gap={4}>
        <ChipBlock icon={Heart} title={t('reinforcers')} items={p.reinforcers} group="reinforcers" notes={p.reinforcersNotes} />
        <ChipBlock icon={TriangleAlert} title={t('triggers')} items={p.triggers} group="triggers" notes={p.triggersNotes} />
        <ChipBlock icon={Waves} title={t('calming')} items={p.calming} group="calming" notes={p.calmingNotes} />
      </Stack>
    </Card>
  );
}
