import { useEffect, useSyncExternalStore } from 'react';

export type FoxMood = 'sit' | 'run' | 'sleep' | 'glad' | 'talk';

const IDLE_MS = 300_000;

/** What the fox in the corner is doing: glad for a moment after a win, alert with a reply you have not read, running while work is in flight, asleep when you are away. */
export function foxMood(s: { busy: number; lastInputAt: number; now: number; gladUntil: number; motion: boolean; talking: boolean }): FoxMood {
  if (s.now < s.gladUntil) return 'glad';
  if (s.talking) return 'talk';
  if (s.busy > 0 && s.motion) return 'run';
  if (s.now - s.lastInputAt >= IDLE_MS) return 'sleep';
  return 'sit';
}

const state = { busy: 0, work: false, lastInputAt: Date.now(), gladUntil: 0, talking: false };
let mood: FoxMood = 'sit';
const listeners = new Set<() => void>();

function recompute() {
  const motion = typeof document === 'undefined' || !document.documentElement.classList.contains('nomo');
  const next = foxMood({ ...state, busy: state.busy + (state.work ? 1 : 0), now: Date.now(), motion });
  if (next !== mood) { mood = next; listeners.forEach(f => f()); }
}

/** Whether data is loading or saving right now (the Shell feeds this from TanStack). */
export function foxWork(on: boolean) { if (state.work !== on) { state.work = on; recompute(); } }

/** +1 when work starts, -1 when it ends. */
export function foxBusy(delta: 1 | -1) { state.busy = Math.max(0, state.busy + delta); recompute(); }

/** Runs for a short while, for a moment of travel such as a tab change. */
export function foxDash(ms = 700) { foxBusy(1); setTimeout(() => foxBusy(-1), ms); }

/** On while the fox has a reply the user has not opened. */
export function foxTalk(on: boolean) { if (state.talking !== on) { state.talking = on; recompute(); } }

export function foxGlad(ms = 1600) { state.gladUntil = Date.now() + ms; recompute(); setTimeout(recompute, ms + 20); }

export function useFoxMood(): FoxMood {
  useEffect(() => {
    const input = () => { state.lastInputAt = Date.now(); recompute(); };
    window.addEventListener('pointerdown', input, { passive: true });
    window.addEventListener('keydown', input);
    const tick = setInterval(recompute, 15_000);
    return () => { window.removeEventListener('pointerdown', input); window.removeEventListener('keydown', input); clearInterval(tick); };
  }, []);
  return useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, () => mood, () => 'sit' as FoxMood);
}
