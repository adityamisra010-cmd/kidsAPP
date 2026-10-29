import { Image } from 'expo-image';
import { School } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { Organization } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

/**
 * Custom header for role home screens (parent Home, therapist Today, admin Dashboard).
 * Lives inside the scroll view so it moves with pull-to-refresh, and keeps actions as icon + word.
 */
export function HomeHeader({
  eyebrow,
  title,
  below,
  actions,
  testID,
}: {
  /** Small line above the title (greeting or date). */
  eyebrow?: string;
  title: string;
  /** Under the title: school line, sync badge… */
  below?: ReactNode;
  /** LabeledIconButtons. */
  actions?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2], paddingTop: t.space[3] }}>
      <View style={{ flex: 1, gap: t.space[1] }}>
        {eyebrow ? (
          <Text variant="label" color="textMuted" numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="title" accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        {below ? <View style={{ marginTop: 2 }}>{below}</View> : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>{actions}</View> : null}
    </View>
  );
}

/** School logo (or a calm school icon) + name. Light white-labelling for each school. */
export function SchoolLine({ organization }: { organization?: Organization }) {
  const t = useTheme();
  if (!organization) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
      {organization.logoUrl ? (
        <Image
          source={{ uri: organization.logoUrl }}
          style={{ width: 22, height: 22, borderRadius: 6 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      ) : (
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <School size={14} color={t.colors.primaryText} />
        </View>
      )}
      <Text variant="label" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {organization.name}
      </Text>
    </View>
  );
}
