import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ImagePlus, Send, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { Button, IconOnlyButton, Text, toast } from '@/ui';

import type { PickedImage, SendInput } from './useConversation';

const MAX_LENGTH = 2000;

/**
 * Multiline composer with a labelled Photo button and a labelled Send button. The draft is cleared
 * at once (optimistic) and put back if sending fails.
 */
export function Composer({ onSend }: { onSend: (input: SendInput) => Promise<unknown> }) {
  const t = useTheme();
  const { t: tr } = useTranslation('messages');
  const [text, setText] = useState('');
  const [image, setImage] = useState<PickedImage | undefined>();
  const canSend = text.trim().length > 0 || !!image;

  const pick = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: false });
      const a = res.canceled ? undefined : res.assets?.[0];
      if (!a) return;
      setImage({ uri: a.uri, name: a.fileName ?? 'photo.jpg', sizeBytes: a.fileSize ?? 0, mimeType: a.mimeType ?? 'image/jpeg' });
    } catch {
      toast.error(tr('composer.pickFailed'));
    }
  };

  const send = () => {
    if (!canSend) return;
    const input: SendInput = { body: text.trim(), image };
    setText('');
    setImage(undefined);
    onSend(input).catch(() => {
      setText((cur) => cur || input.body);
      setImage((cur) => cur ?? input.image);
      toast.error(tr('composer.failed'));
    });
  };

  return (
    <View style={{ gap: t.space[2] }}>
      {image ? (
        <View
          testID="attachment-chip"
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], alignSelf: 'flex-start', padding: 4, paddingRight: 0, borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt }}
        >
          <Image source={{ uri: image.uri }} style={{ width: 40, height: 40, borderRadius: t.radius.sm }} contentFit="cover" />
          <Text variant="label" numberOfLines={1} style={{ maxWidth: 180 }}>
            {image.name}
          </Text>
          <IconOnlyButton icon={X} label={tr('composer.removePhoto')} onPress={() => setImage(undefined)} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.space[2] }}>
        <Pressable
          testID="attach"
          onPress={() => void pick()}
          accessibilityRole="button"
          accessibilityLabel={tr('composer.photo')}
          hitSlop={4}
          style={({ pressed }) => ({ minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <ImagePlus size={22} color={t.colors.textMuted} />
          <Text variant="caption" color="textMuted" style={{ fontSize: 11, lineHeight: 14 }}>
            {tr('composer.photo')}
          </Text>
        </Pressable>
        <TextInput
          testID="composer-input"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MAX_LENGTH}
          placeholder={tr('composer.placeholder')}
          placeholderTextColor={t.colors.textSubtle}
          accessibilityLabel={tr('composer.label')}
          maxFontSizeMultiplier={1.6}
          style={{
            flex: 1,
            minHeight: TOUCH,
            maxHeight: 132,
            paddingHorizontal: t.space[3],
            paddingTop: 12,
            paddingBottom: 12,
            borderRadius: t.radius.md,
            borderWidth: 1.5,
            borderColor: t.colors.border,
            backgroundColor: t.colors.bg,
            color: t.colors.text,
            fontFamily: t.fonts.regular,
            fontSize: 16,
            textAlignVertical: 'top',
          }}
        />
        <Button testID="send" label={tr('composer.send')} icon={Send} onPress={send} disabled={!canSend} />
      </View>
    </View>
  );
}
