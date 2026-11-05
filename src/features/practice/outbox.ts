/**
 * Outbox handlers for parent writes that must survive no-network:
 *   - 'homeLog.create'  upload the video (if any) with progress, then save the log
 *   - 'checkin.submit'  morning check-in
 * The integrator calls registerPracticeOutbox() once at app start. Screens that enqueue also call
 * it (registration is idempotent) so a handler is always present when the user saves.
 */
import { registerOutboxHandler } from '@/data/outbox';
import { invalidate } from '@/data/queryClient';
import { RepoError } from '@/data/repository';
import { usePreferences } from '@/state/preferences';

import { isCheckinInput } from '../checkins/logic';
import { CHECKIN_KIND, HOME_LOG_KIND, homeLogNeedsWifi, isHomeLogPayload, syncHomeLog } from './outboxLogic';
import { uploadMemo, useUploadStore } from './uploadStore';
import { deleteLocalVideo } from './video/device';

let registered = false;

export function registerPracticeOutbox(): void {
  if (registered) return;
  registered = true;

  registerOutboxHandler(
    HOME_LOG_KIND,
    async (payload, repo) => {
      if (!isHomeLogPayload(payload)) throw new RepoError('validation', 'Malformed home log payload');
      const { setProgress, clearProgress } = useUploadStore.getState();
      try {
        await syncHomeLog(payload, repo, {
          memo: uploadMemo,
          onProgress: (clientId, phase, value) => setProgress(clientId, phase, value),
          cleanup: deleteLocalVideo,
        });
      } finally {
        clearProgress(payload.clientId);
      }
    },
    {
      needsWifi: (payload) => homeLogNeedsWifi(payload, usePreferences.getState().uploadOnWifiOnly),
      onSynced: () => void invalidate('homePractice', 'dashboards', 'notifications'),
    },
  );

  registerOutboxHandler(
    CHECKIN_KIND,
    async (payload, repo) => {
      if (!isCheckinInput(payload)) throw new RepoError('validation', 'Malformed check-in payload');
      await repo.checkins.submit(payload);
    },
    { onSynced: () => void invalidate('appointments', 'checkins', 'dashboards', 'sessions') },
  );
}
