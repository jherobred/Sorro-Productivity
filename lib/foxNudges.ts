/**
 * When the fox speaks first, and what it says if Gemini cannot word it.
 * Pure, no React or browser imports, so `node --test` runs it.
 */
export type NudgeKind = 'morning' | 'overdue' | 'reaction' | 'evening';
export type Facts = { dueToday: string[]; overdue: string[]; events: { title: string; time: string }[]; doneToday: number; unfinishedToday: { id: string; title: string }[] };
export type FoxTimes = { morning: string; evening: string };
export type NudgeLog = { day: string; morning: boolean; evening: boolean; overdue: number; lastOverdueAt: number; lastReactionAt: number; seen: string[] };
export type Nudge = { key: string; kind: NudgeKind; text: string; moveIds?: string[] };
export type FoxEvent =
  | { kind: 'task_done'; id: string; title: string }
  | { kind: 'streak'; id: string; title: string; days: number }
  | { kind: 'focus_end'; minutes: number; title: string | null; at: number };

export const DEFAULT_FOX_TIMES: FoxTimes = { morning: '08:00', evening: '21:00' };
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];
const LOG_KEY = 'sorro-fox-nudges';
const OVERDUE_MAX = 3;
const OVERDUE_GAP = 3 * 3_600_000;
const REACTION_GAP = 600_000;

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
const nowMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** A, B and C, and 2 more */
function list(titles: string[]): string {
  const shown = titles.slice(0, 3);
  const rest = titles.length - shown.length;
  const head = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0] ?? '';
  return rest > 0 ? `${shown.join(', ')}, and ${rest} more` : head;
}

export function freshLog(log: NudgeLog | null, day: string): NudgeLog {
  if (log && log.day === day) return log;
  return { day, morning: false, evening: false, overdue: 0, lastOverdueAt: 0, lastReactionAt: 0, seen: [] };
}

function morningText(f: Facts): string {
  if (!f.dueToday.length && !f.events.length) return 'Clear day. Nothing due, nothing booked. Suspicious, but I will allow it.';
  const parts: string[] = [];
  if (f.dueToday.length) parts.push(`due today: ${list(f.dueToday)}`);
  if (f.events.length) parts.push(`on the calendar: ${list(f.events.map(e => `${e.title} at ${e.time}`))}`);
  if (f.overdue.length) parts.push(`still waiting from before: ${list(f.overdue)}`);
  return `Morning. ${parts.join('; ')}. Start with the first one?`.replace(/^Morning\. d/, 'Morning. D');
}

/** The one thing the fox should say now, if any. Evening first, then the morning plan, then overdue. */
export function nextNudge(now: Date, f: Facts, log: NudgeLog, times: FoxTimes): Nudge | null {
  const t = nowMinutes(now);
  const day = dayKey(now);
  if (!log.evening && t >= minutes(times.evening)) {
    const left = f.unfinishedToday;
    const text = left.length
      ? `Wrap-up time. ${f.doneToday} done today. Still open: ${list(left.map(x => x.title))}. Move them to tomorrow?`
      : `Wrap-up time. ${f.doneToday} done today and nothing left hanging. Show-off.`;
    return { key: `evening:${day}`, kind: 'evening', text, ...(left.length ? { moveIds: left.map(x => x.id) } : {}) };
  }
  if (!log.morning && t < minutes(times.evening)) return { key: `morning:${day}`, kind: 'morning', text: morningText(f) };
  const quiet = now.getHours() >= 22 || now.getHours() < 7;
  if (f.overdue.length && log.overdue < OVERDUE_MAX && !quiet && now.getTime() - log.lastOverdueAt >= OVERDUE_GAP) {
    return { key: `overdue:${day}:${log.overdue + 1}`, kind: 'overdue', text: `${list(f.overdue)} ${f.overdue.length > 1 ? 'are' : 'is'} overdue and getting comfortable. Ten minutes on one?` };
  }
  return null;
}

function reactionKey(e: FoxEvent): string {
  return e.kind === 'focus_end' ? `reaction:focus:${e.at}` : `reaction:${e.kind}:${e.id}:${e.kind === 'streak' ? e.days : ''}`;
}

export function reactionNudge(e: FoxEvent, log: NudgeLog, now: number): Nudge | null {
  const key = reactionKey(e);
  if (log.seen.includes(key) || now - log.lastReactionAt < REACTION_GAP) return null;
  const text = e.kind === 'task_done' ? `${e.title}, done. Look at you.`
    : e.kind === 'streak' ? `${e.days} in a row on ${e.title}. Who are you and what did you do with the procrastinator?`
    : `${e.minutes} minutes of focus${e.title ? ` on ${e.title}` : ''}. Stretch, then brag.`;
  return { key, kind: 'reaction', text };
}

