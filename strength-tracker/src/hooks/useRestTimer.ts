import { useCallback, useEffect, useRef, useState } from 'react';

export interface RestTimer {
  /** Seconds left, 0 when idle or finished. */
  remaining: number;
  running: boolean;
  /** True from the moment a timer hits zero until it is dismissed or restarted. */
  finished: boolean;
  start: (seconds: number) => void;
  stop: () => void;
  extend: (seconds: number) => void;
  totalSeconds: number;
}

/**
 * Wall-clock based so that locking the phone mid-rest does not pause the timer.
 */
export function useRestTimer(onFinished: () => void): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [finished, setFinished] = useState(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (endsAt === null) return;

    const tick = () => {
      const left = Math.max(0, (endsAt - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        setEndsAt(null);
        setFinished(true);
        onFinishedRef.current();
      }
    };

    tick();
    const handle = window.setInterval(tick, 250);
    // A phone that slept through the end still fires as soon as it wakes.
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(handle);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    setTotalSeconds(seconds);
    setFinished(false);
    setRemaining(seconds);
    setEndsAt(Date.now() + seconds * 1000);
  }, []);

  const stop = useCallback(() => {
    setEndsAt(null);
    setRemaining(0);
    setFinished(false);
  }, []);

  const extend = useCallback((seconds: number) => {
    setEndsAt((current) => (current === null ? null : current + seconds * 1000));
    setTotalSeconds((current) => current + seconds);
  }, []);

  return { remaining, running: endsAt !== null, finished, start, stop, extend, totalSeconds };
}
