'use client';

/**
 * The competitive ladder, modelled on Marvel Rivals: seven tiers of three
 * divisions each, then two capstone ranks that have no divisions. Rank points
 * are the only stored number — tier, division and progress are all derived, so
 * the thresholds can be retuned without a migration.
 *
 *   Bronze III  0     …  Bronze I   200
 *   Silver III  300   …  Celestial I 2000
 *   Eternity    2100     (no divisions)
 *   One Above All 2600
 */

export type Tier = {
  name: string;
  from: number;
  hue: string;
  divisions: number;
};

export const TIERS: Tier[] = [
  { name: 'Bronze', from: 0, hue: '#B87333', divisions: 3 },
  { name: 'Silver', from: 300, hue: '#B9C0CC', divisions: 3 },
  { name: 'Gold', from: 600, hue: '#FFC24B', divisions: 3 },
  { name: 'Platinum', from: 900, hue: '#34D9A0', divisions: 3 },
  { name: 'Diamond', from: 1200, hue: '#38D6F2', divisions: 3 },
  { name: 'Grandmaster', from: 1500, hue: '#FF6B6B', divisions: 3 },
  { name: 'Celestial', from: 1800, hue: '#B07CFF', divisions: 3 },
  { name: 'Eternity', from: 2100, hue: '#7C6CFF', divisions: 1 },
  { name: 'One Above All', from: 2600, hue: '#FF6FA8', divisions: 1 },
];

const DIVISION_SIZE = 100;
const ROMAN = ['', 'I', 'II', 'III'];

export type Rank = {
  tier: Tier;
  /** 3 → 1, counting *down* as you climb, which is the convention. 0 = none. */
  division: number;
  label: string;
  /** 0–1 through the current division, for the progress bar. */
  progress: number;
  /** RP still needed to promote; null at the top. */
  toNext: number | null;
  rp: number;
};

export function rankOf(rp: number): Rank {
  const clamped = Math.max(0, Math.round(rp));
  const tier = [...TIERS].reverse().find((t) => clamped >= t.from) ?? TIERS[0];
  const into = clamped - tier.from;

  if (tier.divisions === 1) {
    const next = TIERS[TIERS.indexOf(tier) + 1];
    return {
      tier, division: 0, label: tier.name,
      progress: next ? Math.min(1, into / (next.from - tier.from)) : 1,
      toNext: next ? next.from - clamped : null,
      rp: clamped,
    };
  }

  const step = Math.min(tier.divisions - 1, Math.floor(into / DIVISION_SIZE));
  const division = tier.divisions - step;
  return {
    tier,
    division,
    label: `${tier.name} ${ROMAN[division]}`,
    progress: (into - step * DIVISION_SIZE) / DIVISION_SIZE,
    toNext: DIVISION_SIZE - ((into - step * DIVISION_SIZE) % DIVISION_SIZE),
    rp: clamped,
  };
}

/**
 * RP awarded when a challenge settles. Placing well is worth more in a bigger
 * field, and finishing last still pays something as long as you took part —
 * the point is accountability, not punishment.
 */
export function rpFor(place: number, field: number): number {
  if (field <= 1) return 10;
  const top = Math.max(1, Math.round(field * 0.34));
  if (place === 1) return 60 + field * 4;
  if (place <= top) return 34 + field * 2;
  if (place <= Math.ceil(field / 2)) return 14;
  return 4;
}

/* ------------------------------------------------------------ challenges */

/** What a challenge counts. Each maps to something the app already tracks. */
export const METRICS = [
  { id: 'habit', label: 'A habit', hint: 'Ticks on one of your habits', icon: 'habit', unit: 'days' },
  { id: 'task', label: 'Tasks done', hint: 'Anything you complete in Tasks', icon: 'task', unit: 'tasks' },
  { id: 'project', label: 'Project progress', hint: 'Percentage moved on a board', icon: 'proj', unit: '%' },
  { id: 'body', label: 'Gym sessions', hint: 'Days logged in Body', icon: 'gym', unit: 'sessions' },
  { id: 'study', label: 'Study hours', hint: 'Deep-work blocks on the calendar', icon: 'clock', unit: 'hours' },
] as const;

export type MetricId = (typeof METRICS)[number]['id'];

/** How a winner is decided. */
export const RULES = [
  { id: 'most', label: 'Who can do the most', hint: 'Highest count when the clock runs out wins.' },
  { id: 'first_to', label: 'First one to…', hint: 'The first to reach the target takes it, and the challenge ends.' },
  { id: 'streak', label: 'Longest streak', hint: 'Consecutive days only — one miss and you start again.' },
] as const;

export type RuleId = (typeof RULES)[number]['id'];

/** Ordering for the leaderboard, and whether the challenge is already decided. */
export function standings<T extends { progress: number; user_id: string }>(
  members: T[],
  rule: RuleId,
  target: number | null,
): { rows: (T & { place: number })[]; winner: T | null } {
  const rows = [...members]
    .sort((a, b) => b.progress - a.progress)
    .map((m, i) => ({ ...m, place: i + 1 }));

  const winner = rule === 'first_to' && target != null
    ? rows.find((r) => r.progress >= target) ?? null
    : null;

  return { rows, winner };
}

/**
 * One runnable check. The ladder is the kind of thing that silently goes wrong
 * at a boundary and nobody notices until someone's rank is off by a division.
 */
export function demo() {
  const eq = (label: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${label}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  };

  eq('floor', rankOf(0).label, 'Bronze III');
  eq('mid division', rankOf(99).label, 'Bronze III');
  eq('promote to II', rankOf(100).label, 'Bronze II');
  eq('promote to I', rankOf(200).label, 'Bronze I');
  eq('tier boundary', rankOf(300).label, 'Silver III');
  eq('one below a tier', rankOf(299).label, 'Bronze I');
  eq('gold', rankOf(700).label, 'Gold II');
  eq('celestial top', rankOf(2099).label, 'Celestial I');
  eq('no divisions above', rankOf(2100).label, 'Eternity');
  eq('the top', rankOf(3000).label, 'One Above All');
  eq('negatives floor out', rankOf(-50).label, 'Bronze III');

  eq('progress at a boundary', rankOf(300).progress, 0);
  eq('progress mid', Math.round(rankOf(350).progress * 100), 50);
  eq('top rank is full', rankOf(4000).progress, 1);
  eq('top rank has no next', rankOf(4000).toNext, null);

  eq('winning a big field pays more', rpFor(1, 20) > rpFor(1, 4), true);
  eq('taking part still pays', rpFor(9, 9) > 0, true);
  eq('first beats second', rpFor(1, 10) > rpFor(2, 10), true);

  const { rows, winner } = standings(
    [{ user_id: 'a', progress: 3 }, { user_id: 'b', progress: 9 }, { user_id: 'c', progress: 5 }],
    'first_to', 8,
  );
  eq('sorted by progress', rows.map((r) => r.user_id), ['b', 'c', 'a']);
  eq('first past the target wins', winner?.user_id, 'b');
  eq('no winner until reached', standings([{ user_id: 'a', progress: 1 }], 'first_to', 8).winner, null);

  return 'rank: all checks passed';
}
