/**
 * The animal that stands in for a person in a challenge, and how it is feeling.
 *
 *   node lib/mascot.check.ts
 *
 * **Why an animal at all.** A challenge is other people, and a leaderboard
 * renders them as a row of initials in a coloured disc — which is a
 * spreadsheet wearing a lanyard. A creature that looks back at you is a
 * competitor. The whole point of the section is that you turn up because
 * somebody else did, and that only works if the somebody else is visible.
 *
 * **The rule the moods are built on: never punish the person in last place.**
 * The obvious design is a sad animal for whoever is behind, and it is the
 * wrong one — the person losing a fitness challenge on day four is exactly the
 * person about to quit, and a screen that agrees with them is a screen that
 * finishes the job. So mood tracks *your own movement*, never your position:
 * did you do the thing recently. Somebody last on the board who went this
 * morning gets the same bright face as the leader, because they earned the same
 * thing this morning. The only place the standings show up is a small crown on
 * the leader, which is a fact rather than a judgement.
 *
 * The animal itself is derived from the user id, so the same person is the same
 * creature everywhere without a column to store it in.
 */

export type Animal = 'fox' | 'cat' | 'bear' | 'owl' | 'frog' | 'panda' | 'rabbit' | 'wolf';

export const ANIMALS: Animal[] = ['fox', 'cat', 'bear', 'owl', 'frog', 'panda', 'rabbit', 'wolf'];

/** Stable per-person creature. Same hash shape as `hueOf`, so the two agree. */
export function animalOf(id: string): Animal {
  let n = 0;
  for (const c of id) n = (n + c.charCodeAt(0) * 31) % 9973;
  return ANIMALS[n % ANIMALS.length];
}

/**
 * How the creature looks.
 *
 * - `blazing` — moved today, and top of the board. The one place standing
 *   matters at all.
 * - `keen` — moved today, or within the last couple of days. Most of the time
 *   this is everyone, which is the intended feeling.
 * - `waiting` — has never logged anything here. Curious, not disappointed:
 *   nothing has gone wrong yet.
 * - `resting` — nothing for three days or more. Asleep, not sad. A rest day is
 *   a real thing and the picture says so.
 */
export type Mood = 'blazing' | 'keen' | 'waiting' | 'resting';

export function moodOf(v: { daysSince: number | null; leading: boolean }): Mood {
  if (v.daysSince === null) return 'waiting';
  if (v.daysSince === 0) return v.leading ? 'blazing' : 'keen';
  if (v.daysSince <= 2) return 'keen';
  return 'resting';
}

/**
 * Whole days since this person last did the thing, from their day series.
 * `null` when they never have — which is a different state from "a long time
 * ago" and gets a different face.
 */
export function daysSince(series: Record<string, number>, today: string): number | null {
  const days = Object.entries(series).filter(([, v]) => v > 0).map(([d]) => d).sort();
  const last = days[days.length - 1];
  if (!last) return null;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * The line under your own row.
 *
 * Addressed to you, about you, and never about how far behind you are — the
 * gap is on the board already and repeating it in words is just a second way
 * of saying the same discouraging thing. What a person can act on is the next
 * day, so that is what this talks about.
 */
export function nudge(v: {
  mood: Mood; streak: number; leading: boolean; leader: string | null; daysLeft: number;
}): string {
  if (v.daysLeft <= 0) return 'That is the whole run. Well done for finishing it.';

  switch (v.mood) {
    case 'blazing':
      return v.streak > 1 ? `${v.streak} days on the trot, and out in front.` : 'Out in front today.';
    case 'keen':
      return v.streak > 2
        ? `${v.streak} days running. That is the hard part done.`
        : v.leading ? 'Logged today. Keep it going.' : 'Logged today — that is all today asked for.';
    case 'waiting':
      return v.leader
        ? `${v.leader} has started. One session puts you on the board.`
        : 'Nobody has started yet. First one on the board sets the pace.';
    case 'resting':
    default:
      return v.daysLeft > 3
        ? `Rested a few days. ${v.daysLeft} left is plenty of room.`
        : `${v.daysLeft} day${v.daysLeft === 1 ? '' : 's'} left — one more session still counts.`;
  }
}

/** Consecutive days up to and including today. The number the nudge quotes. */
export function streakOf(series: Record<string, number>, today: string): number {
  let n = 0;
  const day = new Date(`${today}T00:00:00Z`);
  for (;;) {
    const key = day.toISOString().slice(0, 10);
    if (!(series[key] > 0)) break;
    n += 1;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return n;
}
