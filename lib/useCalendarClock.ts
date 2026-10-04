'use client';
import { useEffect, useState } from 'react';
import { usePrefs } from './prefs';

/** Power save updates once per minute, and hidden tabs stop ticking entirely. */
export function useCalendarClock(normalInterval = 1000) {
  const powerSave = !!usePrefs().prefs.calendarPowerSave;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const visible = () => {
      clearInterval(timer);
      if (document.hidden) return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), powerSave ? 60_000 : normalInterval);
    };
    visible(); document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [powerSave, normalInterval]);
  return now;
}
