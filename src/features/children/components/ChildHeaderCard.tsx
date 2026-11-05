import { Phone, Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import type { ChildDetail, TherapyType } from '@/domain/types';
import { formatIndianPhone, telLink } from '@/features/people/phone';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { Avatar, Badge, Button, Card, Divider, Row, Stack, Text, TypeTag } from '@/ui';

/**
 * Staff header for a child: photo, communication mode, care team (lead marked) and family with a
 * one-tap call button. Phone numbers are hidden for substitute (brief-only) access.
 */
export function ChildHeaderCard({ detail, therapyTypes, showContacts }: { detail: ChildDetail; therapyTypes: TherapyType[]; showContacts: boolean }) {
  const { t } = useTranslation('child');
  const c = detail.child;
  return (
    <Card testID="child-header">
      <Stack gap={3}>
        <Row gap={3}>
          <Avatar name={c.fullName} uri={c.photoUrl} size={64} />
          <Stack gap={1} flex={1}>
            {c.preferredName ? (
              <Text variant="caption" color="textMuted">
                {t('header.fullName', { name: c.fullName })}
              </Text>
            ) : null}
            <Badge label={vocabLabel(t, 'commModes', detail.profile.communicationMode)} tone="primary" />
          </Stack>
        </Row>

        {detail.therapists.length ? (
          <Stack gap={2}>
            <Divider />
            <Text variant="overline" color="textMuted">
              {t('header.careTeam')}
            </Text>
            {detail.therapists.map((th) => {
              const tt = therapyTypes.find((x) => x.id === th.therapyTypeId);
              return (
                <Row key={`${th.userId}-${th.therapyTypeId}`} gap={2} justify="between">
                  <Stack gap={0} flex={1}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {th.name}
                    </Text>
                    {tt ? <TypeTag name={therapyTypeLabel(t, tt)} color={tt.color} /> : null}
                  </Stack>
                  {th.isLead ? <Badge label={t('header.lead')} tone="neutral" icon={Star} /> : null}
                </Row>
              );
            })}
          </Stack>
        ) : null}

        {detail.guardians.length ? (
          <Stack gap={2}>
            <Divider />
            <Text variant="overline" color="textMuted">
              {t('header.family')}
            </Text>
            {detail.guardians.map((g) => (
              <Row key={g.userId} gap={2} justify="between">
                <Stack gap={0} flex={1}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {[g.relation, g.isPrimary ? t('header.primary') : null, showContacts && g.phone ? formatIndianPhone(g.phone) : null].filter(Boolean).join(' · ')}
                  </Text>
                </Stack>
                {showContacts && g.phone ? (
                  <Button
                    label={t('common:actions.call')}
                    icon={Phone}
                    size="sm"
                    variant="outline"
                    accessibilityHint={t('header.callHint', { name: g.name })}
                    onPress={() => void Linking.openURL(telLink(g.phone!)).catch(() => undefined)}
                  />
                ) : null}
              </Row>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}
