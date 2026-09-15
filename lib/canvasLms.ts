'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { fixture } from './devFixtures';
import { useTasks, type Task } from './tasks';
import { runSync, useIntegrationActions, type Integration, type SyncResult } from './integrations';
import { useNotifActions, type Notif } from './notify';
import { deadlineOf } from './todayCycle';
import { freshIds, notificationId, readAnnouncement, readCanvasNotes, rememberIds, reminderTimes } from './canvasFeed';
import { alertPermission, askAlertPermission, replaceScheduled, showAlerts, type DeviceAlert } from './deviceNotify';

/**
 * UST Canvas in the app: whether it is connected, its to-do list and its
 * announcements, a sync on demand, and the notifications for anything new.
 *
 * Nothing here talks to Canvas. The `sync` Edge Function does, with the token
 * saved in Settings, and writes assignments into bd_tasks and announcements
 * into bd_notifications. These hooks read those rows back.
 */

export type CanvasStatus = { connected: boolean; enabled: boolean; lastSync: string | null; error: string | null; baseUrl: string | null };
export type CanvasTodo = { task: Task; course: string; url: string | null; due: number | null };
export type CanvasNews = { note: Notif; course: string; text: string };

const STATUS_KEY = ['integrations', 'canvas'] as const;
const NEWS_KEY = ['notifications', 'canvas'] as const;
const REFRESH = ['tasks', 'events', 'notifications', 'integrations'];

/** Connection state only. The token stays out of this query, and out of anything the device keeps. */
export function useCanvasStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: async (): Promise<CanvasStatus> => {
      const fx = fixture<Integration[]>('integrations');
      const row = fx
        ? fx.map((r) => ({ enabled: r.enabled, last_sync_at: r.last_sync_at, last_error: r.last_error, base_url: r.config.base_url ?? null, kind: r.kind })).find((r) => r.kind === 'canvas_lms') ?? null
        : await supabase.from('bd_integrations')
          .select('enabled,last_sync_at,last_error,base_url:config->>base_url')
          .eq('kind', 'canvas_lms').maybeSingle()
          .then(({ data, error }) => { if (error) throw error; return data as { enabled: boolean; last_sync_at: string | null; last_error: string | null; base_url: string | null } | null; });
      return row
        ? { connected: true, enabled: row.enabled, lastSync: row.last_sync_at, error: row.last_error, baseUrl: row.base_url }
        : { connected: false, enabled: false, lastSync: null, error: null, baseUrl: null };
    },
  });
}

export function useCanvasNews(enabled: boolean) {
  return useQuery({
    queryKey: NEWS_KEY,
    enabled,
    queryFn: async (): Promise<Notif[]> => {
      const fx = fixture<Notif[]>('notifications');
      if (fx) return fx.filter((n) => n.source === 'canvas_lms');
      const { data, error } = await supabase.from('bd_notifications')
        .select('id,kind,title,body,href,source,read_at,created_at')
        .eq('source', 'canvas_lms')
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });
}

/* One sync at a time for the whole app, and every Canvas section shows it. */
let syncing = false;
const syncListeners = new Set<() => void>();
const setSyncing = (value: boolean) => { syncing = value; for (const l of syncListeners) l(); };
const subscribeSync = (l: () => void) => { syncListeners.add(l); return () => { syncListeners.delete(l); }; };

export function useCanvas() {
  const qc = useQueryClient();
  const status = useCanvasStatus();
  const on = !!status.data?.connected && !!status.data.enabled;
  const { data: tasks = [] } = useTasks();
  const { data: notes = [] } = useCanvasNews(on);
  const busy = useSyncExternalStore(subscribeSync, () => syncing, () => false);
  const notif = useNotifActions();

  const todos = useMemo<CanvasTodo[]>(() => tasks
    .filter((t) => t.source === 'canvas_lms' && !t.deleted_at)
    .map((task) => ({ task, ...readCanvasNotes(task.notes), due: deadlineOf(task) }))
    .sort((a, b) => Number(a.task.done) - Number(b.task.done) || (a.due ?? Infinity) - (b.due ?? Infinity)), [tasks]);

  const news = useMemo<CanvasNews[]>(() => notes.map((note) => ({ note, ...readAnnouncement(note.body) })), [notes]);

  const sync = async (): Promise<SyncResult> => {
    if (syncing) return { ok: false, imported: 0, message: 'Already syncing' };
    setSyncing(true);
    try {
      const result = await runSync('canvas_lms');
      for (const key of REFRESH) void qc.invalidateQueries({ queryKey: [key] });
      return result;
    } finally {
      setSyncing(false);
    }
  };

  const markRead = (id: string) => {
    qc.setQueryData<Notif[]>(NEWS_KEY, (prev) => prev?.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)));
    notif.read.mutate({ id });
  };

  return { status: status.data ?? null, loading: status.isPending, on, todos, news, busy, sync, markRead };
}

