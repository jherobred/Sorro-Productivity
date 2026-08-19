'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { K } from './pal';
import { fixture } from './devFixtures';
import { settler } from './settle';

export type Ev = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  color: string;
  /** 'app' for anything created here; 'gcal_ics' rows are a read-only mirror. */
  source?: string;
  remind_minutes: number | null;
  snoozed_until: string | null;
  deleted_at: string | null;
};

/** Synced events belong to the other calendar; editing them here would diverge. */
export const isReadOnly = (e: Ev) => e.source === 'gcal_ics';

const EVENTS_KEY = ['events'] as const;

/** Last hour the grid draws. The band is 07:00–22:00 (Basedly.dc.html:4455). */
/** The grid is the whole day. It used to stop at 07:00 and 22:00, which
  * quietly hid anything early or late — a 6 a.m. gym slot or a midnight
  * deadline simply had nowhere to be drawn. */
export const GRID_START = 0;
export const GRID_END = 24;

/**
 * Start of the week containing `d`, at local midnight. Which day that is comes
 * from the "Week starts on" setting rather than being hardcoded to Monday, so
 * every view — grid, month, agenda, day strip — rotates together.
 */
export function weekStart(d: Date, startsOn: 'mon' | 'sun' = readWeekStart()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = startsOn === 'sun' ? x.getDay() : (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

/**
 * Prefs live in localStorage and are read synchronously here on purpose: these
 * helpers are called from pure layout maths that has no hook context.
 */
function readPref<T>(field: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = JSON.parse(localStorage.getItem('basedly-prefs') || '{}')[field];
    return v === undefined ? fallback : (v as T);
  } catch {
    return fallback;
  }
}
export const readWeekStart = () => readPref<'mon' | 'sun'>('weekStart', 'mon');
export const read24h = () => readPref<boolean>('time24', false);

/** Day labels rotated to the user's week start. */
export function dayLabels(startsOn: 'mon' | 'sun' = readWeekStart()): string[] {
  const mon = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  return startsOn === 'sun' ? ['Su', ...mon.slice(0, 6)] : mon;
}

/** Decimal hours since local midnight — the unit the grid lays out in. */
export function hoursOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

export function dayIndex(iso: string, ws: Date): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - ws.getTime()) / 86_400_000);
}

/** Compose an ISO timestamp from a week-start, day offset and decimal hour. */
export function at(ws: Date, day: number, hour: number): string {
  const d = new Date(ws);
  d.setDate(d.getDate() + day);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d.toISOString();
}

/**
 * Clock label. 12-hour with AM/PM is the design's default (README "Responsive
 * rules"), but the time-format setting wins when the user has chosen 24-hour.
 */
