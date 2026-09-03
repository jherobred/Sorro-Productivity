'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useSyncExternalStore } from 'react';
import { supabase, currentUserId } from './supabase';
import { fromYmd } from './days';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { settler } from './settle';
import { playTick, playCelebration } from './audio';
import type {
  HabitCategory,
  HabitFrequency,
  TimeOfDay,
  HabitKind,
  HabitLog,
  HabitMilestone,
} from './habitTypes';
import { HABIT_MILESTONES } from './habitTypes';

export * from './habitTypes';

export type Habit = {
  id: string;
  name: string;
  short_name?: string;
  show_in_home?: boolean;
  color: string;
  kind: HabitKind;
  target: number | null;
  target_unit?: string | null;
  position: number;
  archived_at: string | null;
  challenge_id: string | null;
  category?: HabitCategory;
  frequency?: HabitFrequency;
  custom_days?: number[]; // [0..6] (0 = Sunday, 1 = Monday, etc.)
  time_of_day?: TimeOfDay;
  icon?: string;
  cue?: string;
  reminder_time?: string | null;
  created_at?: string;
};

export type Tick = { habit_id: string; on_date: string; value: number };

const HABITS_KEY = ['habits'] as const;
const TICKS_KEY = ['habit_ticks'] as const;
const HABITS_META_KEY = 'basedly-habits-meta-v2';
const HABIT_LOGS_KEY = 'basedly-habit-logs-v2';
const HABIT_FREEZES_KEY = 'basedly-habit-freezes-v2';

/* ----------------------------------------------------------------- Metadata Store */

type HabitMetaMap = Record<string, Partial<Habit>>;

function getLocalMeta(): HabitMetaMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(HABITS_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalMeta(map: HabitMetaMap) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HABITS_META_KEY, JSON.stringify(map));
  } catch {}
}

/* ----------------------------------------------------------------- Habit Logs Store */

let logsCache: HabitLog[] = [];
let logsListeners = new Set<() => void>();

function loadLogs(): HabitLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HABIT_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLogs(logs: HabitLog[]) {
  logsCache = logs;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(HABIT_LOGS_KEY, JSON.stringify(logs));
    } catch {}
  }
  logsListeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  logsCache = loadLogs();
}


/**
 * Hoisted, not an inline arrow. useSyncExternalStore re-subscribes whenever
 * subscribe changes identity, so an arrow at the call site made every render
 * of every consumer drop its listener, re-add it and re-read the snapshot.
 */
const subscribeLogs = (onStoreChange: () => void) => {
  logsListeners.add(onStoreChange);
  return () => { logsListeners.delete(onStoreChange); };
};
const logsSnapshot = () => logsCache;

/** One shared empty array — `() => []` handed React a new one every call. */
const NO_LOGS: HabitLog[] = [];
const noLogs = () => NO_LOGS;

export function useHabitLogs(habitId?: string) {
  const allLogs = useSyncExternalStore(subscribeLogs, logsSnapshot, noLogs);
  // filter() allocates, so without this every render of a caller produced a
  // new array and defeated any memoisation downstream of it.
  return useMemo(
    () => (habitId ? allLogs.filter((l) => l.habit_id === habitId) : allLogs),
    [allLogs, habitId],
  );
}

export function logHabitEntry(log: HabitLog) {
  const prev = loadLogs();
  const index = prev.findIndex((l) => l.habit_id === log.habit_id && l.on_date === log.on_date);
  let updated: HabitLog[];
  if (index >= 0) {
    updated = [...prev];
    updated[index] = { ...updated[index], ...log };
  } else {
    updated = [log, ...prev];
  }
  saveLogs(updated);
}

export function removeHabitEntryLog(habitId: string, onDate: string) {
  const prev = loadLogs();
  saveLogs(prev.filter((l) => !(l.habit_id === habitId && l.on_date === onDate)));
}

/* ----------------------------------------------------------------- Streak Freezes */

const FREEZE_START = 2;

