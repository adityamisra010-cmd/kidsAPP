import { FolderHeart, HandHeart, MapPin, Settings2, Users, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Card, Row, Stack, Text } from '@/ui';

const SECTIONS: { icon: LucideIcon; key: 'collect' | 'why' | 'who' | 'where' | 'choices' }[] = [
  { icon: FolderHeart, key: 'collect' },
  { icon: HandHeart, key: 'why' },
  { icon: Users, key: 'who' },
  { icon: MapPin, key: 'where' },
  { icon: Settings2, key: 'choices' },
];

/** Plain-language "what we keep and why", shown at consent and again in Consent & privacy. */
export function ConsentSummary() {
  const t = useTheme();
  const { t: tr } = useTranslation('auth');
  return (
    <Card padding={4}>
      <Stack gap={4}>
        {SECTIONS.map(({ icon: Icon, key }) => (
          <Row key={key} gap={3} align="flex-start">
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: t.colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={18} color={t.colors.primaryText} />
            </View>
            <Stack gap={1} flex={1}>
              <Text variant="subheading" accessibilityRole="header">
                {tr(`consent.${key}Title`)}
              </Text>
              {key === 'collect' ? (
                <Stack gap={1}>
                  {(['collect1', 'collect2', 'collect3'] as const).map((k) => (
                    <Row key={k} gap={2} align="flex-start">
                      <Text color="textMuted">{'•'}</Text>
                      <Text color="textMuted" style={{ flex: 1 }}>
                        {tr(`consent.${k}`)}
                      </Text>
                    </Row>
                  ))}
                </Stack>
              ) : (
                <Text color="textMuted">{tr(`consent.${key}`)}</Text>
              )}
            </Stack>
          </Row>
        ))}
      </Stack>
    </Card>
  );
}
