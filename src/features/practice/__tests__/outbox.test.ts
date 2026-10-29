import { enqueue, processOutbox, startOutbox, stopOutbox, useOutboxStore } from '@/data/outbox';
import type { Repository } from '@/data/repository';
import type { HomeLog, HomeLogInput, Media, UUID } from '@/domain/types';
import { usePreferences } from '@/state/preferences';

import { registerPracticeOutbox } from '../outbox';
import { HOME_LOG_KIND, homeLogNeedsWifi, syncHomeLog, type HomeLogPayload, type UploadMemo } from '../outboxLogic';
import { useUploadStore } from '../uploadStore';

jest.mock('react-native-compressor', () => ({ Video: { compress: jest.fn() } }));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    exists = false;
    size = 0;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {}
  },
  Directory: class {},
  Paths: { document: 'file:///doc' },
}));

const video = { localUri: 'file:///doc/practice-videos/cid.mp4', durationS: 30, sizeBytes: 4_000_000 };
const base: HomeLogPayload = { clientId: 'cid', taskId: 't1', outcome: 'done', difficulty: 'easy', note: 'fun', childName: 'Aarav', taskTitle: 'Bubbles' };

function fakeRepo(opts?: { failLogTimes?: number }) {
  const calls: string[] = [];
  let failures = opts?.failLogTimes ?? 0;
  const repo = {
    media: {
      upload: jest.fn(async (_input: unknown, onProgress?: (p: number) => void) => {
        calls.push('upload');
        onProgress?.(0.5);
        onProgress?.(1);
        return { id: 'media-1' } as Media;
      }),
    },
    homePractice: {
      log: jest.fn(async (input: HomeLogInput & { mediaId?: UUID }) => {
        calls.push(`log:${input.mediaId ?? 'none'}`);
        if (failures > 0) {
          failures -= 1;
          throw new Error('network');
        }
        return { id: 'log-1' } as HomeLog;
      }),
    },
  };
  return { repo: repo as unknown as Pick<Repository, 'media' | 'homePractice'>, calls, raw: repo };
}

function memo(): UploadMemo & { store: Record<string, string> } {
  const store: Record<string, string> = {};
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v), clear: (k) => void delete store[k] };
}

describe('syncHomeLog', () => {
  it('uploads the video first, then saves the log with the media id, then cleans up', async () => {
    const { repo, calls, raw } = fakeRepo();
    const progress: [string, number][] = [];
    const cleanup = jest.fn();
    await syncHomeLog({ ...base, video }, repo, { memo: memo(), onProgress: (_c, phase, p) => progress.push([phase, p]), cleanup });
    expect(calls).toEqual(['upload', 'log:media-1']);
    expect(raw.media.upload.mock.calls[0][0]).toMatchObject({ localUri: video.localUri, kind: 'video', mimeType: 'video/mp4', sizeBytes: video.sizeBytes });
    expect(progress).toEqual([
      ['uploading', 0],
      ['uploading', 0.5],
      ['uploading', 1],
      ['saving', 1],
    ]);
    expect(cleanup).toHaveBeenCalledWith(video.localUri);
    // Display-only fields never reach the repository.
    expect(raw.homePractice.log.mock.calls[0][0]).not.toHaveProperty('childName');
  });

  it('does not upload twice when the log step failed after a successful upload', async () => {
    const { repo, calls } = fakeRepo({ failLogTimes: 1 });
    const m = memo();
    await expect(syncHomeLog({ ...base, video }, repo, { memo: m })).rejects.toThrow('network');
    expect(m.store.cid).toBe('media-1');
    await syncHomeLog({ ...base, video }, repo, { memo: m });
    expect(calls).toEqual(['upload', 'log:media-1', 'log:media-1']);
    expect(m.store.cid).toBeUndefined();
  });

  it('saves text-only logs without touching media', async () => {
    const { repo, calls } = fakeRepo();
    await syncHomeLog(base, repo, { memo: memo() });
    expect(calls).toEqual(['log:none']);
  });
});

describe('Wi-Fi gate', () => {
  it('only holds logs that carry a video, and only with the Wi-Fi-only setting', () => {
    expect(homeLogNeedsWifi({ ...base, video }, true)).toBe(true);
    expect(homeLogNeedsWifi({ ...base, video }, false)).toBe(false);
    expect(homeLogNeedsWifi(base, true)).toBe(false);
    expect(homeLogNeedsWifi({ nope: 1 }, true)).toBe(false);
  });
});

describe('registered outbox handler', () => {
  afterEach(() => stopOutbox());

  it('waits for Wi-Fi when asked, then uploads and logs once Wi-Fi is back', async () => {
    const { repo, calls } = fakeRepo();
    registerPracticeOutbox();
    await startOutbox({ repo: () => repo as Repository, demo: false });
    await new Promise((r) => setTimeout(r, 0));
    usePreferences.setState({ uploadOnWifiOnly: true });
    useOutboxStore.setState({ online: true, onWifi: false });

    await enqueue(HOME_LOG_KIND, { ...base, clientId: 'wifi-1', video }, 'Bubbles · Aarav');
    await processOutbox();
    expect(calls).toEqual([]);
    expect(useOutboxStore.getState().items).toHaveLength(1);

    useOutboxStore.setState({ onWifi: true });
    await processOutbox();
    expect(calls).toEqual(['upload', 'log:media-1']);
    expect(useOutboxStore.getState().items).toHaveLength(0);
    expect(useUploadStore.getState().progress['wifi-1']).toBeUndefined();
  });
});
