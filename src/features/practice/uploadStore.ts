/**
 * Background video upload progress, read by the Practice tab and the Log screen.
 * `uploaded` (clientId → mediaId) is persisted so a retry never re-uploads the same video.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UUID } from '@/domain/types';

import type { SyncPhase, UploadMemo } from './outboxLogic';

interface UploadProgress {
  phase: SyncPhase;
  /** 0..1 */
  value: number;
}

interface UploadState {
  progress: Record<string, UploadProgress>;
  uploaded: Record<string, UUID>;
  setProgress: (clientId: string, phase: SyncPhase, value: number) => void;
  clearProgress: (clientId: string) => void;
}

export const useUploadStore = create<UploadState>()(
  persist(
    (set) => ({
      progress: {},
      uploaded: {},
      setProgress: (clientId, phase, value) => set((s) => ({ progress: { ...s.progress, [clientId]: { phase, value } } })),
      clearProgress: (clientId) =>
        set((s) => {
          const { [clientId]: _drop, ...rest } = s.progress;
          return { progress: rest };
        }),
    }),
    {
      name: 'mkt.practice.uploads',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ uploaded: s.uploaded }),
    },
  ),
);

export const uploadMemo: UploadMemo = {
  get: (clientId) => useUploadStore.getState().uploaded[clientId],
  set: (clientId, mediaId) => useUploadStore.setState((s) => ({ uploaded: { ...s.uploaded, [clientId]: mediaId } })),
  clear: (clientId) =>
    useUploadStore.setState((s) => {
      const { [clientId]: _drop, ...rest } = s.uploaded;
      return { uploaded: rest };
    }),
};

/** Progress for one queued log, or undefined when it hasn't started uploading. */
export function useUploadProgress(clientId: string | undefined): UploadProgress | undefined {
  return useUploadStore((s) => (clientId ? s.progress[clientId] : undefined));
}