/**
 * Same external-store shape the logs above use. Reading localStorage straight
 * out of the hook meant spending a freeze changed the number on disk and left
 * every badge on screen showing the old one until an unrelated re-render.
 */
let freezeCache = FREEZE_START;
const freezeListeners = new Set<() => void>();

function readFreezes(): number {
  if (typeof window === 'undefined') return FREEZE_START;
  try {
    const raw = localStorage.getItem(HABIT_FREEZES_KEY);
    return raw !== null ? Number(raw) : FREEZE_START;
  } catch {
    return FREEZE_START;
  }
}

if (typeof window !== 'undefined') freezeCache = readFreezes();

export function getAvailableFreezes(): number {
  return freezeCache;
}

export function setAvailableFreezes(n: number) {
  freezeCache = Math.max(0, n);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(HABIT_FREEZES_KEY, String(freezeCache));
    } catch {}
  }
  freezeListeners.forEach((l) => l());
}

const subscribeFreezes = (onStoreChange: () => void) => {
  freezeListeners.add(onStoreChange);
  return () => { freezeListeners.delete(onStoreChange); };
};
const freezeSnapshot = () => freezeCache;
const freezeServerSnapshot = () => FREEZE_START;

/** Dates a freeze has been spent on, so a gap can be forgiven deliberately. */
const FROZEN_DAYS_KEY = 'basedly-habit-frozen-days-v1';

function readFrozenDays(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FROZEN_DAYS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useStreakFreezes() {
  const count = useSyncExternalStore(subscribeFreezes, freezeSnapshot, freezeServerSnapshot);

  return {
    freezes: count,
    useFreeze: (dateStr: string) => {
      if (count <= 0) {
        toast('No Streak Freezes remaining');
        return false;
      }
      setAvailableFreezes(count - 1);
      if (typeof window !== 'undefined') {
        try {
          const days = readFrozenDays();
          if (!days.includes(dateStr)) {
            localStorage.setItem(FROZEN_DAYS_KEY, JSON.stringify([...days, dateStr]));
          }
        } catch {}
      }
      toast(`Used Streak Freeze for ${dateStr} 🛡️`);
      return true;
    },
    addFreeze: () => {
      setAvailableFreezes(count + 1);
      toast('+1 Streak Freeze earned! 🛡️');
    },
  };
}

/* ----------------------------------------------------------------- Helpers */

/** Local YYYY-MM-DD — habit day boundaries follow the user's timezone, not UTC. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function lastDays(n: number): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

export function weekLabel(start: Date, end: Date): string {
  const opt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, opt)} – ${end.toLocaleDateString(undefined, opt)}`;
}

/* ----------------------------------------------------------------- Queries */

export function useHabits() {
  return useQuery({
    queryKey: HABITS_KEY,
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await supabase
        .from('bd_habits')
        .select('id,name,color,kind,target,position,archived_at,challenge_id')
        .is('archived_at', null)
        .order('position');
      if (error) throw error;

      const meta = getLocalMeta();
      return (data ?? []).map((h) => {
        const extra = meta[h.id] || {};
        return {
          ...h,
          short_name: extra.short_name ?? '',
          show_in_home: extra.show_in_home ?? true,
          category: extra.category ?? 'health',
          frequency: extra.frequency ?? 'daily',
          custom_days: extra.custom_days,
          time_of_day: extra.time_of_day ?? 'anytime',
          icon: extra.icon ?? (h.kind === 'dur' ? 'clock' : h.kind === 'count' ? 'plus' : 'check'),
          cue: extra.cue ?? '',
          target_unit: extra.target_unit ?? (h.kind === 'dur' ? 'mins' : h.kind === 'count' ? 'times' : 'day'),
          reminder_time: extra.reminder_time ?? null,
        } as Habit;
      });
    },
  });
}

