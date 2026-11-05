import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { Attachment, Message, Role, UUID } from '@/domain/types';
import { uuid } from '@/lib/id';

import { sortMessages } from './grouping';
import { messagesKey, threadsKey } from './queries';

export interface PickedImage {
  uri: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
}

export interface SendInput {
  body: string;
  image?: PickedImage;
}

export const TEMP_PREFIX = 'temp-';
export const isPendingMessage = (m: Pick<Message, 'id'>) => m.id.startsWith(TEMP_PREFIX);

/**
 * Optimistic send: the bubble appears at once ("Sending…"), the photo uploads to private storage
 * first, and on failure the bubble is removed so the composer can restore the draft.
 */
export function useSendMessage(threadId: UUID, me: { id: UUID; name: string; role: Role }) {
  const repo = useRepo();
  const qc = useQueryClient();
  const k = messagesKey(threadId);
  return useMutation({
    mutationFn: async ({ body, image }: SendInput) => {
      let attachments: Attachment[] | undefined;
      if (image) {
        const media = await repo.media.upload({ localUri: image.uri, kind: 'image', sizeBytes: image.sizeBytes, mimeType: image.mimeType });
        attachments = [{ kind: 'image', name: image.name, url: image.uri, mediaId: media.id }];
      }
      return repo.messaging.send(threadId, body, attachments);
    },
    onMutate: async ({ body, image }) => {
      await qc.cancelQueries({ queryKey: k });
      const prev = qc.getQueryData<Message[]>(k);
      const tempId = `${TEMP_PREFIX}${uuid()}`;
      const temp: Message = {
        id: tempId,
        threadId,
        senderId: me.id,
        senderName: me.name,
        senderRole: me.role,
        body,
        attachments: image ? [{ kind: 'image', name: image.name, url: image.uri }] : [],
        createdAt: new Date().toISOString(),
        readBy: [],
      };
      qc.setQueryData<Message[]>(k, (old) => [...(old ?? []), temp]);
      return { prev, tempId };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData<Message[]>(k, (old) => (old ?? []).filter((m) => m.id !== ctx.tempId));
    },
    onSuccess: (msg, _v, ctx) => {
      qc.setQueryData<Message[]>(k, (old) => [...(old ?? []).filter((m) => m.id !== ctx?.tempId && m.id !== msg.id), msg]);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: threadsKey() }),
  });
}

/** Marks the thread read when it opens and whenever a new message arrives while it's on screen. */
export function useMarkRead(threadId: UUID | undefined, focused: boolean, messages: Message[] | undefined) {
  const repo = useRepo();
  const qc = useQueryClient();
  const marked = useRef<string | null>(null);
  const sorted = messages ? sortMessages(messages).filter((m) => !isPendingMessage(m)) : [];
  const lastId = sorted.length ? sorted[sorted.length - 1].id : null;
  useEffect(() => {
    if (!threadId || !focused || !lastId || marked.current === lastId) return;
    marked.current = lastId;
    repo.messaging
      .markRead(threadId)
      .then(() => {
        void qc.invalidateQueries({ queryKey: key('messaging', 'unread') });
        void qc.invalidateQueries({ queryKey: threadsKey() });
      })
      .catch(() => {
        marked.current = null;
      });
  }, [threadId, focused, lastId, repo, qc]);
}
