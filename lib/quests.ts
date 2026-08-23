'use client';

import { ymd, type Habit, type Tick } from './habits';
import type { Task } from './tasks';

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

export function claimQuestReward(todayStr: string, questId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const claimed = getClaimedQuests(todayStr);
    claimed.add(questId);
    localStorage.setItem(`${LS_QUESTS_KEY}.${todayStr}`, JSON.stringify(Array.from(claimed)));
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
    if (!t.done || !t.completed_at) return false;
    return t.completed_at.slice(0, 10) === todayStr;
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
