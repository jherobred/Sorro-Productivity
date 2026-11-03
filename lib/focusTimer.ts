'use client';
/**
 * One focus timer for the app: started from the Focus widget or from a task.
 * Kept in localStorage so it survives tab changes and reloads; when it runs out
 * with a task attached, the minutes are logged against that task once.
 */
const END = 'sorro-focus-end', TASK = 'sorro-focus-task', MIN = 'sorro-focus-min';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

export type FocusState = { end: number | null; taskId: string | null; minutes: number };
export function focusState(): FocusState {
  const end = Number(read(END)) || null;
  return { end, taskId: read(TASK), minutes: Number(read(MIN)) || 0 };
}
export function startFocus(minutes: number, taskId: string | null = null) {
  write(END, String(Date.now() + minutes * 60_000)); write(MIN, String(minutes)); write(TASK, taskId);
  window.dispatchEvent(new Event('sorro-focus'));
}
export function stopFocus() { write(END, null); write(TASK, null); write(MIN, null); window.dispatchEvent(new Event('sorro-focus')); }
/** A finished timer, once: returns what to log and clears it. */
export function takeFinished(now = Date.now()): { taskId: string | null; minutes: number } | null {
  const s = focusState();
  if (!s.end || s.end > now) return null;
  stopFocus();
  return { taskId: s.taskId, minutes: s.minutes };
}
