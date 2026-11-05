import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import { usePreferences } from '@/state/preferences';

import { darkPalette, lightPalette, radius, space, typography, fonts, type Theme } from './tokens';

function buildTheme(scheme: 'light' | 'dark', reduceMotion: boolean): Theme {
  const colors = scheme === 'dark' ? darkPalette : lightPalette;
  return {
    scheme,
    colors,
    space,
    radius,
    type: typography,
    fonts,
    reduceMotion,
    elevation: (level) => {
      if (level === 0) return {};
      if (Platform.OS === 'android') return { elevation: level === 1 ? 1.5 : 4 };
      return {
        shadowColor: colors.shadow,
        shadowOpacity: scheme === 'dark' ? 0.4 : level === 1 ? 0.06 : 0.12,
        shadowRadius: level === 1 ? 6 : 14,
        shadowOffset: { width: 0, height: level === 1 ? 2 : 6 },
      };
    },
  };
}

const ThemeContext = createContext<Theme>(buildTheme('light', false));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const pref = usePreferences((s) => s.theme);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduceMotion(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const scheme: 'light' | 'dark' = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const theme = useMemo(() => buildTheme(scheme, reduceMotion), [scheme, reduceMotion]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Typed, theme-aware styles. Define once at module level:
 *
 *   const useStyles = makeStyles((t) => ({ card: { backgroundColor: t.colors.surface, padding: t.space[4] } }));
 *   function Card() { const s = useStyles(); return <View style={s.card} />; }
 */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T>>(factory: (t: Theme) => T & NamedStyles<T>) {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme)) as T;
      cache.set(theme, styles);
    }
    return styles;
  };
}