export function hhmm(hour: number, force24?: boolean): string {
  // Hour 24 is the end of the grid — the next midnight, not noon. Without the
  // wrap, 24 % 12 === 0 gave 12 and 24 >= 12 gave PM, so the last rule on the
  // day grid was labelled "12:00 PM".
  const h24 = Math.floor(hour) % 24;
  const m = Math.round((hour % 1) * 60);
  if (force24 ?? read24h()) return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Events in a window of `days` starting at `ws`.
 *
 * The window is a parameter because month view needs five or six weeks, not
 * one: before this, month rendered a whole month but only ever received the
 * events of a single week, so most of the dots were missing.
 */
export function useEvents(ws: Date, days = 7) {
  const from = new Date(ws);
  const to = new Date(ws);
  to.setDate(to.getDate() + days);

  return useQuery({
    queryKey: [...EVENTS_KEY, ws.toISOString(), days],
    queryFn: async (): Promise<Ev[]> => {
      // Dev preview: the window is computed, so there is no fixed key to seed.
      // Compiled out of production along with the rest of devFixtures.
      const fx = fixture<Ev[]>('events');
      if (fx) return fx;

      const { data, error } = await supabase
        .from('bd_events')
        .select('id,title,starts_at,ends_at,all_day,location,color,source,remind_minutes,snoozed_until,deleted_at')
        .is('deleted_at', null)
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .order('starts_at');
      if (error) throw error;
      return (data ?? []) as Ev[];
    },
  });
}

/**
 * Runs of the same event on consecutive days — the horizontal chip Google
 * Calendar draws when a class or standup repeats at the same hour across the
 * week. Purely a grouping pass over what is already loaded: a repeating event
 * is still N rows, it is only *drawn* as one bar.
 */
export type Span = { key: string; ev: Ev; firstDay: number; days: number; ids: string[] };

export function spanRuns(events: Ev[], ws: Date, dayCount: number): Span[] {
  const byKey = new Map<string, { day: number; ev: Ev }[]>();
  for (const e of events) {
    if (e.all_day) continue;
    const day = dayIndex(e.starts_at, ws);
    if (day < 0 || day >= dayCount) continue;
    // Same title at the same clock time is the same series to a reader.
    const key = `${e.title}|${hoursOf(e.starts_at).toFixed(2)}|${hoursOf(e.ends_at).toFixed(2)}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push({ day, ev: e });
  }

  const out: Span[] = [];
  for (const [key, items] of byKey) {
    items.sort((a, b) => a.day - b.day);
    let run = [items[0]];
    const flush = () => {
      out.push({
        key: `${key}|${run[0].day}`,
        ev: run[0].ev,
        firstDay: run[0].day,
        days: run.length,
        ids: run.map((r) => r.ev.id),
      });
    };
    for (let i = 1; i < items.length; i++) {
      if (items[i].day === run[run.length - 1].day + 1) run.push(items[i]);
      else { flush(); run = [items[i]]; }
    }
    flush();
  }
  return out;
}

/* ---- Mutations (registered so offline writes replay after a restart) ---- */

const CREATE = defineMutation(
  'event.create',
  async (v: { id: string; title: string; starts_at: string; ends_at: string; color: string; all_day?: boolean }) => {
    const user_id = await currentUserId();
    const { error } = await supabase.from('bd_events').insert({ ...v, user_id });
    if (error) throw error;
  }
);

// Drag and resize both land here. Fires on drop, not per frame, and must
// accept partials (BACKEND.md "PATCH /events/:id").
const UPDATE = defineMutation('event.update', async (v: { id: string; patch: Partial<Ev> }) => {
  const { error } = await supabase.from('bd_events').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const DELETE = defineMutation('event.delete', async (v: { id: string }) => {
  const { error } = await supabase
    .from('bd_events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('event.restore', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_events', p_id: v.id });
  if (error) throw error;
});

// Snooze pushes the *reminder* 10 minutes, not the event.
const SNOOZE = defineMutation('event.snooze', async (v: { id: string }) => {
  const until = new Date(Date.now() + 10 * 60_000).toISOString();
  const { error } = await supabase.from('bd_events').update({ snoozed_until: until }).eq('id', v.id);
  if (error) throw error;
});

export function useEventActions(ws: Date) {
  const qc = useQueryClient();
  const settle = settler(qc, EVENTS_KEY);

  /**
   * Patch every cached window, not one guessed key.
   *
   * The query is keyed [...EVENTS_KEY, weekStart, days] — three parts, because
   * month needs six weeks and week needs one. This helper used to build a
   * two-part key and write there, so every optimistic create, move and resize
   * landed in a cache entry no component was reading: the change only appeared
   * once the refetch came back, which read as lag rather than as the bug it was.
   *
   * Matching on the prefix also keeps the views consistent with each other —
   * dragging an event in week view updates the month window that is still
   * cached behind it.
   */
  const optimistic = (fn: (prev: Ev[]) => Ev[]) => {
    const snapshot = queryClient.getQueriesData<Ev[]>({ queryKey: EVENTS_KEY });
    for (const [k, prev] of snapshot) queryClient.setQueryData<Ev[]>(k, fn(prev ?? []));
    return snapshot;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: [readonly unknown[], Ev[] | undefined][] | undefined) => {
    for (const [k, prev] of ctx ?? []) queryClient.setQueryData(k, prev);
  };

  const create = useMutation({
    mutationKey: CREATE,
    onMutate: (v: { id: string; title: string; starts_at: string; ends_at: string; color: string; all_day?: boolean }) =>
      optimistic((prev) => [
        ...prev,
        { ...v, all_day: v.all_day ?? false, location: '', remind_minutes: null, snoozed_until: null, deleted_at: null },
      ]),
    onError: rollback,
    onSettled: settle,
  });

  const update = useMutation({
    mutationKey: UPDATE,
    onMutate: (v: { id: string; patch: Partial<Ev> }) =>
      optimistic((prev) => prev.map((e) => (e.id === v.id ? { ...e, ...v.patch } : e))),
    onError: rollback,
    onSettled: settle,
  });

  const restore = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE, onSettled: settle });
  const snooze = useMutation<unknown, Error, { id: string }>({ mutationKey: SNOOZE, onSettled: settle });

  const remove = useMutation({
    mutationKey: DELETE,
    onMutate: (v: { id: string }) => optimistic((prev) => prev.filter((e) => e.id !== v.id)),
    onError: rollback,
    onSettled: settle,
  });

  /**
   * Create an event at a grid slot: one hour by default, or the whole day when
   * called from the all-day tray. The tray used to make a 7:00 timed event
   * while its tooltip promised an all-day item.
   */
  const addAt = (day: number, hour: number, accent: string, allDay = false, title?: string) => {
    const id = crypto.randomUUID();
    create.mutate({
      id,
      title: title?.trim() || (allDay ? 'All-day item' : 'New event'),
      starts_at: at(ws, day, allDay ? 0 : hour),
      ends_at: at(ws, day, allDay ? 23.98 : hour + 1),
      all_day: allDay,
      color: accent,
    });
    toast(allDay ? 'New all-day item' : `New event at ${hhmm(hour)}`);
    return id;
  };

  /**
   * Move by whole days / 30-min steps, clamped to the band the grid draws.
   * GRID_END is 22, not K.calEndHour (21) — clamping to 21 made the grid's last
   * row unreachable by drag.
   */
  const moveTo = (ev: Ev, day: number, hour: number) => {
    const len = hoursOf(ev.ends_at) - hoursOf(ev.starts_at);
    const h = Math.max(GRID_START, Math.min(GRID_END - len, hour));
    const prevStart = ev.starts_at;
    const prevEnd = ev.ends_at;
    update.mutate({ id: ev.id, patch: { starts_at: at(ws, day, h), ends_at: at(ws, day, h + len) } });
    const label = new Date(at(ws, day, h)).toLocaleDateString(undefined, { weekday: 'short' });
    toast(`Moved to ${label} ${hhmm(h)}`, () =>
      update.mutate({ id: ev.id, patch: { starts_at: prevStart, ends_at: prevEnd } })
    );
  };

  const resizeTo = (ev: Ev, endHour: number) => {
    const start = hoursOf(ev.starts_at);
    const h = Math.max(start + 0.5, Math.min(GRID_END, endHour));
    const day = dayIndex(ev.starts_at, ws);
    update.mutate({ id: ev.id, patch: { ends_at: at(ws, day, h) } });
  };

  /** Copy to the next day (BACKEND.md POST /events/:id/duplicate). */
  const duplicate = (ev: Ev) => {
    const s = new Date(ev.starts_at);
    const e = new Date(ev.ends_at);
    s.setDate(s.getDate() + 1);
    e.setDate(e.getDate() + 1);
    create.mutate({
      id: crypto.randomUUID(),
      title: ev.title,
      starts_at: s.toISOString(),
      ends_at: e.toISOString(),
      color: ev.color,
    });
    toast(`Duplicated to ${s.toLocaleDateString(undefined, { weekday: 'short' })}`);
  };

  const removeWithUndo = (ev: Ev) => {
    remove.mutate({ id: ev.id });
    toast(`Deleted “${ev.title}”`, () => restore.mutate({ id: ev.id }));
  };

  return { create, update, remove, restore, snooze, addAt, moveTo, resizeTo, duplicate, removeWithUndo };
}
