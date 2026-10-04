'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { K } from './pal';
import { fixture } from './devFixtures';
import { settler } from './settle';
import { gridRange as localGridRange } from './calendarRange';
import { getPrefs, prefsLoaded, setPrefs, usePrefs } from './prefs';

export type RecurrenceDay = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom';

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  interval?: number; // e.g. every 2 weeks
  byDay?: RecurrenceDay[]; // e.g. ['MO', 'WE', 'FR']
  endType?: 'never' | 'until' | 'count';
  until?: string | null; // YYYY-MM-DD
  count?: number | null; // e.g. 10 occurrences
  exceptions?: string[]; // Array of YYYY-MM-DD strings excluded or altered
};

export type Ev = {
  id: string;
  title: string;
  short_name?: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  color: string;
  /**
   * The label colour. Null means "work it out" — see `chipInk`.
   *
   * `color` has only ever been the background. The label was drawn in the
   * theme's own text colour on top of it, which is unreadable the moment
   * somebody picks a pale swatch in dark mode, or a dark one in light.
   */
  text_color?: string | null;
  /** 'app' for anything created here; 'gcal_ics' rows are a read-only mirror. */
  source?: string;
  remind_minutes: number | null;
  snoozed_until: string | null;
  deleted_at: string | null;
  /** Google Calendar style recurrence rule */
  recurrence?: RecurrenceRule | null;
  /** ID of the master recurring event series */
  master_id?: string;
  /** Flag identifying generated recurrence instances */
  is_recurring_instance?: boolean;
};

const EVENT_META_KEY = 'bd_events_local_meta';
const GCAL_DELETED_KEY = 'basedly_deleted_gcal_events';

export function getDeletedGcalKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(GCAL_DELETED_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

export function markGcalDeleted(ev: Ev) {
  if (typeof window === 'undefined') return;
  const set = getDeletedGcalKeys();
  if (ev.id) set.add(ev.id);
  const ext = (ev as { external_id?: string }).external_id;
  if (ext) set.add(ext);
  try {
    localStorage.setItem(GCAL_DELETED_KEY, JSON.stringify([...set]));
  } catch {}
}

export function unmarkGcalDeleted(ev: Ev) {
  if (typeof window === 'undefined') return;
  const set = getDeletedGcalKeys();
  if (ev.id) set.delete(ev.id);
  const ext = (ev as { external_id?: string }).external_id;
  if (ext) set.delete(ext);
  try {
    localStorage.setItem(GCAL_DELETED_KEY, JSON.stringify([...set]));
  } catch {}
}

export type EventLocalMeta = {
  short_name?: string;
  recurrence?: RecurrenceRule | null;
};

/** The copy each device kept before these synced. Still read, so nothing set that way is lost. */
function deviceMeta(): Record<string, EventLocalMeta> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(EVENT_META_KEY) || '{}'); } catch { return {}; }
}

/**
 * An event's short name and how it repeats.
 *
 * These used to live only in the storage of the device that set them, so a
 * weekly class repeated on the laptop and showed once on the phone. They ride
 * the synced prefs now. Anything only this device knew is carried over once
 * the account's own prefs have loaded, so an older copy on the server cannot
 * be written over by this one before it has been read.
 */
export function getEventMetaMap(): Record<string, EventLocalMeta> {
  const local = deviceMeta();
  const synced = (getPrefs().eventMeta ?? {}) as Record<string, EventLocalMeta>;
  const onlyHere = Object.keys(local).filter((id) => !(id in synced));
  if (onlyHere.length && prefsLoaded()) {
    setPrefs({ eventMeta: { ...Object.fromEntries(onlyHere.map((id) => [id, local[id]])), ...synced } });
  }
  return { ...local, ...synced };
}

export function setEventMeta(id: string, meta: Partial<EventLocalMeta>) {
  if (typeof window === 'undefined') return;
  const next: EventLocalMeta = { ...getEventMetaMap()[id], ...meta };
  if (meta.short_name === null) delete next.short_name;
  if (meta.recurrence === null) delete next.recurrence;
  try {
    const local = deviceMeta();
    local[id] = next;
    localStorage.setItem(EVENT_META_KEY, JSON.stringify(local));
  } catch { /* the synced copy below is the one that matters */ }
  setPrefs({ eventMeta: { ...(getPrefs().eventMeta ?? {}), [id]: next } });
}

