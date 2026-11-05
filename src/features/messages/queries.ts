import { useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { UUID } from '@/domain/types';

export const threadsKey = () => key('messaging', 'threads');
export const threadKey = (threadId: UUID) => key('messaging', 'thread', threadId);
export const messagesKey = (threadId: UUID) => key('messaging', 'messages', threadId);
export const announcementsKey = () => key('messaging', 'announcements');

export function useThreads() {
  const repo = useRepo();
  return useQuery({ queryKey: threadsKey(), queryFn: () => repo.messaging.listThreads() });
}

export function useThread(threadId: UUID | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: threadKey(threadId ?? ''), queryFn: () => repo.messaging.getThread(threadId!), enabled: !!threadId });
}

/** Polls every 15 s while the conversation is on screen. */
export function useMessages(threadId: UUID | undefined, focused: boolean) {
  const repo = useRepo();
  return useQuery({
    queryKey: messagesKey(threadId ?? ''),
    queryFn: () => repo.messaging.listMessages(threadId!, { limit: 200 }),
    enabled: !!threadId,
    refetchInterval: focused ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useAnnouncements() {
  const repo = useRepo();
  return useQuery({ queryKey: announcementsKey(), queryFn: () => repo.messaging.listAnnouncements() });
}