export function useArchivedHabits() {
  return useQuery({
    queryKey: [...HABITS_KEY, 'archived'],
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await supabase
        .from('bd_habits')
        .select('id,name,color,kind,target,position,archived_at,challenge_id')
        .not('archived_at', 'is', null)
        .order('position');
      if (error) throw error;

      const meta = getLocalMeta();
      return (data ?? []).map((h) => ({
        ...h,
        ...(meta[h.id] || {}),
      })) as Habit[];
    },
  });
}

export function useTicks(days: number) {
  const from = ymd(lastDays(days)[0]);
  return useQuery({
    queryKey: [...TICKS_KEY, days],
    queryFn: async (): Promise<Tick[]> => {
      const { data, error } = await supabase
        .from('bd_habit_ticks')
        .select('habit_id,on_date,value')
        .gte('on_date', from);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ----------------------------------------------------------------- Gamification & Streaks */

/** Longest run of consecutive ticked days ending today. */
export function streak(ticks: Tick[], habitId: string): number {
  const set = new Set(ticks.filter((t) => t.habit_id === habitId).map((t) => t.on_date));
  let n = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Today not being ticked yet should not break yesterday's streak.
  if (!set.has(ymd(d))) d.setDate(d.getDate() - 1);
  while (set.has(ymd(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function maxStreak(ticks: Tick[], habitId: string): number {
  const dates = Array.from(new Set(ticks.filter((t) => t.habit_id === habitId).map((t) => t.on_date))).sort();
  if (!dates.length) return 0;

  let best = 0;
  let cur = 0;
  let prevDate = '';

  for (const dateStr of dates) {
    // Calendar-day adjacency, not a 24h delta — DST makes some local days 23h/25h.
    const next = fromYmd(prevDate || dateStr);
    next.setDate(next.getDate() + 1);
    cur = !prevDate || ymd(next) === dateStr ? cur + 1 : 1;
    if (cur > best) best = cur;
    prevDate = dateStr;
  }
  return best;
}

export function getStreakMultiplier(streakCount: number): number {
  if (streakCount >= 30) return 2.5;
  if (streakCount >= 14) return 2.0;
  if (streakCount >= 7) return 1.5;
  if (streakCount >= 3) return 1.25;
  return 1.0;
}

export function calculateHabitGamification(habits: Habit[], ticks: Tick[]) {
  const totalCompletions = ticks.length;
  const topStreak = habits.reduce((max, h) => Math.max(max, streak(ticks, h.id)), 0);
  const bestAllTimeStreak = habits.reduce((max, h) => Math.max(max, maxStreak(ticks, h.id)), 0);
  const multiplier = getStreakMultiplier(topStreak);

  // 15 base XP per tick multiplied by streak multiplier
  const baseHabitXp = Math.round(totalCompletions * 15 * multiplier);

  // Group by date to find perfect days
  const today = ymd(new Date());
  const dateMap: Record<string, number> = {};
  for (const t of ticks) {
    dateMap[t.on_date] = (dateMap[t.on_date] ?? 0) + 1;
  }

  const activeCount = habits.filter((h) => !h.archived_at).length;
  let perfectDays = 0;
  for (const date in dateMap) {
    if (activeCount > 0 && dateMap[date] >= activeCount) {
      perfectDays++;
    }
  }

  const totalXp = baseHabitXp + perfectDays * 50;
  const level = Math.floor(totalXp / 250) + 1;
  const currentLevelXp = totalXp % 250;
  const levelProgress = Math.min(100, Math.round((currentLevelXp / 250) * 100));

  const unlockedMilestones = HABIT_MILESTONES.filter((m) => bestAllTimeStreak >= m.days);
  const nextMilestone = HABIT_MILESTONES.find((m) => bestAllTimeStreak < m.days) ?? null;

  const todayCompleted = ticks.filter((t) => t.on_date === today).length;
  const todayPercent = activeCount > 0 ? Math.min(100, Math.round((todayCompleted / activeCount) * 100)) : 0;
  const isPerfectToday = activeCount > 0 && todayCompleted >= activeCount;

  return {
    totalCompletions,
    topStreak,
    bestAllTimeStreak,
    multiplier,
    totalXp,
    level,
    currentLevelXp,
    levelProgress,
    perfectDays,
    unlockedMilestones,
    nextMilestone,
    todayCompleted,
    activeCount,
    todayPercent,
    isPerfectToday,
  };
}

/* ----------------------------------------------------------------- Mutations */

/**
 * `toggle` flips the day on or off. `set` writes an exact value and only
 * removes the row when that value drops to zero.
 *
 * Without the split, every caller that meant "record 3 reps" or "log 42
 * minutes" hit the toggling RPC and deleted the entry it was trying to
 * update, so a count habit could never pass 1 and finishing a timer on an
 * already-ticked habit un-ticked it.
 */
export type TickMode = 'toggle' | 'set';

export type TickVars = {
  habitId: string;
  date: string;
  value?: number;
  note?: string;
  mood?: HabitLog['mood'];
  mode?: TickMode;
};

const TICK = defineMutation('habit.tick', async (v: TickVars) => {
  const user_id = await currentUserId();

  if (v.mode === 'set') {
    const next = v.value ?? 1;
    const { data: row } = await supabase
      .from('bd_habit_ticks')
      .select('id')
      .eq('user_id', user_id)
      .eq('habit_id', v.habitId)
      .eq('on_date', v.date)
      .maybeSingle();

    const { error } = next <= 0
      ? (row?.id
        ? await supabase.from('bd_habit_ticks').delete().eq('id', row.id)
        : { error: null })
      : (row?.id
        ? await supabase.from('bd_habit_ticks').update({ value: next }).eq('id', row.id)
        : await supabase.from('bd_habit_ticks').insert({
          user_id, habit_id: v.habitId, on_date: v.date, value: next,
        }));
    if (error) throw error;
    return;
  }

  const { error: rpcErr } = await supabase.rpc('bd_habit_tick', {
    p_habit: v.habitId,
    p_date: v.date,
    p_value: v.value ?? 1,
  });

  if (rpcErr) {
    // Resilient fallback: direct insert/delete if RPC is missing or fails
    const { data: existing } = await supabase
      .from('bd_habit_ticks')
      .select('id')
      .eq('user_id', user_id)
      .eq('habit_id', v.habitId)
      .eq('on_date', v.date)
      .maybeSingle();

    // The fallback's own failure has to reach the caller. Ignoring it resolved
    // the mutation as a success on a write that never happened: no rollback, no
    // retry, and the tick sat in the cache until some later refetch quietly
    // removed it. Throwing lets `tick`'s onError put the square back.
    const { error } = existing?.id
      ? await supabase.from('bd_habit_ticks').delete().eq('id', existing.id)
      : await supabase.from('bd_habit_ticks').insert({
        user_id,
        habit_id: v.habitId,
        on_date: v.date,
        value: v.value ?? 1,
      });
    if (error) throw error;
  }
});

const CREATE = defineMutation('habit.create', async (v: {
  id: string;
  name: string;
  short_name?: string;
  show_in_home?: boolean;
  color: string;
  kind?: HabitKind;
  target?: number | null;
  target_unit?: string | null;
  category?: HabitCategory;
  frequency?: HabitFrequency;
  time_of_day?: TimeOfDay;
  icon?: string;
  cue?: string;
}) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_habits').insert({
    id: v.id,
    name: v.name,
    color: v.color,
    kind: v.kind ?? 'bin',
    target: v.target ?? null,
    user_id,
  });
  if (error) throw error;

  const meta = getLocalMeta();
  meta[v.id] = {
    short_name: v.short_name,
    show_in_home: v.show_in_home ?? true,
    category: v.category ?? 'health',
    frequency: v.frequency ?? 'daily',
    time_of_day: v.time_of_day ?? 'anytime',
    icon: v.icon,
    cue: v.cue,
    target_unit: v.target_unit,
  };
  saveLocalMeta(meta);
});

const EDIT = defineMutation('habit.edit', async (v: { id: string; patch: Partial<Habit> }) => {
  const { patch } = v;
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.color !== undefined) dbPatch.color = patch.color;
  if (patch.kind !== undefined) dbPatch.kind = patch.kind;
  if (patch.target !== undefined) dbPatch.target = patch.target;
  if (patch.position !== undefined) dbPatch.position = patch.position;
  if (patch.archived_at !== undefined) dbPatch.archived_at = patch.archived_at;

  if (Object.keys(dbPatch).length > 0) {
    const { error } = await supabase.from('bd_habits').update(dbPatch).eq('id', v.id);
    if (error) throw error;
  }

  const meta = getLocalMeta();
  meta[v.id] = {
    ...(meta[v.id] || {}),
    ...patch,
  };
  saveLocalMeta(meta);
});

const ARCHIVE = defineMutation('habit.archive', async (v: { id: string; at: string | null }) => {
  const { error } = await supabase.from('bd_habits').update({ archived_at: v.at }).eq('id', v.id);
  if (error) throw error;
});

const RENAME = defineMutation('habit.rename', async (v: { id: string; name: string }) => {
  const { error } = await supabase.from('bd_habits').update({ name: v.name }).eq('id', v.id);
  if (error) throw error;
});

const SET_KIND = defineMutation('habit.setKind', async (v: { id: string; kind: Habit['kind'] }) => {
  const { error } = await supabase.from('bd_habits').update({ kind: v.kind }).eq('id', v.id);
  if (error) throw error;
});

export async function mirrorHabit(v: {
  challenge_id: string; name: string; color: string;
}): Promise<string | null> {
  const user_id = await currentUserId();

  const found = await supabase.from('bd_habits')
    .select('id,archived_at').eq('user_id', user_id).eq('challenge_id', v.challenge_id).maybeSingle();
  if (found.data?.id) {
    if (found.data.archived_at) {
      await supabase.from('bd_habits').update({ archived_at: null, name: v.name, color: v.color }).eq('id', found.data.id);
    }
    return found.data.id;
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('bd_habits')
    .insert({ id, user_id, name: v.name, color: v.color, challenge_id: v.challenge_id });
  if (!error) {
    const meta = getLocalMeta();
    meta[id] = { category: 'productivity', time_of_day: 'anytime', icon: 'trophy' };
    saveLocalMeta(meta);
    return id;
  }

  const again = await supabase.from('bd_habits')
    .select('id').eq('user_id', user_id).eq('challenge_id', v.challenge_id).maybeSingle();
  if (again.data?.id) return again.data.id;
  throw error;
}

export async function retireMirror(challenge_id: string) {
  const user_id = await currentUserId();
  await supabase.from('bd_habits')
    .update({ archived_at: new Date().toISOString() })
    .eq('user_id', user_id).eq('challenge_id', challenge_id);
}

export function useHabitActions(days = 30) {
  const qc = useQueryClient();
  const tKey = [...TICKS_KEY, days];
  const settle = settler(qc, TICKS_KEY, HABITS_KEY, ['challenges'], ['challenge_members'], ['challenge_days'], ['metric']);

  const tick = useMutation({
    mutationKey: TICK,
    onMutate: (v: TickVars) => {
      const prev = queryClient.getQueryData<Tick[]>(tKey) ?? [];
      const on = prev.some((t) => t.habit_id === v.habitId && t.on_date === v.date);

      // `set` writes the value it was given. Only `toggle` may clear the day,
      // which is what a square in the grid and the Mark Done button mean.
      const next = v.value ?? 1;
      const clearing = v.mode === 'set' ? next <= 0 : on;

      if (!clearing) {
        if (!on) playTick();
        if (v.note || v.mood) {
          logHabitEntry({
            habit_id: v.habitId,
            on_date: v.date,
            value: next,
            note: v.note,
            mood: v.mood,
            completed_at: new Date().toISOString(),
          });
        }
      } else {
        removeHabitEntryLog(v.habitId, v.date);
      }

      queryClient.setQueryData<Tick[]>(
        tKey,
        clearing
          ? prev.filter((t) => !(t.habit_id === v.habitId && t.on_date === v.date))
          : on
            ? prev.map((t) => (t.habit_id === v.habitId && t.on_date === v.date
              ? { ...t, value: next } : t))
            : [...prev, { habit_id: v.habitId, on_date: v.date, value: next }]
      );
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(tKey, ctx); },
    onSettled: settle,
  });

  const create = useMutation<unknown, Error, Partial<Habit> & { id: string; name: string; color: string }, Habit[]>({
    mutationKey: CREATE,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Habit[]>(HABITS_KEY) ?? [];
      const newHabit: Habit = {
        id: v.id,
        name: v.name,
        color: v.color,
        kind: v.kind ?? 'bin',
        target: v.target ?? null,
        target_unit: v.target_unit ?? null,
        position: prev.length,
        archived_at: null,
        challenge_id: null,
        category: v.category ?? 'health',
        frequency: v.frequency ?? 'daily',
        time_of_day: v.time_of_day ?? 'anytime',
        icon: v.icon ?? 'check',
        cue: v.cue ?? '',
        reminder_time: v.reminder_time ?? null,
      };
      queryClient.setQueryData<Habit[]>(HABITS_KEY, [...prev, newHabit]);
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(HABITS_KEY, ctx); },
    onSettled: settle,
  });

  const edit = useMutation<unknown, Error, { id: string; patch: Partial<Habit> }, Habit[]>({
    mutationKey: EDIT,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Habit[]>(HABITS_KEY) ?? [];
      queryClient.setQueryData<Habit[]>(
        HABITS_KEY,
        prev.map((h) => (h.id === v.id ? { ...h, ...v.patch } : h))
      );
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(HABITS_KEY, ctx); },
    onSettled: settle,
  });

  const archive = useMutation<unknown, Error, { id: string; at: string | null }>({
    mutationKey: ARCHIVE,
    onSettled: settle,
  });

  const rename = useMutation<unknown, Error, { id: string; name: string }>({
    mutationKey: RENAME,
    onSettled: settle,
  });

  const setKind = useMutation<unknown, Error, { id: string; kind: Habit['kind'] }>({
    mutationKey: SET_KIND,
    onSettled: settle,
  });

  const removeWithUndo = (h: Habit) => {
    archive.mutate({ id: h.id, at: new Date().toISOString() });
    toast(`Deleted “${h.name}”`, () => archive.mutate({ id: h.id, at: null }));
  };

  const completeAllToday = (habits: Habit[]) => {
    const today = ymd(new Date());
    const prevTicks = queryClient.getQueryData<Tick[]>(tKey) ?? [];
    const unticked = habits.filter((h) => !h.archived_at && !prevTicks.some((t) => t.habit_id === h.id && t.on_date === today));

    if (unticked.length === 0) {
      toast('All habits already completed for today!');
      return;
    }

    unticked.forEach((h) => {
      tick.mutate({ habitId: h.id, date: today, value: h.target ?? 1 });
    });
    playCelebration();
    toast(`Boom! Completed all ${unticked.length} habits for today! 🎉🔥`);
  };

  const resetToday = (habits: Habit[]) => {
    const today = ymd(new Date());
    const prevTicks = queryClient.getQueryData<Tick[]>(tKey) ?? [];
    const ticked = habits.filter((h) => prevTicks.some((t) => t.habit_id === h.id && t.on_date === today));

    ticked.forEach((h) => {
      tick.mutate({ habitId: h.id, date: today });
    });
    toast(`Reset today's progress for ${ticked.length} habits`);
  };

  return {
    tick,
    create,
    edit,
    archive,
    rename,
    setKind,
    removeWithUndo,
    completeAllToday,
    resetToday,
  };
}
