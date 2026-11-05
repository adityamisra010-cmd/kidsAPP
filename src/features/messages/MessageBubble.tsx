import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Check, CheckCheck, Clock, FileText } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { Attachment, ISODate } from '@/domain/types';
import { formatDay, formatTime } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

import { dayLabel, readReceipt, type ChatItem } from './grouping';
import { receiptText } from './labels';
import { isPendingMessage } from './useConversation';

/** Signed, short-lived URL for private media; falls back to the attachment's own URL (local or demo). */
function useAttachmentUrl(a: Attachment): string | undefined {
  const repo = useRepo();
  const q = useQuery({
    queryKey: key('media', 'url', a.mediaId),
    queryFn: () => repo.media.playbackUrl(a.mediaId!),
    enabled: !!a.mediaId,
    staleTime: 5 * 60_000,
  });
  return a.mediaId ? (q.data ?? (a.url.startsWith('file:') ? a.url : undefined)) : a.url;
}

function AttachmentView({ attachment: a }: { attachment: Attachment }) {
  const t = useTheme();
  const { t: tr } = useTranslation('messages');
  const url = useAttachmentUrl(a);
  if (a.kind === 'image') {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={tr('thread.photo', { name: a.name })}
        style={{ width: 220, height: 165, borderRadius: t.radius.md, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt }}
      >
        {url ? <Image source={{ uri: url }} style={{ width: 220, height: 165 }} contentFit="cover" transition={150} /> : null}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tr('thread.openFile', { name: a.name })}
      disabled={!url}
      onPress={() => url && void Linking.openURL(url)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minHeight: 44, paddingHorizontal: t.space[3], borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt }}
    >
      <FileText size={18} color={t.colors.textMuted} />
      <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
        {a.name}
      </Text>
    </Pressable>
  );
}

export function DaySeparator({ date }: { date: ISODate }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const l = dayLabel(date);
  const text = l.kind === 'today' ? tr('common:time.today') : l.kind === 'yesterday' ? tr('common:time.yesterday') : formatDay(date);
  return (
    <View style={{ alignItems: 'center', paddingVertical: t.space[3] }}>
      <View style={{ paddingHorizontal: t.space[3], paddingVertical: 4, borderRadius: t.radius.pill, backgroundColor: t.colors.surfaceAlt }}>
        <Text variant="caption" color="textMuted" weight="medium" accessibilityRole="header">
          {text}
        </Text>
      </View>
    </View>
  );
}

export function MessageBubble({ item, myName }: { item: Extract<ChatItem, { type: 'message' }>; myName: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('messages');
  const m = item.message;
  const mine = item.mine;
  const pending = isPendingMessage(m);
  const receipt = mine && item.showReceipt && !pending ? receiptText(tr, readReceipt(m.readBy, myName)) : null;
  const seen = mine && item.showReceipt && readReceipt(m.readBy, myName).kind === 'seen';
  const role = tr(`common:roles.${m.senderRole}`);
  const time = formatTime(m.createdAt);
  const r = t.radius.lg;

  return (
    <View
      testID={`msg-${m.id}`}
      style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginTop: item.firstInGroup ? t.space[3] : 2 }}
      accessible
      accessibilityLabel={`${mine ? tr('thread.you') : `${m.senderName}, ${role}`}: ${m.body}. ${time}${receipt ? `. ${receipt}` : ''}`}
    >
      {item.firstInGroup && !mine ? (
        <Text variant="caption" color="textMuted" style={{ marginBottom: 4, marginLeft: 4 }} numberOfLines={1}>
          <Text variant="caption" weight="semibold" color="text">
            {m.senderName}
          </Text>
          {` · ${role}`}
        </Text>
      ) : null}
      <View
        style={{
          maxWidth: '84%',
          gap: t.space[2],
          paddingHorizontal: t.space[3],
          paddingVertical: t.space[2] + 2,
          borderRadius: r,
          borderBottomRightRadius: mine && item.lastInGroup ? 6 : r,
          borderBottomLeftRadius: !mine && item.lastInGroup ? 6 : r,
          backgroundColor: mine ? t.colors.primarySoft : t.colors.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: t.colors.border,
          opacity: pending ? 0.75 : 1,
        }}
      >
        {m.attachments.map((a, i) => (
          <AttachmentView key={`${a.name}-${i}`} attachment={a} />
        ))}
        {m.body ? <Text>{m.body}</Text> : null}
      </View>
      {item.lastInGroup || receipt || pending ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginHorizontal: 4 }}>
          {pending ? <Clock size={12} color={t.colors.textSubtle} /> : null}
          <Text variant="caption" color="textSubtle">
            {pending ? tr('thread.sending') : time}
          </Text>
          {receipt ? (
            <>
              <Text variant="caption" color="textSubtle">
                ·
              </Text>
              {seen ? <CheckCheck size={14} color={t.colors.success} /> : <Check size={14} color={t.colors.textSubtle} />}
              <Text variant="caption" color={seen ? 'success' : 'textSubtle'} testID="receipt">
                {receipt}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
