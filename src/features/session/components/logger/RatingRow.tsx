// One anchored 1–5 dimension: five big pills (radio group), anchor text, "?" sheet, hold-to-peek.
import { Check, CircleQuestionMark } from 'lucide-react-native';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { PromptLevel, RatingDimension, RatingValue } from '@/domain/types';
import { dimensionText } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Sheet, Text } from '@/ui';

import { promptLabel, RATING_VALUES } from '../../labels';
import { INDEPENDENCE_KEY, issueId } from '../../logic/draft';
import { useTargetRef } from './scrollTargets';

const PEEK_MS = 2500;

function RatingPill({
  value,
  selected,
  caption,
  anchor,
  onPress,
  onLongPress,
  onPressOut,
  testID,
}: {
  value: RatingValue;
  selected: boolean;
  caption?: string;
  anchor: string;
  onPress: () => void;
  onLongPress: () => void;
  onPressOut: () => void;
  testID: string;
}) {
  const t = useTheme();
  const fill = t.colors.scale[value - 1];
  const ink = t.scheme === 'dark' ? t.colors.bg : t.colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${value}, ${anchor}`}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressOut={onPressOut}
      delayLongPress={350}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: caption ? 66 : 54,
        borderRadius: t.radius.md,
        borderWidth: 1.5,
        borderColor: selected ? fill : t.colors.border,
        backgroundColor: selected ? fill : pressed ? t.colors.surfaceAlt : t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 2,
        paddingVertical: 4,
      })}
    >
      {selected ? (
        <View style={{ position: 'absolute', top: 3, right: 4 }}>
          <Check size={14} color={ink} strokeWidth={3} />
        </View>
      ) : null}
      <Text variant="heading" tint={selected ? ink : t.colors.text}>
        {value}
      </Text>
      {caption ? (
        <Text
          variant="caption"
          tint={selected ? ink : t.colors.textMuted}
          numberOfLines={2}
          align="center"
          maxFontSizeMultiplier={1.2}
          style={{ fontSize: 11, lineHeight: 13 }}
        >
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

function RatingRowBase({
  dimension,
  value,
  invalid,
  onRate,
  children,
}: {
  dimension: RatingDimension;
  value?: RatingValue;
  invalid: boolean;
  onRate: (key: string, value: RatingValue) => void;
  /** Rendered between the label and the pills (regulation's energy-state selector). */
  children?: ReactNode;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('session');
  const text = dimensionText(tr, dimension);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [peek, setPeek] = useState<RatingValue | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useTargetRef(issueId.rating(dimension.key));
  const isIndependence = dimension.key === INDEPENDENCE_KEY;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const startPeek = (v: RatingValue) => {
    if (timer.current) clearTimeout(timer.current);
    setPeek(v);
  };
  const endPeek = () => {
    if (peek == null) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPeek(null), PEEK_MS);
  };

  const showPeek = peek != null && peek !== value;
  return (
    <View
      ref={targetRef}
      style={{ gap: t.space[2], paddingVertical: t.space[3] }}
      testID={`rating-row-${dimension.key}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{text.label}</Text>
        </View>
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${tr('logger.rating.whatMeans')} ${text.label}`}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}
        >
          <CircleQuestionMark size={16} color={t.colors.primaryText} />
          <Text variant="caption" color="primaryText" weight="semibold">
            {tr('logger.rating.whatMeans')}
          </Text>
        </Pressable>
      </View>
      {children}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={text.label}
        style={{ flexDirection: 'row', gap: t.space[2] }}
      >
        {RATING_VALUES.map((v) => (
          <RatingPill
            key={v}
            testID={`rate-${dimension.key}-${v}`}
            value={v}
            selected={value === v}
            caption={isIndependence ? promptLabel(tr, v as PromptLevel) : undefined}
            anchor={text.anchor(v)}
            onPress={() => {
              setPeek(null);
              onRate(dimension.key, v);
            }}
            onLongPress={() => startPeek(v)}
            onPressOut={endPeek}
          />
        ))}
      </View>
      <View accessibilityLiveRegion="polite" style={{ minHeight: 20 }}>
        {showPeek ? (
          <Text variant="label" color="primaryText">
            {tr('logger.rating.peek', { value: peek, anchor: text.anchor(peek) })}
          </Text>
        ) : value ? (
          <Text variant="label">{text.anchor(value)}</Text>
        ) : invalid ? (
          <Text variant="label" color="danger" weight="semibold">
            {tr('logger.rating.needed')}
          </Text>
        ) : (
          <Text variant="caption" color="textSubtle">
            {tr('logger.rating.notRated')}
          </Text>
        )}
      </View>

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={text.label}
        subtitle={tr('logger.rating.anchorsSubtitle')}
      >
        {text.description ? <Text color="textMuted">{text.description}</Text> : null}
        {RATING_VALUES.map((v) => {
          const selected = value === v;
          return (
            <Pressable
              key={v}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${v}, ${text.anchor(v)}`}
              onPress={() => {
                onRate(dimension.key, v);
                setSheetOpen(false);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[3],
                minHeight: 56,
                paddingHorizontal: t.space[3],
                borderRadius: t.radius.md,
                borderWidth: 1.5,
                borderColor: selected ? t.colors.primary : t.colors.border,
                backgroundColor: pressed ? t.colors.surfaceAlt : selected ? t.colors.primarySoft : t.colors.surface,
              })}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: t.colors.scale[v - 1],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="subheading" tint={t.scheme === 'dark' ? t.colors.bg : t.colors.text}>
                  {v}
                </Text>
              </View>
              <View style={{ flex: 1, paddingVertical: t.space[2] }}>
                {isIndependence ? (
                  <Text variant="label" weight="semibold">
                    {promptLabel(tr, v as PromptLevel)}
                  </Text>
                ) : null}
                <Text>{text.anchor(v)}</Text>
              </View>
              {selected ? <Check size={20} color={t.colors.primaryText} strokeWidth={2.6} /> : null}
            </Pressable>
          );
        })}
      </Sheet>
      {invalid && !value ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -12,
            top: 12,
            bottom: 12,
            width: 3,
            borderRadius: 2,
            backgroundColor: t.colors.danger,
          }}
        />
      ) : null}
    </View>
  );
}

export const RatingRow = memo(RatingRowBase);
