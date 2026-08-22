/**
 * The gym, as arithmetic. Pure, so it can be checked without a browser:
 *
 *   node lib/lift.check.ts
 *
 * `bd_workouts` records that a session happened, which muscles it touched and
 * how long it took. That is enough to warm a body map and to count a gym day,
 * and not enough to answer the one question a person standing at a rack
 * actually has: *what did I do last time?* Without it they guess, and a guess
 * is how a training log stops being worth keeping.
 *
 * So a session holds sets, and a set is a weight and a number of reps. Three
 * things fall out of those two numbers, and they are the whole point:
 *
 *   - **Last time**, prefilled into the next set, so logging is one tap.
 *   - **Volume** (weight x reps, summed) — the honest measure of how hard a
 *     session was. Twenty minutes of heavy squats beats an hour of wandering,
 *     and only volume says so.
 *   - **An estimated one-rep max**, so 8 at 60 kg and 5 at 70 kg can be
 *     compared at all.
 *
 * The exercise list is a constant, not a table and not a dataset download.
 * Forty movements covers a campus gym; anything missing is typed in and lives
 * as a name like any other.
 */

/** Top to bottom, the order the body map draws. `lib/body.ts` re-exports this. */
export const MUSCLES = ['chest', 'back', 'arms', 'core', 'legs', 'cardio'] as const;
export type Muscle = (typeof MUSCLES)[number];

export type Kind = 'weight' | 'bodyweight' | 'cardio';

export type Exercise = { id: string; name: string; group: Muscle; kind: Kind };

/** One line of a session. Mirrors a `bd_workout_sets` row. */
export type WorkoutSet = {
  id: string;
  workout_id: string;
  exercise: string;
  position: number;
  weight_kg: number;
  reps: number;
  done: boolean;
};

export const EXERCISES: Exercise[] = [
  { id: 'bench', name: 'Bench press', group: 'chest', kind: 'weight' },
  { id: 'incline', name: 'Incline press', group: 'chest', kind: 'weight' },
  { id: 'dbfly', name: 'Dumbbell fly', group: 'chest', kind: 'weight' },
  { id: 'pushup', name: 'Push-up', group: 'chest', kind: 'bodyweight' },
  { id: 'dip', name: 'Dip', group: 'chest', kind: 'bodyweight' },
  { id: 'cablefly', name: 'Cable fly', group: 'chest', kind: 'weight' },

  { id: 'deadlift', name: 'Deadlift', group: 'back', kind: 'weight' },
  { id: 'row', name: 'Barbell row', group: 'back', kind: 'weight' },
  { id: 'dbrow', name: 'Dumbbell row', group: 'back', kind: 'weight' },
  { id: 'pulldown', name: 'Lat pulldown', group: 'back', kind: 'weight' },
  { id: 'pullup', name: 'Pull-up', group: 'back', kind: 'bodyweight' },
  { id: 'facepull', name: 'Face pull', group: 'back', kind: 'weight' },
  { id: 'shrug', name: 'Shrug', group: 'back', kind: 'weight' },

  { id: 'ohp', name: 'Overhead press', group: 'arms', kind: 'weight' },
  { id: 'lateral', name: 'Lateral raise', group: 'arms', kind: 'weight' },
  { id: 'curl', name: 'Barbell curl', group: 'arms', kind: 'weight' },
  { id: 'hammer', name: 'Hammer curl', group: 'arms', kind: 'weight' },
  { id: 'triext', name: 'Triceps extension', group: 'arms', kind: 'weight' },
  { id: 'pushdown', name: 'Cable pushdown', group: 'arms', kind: 'weight' },
  { id: 'preacher', name: 'Preacher curl', group: 'arms', kind: 'weight' },

  { id: 'plank', name: 'Plank', group: 'core', kind: 'bodyweight' },
  { id: 'crunch', name: 'Crunch', group: 'core', kind: 'bodyweight' },
  { id: 'legraise', name: 'Hanging leg raise', group: 'core', kind: 'bodyweight' },
  { id: 'russian', name: 'Russian twist', group: 'core', kind: 'weight' },
  { id: 'cablecrunch', name: 'Cable crunch', group: 'core', kind: 'weight' },

  { id: 'squat', name: 'Back squat', group: 'legs', kind: 'weight' },
  { id: 'frontsquat', name: 'Front squat', group: 'legs', kind: 'weight' },
  { id: 'legpress', name: 'Leg press', group: 'legs', kind: 'weight' },
  { id: 'lunge', name: 'Walking lunge', group: 'legs', kind: 'weight' },
  { id: 'rdl', name: 'Romanian deadlift', group: 'legs', kind: 'weight' },
  { id: 'legcurl', name: 'Leg curl', group: 'legs', kind: 'weight' },
  { id: 'legext', name: 'Leg extension', group: 'legs', kind: 'weight' },
  { id: 'calf', name: 'Calf raise', group: 'legs', kind: 'weight' },
  { id: 'hipthrust', name: 'Hip thrust', group: 'legs', kind: 'weight' },

  { id: 'run', name: 'Run', group: 'cardio', kind: 'cardio' },
  { id: 'bike', name: 'Bike', group: 'cardio', kind: 'cardio' },
  { id: 'rowerg', name: 'Rowing machine', group: 'cardio', kind: 'cardio' },
  { id: 'skip', name: 'Skipping', group: 'cardio', kind: 'cardio' },
  { id: 'stairs', name: 'Stair climber', group: 'cardio', kind: 'cardio' },
  { id: 'inclinewalk', name: 'Incline walk', group: 'cardio', kind: 'cardio' },
];

