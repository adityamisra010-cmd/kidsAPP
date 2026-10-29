import { CircleCheck, CircleX, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ChipGroup } from '@/domain/constants';
import { chipLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Chip, Row, Stack, Text } from '@/ui';

/** Read-only chips for a vocabulary group (custom values shown as typed). */
export function ChipCloud({ group, values }: { group: ChipGroup; values: string[] }) {
  const { t } = useTranslation();
  if (values.length === 0) return null;
  return (
    <Row gap={2} wrap>
      {values.map((v) => (
        <Chip key={v} label={chipLabel(t, group, v)} size="sm" />
      ))}
    </Row>
  );
}

/** Titled block with an icon. Shows `emptyText` when there is nothing inside. */
export function InfoSection({
  icon: Icon,
  title,
  children,
  isEmpty,
  emptyText,
  tone = 'default',
  badge,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  isEmpty?: boolean;
  emptyText?: string;
  tone?: 'default' | 'sunken';
  badge?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Card tone={tone} testID={testID}>
      <Stack gap={3}>
        <Row gap={2} justify="between" align="center">
          <Row gap={2} flex={1}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} color={t.colors.primaryText} />
            </View>
            <Text variant="subheading" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Text>
          </Row>
          {badge}
        </Row>
        {isEmpty ? (
          <Text color="textMuted">{emptyText}</Text>
        ) : (
          children
        )}
      </Stack>
    </Card>
  );
}

export function NotesText({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return <Text color="textMuted">{text.trim()}</Text>;
}

/** Do / Don't rules as icon bullets (icon + words, never colour alone). */
export function RuleList({ items, kind }: { items: string[]; kind: 'do' | 'dont' }) {
  const t = useTheme();
  const { t: tr } = useTranslation('child');
  const Icon = kind === 'do' ? CircleCheck : CircleX;
  const color = kind === 'do' ? t.colors.success : t.colors.danger;
  if (items.length === 0) return null;
  return (
    <Stack gap={2}>
      {items.map((item, i) => (
        <Row key={`${i}-${item}`} gap={2} align="flex-start" accessibilityLabel={`${tr(kind === 'do' ? 'about.doPrefix' : 'about.dontPrefix')}: ${item}`}>
          <View style={{ paddingTop: 2 }}>
            <Icon size={18} color={color} />
          </View>
          <Text style={{ flex: 1 }}>{item}</Text>
        </Row>
      ))}
    </Stack>
  );
}