export function getEventShortName(e: { title: string; short_name?: string | null }): string {
  if (e.short_name && e.short_name.trim()) return e.short_name.trim();
  const title = e.title.trim();
  if (!title || title === '(No title)') return 'Event';
  return title;
}

export const DOW_MAP: Record<RecurrenceDay, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};
export const DOW_NAMES: RecurrenceDay[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function getWeekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * ISO week number of the week being displayed, for the header badge.
 *
 * ISO weeks are defined by the Thursday they contain, so reading the badge off
 * the week's *start* lies to Sunday-start users: their week begins inside the
 * previous ISO week and the badge counted that one instead. Anchoring on the
 * displayed week's Thursday is correct for either week start.
 */
export function displayedWeekNumber(ws: Date, startsOn: 'mon' | 'sun' = readWeekStart()): number {
  const anchor = new Date(ws);
  anchor.setDate(anchor.getDate() + (startsOn === 'sun' ? 4 : 3));
  return getWeekNumber(anchor);
}

export function formatRecurrenceLabel(rule: RecurrenceRule | null | undefined, startDate?: Date): string {
  if (!rule || !rule.freq) return 'Does not repeat';
  const interval = rule.interval ?? 1;

  if (rule.freq === 'daily') {
    return interval === 1 ? 'Daily' : `Every ${interval} days`;
  }
  if (rule.freq === 'weekdays') {
    return 'Every weekday (Monday to Friday)';
  }
  if (rule.freq === 'weekly') {
    if (rule.byDay && rule.byDay.length > 0) {
      const days = rule.byDay.map((d) => d[0] + d.slice(1).toLowerCase()).join(', ');
      return interval === 1 ? `Weekly on ${days}` : `Every ${interval} weeks on ${days}`;
    }
    const dayName = startDate ? startDate.toLocaleDateString(undefined, { weekday: 'long' }) : 'week';
    return interval === 1 ? `Weekly on ${dayName}` : `Every ${interval} weeks on ${dayName}`;
  }
  if (rule.freq === 'monthly') {
    const dayOfMonth = startDate ? startDate.getDate() : 'day';
    return interval === 1 ? `Monthly on day ${dayOfMonth}` : `Every ${interval} months on day ${dayOfMonth}`;
  }
  if (rule.freq === 'yearly') {
    const dateStr = startDate ? startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'year';
    return interval === 1 ? `Annually on ${dateStr}` : `Every ${interval} years on ${dateStr}`;
  }
  return 'Custom recurrence';
}

/**
 * Expands recurring events within a given date window [from, to]
 */
export function expandRecurringEvents(events: Ev[], from: Date, to: Date): Ev[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const result: Ev[] = [];

  for (const ev of events) {
    if (!ev.recurrence || !ev.recurrence.freq) {
      const evStartMs = new Date(ev.starts_at).getTime();
      const evEndMs = new Date(ev.ends_at).getTime();
      if (evEndMs >= fromMs && evStartMs < toMs) {
        result.push(ev);
      }
      continue;
    }

    const rule = ev.recurrence;
    const evStart = new Date(ev.starts_at);
    const evEnd = new Date(ev.ends_at);
    const durationMs = Math.max(1800000, evEnd.getTime() - evStart.getTime());

    const interval = Math.max(1, rule.interval ?? 1);
    const exceptions = new Set(rule.exceptions ?? []);
    const untilMs = rule.until ? new Date(`${rule.until}T23:59:59.999`).getTime() : Infinity;
    const maxCount = rule.endType === 'count' && rule.count ? rule.count : Infinity;

    let count = 0;
    const cursor = new Date(evStart);
    cursor.setHours(0, 0, 0, 0);

    const hardLimitMs = Math.min(toMs + 86400000 * 2, new Date(evStart).setFullYear(evStart.getFullYear() + 3));

    if (rule.freq === 'daily') {
      while (cursor.getTime() <= hardLimitMs && cursor.getTime() <= untilMs && count < maxCount) {
        const dateStr = cursor.toISOString().slice(0, 10);
        if (!exceptions.has(dateStr)) {
          count++;
          const instStart = new Date(cursor);
          instStart.setHours(evStart.getHours(), evStart.getMinutes(), evStart.getSeconds(), evStart.getMilliseconds());
          const instEnd = new Date(instStart.getTime() + durationMs);

          if (instEnd.getTime() >= fromMs && instStart.getTime() < toMs) {
            result.push({
              ...ev,
              id: `${ev.id}__rec__${dateStr}`,
              starts_at: instStart.toISOString(),
              ends_at: instEnd.toISOString(),
              master_id: ev.id,
              is_recurring_instance: true,
            });
          }
        }
        cursor.setDate(cursor.getDate() + interval);
      }
    } else if (rule.freq === 'weekdays') {
      while (cursor.getTime() <= hardLimitMs && cursor.getTime() <= untilMs && count < maxCount) {
        const dow = cursor.getDay();
        if (dow >= 1 && dow <= 5) {
          const dateStr = cursor.toISOString().slice(0, 10);
          if (!exceptions.has(dateStr)) {
            count++;
            const instStart = new Date(cursor);
            instStart.setHours(evStart.getHours(), evStart.getMinutes(), evStart.getSeconds(), evStart.getMilliseconds());
            const instEnd = new Date(instStart.getTime() + durationMs);

            if (instEnd.getTime() >= fromMs && instStart.getTime() < toMs) {
              result.push({
                ...ev,
                id: `${ev.id}__rec__${dateStr}`,
                starts_at: instStart.toISOString(),
                ends_at: instEnd.toISOString(),
                master_id: ev.id,
                is_recurring_instance: true,
              });
            }
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (rule.freq === 'weekly') {
      const byDays = (rule.byDay && rule.byDay.length > 0)
        ? rule.byDay.map((d) => DOW_MAP[d])
        : [evStart.getDay()];

      const currentWeekStart = new Date(cursor);
      const dowOffset = currentWeekStart.getDay();
      currentWeekStart.setDate(currentWeekStart.getDate() - dowOffset);

      const evStartDayMs = new Date(evStart).setHours(0, 0, 0, 0);

      while (currentWeekStart.getTime() <= hardLimitMs && currentWeekStart.getTime() <= untilMs && count < maxCount) {
        for (const targetDow of byDays) {
          const dayDate = new Date(currentWeekStart);
          dayDate.setDate(dayDate.getDate() + targetDow);

          if (dayDate.getTime() < evStartDayMs) continue;
          if (dayDate.getTime() > hardLimitMs || dayDate.getTime() > untilMs || count >= maxCount) break;

          const dateStr = dayDate.toISOString().slice(0, 10);
          if (!exceptions.has(dateStr)) {
            count++;
            const instStart = new Date(dayDate);
            instStart.setHours(evStart.getHours(), evStart.getMinutes(), evStart.getSeconds(), evStart.getMilliseconds());
            const instEnd = new Date(instStart.getTime() + durationMs);

            if (instEnd.getTime() >= fromMs && instStart.getTime() < toMs) {
              result.push({
                ...ev,
                id: `${ev.id}__rec__${dateStr}`,
                starts_at: instStart.toISOString(),
                ends_at: instEnd.toISOString(),
                master_id: ev.id,
                is_recurring_instance: true,
              });
            }
          }
        }
        currentWeekStart.setDate(currentWeekStart.getDate() + 7 * interval);
      }
    } else if (rule.freq === 'monthly') {
      while (cursor.getTime() <= hardLimitMs && cursor.getTime() <= untilMs && count < maxCount) {
        const dateStr = cursor.toISOString().slice(0, 10);
        if (!exceptions.has(dateStr)) {
          count++;
          const instStart = new Date(cursor);
          instStart.setHours(evStart.getHours(), evStart.getMinutes(), evStart.getSeconds(), evStart.getMilliseconds());
          const instEnd = new Date(instStart.getTime() + durationMs);

          if (instEnd.getTime() >= fromMs && instStart.getTime() < toMs) {
            result.push({
              ...ev,
              id: `${ev.id}__rec__${dateStr}`,
              starts_at: instStart.toISOString(),
              ends_at: instEnd.toISOString(),
              master_id: ev.id,
              is_recurring_instance: true,
            });
          }
        }
        cursor.setMonth(cursor.getMonth() + interval);
      }
    } else if (rule.freq === 'yearly') {
      while (cursor.getTime() <= hardLimitMs && cursor.getTime() <= untilMs && count < maxCount) {
        const dateStr = cursor.toISOString().slice(0, 10);
        if (!exceptions.has(dateStr)) {
          count++;
          const instStart = new Date(cursor);
          instStart.setHours(evStart.getHours(), evStart.getMinutes(), evStart.getSeconds(), evStart.getMilliseconds());
          const instEnd = new Date(instStart.getTime() + durationMs);

          if (instEnd.getTime() >= fromMs && instStart.getTime() < toMs) {
            result.push({
              ...ev,
              id: `${ev.id}__rec__${dateStr}`,
              starts_at: instStart.toISOString(),
              ends_at: instEnd.toISOString(),
              master_id: ev.id,
              is_recurring_instance: true,
            });
          }
        }
        cursor.setFullYear(cursor.getFullYear() + interval);
      }
    }
  }

  return result.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

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
  // Round the whole time in minutes once, not the hour and minutes
  // separately: rounding a 0.999 hour gave ":60" and rolled 24:00 into a
  // non-existent minute of the same day.
  const totalMin = Math.max(0, Math.round(hour * 60));
  // Hour 24 is the end of the grid — the next midnight, not noon. Without the
  // wrap, 24 % 12 === 0 gave 12 and 24 >= 12 gave PM, so the last rule on the
  // day grid was labelled "12:00 PM".
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  if (force24 ?? read24h()) return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Grid hours for an event, safe to subtract.
 *
 * `hoursOf` reads local wall-clock hours, so an event that crosses midnight
 * (23:00–01:00) comes back with its end before its start; laid out raw, that
 * is a negative-height chip and a drag length that escapes the 24-hour grid.
 * Crossing midnight is drawn as a chip that runs to the end of the day it
 * starts on.
 */
export function gridRange(startsAt: string, endsAt: string): { start: number; end: number } {
  return localGridRange(startsAt, endsAt);
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

  // A repeat set on another device arrives with the prefs, after the events
  // were read, so the calendar reads them again when it does.
  const meta = usePrefs().prefs.eventMeta;
  const seen = useRef(meta);
  useEffect(() => {
    if (seen.current === meta) return;
    seen.current = meta;
    void queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
  }, [meta]);

  return useQuery({
    queryKey: [...EVENTS_KEY, ws.toISOString(), days],
    queryFn: async (): Promise<Ev[]> => {
      // Dev preview: the window is computed, so there is no fixed key to seed.
      // Compiled out of production along with the rest of devFixtures.
      const fx = fixture<Ev[]>('events');
      if (fx) return expandRecurringEvents(fx, from, to);

      const { data, error } = await supabase
        .from('bd_events')
        .select('id,title,starts_at,ends_at,all_day,location,color,text_color,source,remind_minutes,snoozed_until,deleted_at')
        .is('deleted_at', null)
        .order('starts_at');
      if (error) throw error;
      const meta = getEventMetaMap();
      const rawEvents: Ev[] = (data ?? []).map((e) => ({
        ...e,
        short_name: meta[e.id]?.short_name ?? '',
        recurrence: meta[e.id]?.recurrence ?? null,
      })) as Ev[];
      return expandRecurringEvents(rawEvents, from, to);
    },
  });
}

/**
 * Runs of the same event on consecutive days — the horizontal chip Google
 * Calendar draws when a class or standup repeats at the same hour across the
 * week. Purely a grouping pass over what is already loaded: a repeating event
 * is still N rows, it is only *drawn* as one bar.
 */
/**
 * `members` is what makes a run editable.
 *
 * The bar is drawn from `ev` — the *first* day's row — and everything used to
 * act on that: clicking the middle of a five-day run and pressing delete
 * removed Monday, and dragging it moved all five. `members` maps each column
 * back to the row that actually sits in it, so a press can find the day it
 * landed on instead of the day the bar happens to start.
 */
export type Span = {
  key: string; ev: Ev; firstDay: number; days: number; ids: string[];
  members: { day: number; ev: Ev }[];
};

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
        members: run.map((r) => ({ day: r.day, ev: r.ev })),
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

/**
 * What colour to draw an event's label in.
 *
 * An explicit choice wins. Otherwise it is decided from the *background the
 * chip actually has*, which is 26% of the event colour over the card — so it
 * follows the theme, and a yellow event is not black text in dark mode and
 * white text in light. sRGB relative luminance, the same sum WCAG uses.
 */
export function chipInk(ev: Pick<Ev, 'color' | 'text_color'>, dark: boolean): string {
  if (ev.text_color) return ev.text_color;
  const hex = /^#([0-9a-f]{6})$/i.exec(ev.color.trim());
  if (!hex) return 'var(--tx)';
  const n = parseInt(hex[1], 16);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => lin(c / 255));
  const evL = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // The chip is mostly card, not event colour, so the ground's own lightness
  // dominates; the event tint only nudges it.
  const groundL = dark ? 0.06 : 0.96;
  return evL * 0.26 + groundL * 0.74 > 0.45 ? '#141220' : '#F4F2FB';
}

/* ---- Mutations (registered so offline writes replay after a restart) ---- */

const CREATE = defineMutation(
  'event.create',
  async (v: {
    id: string;
    title: string;
    short_name?: string | null;
    starts_at: string;
    ends_at: string;
    color: string;
    text_color?: string | null;
    all_day?: boolean;
    location?: string;
    recurrence?: RecurrenceRule | null;
  }) => {
    const user_id = await currentUserId();
    const { short_name, recurrence, ...payload } = v;
    if (short_name !== undefined || recurrence !== undefined) {
      setEventMeta(v.id, {
        short_name: short_name ?? undefined,
        recurrence: recurrence ?? undefined,
      });
    }
    const { error } = await supabase.from('bd_events').insert({ ...payload, user_id });
    if (error) throw error;
  }
);

// Drag and resize both land here. Fires on drop, not per frame, and must
// accept partials (BACKEND.md "PATCH /events/:id").
const UPDATE = defineMutation('event.update', async (v: { id: string; patch: Partial<Ev> }) => {
  const { short_name, recurrence, master_id, is_recurring_instance, ...patch } = v.patch;
  if (short_name !== undefined || recurrence !== undefined) {
    setEventMeta(v.id, {
      short_name: short_name ?? undefined,
      recurrence: recurrence ?? undefined,
    });
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('bd_events').update(patch).eq('id', v.id);
    if (error) throw error;
  }
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

/**
 * Empty the calendar.
 *
 * No id list on the wire: RLS already scopes every row to the signed-in user,
 * so "everything of mine that is not already deleted" is one statement and
 * cannot be defeated by a URL length limit at four hundred classes. The ids are
 * read first anyway, because Undo needs them — this is the same soft delete a
 * single event gets, so nothing is actually gone.
 */
const CLEAR_ALL = defineMutation('event.clearAll', async () => {
  const { error } = await supabase.from('bd_events')
    .update({ deleted_at: new Date().toISOString() }).is('deleted_at', null);
  if (error) throw error;
});

/** Soft-delete a named set — one run of a repeating class, usually. */
const DELETE_MANY = defineMutation('event.deleteMany', async (v: { ids: string[] }) => {
  for (let i = 0; i < v.ids.length; i += 200) {
    const { error } = await supabase.from('bd_events')
      .update({ deleted_at: new Date().toISOString() }).in('id', v.ids.slice(i, i + 200));
    if (error) throw error;
  }
});

const RESTORE_MANY = defineMutation('event.restoreMany', async (v: { ids: string[] }) => {
  // Chunked: a thousand uuids in an `in.(...)` filter is a request no proxy
  // will forward.
  for (let i = 0; i < v.ids.length; i += 200) {
    const { error } = await supabase.from('bd_events')
      .update({ deleted_at: null }).in('id', v.ids.slice(i, i + 200));
    if (error) throw error;
  }
});

/** Every live event id of yours, for the count on the confirmation and for Undo. */
export async function liveEventIds(): Promise<string[]> {
  const fx = fixture<Ev[]>('events');
  if (fx) return fx.map((e) => e.id);
  const { data, error } = await supabase.from('bd_events').select('id').is('deleted_at', null);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

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
    onMutate: (v: {
      id: string;
      title: string;
      short_name?: string | null;
      starts_at: string;
      ends_at: string;
      color: string;
      text_color?: string | null;
      all_day?: boolean;
      location?: string;
      recurrence?: RecurrenceRule | null;
    }) => {
      if (v.short_name !== undefined || v.recurrence !== undefined) {
        setEventMeta(v.id, {
          short_name: v.short_name ?? undefined,
          recurrence: v.recurrence ?? undefined,
        });
      }
      return optimistic((prev) => [
        ...prev,
        {
          ...v,
          all_day: v.all_day ?? false,
          location: v.location ?? '',
          recurrence: v.recurrence ?? null,
          remind_minutes: null,
          snoozed_until: null,
          deleted_at: null,
        },
      ]);
    },
    onError: rollback,
    onSettled: settle,
  });

  const update = useMutation({
    mutationKey: UPDATE,
    onMutate: (v: { id: string; patch: Partial<Ev> }) => {
      if (v.patch.short_name !== undefined || v.patch.recurrence !== undefined) {
        setEventMeta(v.id, {
          short_name: v.patch.short_name ?? undefined,
          recurrence: v.patch.recurrence ?? undefined,
        });
      }
      return optimistic((prev) => prev.map((e) => (e.id === v.id ? { ...e, ...v.patch } : e)));
    },
    onError: rollback,
    onSettled: settle,
  });

  const restore = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE, onSettled: settle });
  const restoreMany = useMutation<unknown, Error, { ids: string[] }>({ mutationKey: RESTORE_MANY, onSettled: settle });
  const deleteMany = useMutation<unknown, Error, { ids: string[] }>({ mutationKey: DELETE_MANY, onSettled: settle });

  const clearAll = useMutation<unknown, Error, void, [readonly unknown[], Ev[] | undefined][]>({
    mutationKey: CLEAR_ALL,
    onMutate: () => optimistic(() => []),
    onError: rollback,
    onSettled: settle,
  });
  const snooze = useMutation<unknown, Error, { id: string }>({ mutationKey: SNOOZE, onSettled: settle });

  const remove = useMutation({
    mutationKey: DELETE,
    onMutate: (v: { id: string }) => optimistic((prev) => prev.filter((e) => e.id !== v.id)),
    onError: rollback,
    onSettled: settle,
  });

  /**
   * Create an event at a grid slot: one hour by default (or specified endHour), or the whole day when
   * called from the all-day tray.
   */
  const addAt = (day: number, hour: number, accent: string, allDay = false, title?: string, endHour?: number) => {
    const id = crypto.randomUUID();
    const eH = allDay ? 23.98 : (endHour !== undefined ? endHour : hour + 1);
    create.mutate({
      id,
      title: title?.trim() || (allDay ? 'All-day item' : '(No title)'),
      starts_at: at(ws, day, allDay ? 0 : hour),
      ends_at: at(ws, day, eH),
      all_day: allDay,
      color: accent,
    });
    toast(allDay ? 'New all-day item' : `New event: ${hhmm(hour)} – ${hhmm(eH)}`);
    return id;
  };

  /**
   * Move by whole days / 30-min steps, clamped to the band the grid draws.
   * GRID_END is 22, not K.calEndHour (21) — clamping to 21 made the grid's last
   * row unreachable by drag.
   */
  const moveTo = (ev: Ev, day: number, hour: number) => {
    const rawLen = hoursOf(ev.ends_at) - hoursOf(ev.starts_at);
    const len = rawLen > 0 ? rawLen : 1;
    const h = Math.max(GRID_START, Math.min(GRID_END - len, hour));
    const prevStart = ev.starts_at;
    const prevEnd = ev.ends_at;
    update.mutate({ id: ev.id, patch: { starts_at: at(ws, day, h), ends_at: at(ws, day, h + len) } });
    const label = new Date(at(ws, day, h)).toLocaleDateString(undefined, { weekday: 'short' });
    toast(`Moved to ${label} ${hhmm(h)}`, () =>
      update.mutate({ id: ev.id, patch: { starts_at: prevStart, ends_at: prevEnd } })
    );
  };

  /**
   * Move a whole run — the bar drawn over a class that meets at the same hour
   * on consecutive days. It is N rows underneath, so this is N patches with one
   * shared offset, and one Undo that puts all of them back.
   *
   * Without this a repeating class was the only thing on the grid you could not
   * drag: the moment `spanRuns` merged it into a bar, the bar swallowed the
   * pointer and no chip underneath was left to grab.
   */
  const moveRun = (evs: Ev[], dayDelta: number, hourDelta: number) => {
    if (!evs.length || (dayDelta === 0 && hourDelta === 0)) return;
    const len = hoursOf(evs[0].ends_at) - hoursOf(evs[0].starts_at);
    const h = Math.max(GRID_START, Math.min(GRID_END - len, hoursOf(evs[0].starts_at) + hourDelta));
    const before = evs.map((e) => ({ id: e.id, starts_at: e.starts_at, ends_at: e.ends_at }));

    for (const e of evs) {
      const day = dayIndex(e.starts_at, ws) + dayDelta;
      update.mutate({ id: e.id, patch: { starts_at: at(ws, day, h), ends_at: at(ws, day, h + len) } });
    }
    toast(`Moved ${evs.length} day${evs.length === 1 ? '' : 's'} to ${hhmm(h)}`, () => {
      for (const b of before) update.mutate({ id: b.id, patch: { starts_at: b.starts_at, ends_at: b.ends_at } });
    });
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

  /**
   * Every day of one run, in one press and one Undo.
   *
   * A run is N separate rows that only *look* like one bar, so removing "the
   * whole thing" is N deletes — and N toasts, each with its own Undo, would be
   * unusable. One `in.(...)` update and one restore, which is also what makes
   * "I meant the other one" recoverable.
   */
  const wipeRun = (evs: Ev[]) => {
    const ids = evs.map((e) => e.id);
    if (!ids.length) return;
    optimistic((prev) => prev.filter((e) => !ids.includes(e.id)));
    deleteMany.mutate({ ids });
    toast(`Deleted ${ids.length} day${ids.length === 1 ? '' : 's'} of “${evs[0].title}”`,
      () => restoreMany.mutate({ ids }));
  };

  /** Everything, soft-deleted, with the ids kept so Undo is one restore. */
  const wipe = (ids: string[]) => {
    clearAll.mutate(undefined);
    toast(`${ids.length} event${ids.length === 1 ? '' : 's'} cleared`, () => restoreMany.mutate({ ids }));
  };

  return {
    create, update, remove, restore, snooze, addAt, moveTo, moveRun, resizeTo,
    duplicate, removeWithUndo, wipe, wipeRun,
  };
}

export type EventCountdown = {
  status: 'upcoming' | 'ongoing' | 'past';
  text: string;
  badge: string;
  secondsLeft: number;
};

/**
 * Calculates countdown until event starts or ends:
 * - Upcoming: "in 2h 15m", "in 45m 10s", "in 3d"
 * - Ongoing: "45m left", "1h 10m left"
 */
export function formatEventCountdown(
  startsAt: string,
  endsAt: string,
  nowMs: number = Date.now()
): EventCountdown | null {
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (isNaN(startMs) || isNaN(endMs)) return null;

  if (nowMs < startMs) {
    const diff = startMs - nowMs;
    const totalSec = Math.floor(diff / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    let text = '';
    if (days > 0) {
      text = `in ${days}d ${hours}h`;
    } else if (hours > 0) {
      text = `in ${hours}h ${mins}m`;
    } else if (mins > 0) {
      text = `in ${mins}m ${secs}s`;
    } else {
      text = `in ${secs}s`;
    }

    return {
      status: 'upcoming',
      text,
      badge: `Starts ${text}`,
      secondsLeft: totalSec,
    };
  } else if (nowMs >= startMs && nowMs <= endMs) {
    const diff = endMs - nowMs;
    const totalSec = Math.floor(diff / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    let text = '';
    if (hours > 0) {
      text = `${hours}h ${mins}m left`;
    } else if (mins > 0) {
      text = `${mins}m ${secs}s left`;
    } else {
      text = `${secs}s left`;
    }

    return {
      status: 'ongoing',
      text,
      badge: `Ongoing · ${text}`,
      secondsLeft: totalSec,
    };
  } else {
    return {
      status: 'past',
      text: 'Ended',
      badge: 'Ended',
      secondsLeft: 0,
    };
  }
}

export type PositionedEvent<T = Ev> = {
  ev: T;
  start: number;
  end: number;
  colIndex: number;
  totalCols: number;
};

/**
 * Packs overlapping events on a calendar day into non-obstructing sub-columns
 * (Google Calendar / Apple Calendar layout algorithm).
 */
export function layoutOverlappingEvents<T = Ev>(
  events: { ev: T; start: number; end: number }[]
): PositionedEvent<T>[] {
  if (!events.length) return [];

  // Normalize durations and sort: start time ascending, then duration descending
  const normalized = events.map((item) => ({
    ...item,
    end: Math.max(item.start + 0.25, item.end),
  }));

  const sorted = [...normalized].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  // Group into overlapping clusters (connected components)
  const clusters: typeof sorted[] = [];
  let currentCluster: typeof sorted = [];
  let clusterEnd = -1;

  for (const item of sorted) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.end;
    } else {
      if (item.start < clusterEnd) {
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.end);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.end;
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const result: PositionedEvent<T>[] = [];

  // Pack each cluster into sub-columns
  for (const cluster of clusters) {
    const columns: number[] = [];
    const assignments: { ev: T; start: number; end: number; colIndex: number }[] = [];

    for (const item of cluster) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        if (columns[c] <= item.start) {
          columns[c] = item.end;
          assignments.push({ ...item, colIndex: c });
          placed = true;
          break;
        }
      }
      if (!placed) {
        assignments.push({ ...item, colIndex: columns.length });
        columns.push(item.end);
      }
    }

    const totalCols = Math.max(1, columns.length);
    for (const a of assignments) {
      result.push({
        ev: a.ev,
        start: a.start,
        end: a.end,
        colIndex: a.colIndex,
        totalCols,
      });
    }
  }

  return result;
}

export type VacantInterval = {
  id: string;
  startHour: number;
  endHour: number;
  durationHours: number;
  isNext: boolean;
  targetEventTitle?: string;
  targetStartsAt?: string;
};

export function formatVacantCountdown(targetIso: string, nowMs: number): string {
  const diff = new Date(targetIso).getTime() - nowMs;
  if (diff <= 0) return 'Starting now';
  const totalSecs = Math.floor(diff / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `Starts in ${h}h ${m}m ${s}s`;
  if (m > 0) return `Starts in ${m}m ${s}s`;
  return `Starts in ${s}s`;
}

export function formatDurationHours(hours: number): string {
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function computeVacantIntervals(
  dayEvents: { id: string; title: string; start: number; end: number; starts_at: string; ends_at: string }[],
  isToday: boolean,
  nowHour: number,
  nextEventId?: string | null,
  dayStartHour = 0,
  dayEndHour = 24,
  isPastDay = false
): VacantInterval[] {
  // If the whole day is in the past, do not draw vacant indicators or arrows
  if (isPastDay) return [];

  const sorted = [...dayEvents].sort((a, b) => a.start - b.start);
  const busy: { start: number; end: number; events: typeof sorted }[] = [];

  for (const ev of sorted) {
    if (!busy.length) {
      busy.push({ start: ev.start, end: ev.end, events: [ev] });
    } else {
      const last = busy[busy.length - 1];
      if (ev.start < last.end) {
        last.end = Math.max(last.end, ev.end);
        last.events.push(ev);
      } else {
        busy.push({ start: ev.start, end: ev.end, events: [ev] });
      }
    }
  }

  const rawIntervals: { start: number; end: number; isNext: boolean; targetEv?: (typeof sorted)[0] }[] = [];

  // Case 1: No events on this day -> entire day is vacant (0:00 to 24:00)
  if (busy.length === 0) {
    rawIntervals.push({ start: dayStartHour, end: dayEndHour, isNext: false });
  } else {
    // Case 2: Morning vacant block (from midnight / dayStartHour to first event)
    if (busy[0].start - dayStartHour >= 0.35) {
      const firstEv = busy[0].events[0];
      const isNext = (firstEv.id === nextEventId || busy[0].events.some((e) => e.id === nextEventId)) && (isToday ? nowHour <= busy[0].start : true);
      rawIntervals.push({ start: dayStartHour, end: busy[0].start, isNext, targetEv: firstEv });
    }

    // Case 3: Mid-day gaps between consecutive events
    for (let i = 1; i < busy.length; i++) {
      const prevEnd = busy[i - 1].end;
      const nextStart = busy[i].start;
      const targetEv = busy[i].events[0];

      if (nextStart - prevEnd >= 0.35) {
        const isNext = (targetEv.id === nextEventId || busy[i].events.some((e) => e.id === nextEventId)) && (isToday ? nowHour <= nextStart : true);
        rawIntervals.push({ start: prevEnd, end: nextStart, isNext, targetEv });
      }
    }

    // Case 4: Afternoon / Evening / Night vacant block (from last event to midnight / dayEndHour)
    const lastEnd = busy[busy.length - 1].end;
    if (dayEndHour - lastEnd >= 0.35) {
      rawIntervals.push({ start: lastEnd, end: dayEndHour, isNext: false });
    }
  }

  const result: VacantInterval[] = [];

  for (const interval of rawIntervals) {
    let s = interval.start;
    const e = interval.end;

    // If today, filter out past intervals and clamp current interval to nowHour
    if (isToday) {
      if (e <= nowHour) continue; // Entire interval is in past
      if (s < nowHour) s = nowHour; // Clamp start to present moment
    }

    const duration = e - s;
    if (duration >= 0.3) {
      result.push({
        id: `vacant-${s.toFixed(2)}-${e.toFixed(2)}`,
        startHour: s,
        endHour: e,
        durationHours: duration,
        isNext: interval.isNext,
        targetEventTitle: interval.targetEv?.title,
        targetStartsAt: interval.targetEv?.starts_at,
      });
    }
  }

  return result;
}


