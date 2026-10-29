/**
 * Design tokens. The ONLY place colours, spacing, radii and type sizes are defined.
 * Calm, low-stimulation palette: warm beige surfaces, one burnt-orange primary, muted markers.
 */

export interface Palette {
  bg: string;
  surface: string;
  /** Slightly sunken areas: inputs, segmented control track, skeletons. */
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  /** Filled buttons, active tab, header accents. White text passes AA on it. */
  primary: string;
  /** Pressed state of primary. */
  primaryPressed: string;
  /** Highlights and progress fills only. Never for text. */
  accent: string;
  /** Selected chips, tinted cards. */
  primarySoft: string;
  /** Text/icons on primarySoft or for links (AA on bg). */
  primaryText: string;
  onPrimary: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  overlay: string;
  shadow: string;
  /** Rating pill colours 1..5 (muted, never traffic-light loud). */
  scale: [string, string, string, string, string];
}

export const lightPalette: Palette = {
  bg: '#F7F1E8',
  surface: '#FFFBF5',
  surfaceAlt: '#F1E8DB',
  border: '#E8DCCB',
  borderStrong: '#D6C4AC',
  primary: '#B85418',
  primaryPressed: '#9A4312',
  accent: '#F08A3C',
  primarySoft: '#FBE6D4',
  primaryText: '#9A4312',
  onPrimary: '#FFFFFF',
  text: '#2B211A',
  textMuted: '#6E6157',
  textSubtle: '#8F8277',
  success: '#3F6E4C',
  successSoft: '#E1EDE3',
  warning: '#8A6508',
  warningSoft: '#F6EBCB',
  danger: '#B3261E',
  dangerSoft: '#F7DEDB',
  info: '#3F6382',
  infoSoft: '#DFE8F0',
  overlay: 'rgba(43, 33, 26, 0.45)',
  shadow: '#5A3A1E',
  scale: ['#C9826B', '#D9A877', '#D8C08A', '#9DB98F', '#6F9A7A'],
};

export const darkPalette: Palette = {
  bg: '#1C1713',
  surface: '#27201A',
  surfaceAlt: '#312820',
  border: '#3A3028',
  borderStrong: '#4E4136',
  primary: '#E08A4E',
  primaryPressed: '#F0A066',
  accent: '#F08A3C',
  primarySoft: '#3D2A1C',
  primaryText: '#F0A066',
  onPrimary: '#1C1713',
  text: '#F3ECE3',
  textMuted: '#B5A99D',
  textSubtle: '#94877B',
  success: '#86B595',
  successSoft: '#22332A',
  warning: '#E0B341',
  warningSoft: '#3A3016',
  danger: '#F2B8B5',
  dangerSoft: '#46201D',
  info: '#9DBAD6',
  infoSoft: '#1F2B37',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
  scale: ['#B77561', '#C49A6E', '#C2AE7E', '#8EA983', '#77A383'],
};

/** 4-pt spacing scale: space[4] = 16. */
export const space = [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64] as const;
export type SpaceKey = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/** Minimum touch target (dp). */
export const TOUCH = 48;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type TextVariant = 'display' | 'title' | 'heading' | 'subheading' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'overline';

/** Body is 16 (parent views minimum). */
export const typography: Record<TextVariant, { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number }> = {
  display: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  overline: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
};

export interface Theme {
  scheme: 'light' | 'dark';
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  type: typeof typography;
  fonts: typeof fonts;
  /** Platform-appropriate card elevation style. */
  elevation: (level: 0 | 1 | 2) => object;
  reduceMotion: boolean;
}
