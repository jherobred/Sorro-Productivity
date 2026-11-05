'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrefs } from './prefs';
import { useTasks } from './tasks';
import { useEvents } from './events';
import { foxTalk } from './foxMood';
import { fetchNudgeLine } from './assistant';
import { buildFacts, claimNudge, nextNudge, nudgeLine, onFoxReact, reactionNudge, readLog, DEFAULT_FOX_TIMES, type Nudge } from './foxNudges';

export type ShownNudge = Nudge & { line: string };

/** Runs the fox's rules on this device and holds the bubble it should show. */
export function useFoxNudges(): { nudge: ShownNudge | null; dismiss(): void } {
  const { prefs } = usePrefs();
  const on = prefs.fox?.proactive !== false;
  const times = useMemo(() => ({ morning: prefs.fox?.morning || DEFAULT_FOX_TIMES.morning, evening: prefs.fox?.evening || DEFAULT_FOX_TIMES.evening }), [prefs.fox?.morning, prefs.fox?.evening]);
  const tasks = useTasks();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const events = useEvents(today, 1);
  const [nudge, setNudge] = useState<ShownNudge | null>(null);
  const facts = useRef(buildFacts([], [], new Date()));
  facts.current = buildFacts(tasks.data ?? [], events.data ?? [], new Date());

  const show = useCallback(async (n: Nudge) => {
    // Claimed before the wording is fetched, so a second window or the next tick cannot show it too.
    if (!claimNudge(localStorage, n, new Date())) return;
    const line = await nudgeLine(n, fetchNudgeLine);
    setNudge({ ...n, line });
    foxTalk(true);
  }, []);

  const loaded = tasks.isSuccess;
  useEffect(() => {
    // Waits for real tasks, so the morning plan never says "clear day" off an empty cache.
    if (!on || !loaded) return;
    const check = () => { const now = new Date(); const n = nextNudge(now, facts.current, readLog(localStorage, now), times); if (n) void show(n); };
    check();
    const tick = setInterval(check, 60_000);
    const seen = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', seen);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', seen); };
  }, [on, loaded, times, show]);

  useEffect(() => {
    if (!on) return;
    return onFoxReact(e => { const n = reactionNudge(e, readLog(localStorage, new Date()), Date.now()); if (n) void show(n); });
  }, [on, show]);

  const dismiss = useCallback(() => { setNudge(null); foxTalk(false); }, []);
  return { nudge, dismiss };
}
