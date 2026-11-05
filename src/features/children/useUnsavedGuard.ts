import { router, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { confirm } from '@/ui';

/**
 * Asks before leaving a form with unsaved changes (back button, hardware back, swipe).
 * Call `leave()` after a successful save to go back without the prompt.
 */
export function useUnsavedGuard(dirty: boolean) {
  const { t } = useTranslation('child');
  const [released, setReleased] = useState(false);
  const next = useRef<(() => void) | null>(null);

  usePreventRemove(dirty && !released, ({ repeat }) => {
    void confirm({
      title: t('unsaved.title'),
      body: t('unsaved.body'),
      confirmLabel: t('unsaved.discard'),
      cancelLabel: t('unsaved.keep'),
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      next.current = repeat;
      setReleased(true);
    });
  });

  // Navigation continues only after the guard is lifted (next render).
  useEffect(() => {
    if (released && next.current) {
      const go = next.current;
      next.current = null;
      go();
    }
  }, [released]);

  return {
    /** Leave the screen without asking (e.g. after saving). */
    leave: (go: () => void = () => (router.canGoBack() ? router.back() : router.replace('/'))) => {
      next.current = go;
      setReleased(true);
    },
  };
}