/** Saves the address and token, then runs the first sync straight away. */
export function useCanvasConnect() {
  const qc = useQueryClient();
  const actions = useIntegrationActions();
  return async (baseUrl: string, token: string): Promise<SyncResult> => {
    await actions.save.mutateAsync({ kind: 'canvas_lms', config: { base_url: baseUrl.trim().replace(/\/+$/, ''), token: token.trim() }, enabled: true });
    setSyncing(true);
    try {
      const result = await runSync('canvas_lms');
      for (const key of REFRESH) void qc.invalidateQueries({ queryKey: [key] });
      return result;
    } finally {
      setSyncing(false);
    }
  };
}

/* ---- notifications, remembered per device */

const ALERTS_KEY = 'bd_canvas_alerts';
const SEEN_KEY = (kind: 'news' | 'todos') => `bd_canvas_seen_${kind}`;
const SCHEDULED_KEY = 'bd_canvas_scheduled';
const alertListeners = new Set<() => void>();
const readLocal = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw) as T; } catch { return fallback; } };
const writeLocal = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

export function useCanvasAlertsOn(): boolean {
  return useSyncExternalStore(
    (l) => { alertListeners.add(l); return () => { alertListeners.delete(l); }; },
    () => readLocal<boolean>(ALERTS_KEY, false),
    () => false,
  );
}

/** Turns device notifications on or off. Turning them on asks for permission first. */
export async function setCanvasAlerts(on: boolean): Promise<'on' | 'off' | 'blocked' | 'unsupported'> {
  if (on) {
    const permission = await alertPermission().catch(() => 'unsupported' as const);
    if (permission === 'unsupported') return 'unsupported';
    if (permission === 'denied') return 'blocked';
    if (permission === 'prompt' && !(await askAlertPermission().catch(() => false))) return 'blocked';
  } else {
    await replaceScheduled(readLocal<number[]>(SCHEDULED_KEY, []), []).catch(() => false);
    writeLocal(SCHEDULED_KEY, []);
  }
  writeLocal(ALERTS_KEY, on);
  for (const l of alertListeners) l();
  return on ? 'on' : 'off';
}

const dueText = (due: number) => new Date(due).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Mounted once, by the Shell. After every sync it compares what Canvas sent
 * with what this device has already seen: new announcements and new to-dos
 * become notifications, and every open to-do gets a reminder a day and an
 * hour before it is due. Those two reminders are scheduled on the phone, so
 * they arrive even with the app closed. New items can only be noticed while the
 * app is open, because that is when it syncs.
 */
export function useCanvasAlerts() {
  const { on, todos, news } = useCanvas();
  const alertsOn = useCanvasAlertsOn();
  const lastSchedule = useRef('');

  useEffect(() => {
    if (!on || !alertsOn) return;

    const newsIds = news.map((n) => n.note.id);
    const open = todos.filter((t) => !t.task.done);
    const todoIds = open.map((t) => t.task.id);
    const seenNews = readLocal<string[] | null>(SEEN_KEY('news'), null);
    const seenTodos = readLocal<string[] | null>(SEEN_KEY('todos'), null);

    const alerts: DeviceAlert[] = [
      ...freshIds(newsIds, seenNews).map((id) => {
        const item = news.find((n) => n.note.id === id)!;
        return { id: notificationId(`news:${id}`), title: item.note.title, body: [item.course, item.text].filter(Boolean).join(' · ').slice(0, 180) };
      }),
      ...freshIds(todoIds, seenTodos).map((id) => {
        const item = open.find((t) => t.task.id === id)!;
        return { id: notificationId(`todo:${id}`), title: `New on Canvas: ${item.task.title}`, body: [item.course, item.due ? `due ${dueText(item.due)}` : ''].filter(Boolean).join(' · ') };
      }),
    ];
    writeLocal(SEEN_KEY('news'), rememberIds(newsIds, seenNews));
    writeLocal(SEEN_KEY('todos'), rememberIds(todoIds, seenTodos));
    void showAlerts(alerts).catch(() => undefined);

    const withDue = open.filter((t) => t.due);
    const signature = withDue.map((t) => `${t.task.id}:${t.due}`).join('|');
    if (signature === lastSchedule.current) return;
    lastSchedule.current = signature;
    const reminders: DeviceAlert[] = withDue.flatMap((t) => reminderTimes(t.due!, Date.now()).map((r) => ({
      id: notificationId(`due:${t.task.id}:${r.lead}`),
      title: `${r.lead === 'day' ? 'Due tomorrow' : 'Due in an hour'}: ${t.task.title}`,
      body: [t.course, dueText(t.due!)].filter(Boolean).join(' · '),
      at: new Date(r.at),
    })));
    void replaceScheduled(readLocal<number[]>(SCHEDULED_KEY, []), reminders)
      .then((scheduled) => { if (scheduled) writeLocal(SCHEDULED_KEY, reminders.map((r) => r.id)); })
      .catch(() => undefined);
  }, [on, alertsOn, todos, news]);
}
