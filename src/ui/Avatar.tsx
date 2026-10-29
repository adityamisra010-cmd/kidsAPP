import { Image } from 'expo-image';
import { View } from 'react-native';

import { Text } from './Text';

const WARM = ['#E9C8A8', '#D9B99B', '#C8D5B9', '#E7CFC1', '#D6C7DE', '#C9D9D6', '#EBD9A8'];

function initials(name: string): string {
  const parts = name
    .replace(/^(Ms\.|Mr\.|Mrs\.|Dr\.)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Photo when available, otherwise warm-toned initials. */
export function Avatar({ name, uri, size = 44, ring }: { name: string; uri?: string; size?: number; ring?: string }) {
  const bg = WARM[hash(name) % WARM.length];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={150} />
      ) : (
        <Text
          tint="#3B2A1E"
          weight="semibold"
          style={{ fontSize: size * 0.38, lineHeight: size * 0.46 }}
          maxFontSizeMultiplier={1}
          accessibilityElementsHidden
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
}
