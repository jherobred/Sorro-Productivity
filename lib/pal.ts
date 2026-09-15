// Category palette + per-section hues. Values from README.md "Design tokens".

export const PAL = {
  coral: '#FF6B6B',
  indigo: '#7C8CFF',
  cyan: '#38D6F2',
  mint: '#34D9A0',
  violet: '#B07CFF',
  amber: '#FFC24B',
  deep: '#8B6BFF',
  pink: '#FF6FA8',
  sky: '#38BDF8',
  lime: '#A3E635',
} as const;

export type PalKey = keyof typeof PAL;

export const SECHUE: Record<string, string> = {
  home: '#8B7CFF',
  calendar: '#38BDF8',
  tasks: '#34D9A0',
  notebooks: '#B07CFF',
  projects: '#FFC24B',
  habits: '#FF6B6B',
  gym: '#FF6FA8',
  fitness: '#FF6FA8',
  fuel: '#A3E635',
  money: '#34D9A0',
  profile: '#FF6FA8',
  files: '#7C8CFF',
  people: '#38D6F2',
  // community intentionally absent — it tints to the user's accent.
};

/** Retired in favour of RETIRED_ACCENT's replacement; see prefs.read(). */
export const RETIRED_ACCENT = '#7C6CFF';
export const DEFAULT_ACCENT = '#8B7CFF';

/** Interaction constants — README.md "Interaction constants". These are tuned; reuse them. */
export const K = {
  longPressMs: 420,
  longPressCancelPx: 7,
  hapticMs: 12,
  taskExitMs: 380,
  toastMs: 4200,
  toastSweepMs: 900,
  calDayPx: 46,
  calHalfHourPx: 16,
  calStartHour: 7,
  calEndHour: 21,
  notebookSwipePx: 156,
  countdownTickMs: 1000,
} as const;
