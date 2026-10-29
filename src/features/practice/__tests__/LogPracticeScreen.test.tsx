import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useOutboxStore } from '@/data/outbox';
import type { Repository } from '@/data/repository';
import type { Consent } from '@/domain/types';

import { HOME_LOG_KIND, type HomeLogPayload } from '../outboxLogic';
import { LogPracticeScreen } from '../screens/LogPracticeScreen';
import { makeTask, renderWithProviders, signInAs } from '../testing';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('react-native-compressor', () => ({ Video: { compress: jest.fn() } }));

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return true;
    }
    get size() {
      return 6 * 1024 * 1024;
    }
    async copy() {}
    delete() {}
  }
  class Directory {
    uri: string;
    exists = true;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    create() {}
  }
  return { File, Directory, Paths: { document: { uri: 'file:///doc' } } };
});

jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ status: 'readyToPlay', loop: false, addListener: () => ({ remove: () => undefined }) }),
  VideoView: () => null,
}));

const mockRouter = jest.requireMock<{ router: Record<'push' | 'back' | 'replace', jest.Mock> }>('expo-router').router;
const mockPicker = jest.requireMock<Record<'getCameraPermissionsAsync' | 'requestCameraPermissionsAsync' | 'launchCameraAsync' | 'launchImageLibraryAsync', jest.Mock>>('expo-image-picker');
const mockCompress = jest.requireMock<{ Video: { compress: jest.Mock } }>('react-native-compressor').Video.compress;

let mockConsents: Consent[] = [];
const mockRepo = {
  homePractice: { getTask: jest.fn(async () => ({ ...makeTask(), logs: [] })) },
  children: {
    get: jest.fn(async () => ({ child: { id: 'c1', fullName: 'Aarav Sharma', preferredName: 'Aarav' }, profile: {}, guardians: [], therapists: [], access: 'parent' })),
  },
  me: { listConsents: jest.fn(async () => mockConsents) },
} as unknown as Repository;

jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));

/** Newest queued home log (the in-memory outbox storage lives for the whole file). */
function queuedPayload(): HomeLogPayload | undefined {
  const items = useOutboxStore.getState().items.filter((i) => i.kind === HOME_LOG_KIND);
  return items[items.length - 1]?.payload as HomeLogPayload | undefined;
}

beforeEach(() => {
  mockConsents = [];
  useOutboxStore.setState({ items: [], online: true, onWifi: true });
  jest.clearAllMocks();
  signInAs('parent');
});

describe('LogPracticeScreen', () => {
  it('asks for both choices, then saves a text log to the outbox', async () => {
    await renderWithProviders(<LogPracticeScreen taskId="t1" />);
    await screen.findByText('How did it go?');
    expect(screen.getByText('Bubbles and "more"')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('log-submit'));
    expect(await screen.findByText('Please choose how it went and how hard it was.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: 'Done' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Easy' }));
    await fireEvent.changeText(screen.getByTestId('log-note'), ' He asked for more! ');
    await fireEvent.press(screen.getByTestId('log-submit'));

    expect(await screen.findByTestId('log-saved')).toBeTruthy();
    expect(screen.getByText("Thank you. Aarav's therapist will see this.")).toBeTruthy();
    expect(queuedPayload()).toMatchObject({ taskId: 't1', outcome: 'done', difficulty: 'easy', note: 'He asked for more!', childName: 'Aarav' });
    expect(queuedPayload()?.video).toBeUndefined();
  });

  it('hides the video option when video consent was withdrawn', async () => {
    mockConsents = [{ id: 'x', userId: 'u-parent', kind: 'video_upload', granted: false, at: '2026-10-01T00:00:00Z', version: '1' }];
    await renderWithProviders(<LogPracticeScreen taskId="t1" />);
    expect(await screen.findByTestId('video-consent-off')).toBeTruthy();
    expect(screen.queryByText('Record video')).toBeNull();
    await fireEvent.press(screen.getByText('Change in Consent & privacy'));
    expect(mockRouter.push).toHaveBeenCalledWith('/account/privacy');
  });

  it('kindly rejects a video longer than 60 seconds without compressing it', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///long.mp4', duration: 95_000, fileSize: 40_000_000 }] });
    await renderWithProviders(<LogPracticeScreen taskId="t1" />);
    await fireEvent.press(await screen.findByTestId('video-gallery'));
    expect(await screen.findByText(/longer than 60 seconds/)).toBeTruthy();
    expect(mockCompress).not.toHaveBeenCalled();
  });

  it('compresses to 720p, previews, and queues the log with the private video', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///clip.mp4', duration: 31_000, fileSize: 40_000_000 }] });
    mockCompress.mockImplementation(async (_uri: string, _opts: unknown, onProgress: (p: number) => void) => {
      onProgress(0.5);
      return 'file:///cache/compressed.mp4';
    });
    await renderWithProviders(<LogPracticeScreen taskId="t1" />);
    await fireEvent.press(await screen.findByTestId('video-gallery'));
    expect(await screen.findByText('Video ready · 31 sec')).toBeTruthy();
    expect(mockPicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['videos'] }));
    expect(mockCompress).toHaveBeenCalledWith('file:///clip.mp4', expect.objectContaining({ compressionMethod: 'auto', maxSize: 720 }), expect.any(Function));

    await fireEvent.press(screen.getByRole('radio', { name: 'Partly' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Hard' }));
    await fireEvent.press(screen.getByTestId('log-submit'));
    expect(await screen.findByText('Saved. The video will upload in the background. You can close the app.')).toBeTruthy();
    const payload = queuedPayload();
    expect(payload?.video).toMatchObject({ durationS: 31, sizeBytes: 6 * 1024 * 1024 });
    expect(payload?.video?.localUri).toMatch(/practice-videos/);
  });

  it('explains the camera before the first permission prompt and handles a blocked camera', async () => {
    mockPicker.getCameraPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
    await renderWithProviders(<LogPracticeScreen taskId="t1" />);
    await fireEvent.press(await screen.findByTestId('video-record'));
    await waitFor(() => expect(screen.getByText(/Camera access is turned off/)).toBeTruthy());
    expect(screen.getByText('Open settings')).toBeTruthy();
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
  });
});
