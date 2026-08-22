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

/**
 * Which demonstration picture a movement uses. Nine patterns, not 1,324
 * pictures: a bench press and an incline press are the same drawing with the
 * bench at a different angle. `components/body/ExerciseArt.tsx` draws them.
 */
export type Art =
  | 'bench' | 'incline' | 'ohp' | 'row' | 'pull' | 'squat' | 'hinge' | 'curl' | 'core' | 'cardio';

/** What you hold. openGym filters its catalogue by this; so does ours. */
export type Gear = 'Barbell' | 'Dumbbell' | 'Machine' | 'Cable' | 'Bodyweight' | 'Cardio';

export type Exercise = {
  id: string; name: string; group: Muscle; kind: Kind; art: Art; gear: Gear;
  /** The muscle names openGym prints as tags under the exercise title. */
  worked: string;
};

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
  { id: 'bench', name: 'Bench press', group: 'chest', kind: 'weight', art: 'bench', gear: 'Barbell', worked: 'Pectorals' },
  { id: 'incline', name: 'Incline press', group: 'chest', kind: 'weight', art: 'incline', gear: 'Barbell', worked: 'Upper chest' },
  { id: 'dbfly', name: 'Dumbbell fly', group: 'chest', kind: 'weight', art: 'bench', gear: 'Dumbbell', worked: 'Pectorals' },
  { id: 'pushup', name: 'Push-up', group: 'chest', kind: 'bodyweight', art: 'bench', gear: 'Bodyweight', worked: 'Pectorals' },
  { id: 'dip', name: 'Dip', group: 'chest', kind: 'bodyweight', art: 'bench', gear: 'Bodyweight', worked: 'Lower chest' },
  { id: 'cablefly', name: 'Cable fly', group: 'chest', kind: 'weight', art: 'bench', gear: 'Cable', worked: 'Pectorals' },

  { id: 'deadlift', name: 'Deadlift', group: 'back', kind: 'weight', art: 'hinge', gear: 'Barbell', worked: 'Posterior chain' },
  { id: 'row', name: 'Barbell row', group: 'back', kind: 'weight', art: 'row', gear: 'Barbell', worked: 'Lats' },
  { id: 'dbrow', name: 'Dumbbell row', group: 'back', kind: 'weight', art: 'row', gear: 'Dumbbell', worked: 'Lats' },
  { id: 'pulldown', name: 'Lat pulldown', group: 'back', kind: 'weight', art: 'pull', gear: 'Cable', worked: 'Lats' },
  { id: 'pullup', name: 'Pull-up', group: 'back', kind: 'bodyweight', art: 'pull', gear: 'Bodyweight', worked: 'Lats' },
  { id: 'facepull', name: 'Face pull', group: 'back', kind: 'weight', art: 'row', gear: 'Cable', worked: 'Rear delts' },
  { id: 'shrug', name: 'Shrug', group: 'back', kind: 'weight', art: 'hinge', gear: 'Barbell', worked: 'Traps' },

  { id: 'ohp', name: 'Overhead press', group: 'arms', kind: 'weight', art: 'ohp', gear: 'Barbell', worked: 'Front delts' },
  { id: 'lateral', name: 'Lateral raise', group: 'arms', kind: 'weight', art: 'ohp', gear: 'Dumbbell', worked: 'Side delts' },
  { id: 'curl', name: 'Barbell curl', group: 'arms', kind: 'weight', art: 'curl', gear: 'Barbell', worked: 'Biceps' },
  { id: 'hammer', name: 'Hammer curl', group: 'arms', kind: 'weight', art: 'curl', gear: 'Dumbbell', worked: 'Brachialis' },
  { id: 'triext', name: 'Triceps extension', group: 'arms', kind: 'weight', art: 'ohp', gear: 'Dumbbell', worked: 'Triceps' },
  { id: 'pushdown', name: 'Cable pushdown', group: 'arms', kind: 'weight', art: 'curl', gear: 'Cable', worked: 'Triceps' },
  { id: 'preacher', name: 'Preacher curl', group: 'arms', kind: 'weight', art: 'curl', gear: 'Machine', worked: 'Biceps' },

  { id: 'plank', name: 'Plank', group: 'core', kind: 'bodyweight', art: 'core', gear: 'Bodyweight', worked: 'Abdominals' },
  { id: 'crunch', name: 'Crunch', group: 'core', kind: 'bodyweight', art: 'core', gear: 'Bodyweight', worked: 'Abdominals' },
  { id: 'legraise', name: 'Hanging leg raise', group: 'core', kind: 'bodyweight', art: 'core', gear: 'Bodyweight', worked: 'Lower abs' },
  { id: 'russian', name: 'Russian twist', group: 'core', kind: 'weight', art: 'core', gear: 'Dumbbell', worked: 'Obliques' },
  { id: 'cablecrunch', name: 'Cable crunch', group: 'core', kind: 'weight', art: 'core', gear: 'Cable', worked: 'Abdominals' },

  { id: 'squat', name: 'Back squat', group: 'legs', kind: 'weight', art: 'squat', gear: 'Barbell', worked: 'Quadriceps' },
  { id: 'frontsquat', name: 'Front squat', group: 'legs', kind: 'weight', art: 'squat', gear: 'Barbell', worked: 'Quadriceps' },
  { id: 'legpress', name: 'Leg press', group: 'legs', kind: 'weight', art: 'squat', gear: 'Machine', worked: 'Quadriceps' },
  { id: 'lunge', name: 'Walking lunge', group: 'legs', kind: 'weight', art: 'squat', gear: 'Dumbbell', worked: 'Glutes' },
  { id: 'rdl', name: 'Romanian deadlift', group: 'legs', kind: 'weight', art: 'hinge', gear: 'Barbell', worked: 'Hamstrings' },
  { id: 'legcurl', name: 'Leg curl', group: 'legs', kind: 'weight', art: 'hinge', gear: 'Machine', worked: 'Hamstrings' },
  { id: 'legext', name: 'Leg extension', group: 'legs', kind: 'weight', art: 'squat', gear: 'Machine', worked: 'Quadriceps' },
  { id: 'calf', name: 'Calf raise', group: 'legs', kind: 'weight', art: 'squat', gear: 'Machine', worked: 'Calves' },
  { id: 'hipthrust', name: 'Hip thrust', group: 'legs', kind: 'weight', art: 'hinge', gear: 'Barbell', worked: 'Glutes' },

  { id: 'run', name: 'Run', group: 'cardio', kind: 'cardio', art: 'cardio', gear: 'Cardio', worked: 'Heart & lungs' },
  { id: 'bike', name: 'Bike', group: 'cardio', kind: 'cardio', art: 'cardio', gear: 'Cardio', worked: 'Quadriceps' },
  { id: 'rowerg', name: 'Rowing machine', group: 'cardio', kind: 'cardio', art: 'cardio', gear: 'Cardio', worked: 'Full body' },
  { id: 'skip', name: 'Skipping', group: 'cardio', kind: 'cardio', art: 'cardio', gear: 'Cardio', worked: 'Calves' },
  { id: 'stairs', name: 'Stair climber', group: 'cardio', kind: 'cardio', art: 'cardio', gear: 'Cardio', worked: 'Glutes' },
  { id: 'inclinewalk', name: 'Incline walk', group: 'cardio', kind: 'cardio', art: 'cardio', gear: 'Cardio', worked: 'Heart & lungs' },
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

