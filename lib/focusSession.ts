'use client';

import { useSyncExternalStore } from 'react';
import { secondsLeft, startClock, pauseClock, extendClock, retimeClock, type FocusClock } from './focusClock';
import { currentUserId } from './supabase';
import { playFocusBell, startAmbient, stopAmbient, type AmbientSound } from './audio';
import { ymd } from './days';

/**
 * One focus timer for the whole app.
 *
 * The timer used to live inside the Focus page, so it only counted, finished
 * and rang while that page was open. The top bar now shows it everywhere, which
 * means the clock, the finish and the question that follows it cannot belong to
 * a route. They live here, and the Focus page and the top bar both read it.
 *
 * The saved shape is the one the page already wrote to `basedly-focus:<uid>`,
 * plus `finished`, so a session in progress survives this change.
 */

export type FocusMode = 'study' | 'break';
export type FocusSession = {
  clock: FocusClock;
  mode: FocusMode;
  goal: number;
  subject: string;
  minutes: Record<string, number>;
  /** Set when a run reaches zero, and cleared by whatever the person chooses next. */
  finished: FocusMode | null;
};

type Snapshot = { session: FocusSession; now: number; ready: boolean; sound: AmbientSound; notice: string };

const fresh = (): FocusSession => ({
  clock: { duration: 1500, remaining: 1500, endsAt: null }, mode: 'study', goal: 60, subject: '', minutes: {}, finished: null,
});

let session = fresh();
let now = Date.now();
let ready = false;
let sound: AmbientSound = 'off';
let notice = '';
let key = '';
let loading: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let snapshot: Snapshot = { session, now, ready, sound, notice };
const SERVER: Snapshot = { session: fresh(), now: 0, ready: false, sound: 'off', notice: '' };
const listeners = new Set<() => void>();

function emit() {
  snapshot = { session, now, ready, sound, notice };
  for (const listener of listeners) listener();
}

function readStored(): FocusSession | null {
  if (!key) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    const clock = raw?.clock;
    if (!raw || typeof clock?.duration !== 'number' || typeof clock?.remaining !== 'number'
      || !(clock.endsAt === null || typeof clock.endsAt === 'number') || typeof raw.goal !== 'number' || !raw.minutes) return null;
    return { ...fresh(), ...raw, finished: raw.finished === 'study' || raw.finished === 'break' ? raw.finished : null };
  } catch { return null; }
}

function persist() {
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(session)); notice = ''; }
  catch { notice = 'Device storage is full. Keep this page open to retain your session.'; }
}

function load() {
  loading ??= currentUserId()
    .then((uid) => { key = 'basedly-focus:' + uid; session = readStored() ?? session; })
    .catch(() => { notice = 'Your timer is available on this device. Sign in to keep it with your account.'; })
    .finally(() => { ready = true; tick(true); });
}

function complete() {
  // A second tab can reach zero in the same second. Whichever wrote first owns
  // the finish, so the minutes are counted and the bell rings once.
  const stored = readStored();
  if (stored && stored.clock.endsAt === null && stored.finished) { session = stored; return; }
  const ended = session.clock.endsAt ?? Date.now();
  const day = ymd(new Date(ended));
  const minutes = session.mode === 'study'
    ? { ...session.minutes, [day]: (session.minutes[day] || 0) + Math.round(session.clock.duration / 60) }
    : session.minutes;
  session = { ...session, minutes, clock: { ...session.clock, remaining: 0, endsAt: null }, finished: session.mode };
  persist();
  stopAmbient();
  playFocusBell();
}

function tick(force = false) {
  // An idle clock has nothing to redraw, so it does not wake every screen each second.
  if (!force && session.clock.endsAt === null) return;
  now = Date.now();
  if (ready && session.clock.endsAt !== null && secondsLeft(session.clock, now) === 0) complete();
  emit();
}

const onVisible = () => { if (document.visibilityState === 'visible') tick(true); };
const onStorage = (event: StorageEvent) => {
  if (event.key !== key) return;
  const stored = readStored();
  if (stored) { session = stored; now = Date.now(); emit(); }
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    load();
    timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    clearInterval(timer);
    timer = undefined;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('storage', onStorage);
  };
}

function update(next: FocusSession) {
  session = next;
  now = Date.now();
  persist();
  emit();
}

const idle = (minutes: number): FocusClock => ({ duration: minutes * 60, remaining: minutes * 60, endsAt: null });
const playAmbient = () => { if (sound !== 'off') startAmbient(sound, 0.3); };

export const focusActions = {
  toggle() {
    const at = Date.now();
    if (session.clock.endsAt !== null) { stopAmbient(); update({ ...session, clock: pauseClock(session.clock, at) }); return; }
    playAmbient();
    update({ ...session, finished: null, clock: startClock(session.clock, at) });
  },
  /** Back to the start of the current length, not running. */
  reset() { stopAmbient(); update({ ...session, finished: null, clock: idle(session.clock.duration / 60) }); },
  preset(minutes: number, mode: FocusMode) { stopAmbient(); update({ ...session, mode, finished: null, clock: idle(minutes) }); },
  retime(minutes: number) { update({ ...session, clock: retimeClock(session.clock, minutes, Date.now()) }); },
  extend(minutes: number) {
    if (session.finished) playAmbient();
    update({ ...session, finished: null, clock: extendClock(session.clock, minutes * 60, Date.now()) });
  },
  begin(mode: FocusMode, minutes: number) {
    playAmbient();
    update({ ...session, mode, finished: null, clock: startClock(idle(minutes), Date.now()) });
  },
  /** Ends the session without counting the unfinished part. */
  done() { stopAmbient(); update({ ...session, mode: 'study', finished: null, clock: idle(25) }); },
  setSubject(subject: string) { update({ ...session, subject }); },
  setGoal(goal: number) { update({ ...session, goal }); },
  setSound(next: AmbientSound) {
    sound = next;
    stopAmbient();
    if (session.clock.endsAt !== null) playAmbient();
    emit();
  },
};

export function useFocus() {
  const snap = useSyncExternalStore(subscribe, () => snapshot, () => SERVER);
  const left = secondsLeft(snap.session.clock, snap.now);
  const running = snap.session.clock.endsAt !== null;
  const active = snap.ready && (running || !!snap.session.finished || (left > 0 && left < snap.session.clock.duration));
  return { ...snap, left, running, active };
}

export const clockText = (seconds: number) =>
  `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
