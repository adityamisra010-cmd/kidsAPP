import { Award } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { Easing, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { Card, Row, Stack, Text } from '@/ui';

const VISIBLE_MS = 3200;

/**
 * The one restrained celebration in the app: an award icon that gently scales and fades in with
 * "Goal mastered", then the card fades away. No bounce, no confetti. With reduce-motion on it simply
 * appears and disappears. Screen readers hear the announcement.
 */
export function MasteredMoment({ goalText, onDone }: { goalText?: string; onDone: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation('goals');
  const scale = useSharedValue(theme.reduceMotion ? 1 : 0.7);
  const opacity = useSharedValue(theme.reduceMotion ? 1 : 0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(t('mastery.moment'));
    if (!theme.reduceMotion) {
      scale.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(1, { duration: 350 });
    }
    const timer = setTimeout(() => done.current(), VISIBLE_MS);
    return () => clearTimeout(timer);
    // Runs once per moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <Animated.View exiting={theme.reduceMotion ? undefined : FadeOut.duration(300)} testID="mastered-moment">
      <Card tone="success">
        <Row gap={3}>
          <Animated.View style={iconStyle}>
            <View
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}
            >
              <Award size={28} color={theme.colors.success} strokeWidth={2.2} />
            </View>
          </Animated.View>
          <Stack gap={1} flex={1}>
            <Text variant="subheading" color="success" accessibilityRole="header">
              {t('mastery.moment')}
            </Text>
            {goalText ? (
              <Text variant="label" color="textMuted" numberOfLines={2}>
                {goalText}
              </Text>
            ) : null}
          </Stack>
        </Row>
      </Card>
    </Animated.View>
  );
}
