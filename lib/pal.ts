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

/**
 * Section hues, retuned warm.
 *
 * The old set was indigo, sky, spring green, violet, hot pink — a saturated
 * cool spectrum sitting on a ground that is now warm ink. Two problems: it
 * fought the ground, and `tasks` and `money` were the same hex, so two
 * sidebar rows lit up identically.
 *
 * Each value keeps roughly the lightness of the one it replaces, which is what
 * `hueTx()` and the 16% sidebar tint are tuned against, and every one clears
 * 5:1 against `--card2` in the dark theme where the calendar draws it as text.
 */
export const SECHUE: Record<string, string> = {
  home: '#F0865C',
  calendar: '#63BCD6',
  tasks: '#6FD69C',
  notebooks: '#D18FD6',
  projects: '#F0B44E',
  habits: '#F07A63',
  body: '#E886A2',
  money: '#9CCB6A',
  profile: '#E29578',
  files: '#A0A6E8',
  people: '#6FC7BC',
  // community intentionally absent — it tints to the user's accent.
};

/** Ember. See the `--acc` note in globals.css for why it is not indigo. */
export const DEFAULT_ACCENT = '#E8734A';

/**
 * The accent every account is carrying right now, because it was the default
 * and almost nobody opens the swatch grid. A stored value that is exactly this
 * is the old default rather than a choice, so it is dropped on read and the
 * account picks up DEFAULT_ACCENT. Anything else is a real preference and is
 * left alone. Delete this and the constant once no live profile still holds it.
 */
export const LEGACY_ACCENT = '#7C6CFF';

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