const BY_NAME = new Map(EXERCISES.map((e) => [e.name.toLowerCase(), e]));

/** Which muscle an exercise belongs to. Anything typed in is filed under core. */
export const groupOf = (name: string): Muscle =>
  BY_NAME.get(name.trim().toLowerCase())?.group ?? 'core';

export const kindOf = (name: string): Kind =>
  BY_NAME.get(name.trim().toLowerCase())?.kind ?? 'weight';

/**
 * Epley: 1RM ≈ w × (1 + reps/30). A single rep is its own max. Past about
 * twelve reps the set is a fitness test rather than a strength one and the
 * estimate drifts, so it is capped rather than extrapolated into fiction.
 */
export function e1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + Math.min(reps, 12) / 30) * 10) / 10;
}

/** Weight moved: every completed set, weight times reps. Unfinished sets are not work. */
export function volumeOf(sets: WorkoutSet[]): number {
  return Math.round(sets.filter((s) => s.done).reduce((n, s) => n + s.weight_kg * s.reps, 0));
}

/** Best estimated max per exercise across a batch of sets. */
export function bestByExercise(sets: WorkoutSet[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sets) {
    if (!s.done) continue;
    const v = e1rm(s.weight_kg, s.reps);
    if (v > (out[s.exercise] ?? 0)) out[s.exercise] = v;
  }
  return out;
}

/** The muscle groups a set of sets touched, in the body map's own order. */
export function groupsOfSets(sets: WorkoutSet[]): Muscle[] {
  const seen = new Set(sets.map((s) => groupOf(s.exercise)));
  return MUSCLES.filter((g) => seen.has(g));
}

/**
 * What you did last time, per exercise.
 *
 * `order` is workout ids newest first — the caller knows the dates, this does
 * not need to. Sets from `skip` are ignored, which is how today's own session
 * stays out of its own "last time" and the prefill shows the previous week
 * rather than the row above.
 */
export function lastTime(
  sets: WorkoutSet[], order: string[], skip?: string,
): Record<string, WorkoutSet> {
  const rank = new Map(order.map((id, i) => [id, i]));
  const out: Record<string, WorkoutSet> = {};
  for (const s of sets) {
    if (s.workout_id === skip) continue;
    const mine = rank.get(s.workout_id) ?? Number.MAX_SAFE_INTEGER;
    const prev = out[s.exercise];
    if (!prev || mine < (rank.get(prev.workout_id) ?? Number.MAX_SAFE_INTEGER)) out[s.exercise] = s;
  }
  return out;
}

/**
 * The next set to offer, from the one before it. Same weight, same reps — a
 * repeat is what happens most often, and a number already in the box is a
 * number you correct rather than one you type.
 */
export function nextSet(prev: WorkoutSet | undefined, kind: Kind): { weight_kg: number; reps: number } {
  if (prev) return { weight_kg: prev.weight_kg, reps: prev.reps };
  return kind === 'bodyweight' ? { weight_kg: 0, reps: 10 } : kind === 'cardio' ? { weight_kg: 0, reps: 20 } : { weight_kg: 20, reps: 8 };
}
