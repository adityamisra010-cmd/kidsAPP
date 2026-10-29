import { useCallback, useEffect, useState } from 'react';

import { secondsLeft } from './phone';

/** Counts down to a deadline (survives the app going to the background while waiting for SMS). */
export function useResendTimer(seconds: number) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt == null || now >= endsAt) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [endsAt, now]);

  const restart = useCallback(() => {
    const start = Date.now();
    setNow(start);
    setEndsAt(start + seconds * 1000);
  }, [seconds]);

  return { left: endsAt == null ? 0 : secondsLeft(endsAt, now), restart };
}
