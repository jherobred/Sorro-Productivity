'use client';

import { ymd, type Habit, type Tick } from './habits';
import type { Task } from './tasks';
import { supabase, currentUserId } from './supabase';
import { queryClient } from './offline';
import { toast } from './toast';

export type Quest = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  current: number;
  target: number;
  reward: number; // RP
  claimed: boolean;
  completed: boolean;
};

const LS_QUESTS_KEY = 'bd.claimedQuests';

export function getClaimedQuests(todayStr: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(`${LS_QUESTS_KEY}.${todayStr}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/**
 * A claim used to be recorded locally and then banked in an async block whose
 * every failure mode was swallowed by `catch {}` — and an upsert that RLS or a
 * constraint refuses reports that in `error` rather than throwing, so even a
 * rejected write looked like a success. The quest was marked claimed forever
 * and the RP never arrived. The local mark is now undone when the write does
 * not land, so the quest can be claimed again.
 */
function unclaim(todayStr: string, questId: string) {
  try {
    const claimed = getClaimedQuests(todayStr);
    claimed.delete(questId);
    localStorage.setItem(`${LS_QUESTS_KEY}.${todayStr}`, JSON.stringify(Array.from(claimed)));
  } catch {}
}

export function claimQuestReward(todayStr: string, questId: string, reward = 20): void {
  if (typeof window === 'undefined') return;
  try {
    const claimed = getClaimedQuests(todayStr);
    claimed.add(questId);
    localStorage.setItem(`${LS_QUESTS_KEY}.${todayStr}`, JSON.stringify(Array.from(claimed)));

    // Also sync to Supabase bd_ranked table
    void (async () => {
      try {
        const me = await currentUserId();
        const { data: cur } = await supabase.from('bd_ranked')
          .select('rp,peak_rp,wins,losses').eq('user_id', me).maybeSingle();
        const rp = (cur?.rp ?? 0) + reward;
        const { error } = await supabase.from('bd_ranked').upsert({
          user_id: me,
          rp,
          peak_rp: Math.max(cur?.peak_rp ?? 0, rp),
          wins: cur?.wins ?? 0,
          losses: cur?.losses ?? 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['ranked'] });
      } catch (e) {
        unclaim(todayStr, questId);
        toast('Could not bank that reward — try again');
        console.warn('Quest reward not banked:', e);
      }
    })();
  } catch {}
}

export function deriveDailyQuests({
  tasks = [],
  habits = [],
  ticks = [],
  notesUpdatedToday = 0,
  eventsCountToday = 0,
}: {
  tasks?: Task[];
  habits?: Habit[];
  ticks?: Tick[];
  notesUpdatedToday?: number;
  eventsCountToday?: number;
}): Quest[] {
  const todayStr = ymd(new Date());
  const claimed = getClaimedQuests(todayStr);

  // 1. Habits ticked today
  const todayTicks = ticks.filter((t) => t.on_date === todayStr && t.value > 0).length;

  // 2. Tasks completed today
  const tasksDoneToday = tasks.filter((t) => {
    if (!t.done) return false;
    if (t.completed_at) return ymd(new Date(t.completed_at)) === todayStr;
    return t.due_on === todayStr;
  }).length;

  const quests: Quest[] = [
    {
      id: 'tasks_today',
      title: 'Action Champion',
      desc: 'Check off 2 tasks on your to-do list today',
      icon: 'task',
      current: Math.min(2, tasksDoneToday),
      target: 2,
      reward: 25,
      claimed: claimed.has('tasks_today'),
      completed: tasksDoneToday >= 2,
    },
    {
      id: 'habits_today',
      title: 'Habit Builder',
      desc: 'Log and complete 2 daily habits or routines',
      icon: 'habit',
      current: Math.min(2, todayTicks),
      target: 2,
      reward: 20,
      claimed: claimed.has('habits_today'),
      completed: todayTicks >= 2,
    },
    {
      id: 'knowledge_note',
      title: 'Idea Spark',
      desc: 'Jot down a quick thought in scratchpad or update a note',
      icon: 'book',
      current: Math.min(1, notesUpdatedToday),
      target: 1,
      reward: 15,
      claimed: claimed.has('knowledge_note'),
      completed: notesUpdatedToday >= 1,
    },
    {
      id: 'daily_focus',
      title: 'Focus Sprint',
      desc: 'Complete at least 1 task or start a Pomodoro session',
      icon: 'clock',
      current: Math.min(1, tasksDoneToday > 0 ? 1 : 0),
      target: 1,
      reward: 20,
      claimed: claimed.has('daily_focus'),
      completed: tasksDoneToday >= 1,
    },
  ];

  return quests;
}
