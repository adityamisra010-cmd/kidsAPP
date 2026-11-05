import {
  Activity,
  AlertTriangle,
  Award,
  BookOpen,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  Ear,
  FileText,
  Footprints,
  Hand,
  Handshake,
  Heart,
  Link,
  MessageCircle,
  Puzzle,
  Repeat,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Target,
  Video,
  Waves,
  Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { Palette } from '@/theme/tokens';

/**
 * Icons referenced BY NAME from data (therapy types, rating dimensions, resources).
 * In feature code, import lucide components directly instead (tree-shaken, typed).
 */
const REGISTRY: Record<string, LucideIcon> = {
  'message-circle': MessageCircle,
  hand: Hand,
  sprout: Sprout,
  'book-open': BookOpen,
  activity: Activity,
  ear: Ear,
  sparkles: Sparkles,
  target: Target,
  waves: Waves,
  smile: Smile,
  handshake: Handshake,
  footprints: Footprints,
  repeat: Repeat,
  puzzle: Puzzle,
  heart: Heart,
  star: Star,
  award: Award,
  calendar: CalendarDays,
  clipboard: ClipboardList,
  'file-text': FileText,
  video: Video,
  image: ImageIcon,
  link: Link,
  'alert-triangle': AlertTriangle,
};

export interface IconProps {
  /** Registry name (data-driven) or a lucide component. */
  name?: string;
  icon?: LucideIcon;
  size?: number;
  color?: keyof Palette;
  /** Raw colour, e.g. a therapy-type marker. */
  tint?: string;
  strokeWidth?: number;
}

export function Icon({ name, icon, size = 20, color = 'text', tint, strokeWidth = 2 }: IconProps) {
  const t = useTheme();
  const Cmp = icon ?? (name ? REGISTRY[name] : undefined) ?? CircleHelp;
  const c = tint ?? (t.colors[color] as string);
  return <Cmp size={size} color={c} strokeWidth={strokeWidth} />;
}
