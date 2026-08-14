'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { K } from './pal';

export type Ev = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  color: string;
  remind_minutes: number | null;
  snoozed_until: string | null;
  deleted_at: string | null;
};

const EVENTS_KEY = ['events'] as const;

/** Monday-start week containing `d`, at local midnight. */
export function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
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

/** 12-hour label with AM/PM — never 24-hour (README "Responsive rules"). */
export function hhmm(hour: number): string {
  const h24 = Math.floor(hour);
  const m = Math.round((hour % 1) * 60);
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function useEvents(ws: Date) {
  const from = new Date(ws);
  const to = new Date(ws);
  to.setDate(to.getDate() + 7);

  return useQuery({
    queryKey: [...EVENTS_KEY, ws.toISOString()],
    queryFn: async (): Promise<Ev[]> => {
      const { data, error } = await supabase
        .from('bd_events')
        .select('id,title,starts_at,ends_at,all_day,location,color,remind_minutes,snoozed_until,deleted_at')
        .is('deleted_at', null)
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .order('starts_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ---- Mutations (registered so offline writes replay after a restart) ---- */

const CREATE = defineMutation(
  'event.create',
  async (v: { id: string; title: string; starts_at: string; ends_at: string; color: string }) => {
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
  const key = [...EVENTS_KEY, ws.toISOString()];
  const settle = () => void qc.invalidateQueries({ queryKey: EVENTS_KEY });

  const optimistic = (fn: (prev: Ev[]) => Ev[]) => {
    const prev = queryClient.getQueryData<Ev[]>(key) ?? [];
    queryClient.setQueryData<Ev[]>(key, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: Ev[] | undefined) => {
    if (ctx) queryClient.setQueryData(key, ctx);
  };

  const create = useMutation({
    mutationKey: CREATE,
    onMutate: (v: { id: string; title: string; starts_at: string; ends_at: string; color: string }) =>
      optimistic((prev) => [
        ...prev,
        { ...v, all_day: false, location: '', remind_minutes: null, snoozed_until: null, deleted_at: null },
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

  /** Create a 1-hour event at a grid slot and toast the time. */
  const addAt = (day: number, hour: number, accent: string) => {
    const id = crypto.randomUUID();
    create.mutate({
      id,
      title: 'New event',
      starts_at: at(ws, day, hour),
      ends_at: at(ws, day, hour + 1),
      color: accent,
    });
    toast(`New event at ${hhmm(hour)}`);
    return id;
  };

  /** Move by whole days / 30-min steps, clamped to the visible 7:00–21:00 band. */
  const moveTo = (ev: Ev, day: number, hour: number) => {
    const len = hoursOf(ev.ends_at) - hoursOf(ev.starts_at);
    const h = Math.max(K.calStartHour, Math.min(K.calEndHour - len, hour));
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
    const h = Math.max(start + 0.5, Math.min(K.calEndHour, endHour));
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
