export type HabitCategory =
  | 'health'
  | 'fitness'
  | 'study'
  | 'mind'
  | 'productivity'
  | 'finance'
  | 'lifestyle'
  | 'custom';

export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom_days';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'anytime';

export type HabitKind = 'bin' | 'count' | 'dur';

export type HabitLog = {
  habit_id: string;
  on_date: string;
  value: number;
  note?: string;
  mood?: 'fire' | 'happy' | 'neutral' | 'tired' | 'skull';
  completed_at?: string;
};

export type HabitMilestone = {
  id: string;
  days: number;
  title: string;
  icon: string;
  color: string;
  description: string;
};

export const HABIT_MILESTONES: HabitMilestone[] = [
  { id: 'spark', days: 3, title: 'Spark of Habit', icon: 'spark', color: '#FFC24B', description: '3 days of unbroken consistency' },
  { id: 'flame', days: 7, title: 'Weekly Flame', icon: 'flame', color: '#FF7A45', description: '7-day unbroken momentum' },
  { id: 'warrior', days: 14, title: 'Fortnight Warrior', icon: 'trophy', color: '#38D6F2', description: '2 full weeks of dedication' },
  { id: 'builder', days: 21, title: 'Habit Builder', icon: 'check', color: '#52C41A', description: '21 days — the scientific neuroplasticity threshold' },
  { id: 'master', days: 30, title: 'Monthly Master', icon: 'star', color: '#9254DE', description: '30 days of relentless discipline' },
  { id: 'unstoppable', days: 60, title: 'Unstoppable Force', icon: 'flame', color: '#F759AB', description: '60 days in a row' },
  { id: 'titan', days: 100, title: 'Century Titan', icon: 'trophy', color: '#FA8C16', description: '100 days of absolute mastery' },
  { id: 'legend', days: 365, title: 'Annual Legend', icon: 'trophy', color: '#FADB14', description: 'A full 365-day year of perfection' },
];

export type HabitCategoryDef = {
  id: HabitCategory;
  label: string;
  icon: string;
  color: string;
};

export const HABIT_CATEGORIES: HabitCategoryDef[] = [
  { id: 'health', label: 'Health & Body', icon: 'heart', color: '#FF6B6B' },
  { id: 'fitness', label: 'Fitness & Gym', icon: 'gym', color: '#34D9A0' },
  { id: 'study', label: 'Study & Skills', icon: 'clock', color: '#38D6F2' },
  { id: 'mind', label: 'Mind & Mindfulness', icon: 'spark', color: '#A855F7' },
  { id: 'productivity', label: 'Productivity', icon: 'task', color: '#7C6CFF' },
  { id: 'finance', label: 'Money & Budget', icon: 'money', color: '#FFC24B' },
  { id: 'lifestyle', label: 'Lifestyle & Routine', icon: 'sun', color: '#FF85C0' },
  { id: 'custom', label: 'Other', icon: 'plus', color: '#8C8C8C' },
];

export type HabitPreset = {
  id: string;
  name: string;
  category: HabitCategory;
  kind: HabitKind;
  target: number;
  target_unit: string;
  color: string;
  icon: string;
  time_of_day: TimeOfDay;
  cue: string;
  default_duration?: number; // in seconds
};

export const HABIT_PRESETS: HabitPreset[] = [
  {
    id: 'hydrate',
    name: 'Drink 2.5L Water',
    category: 'health',
    kind: 'count',
    target: 8,
    target_unit: 'glasses',
    color: '#38D6F2',
    icon: 'droplet',
    time_of_day: 'anytime',
    cue: 'Keep a full water bottle on my desk throughout the day',
  },
  {
    id: 'deep-work',
    name: 'Deep Focus Work',
    category: 'productivity',
    kind: 'dur',
    target: 90,
    target_unit: 'mins',
    color: '#7C6CFF',
    icon: 'clock',
    time_of_day: 'morning',
    cue: 'After morning coffee, put phone in another room and open focus timer',
    default_duration: 5400,
  },
  {
    id: 'read-books',
    name: 'Read 20 Pages',
    category: 'study',
    kind: 'count',
    target: 20,
    target_unit: 'pages',
    color: '#FFC24B',
    icon: 'book',
    time_of_day: 'evening',
    cue: 'Before sleeping, place the book on the pillow',
  },
  {
    id: 'gym-workout',
    name: 'Gym / Lift Workout',
    category: 'fitness',
    kind: 'dur',
    target: 60,
    target_unit: 'mins',
    color: '#34D9A0',
    icon: 'gym',
    time_of_day: 'afternoon',
    cue: 'Pack gym bag the night before beside the door',
    default_duration: 3600,
  },
  {
    id: 'meditation',
    name: 'Mindful Meditation',
    category: 'mind',
    kind: 'dur',
    target: 15,
    target_unit: 'mins',
    color: '#A855F7',
    icon: 'spark',
    time_of_day: 'morning',
    cue: 'Right after waking up, sit on the floor for 15 minutes of silence',
    default_duration: 900,
  },
  {
    id: 'cold-shower',
    name: 'Cold Shower Reset',
    category: 'health',
    kind: 'bin',
    target: 1,
    target_unit: 'time',
    color: '#36CFC9',
    icon: 'snowflake',
    time_of_day: 'morning',
    cue: 'Turn handle to full cold for the last 2 minutes of shower',
  },
  {
    id: 'journal-gratitude',
    name: 'Daily Gratitude & Journal',
    category: 'mind',
    kind: 'bin',
    target: 1,
    target_unit: 'entry',
    color: '#FF85C0',
    icon: 'pen',
    time_of_day: 'evening',
    cue: 'Write 3 specific wins before closing the laptop',
  },
  {
    id: 'no-sugar',
    name: 'Zero Refined Sugar',
    category: 'health',
    kind: 'bin',
    target: 1,
    target_unit: 'day',
    color: '#FF6B6B',
    icon: 'x-circle',
    time_of_day: 'anytime',
    cue: 'Replace afternoon sweet cravings with green tea or sparkling water',
  },
  {
    id: 'wake-early',
    name: 'Wake Up at 6:00 AM',
    category: 'lifestyle',
    kind: 'bin',
    target: 1,
    target_unit: 'day',
    color: '#FFA940',
    icon: 'sun',
    time_of_day: 'morning',
    cue: 'Place alarm clock across the room so I have to stand up',
  },
  {
    id: 'budget-check',
    name: 'Review Daily Spend',
    category: 'finance',
    kind: 'bin',
    target: 1,
    target_unit: 'check',
    color: '#52C41A',
    icon: 'money',
    time_of_day: 'evening',
    cue: 'Open Sorro Money tab before dinner and tag any unclassified receipts',
  },
];
