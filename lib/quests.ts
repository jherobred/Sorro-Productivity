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
}: {
  tasks?: Task[];
  habits?: Habit[];
  ticks?: Tick[];
  notesUpdatedToday?: number;
}): Quest[] {
  const todayStr = ymd(new Date());
  const claimed = getClaimedQuests(todayStr);

  // 1. Habits ticked today
  const todayTicks = ticks.filter((t) => t.on_date === todayStr && t.value > 0).length;

  // 2. Tasks completed today
  const tasksDoneToday = tasks.filter((t) => {
    if (!t.done) return false;
    // completed_at is a UTC ISO string, so slicing it compares the wrong day
    // either side of local midnight — convert it. due_on is already a local
    // yyyy-mm-dd and must not go through the same conversion.
    if (t.completed_at) return ymd(new Date(t.completed_at)) === todayStr;
    return t.due_on === todayStr;
  }).length;

  const quests: Quest[] = [
    {
      id: 'habits_3',
      title: 'Habit Warrior',
      desc: 'Complete at least 2 habits today',
      icon: 'habit',
      current: Math.min(2, todayTicks),
      target: 2,
      reward: 20,
      claimed: claimed.has('habits_3'),
      completed: todayTicks >= 2,
    },
    {
      id: 'tasks_2',
      title: 'Task Slayer',
      desc: 'Complete 2 todo tasks today',
      icon: 'task',
      current: Math.min(2, tasksDoneToday),
      target: 2,
      reward: 25,
      claimed: claimed.has('tasks_2'),
      completed: tasksDoneToday >= 2,
    },
    {
      id: 'knowledge_1',
      title: 'Brain Power',
      desc: 'Capture a quick scratch note or study thought',
      icon: 'book',
      current: Math.min(1, notesUpdatedToday),
      target: 1,
      reward: 15,
      claimed: claimed.has('knowledge_1'),
      completed: notesUpdatedToday >= 1,
    },
  ];

  return quests;
}
