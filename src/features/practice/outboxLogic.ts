/**
 * Pure sequencing for the home-log outbox item: upload the video (if any) first, then save the log
 * with the new media id. Kept free of React / native imports so it can be unit-tested.
 */
import type { Repository } from '@/data/repository';
import type { HomeLog, HomeLogInput, UUID } from '@/domain/types';

export const HOME_LOG_KIND = 'homeLog.create';
export const CHECKIN_KIND = 'checkin.submit';

/** What the Log Practice screen enqueues. Extra display fields are never sent to the repository. */
export interface HomeLogPayload extends HomeLogInput {
  childId?: UUID;
  childName?: string;
  taskTitle?: string;
}

export function isHomeLogPayload(p: unknown): p is HomeLogPayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.clientId === 'string' && typeof o.taskId === 'string' && typeof o.outcome === 'string';
}

/** Video items wait for Wi-Fi only when the user turned on "Upload videos on Wi-Fi only". */
export function homeLogNeedsWifi(payload: unknown, uploadOnWifiOnly: boolean): boolean {
  return uploadOnWifiOnly && isHomeLogPayload(payload) && !!payload.video;
}

/**
 * Remembers media already uploaded for a log, so a retry after "upload ok, log failed"
 * doesn't upload the same video twice.
 */
export interface UploadMemo {
  get(clientId: string): UUID | undefined;
  set(clientId: string, mediaId: UUID): void;
  clear(clientId: string): void;
}

export type SyncPhase = 'uploading' | 'saving';

export interface HomeLogSyncHooks {
  memo: UploadMemo;
  onProgress?: (clientId: string, phase: SyncPhase, progress: number) => void;
  /** Remove the local copy once the server has it (best effort, never throws). */
  cleanup?: (localUri: string) => void | Promise<void>;
}

export async function syncHomeLog(
  payload: HomeLogPayload,
  repo: Pick<Repository, 'media' | 'homePractice'>,
  hooks: HomeLogSyncHooks,
): Promise<HomeLog> {
  const { clientId, taskId, outcome, difficulty, note, video } = payload;
  let mediaId: UUID | undefined;

  if (video) {
    mediaId = hooks.memo.get(clientId);
    if (!mediaId) {
      hooks.onProgress?.(clientId, 'uploading', 0);
      const media = await repo.media.upload(
        { localUri: video.localUri, kind: 'video', durationS: video.durationS, sizeBytes: video.sizeBytes, mimeType: 'video/mp4' },
        (p) => hooks.onProgress?.(clientId, 'uploading', Math.max(0, Math.min(1, p))),
      );
      mediaId = media.id;
      hooks.memo.set(clientId, mediaId);
    }
    hooks.onProgress?.(clientId, 'saving', 1);
  }

  const input: HomeLogInput & { mediaId?: UUID } = { clientId, taskId, outcome, difficulty, note, ...(video ? { video } : {}), ...(mediaId ? { mediaId } : {}) };
  const log = await repo.homePractice.log(input);

  if (video) {
    hooks.memo.clear(clientId);
    try {
      await hooks.cleanup?.(video.localUri);
    } catch {
      // The OS clears app files eventually; a leftover copy is harmless.
    }
  }
  return log;
}