/* ------------------------------------------------------------- catalogue */

export const exerciseOf = (name: string): Exercise | null =>
  BY_NAME.get(name.trim().toLowerCase()) ?? null;

export const artOf = (name: string): Art => exerciseOf(name)?.art ?? 'core';
export const gearOf = (name: string): Gear => exerciseOf(name)?.gear ?? 'Barbell';
export const workedOf = (name: string): string => exerciseOf(name)?.worked ?? 'Whole body';

/* ---------------------------------------------------------------- plans */

export type Routine = { id: string; name: string; exercises: string[] };

/**
 * The weekly plan, as a fixed set of splits rather than a routine builder.
 *
 * openGym ships an editor over 1,324 exercises; the thing a student actually
 * needs is to say "Monday is push" once and be asked about it every Monday.
 * Which day carries which split lives in `prefs.gymPlan` — seven strings — so
 * it follows the account between devices without a table, and a session built
 * from a split is still just exercises you can add to or drop.
 */
export const ROUTINES: Routine[] = [
  { id: 'push', name: 'Push Day', exercises: ['Bench press', 'Incline press', 'Overhead press', 'Lateral raise', 'Cable pushdown'] },
  { id: 'pull', name: 'Pull Day', exercises: ['Deadlift', 'Barbell row', 'Lat pulldown', 'Face pull', 'Barbell curl'] },
  { id: 'legs', name: 'Leg Day', exercises: ['Back squat', 'Romanian deadlift', 'Leg press', 'Leg curl', 'Calf raise'] },
  { id: 'upper', name: 'Upper Body', exercises: ['Bench press', 'Barbell row', 'Overhead press', 'Lat pulldown', 'Barbell curl'] },
  { id: 'lower', name: 'Lower Body', exercises: ['Back squat', 'Romanian deadlift', 'Hip thrust', 'Leg extension', 'Calf raise'] },
  { id: 'full', name: 'Full Body', exercises: ['Back squat', 'Bench press', 'Barbell row', 'Overhead press', 'Plank'] },
  { id: 'cardio', name: 'Cardio', exercises: ['Run', 'Skipping'] },
];

export const routineOf = (id: string | null | undefined): Routine | null =>
  ROUTINES.find((r) => r.id === id) ?? null;

/** Seven slots, Monday first — the order the week strip is drawn in. */
export const EMPTY_PLAN: string[] = ['push', '', 'pull', '', 'legs', '', ''];

/** The plan slot for a JS weekday (0 = Sunday), against a Monday-first plan. */
export const slotFor = (jsDay: number): number => (jsDay + 6) % 7;

/* ----------------------------------------------------------- progression */

/**
 * Double progression, which is the rule openGym defaults to and the only one
 * worth having on a screen this size: hold the weight until every set hits the
 * top of the rep range, then add the smallest jump the gym owns.
 *
 * Returns null when there is nothing to say — a first session, or a set that
 * fell short, where the honest advice is "same again".
 */
export function progression(
  last: WorkoutSet[], targetReps = 8, step = 2.5,
): { weight: number; hit: boolean } | null {
  const done = last.filter((s) => s.done && s.weight_kg > 0);
  if (done.length === 0) return null;
  const weight = Math.max(...done.map((s) => s.weight_kg));
  const top = done.filter((s) => s.weight_kg === weight);
  const hit = top.every((s) => s.reps >= targetReps);
  return { weight: hit ? Math.round((weight + step) * 2) / 2 : weight, hit };
}

/** "85×8, 85×8, 85×7" — how openGym prints what you did last time. */
export const setsLine = (sets: WorkoutSet[]): string =>
  sets.filter((s) => s.done)
    .map((s) => (s.weight_kg > 0 ? `${trim(s.weight_kg)}×${s.reps}` : `${s.reps}`))
    .join(', ');

const trim = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
