/**
 * State machine for the optional practice video: pick → check length → compress (with progress)
 * → check size → keep a private local copy for the upload queue.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { checkVideoDuration, checkVideoSize, type LocalVideo, type VideoProblem } from '../logic';
import { compressVideo, deleteLocalVideo, fileSizeBytes, keepForUpload } from './device';
import { cameraAccess, chooseVideo, recordVideo, requestCameraAccess, type PickResult } from './pickVideo';

export type AttachProblem = VideoProblem | 'failed' | 'camera_denied' | 'camera_blocked';

export type AttachState =
  | { kind: 'idle' }
  | { kind: 'preparing'; progress: number }
  | { kind: 'ready'; video: LocalVideo }
  | { kind: 'problem'; problem: AttachProblem };

export interface UseVideoAttachment {
  state: AttachState;
  record: () => Promise<void>;
  choose: () => Promise<void>;
  remove: () => void;
  /** Call once the log is queued: the outbox now owns the file, so don't delete it on unmount. */
  handOver: () => void;
}

/**
 * @param fileName stable name for the private copy (the log's clientId)
 * @param explainCamera shown before the very first camera permission prompt; resolve false to stop
 */
export function useVideoAttachment(fileName: string, explainCamera: () => Promise<boolean>): UseVideoAttachment {
  const [state, setState] = useState<AttachState>({ kind: 'idle' });
  const current = useRef<LocalVideo | null>(null);
  const handedOver = useRef(false);

  useEffect(
    () => () => {
      if (!handedOver.current && current.current) deleteLocalVideo(current.current.localUri);
    },
    [],
  );

  const process = useCallback(
    async (pick: () => Promise<PickResult>) => {
      let picked: PickResult;
      try {
        picked = await pick();
      } catch {
        setState({ kind: 'problem', problem: 'failed' });
        return;
      }
      if (picked.status === 'cancelled') return;

      const lengthProblem = checkVideoDuration(picked.durationS);
      if (lengthProblem) {
        setState({ kind: 'problem', problem: lengthProblem });
        return;
      }

      setState({ kind: 'preparing', progress: 0 });
      try {
        const compressed = await compressVideo(picked.uri, (p) => setState({ kind: 'preparing', progress: Math.max(0, Math.min(1, p)) }));
        const sizeBytes = fileSizeBytes(compressed) ?? picked.sizeBytes ?? 0;
        const sizeProblem = checkVideoSize(sizeBytes);
        if (sizeProblem) {
          if (compressed !== picked.uri) deleteLocalVideo(compressed);
          setState({ kind: 'problem', problem: sizeProblem });
          return;
        }
        const localUri = await keepForUpload(compressed, fileName);
        if (localUri !== compressed && compressed !== picked.uri) deleteLocalVideo(compressed);
        if (current.current && current.current.localUri !== localUri) deleteLocalVideo(current.current.localUri);
        const video: LocalVideo = { localUri, durationS: picked.durationS ?? 0, sizeBytes };
        current.current = video;
        setState({ kind: 'ready', video });
      } catch {
        setState({ kind: 'problem', problem: 'failed' });
      }
    },
    [fileName],
  );

  const record = useCallback(async () => {
    try {
      let access = await cameraAccess();
      if (access === 'undetermined') {
        if (!(await explainCamera())) return;
        access = await requestCameraAccess();
      } else if (access === 'denied') {
        access = await requestCameraAccess();
      }
      if (access !== 'granted') {
        setState({ kind: 'problem', problem: access === 'blocked' ? 'camera_blocked' : 'camera_denied' });
        return;
      }
    } catch {
      setState({ kind: 'problem', problem: 'failed' });
      return;
    }
    await process(recordVideo);
  }, [explainCamera, process]);

  const choose = useCallback(() => process(chooseVideo), [process]);

  const remove = useCallback(() => {
    if (current.current) deleteLocalVideo(current.current.localUri);
    current.current = null;
    setState({ kind: 'idle' });
  }, []);

  const handOver = useCallback(() => {
    handedOver.current = true;
  }, []);

  return { state, record, choose, remove, handOver };
}