/** Records the nudge as shown. False if this or another window already showed it, or a limit now refuses it. */
export function claimNudge(store: Pick<Storage, 'getItem' | 'setItem'>, n: Nudge, now: Date): boolean {
  let saved: NudgeLog | null = null;
  try { saved = JSON.parse(store.getItem(LOG_KEY) ?? 'null'); } catch { /* corrupt: start over */ }
  const log = freshLog(saved, dayKey(now));
  if (log.seen.includes(n.key)) return false;
  const next: NudgeLog = { ...log, seen: [...log.seen, n.key].slice(-50) };
  if (n.kind === 'morning') { if (log.morning) return false; next.morning = true; }
  if (n.kind === 'evening') { if (log.evening) return false; next.evening = true; }
  if (n.kind === 'overdue') { if (log.overdue >= OVERDUE_MAX) return false; next.overdue = log.overdue + 1; next.lastOverdueAt = now.getTime(); }
  if (n.kind === 'reaction') { if (now.getTime() - log.lastReactionAt < REACTION_GAP) return false; next.lastReactionAt = now.getTime(); }
  try { store.setItem(LOG_KEY, JSON.stringify(next)); } catch { /* storage full: shows, may repeat */ }
  return true;
}

/** Reads the saved log for today, for the rules to check against. */
export function readLog(store: Pick<Storage, 'getItem'>, now: Date): NudgeLog {
  try { return freshLog(JSON.parse(store.getItem(LOG_KEY) ?? 'null'), dayKey(now)); } catch { return freshLog(null, dayKey(now)); }
}

/** Gemini's wording if it comes back in time and non-empty, else the template. */
export async function nudgeLine(n: Nudge, fetchLine: (n: Nudge) => Promise<string>, ms = 6000): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<string>(r => { timer = setTimeout(() => r(''), ms); });
  try {
    const line = (await Promise.race([fetchLine(n), late])).trim();
    return line || n.text;
  } catch { return n.text; } finally { clearTimeout(timer); }
}

const REACT_EVENT = 'sorro-fox-react';

/** Tells the fox you just finished something. Safe to call anywhere; a no-op outside the browser. */
export function foxReact(e: FoxEvent) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REACT_EVENT, { detail: e }));
}

export function onFoxReact(f: (e: FoxEvent) => void): () => void {
  const h = (ev: Event) => f((ev as CustomEvent<FoxEvent>).detail);
  window.addEventListener(REACT_EVENT, h);
  return () => window.removeEventListener(REACT_EVENT, h);
}

type TaskLike = { id: string; title: string; done: boolean; due_on: string | null; deleted_at?: string | null; completed_at?: string | null };
type EventLike = { title: string; starts_at: string; all_day?: boolean | null; deleted_at?: string | null };

/** What the fox knows about today, from the tasks and events already on this device. */
export function buildFacts(tasks: TaskLike[], events: EventLike[], now: Date): Facts {
  const today = dayKey(now);
  const live = tasks.filter(t => !t.deleted_at);
  const open = live.filter(t => !t.done && t.due_on);
  const dueToday = open.filter(t => t.due_on === today);
  return {
    dueToday: dueToday.map(t => t.title),
    overdue: open.filter(t => t.due_on! < today).map(t => t.title),
    unfinishedToday: dueToday.map(t => ({ id: t.id, title: t.title })),
    doneToday: live.filter(t => t.done && t.completed_at && dayKey(new Date(t.completed_at)) === today).length,
    events: events.filter(e => !e.deleted_at && !e.all_day && dayKey(new Date(e.starts_at)) === today)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map(e => { const d = new Date(e.starts_at); return { title: e.title, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }; }),
  };
}

/** Same FNV-1a hash as lib/canvasFeed.ts notificationId, copied so this file stays import-free for node tests. */
export function foxAlertId(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 1) || 1;
}
export const FOX_ALERT_IDS = [foxAlertId('fox:morning'), foxAlertId('fox:evening')];

/** The phone's next morning and evening notifications, rescheduled each time the app opens. */
export function foxSchedule(now: Date, f: { dueTomorrow: number }, times: FoxTimes): { id: number; title: string; body: string; at: Date }[] {
  const atTime = (hhmm: string, plusDays: number) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + plusDays, h, m || 0); return d; };
  const evening = atTime(times.evening, 0) > now ? atTime(times.evening, 0) : atTime(times.evening, 1);
  return [
    { id: FOX_ALERT_IDS[0], title: 'Sorro', body: f.dueTomorrow ? `${f.dueTomorrow} due today. Open me for the plan.` : 'Nothing due. Rare.', at: atTime(times.morning, 1) },
    { id: FOX_ALERT_IDS[1], title: 'Sorro', body: 'Time to wrap up the day.', at: evening },
  ];
}
