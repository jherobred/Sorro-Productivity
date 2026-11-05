'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPrefs, prefsLoaded, usePrefs } from './prefs';
import { useTasks } from './tasks';
import { useEvents } from './events';
import { foxTalk } from './foxMood';
import { fetchNudgeLine } from './assistant';
import { replaceScheduled, showAlerts } from './deviceNotify';
import { buildFacts, claimNudge, dayKey, foxAlertId, foxSchedule, nextNudge, nudgeLine, onFoxReact, reactionNudge, readLog, DEFAULT_FOX_TIMES, FOX_ALERT_IDS, type Nudge } from './foxNudges';

export type ShownNudge = Nudge & { line: string };

/** Runs the fox's rules on this device and holds the bubble it should show. */
export function useFoxNudges(): { nudge: ShownNudge | null; dismiss(): void } {
  const { prefs } = usePrefs();
  const on = prefs.fox?.proactive !== false;
  const notify = on && !!prefs.fox?.notify;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const times = useMemo(() => ({ morning: prefs.fox?.morning || DEFAULT_FOX_TIMES.morning, evening: prefs.fox?.evening || DEFAULT_FOX_TIMES.evening }), [prefs.fox?.morning, prefs.fox?.evening]);
  const tasks = useTasks();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const events = useEvents(today, 1);
  const [nudge, setNudge] = useState<ShownNudge | null>(null);
  const facts = useRef(buildFacts([], [], new Date()));
  facts.current = buildFacts(tasks.data ?? [], events.data ?? [], new Date());

  const show = useCallback(async (n: Nudge) => {
    // Read live: the first render runs on default prefs, before this device's and the account's arrive.
    if (!prefsLoaded() || getPrefs().fox?.proactive === false) return;
    // Claimed before the wording is fetched, so a second window or the next tick cannot show it too.
    if (!claimNudge(localStorage, n, new Date())) return;
    const line = await nudgeLine(n, fetchNudgeLine);
    setNudge({ ...n, line });
    foxTalk(true);
    // Web and Windows: a browser notification only while the app is open in the background.
    if (notifyRef.current && document.visibilityState === 'hidden') void showAlerts([{ id: foxAlertId(n.key), title: 'Sorro', body: line }]).catch(() => {});
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
  }, [on, loaded, times, show, prefs]);

  useEffect(() => {
    if (!on) return;
    return onFoxReact(e => { const n = reactionNudge(e, readLog(localStorage, new Date()), Date.now()); if (n) void show(n); });
  }, [on, show]);

  // The phone app: tomorrow's morning and the next evening notification, replaced on every open. Off cancels them.
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
  const dueTomorrow = (tasks.data ?? []).filter(t => !t.done && !t.deleted_at && t.due_on === tomorrow).length;
  useEffect(() => {
    if (!loaded) return;
    void replaceScheduled(FOX_ALERT_IDS, notify ? foxSchedule(new Date(), { dueTomorrow }, times) : []).catch(() => {});
  }, [loaded, notify, times, dueTomorrow]);

  const dismiss = useCallback(() => { setNudge(null); foxTalk(false); }, []);
  return { nudge, dismiss };
}
